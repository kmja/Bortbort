import "server-only";

import { callTradera } from "./soap";

/**
 * Valid shipping / payment option ids for a listing, fetched live from Tradera
 * (the ids can't be hardcoded reliably). Parsed defensively — the response can
 * carry values as elements or attributes and nest them differently — so we walk
 * the whole tree collecting anything that looks like an {id, name} option.
 */

export interface TraderaOption {
  id: number;
  name: string;
}

export interface ListingOptions {
  shipping: TraderaOption[];
  payment: TraderaOption[];
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function toName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Walk arbitrary parsed XML collecting {id, name} pairs (deduped by id). */
function collectOptions(node: unknown, out: Map<number, TraderaOption>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectOptions(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  const id = toNumber(rec["@_Id"] ?? rec.Id ?? rec["@_id"] ?? rec.id);
  const name = toName(
    rec["@_Name"] ?? rec.Name ?? rec["@_Description"] ?? rec.Description ?? rec.description,
  );
  if (id !== null && id > 0 && name && !out.has(id)) out.set(id, { id, name });
  for (const v of Object.values(rec)) collectOptions(v, out);
}

async function fetchOptions(operation: string, signal?: AbortSignal): Promise<TraderaOption[]> {
  const raw = await callTradera<unknown>({
    service: "public",
    operation,
    rotateApp: true,
    parseAttributes: true,
    signal,
  });
  const out = new Map<number, TraderaOption>();
  collectOptions(raw, out);
  return [...out.values()];
}

let cache: { at: number; data: ListingOptions } | null = null;
const TTL_MS = 1000 * 60 * 60 * 12;

export async function getListingOptions(signal?: AbortSignal): Promise<ListingOptions> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  // GetPaymentOptions isn't a PublicService method and payment isn't required on
  // AddItem, so we only fetch shipping products (weight-based; often empty).
  const shipping = await fetchOptions("GetShippingOptions", signal).catch(() => []);
  const data: ListingOptions = { shipping, payment: [] };
  if (shipping.length > 0) cache = { at: Date.now(), data };
  return data;
}

/** Diagnostic: raw response shape for shipping + payment, to fix parsing if empty. */
export async function getListingOptionsDebug(signal?: AbortSignal): Promise<unknown> {
  const [shipRaw, payRaw] = await Promise.all([
    callTradera<unknown>({ service: "public", operation: "GetShippingOptions", rotateApp: true, parseAttributes: true, signal }).catch((e) => String(e)),
    callTradera<unknown>({ service: "public", operation: "GetPaymentOptions", rotateApp: true, parseAttributes: true, signal }).catch((e) => String(e)),
  ]);
  const parsed = await getListingOptions(signal).catch(() => ({ shipping: [], payment: [] }));
  return {
    shippingCount: parsed.shipping.length,
    paymentCount: parsed.payment.length,
    shipping: parsed.shipping,
    payment: parsed.payment,
    shippingSample: JSON.stringify(shipRaw).slice(0, 1500),
    paymentSample: JSON.stringify(payRaw).slice(0, 1500),
  };
}
