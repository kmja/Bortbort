import "server-only";

/**
 * Realized (SOLD) price comparables, scraped from tradera.com.
 *
 * Tradera's public API only exposes ACTIVE listings (asking prices), so real
 * sold prices have to come from the website's ended-listings search. This module
 * is deliberately defensive: any failure (blocked, markup change, empty result)
 * returns [] so the valuation falls back to active comps + AI. It is best-effort
 * and UNVERIFIED against the live site from the dev sandbox — tune the URL via
 * TRADERA_SOLD_SEARCH_URL and inspect /api/tradera/value diagnostics on deploy.
 */

export interface SoldItem {
  title?: string;
  /** Realized price in SEK. */
  price: number;
}

/**
 * Search URL for ended listings. `{q}` is replaced with the URL-encoded query.
 * Overridable via env so we can retune against the live site without a redeploy.
 */
const DEFAULT_SOLD_URL =
  "https://www.tradera.com/search?q={q}&sortBy=EndDateDescending&onlyEndedItems=true";

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export async function fetchSoldComparables(
  query: string,
  signal?: AbortSignal,
): Promise<SoldItem[]> {
  const template = process.env.TRADERA_SOLD_SEARCH_URL ?? DEFAULT_SOLD_URL;
  const url = template.replace("{q}", encodeURIComponent(query));

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
      },
      cache: "no-store",
      signal,
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }
  return parseSoldFromHtml(html);
}

/**
 * Pure parser — extracts sold comparables from the search page HTML.
 * Exported for testing. Tradera is a Next.js app, so we prefer the embedded
 * __NEXT_DATA__ JSON; if that shape changes we degrade to [] rather than guess.
 */
export function parseSoldFromHtml(html: string): SoldItem[] {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) return [];
  let json: unknown;
  try {
    json = JSON.parse(match[1]);
  } catch {
    return [];
  }
  const out: SoldItem[] = [];
  collectItems(json, out, new Set());
  // De-dupe by title+price and cap for sanity.
  const seen = new Set<string>();
  const deduped: SoldItem[] = [];
  for (const item of out) {
    const key = `${item.title ?? ""}|${item.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= 60) break;
  }
  return deduped;
}

const PRICE_KEYS = [
  "soldPrice",
  "finalPrice",
  "sellingPrice",
  "endPrice",
  "leadingBid",
  "maxBid",
  "price",
  "amount",
];
const TITLE_KEYS = ["shortDescription", "title", "heading", "name"];

/**
 * Recursively walk arbitrary JSON collecting objects that look like priced
 * listings. Heuristic (resilient to path changes): an item has a title-ish
 * string and a positive price-ish number. Over-collection is fine — outlier
 * trimming + the AI cross-check downstream absorb the noise.
 */
function collectItems(node: unknown, out: SoldItem[], guard: Set<object>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectItems(n, out, guard);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (guard.has(node)) return;
  guard.add(node);

  const rec = node as Record<string, unknown>;
  const price = firstNumber(rec, PRICE_KEYS);
  const title = firstString(rec, TITLE_KEYS);
  if (price !== null && price > 0 && price < 10_000_000 && title) {
    out.push({ title, price });
  }
  for (const value of Object.values(rec)) collectItems(value, out, guard);
}

function firstNumber(rec: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
      return Number(v);
    }
    // Some shapes nest as { amount: 123 } or { value: 123 }.
    if (v && typeof v === "object") {
      const nested = v as Record<string, unknown>;
      for (const nk of ["amount", "value", "sek"]) {
        if (typeof nested[nk] === "number" && Number.isFinite(nested[nk] as number)) {
          return nested[nk] as number;
        }
      }
    }
  }
  return null;
}

function firstString(rec: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}
