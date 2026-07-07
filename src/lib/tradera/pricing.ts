import "server-only";

import { callTradera, xmlElement } from "./soap";

/**
 * Pricing via Tradera comparables (build-order step 2).
 *
 * IMPORTANT HONESTY NOTE: the public SearchService.Search returns ACTIVE
 * listings, i.e. *asking* prices, which run higher than realized *sold* prices.
 * We label the basis as "active-asking" and cap confidence accordingly. Pulling
 * true sold/completed comparables likely needs SearchService.SearchAdvanced with
 * an ended/sold filter — VERIFY that against the live WSDL before trusting it:
 *   https://api.tradera.com/v3/searchservice.asmx?WSDL
 */

export interface ComparableItem {
  id?: number;
  title?: string;
  /** Best-effort price in SEK. */
  price: number;
}

export type PriceBasis = "sold" | "active-asking";
export type PriceConfidence = "low" | "medium" | "high";

export interface PriceSuggestion {
  basis: PriceBasis;
  count: number;
  currency: "SEK";
  /** Suggested range (p25–p75), or null when there are no comparables. */
  suggested: { low: number; high: number } | null;
  median: number | null;
  confidence: PriceConfidence;
  /** Human-readable, honest explanation of what the number is based on. */
  note: string;
  /** A capped sample of the comparables used, for transparency in the UI. */
  comparables: ComparableItem[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === undefined || value === null) return [];
  return [value as T];
}

function toNumber(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(n) ? n : null;
}

export interface PriceStats {
  count: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** Up to 20 prices, ascending, for transparency and for the AI to reason over. */
  sample: number[];
}

/** Percentile summary of a list of prices (drops non-positive / non-finite values). */
export function priceStats(prices: number[]): PriceStats {
  const sorted = prices.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, median: null, p25: null, p75: null, sample: [] };
  }
  return {
    count: sorted.length,
    median: Math.round(percentile(sorted, 0.5)),
    p25: Math.round(percentile(sorted, 0.25)),
    p75: Math.round(percentile(sorted, 0.75)),
    sample: sorted.slice(0, 20),
  };
}

/** Linear-interpolated percentile of a pre-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface ComparablesQuery {
  query: string;
  categoryId?: number;
  orderBy?: string;
  signal?: AbortSignal;
}

/**
 * SearchService.Search — returns active comparable listings for a query.
 *
 * VERIFY: the Search parameter names (query/categoryId/pageNumber/orderBy) and
 * the SearchItem price field names (BuyItNowPrice/MaxBid/NextBid) against the WSDL.
 */
export async function searchComparables(
  opts: ComparablesQuery,
): Promise<ComparableItem[]> {
  const bodyInnerXml =
    xmlElement("query", opts.query) +
    xmlElement("categoryId", opts.categoryId ?? 0) +
    xmlElement("pageNumber", 1) +
    xmlElement("orderBy", opts.orderBy ?? "Relevance");

  const res = await callTradera<Record<string, unknown>>({
    service: "search",
    operation: "Search",
    bodyInnerXml,
    rotateApp: true,
    signal: opts.signal,
  });

  const result = asRecord(asRecord(res)?.SearchResult);
  const itemsContainer = asRecord(result?.Items);
  const rawItems = toArray<unknown>(
    itemsContainer?.SearchItem ?? result?.Items,
  );

  const items: ComparableItem[] = [];
  for (const raw of rawItems) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const price =
      toNumber(rec.BuyItNowPrice) ??
      toNumber(rec.MaxBid) ??
      toNumber(rec.NextBid);
    if (price === null || price <= 0) continue;
    items.push({
      id: toNumber(rec.Id) ?? undefined,
      title:
        typeof rec.ShortDescription === "string"
          ? rec.ShortDescription
          : undefined,
      price,
    });
  }
  return items;
}

/**
 * Suggests a price range from Tradera comparables, with honest confidence.
 * Because the underlying data is active asking prices, confidence is capped at
 * "medium" and the note makes the asking-vs-sold distinction explicit.
 */
export async function suggestPrice(
  opts: ComparablesQuery,
): Promise<PriceSuggestion> {
  const comparables = await searchComparables(opts);
  return summarizeComparables(comparables);
}

/**
 * Pure summarization of comparables into a price suggestion (no network).
 * Confidence is capped at "medium" because the comps are asking prices.
 */
export function summarizeComparables(
  comparables: ComparableItem[],
): PriceSuggestion {
  const basis: PriceBasis = "active-asking";
  const prices = comparables.map((c) => c.price).sort((a, b) => a - b);
  const count = prices.length;

  if (count === 0) {
    return {
      basis,
      count,
      currency: "SEK",
      suggested: null,
      median: null,
      confidence: "low",
      note: "Inga jämförbara annonser hittades. Gör en grov uppskattning och var tydlig med osäkerheten.",
      comparables,
    };
  }

  const median = Math.round(percentile(prices, 0.5));
  const low = Math.round(percentile(prices, 0.25));
  const high = Math.round(percentile(prices, 0.75));
  // Asking prices overstate realized value, so cap confidence at "medium".
  const confidence: PriceConfidence = count >= 12 ? "medium" : "low";

  return {
    basis,
    count,
    currency: "SEK",
    suggested: { low, high },
    median,
    confidence,
    note: `Baserat på ${count} aktiva Tradera-annonser (utropspriser, inte sålda). Utropspriser ligger oftast över faktiska slutpriser – behandla intervallet som en övre indikation tills såld-data har verifierats.`,
    comparables: comparables.slice(0, 20),
  };
}
