import "server-only";

import { callTradera, xmlElement } from "./soap";
import type { TraderaUserAuth } from "./types";

/**
 * The seller's own items via RestrictedService.GetSellerItems (uses the user
 * token). Split into active (EndDate > now) and ended (past). Parsed defensively
 * — the Item shape can carry values as elements or attributes — so we walk the
 * tree collecting anything that looks like a listing.
 */

export interface SellerItem {
  id: number;
  title?: string;
  price?: number;
  endDate?: string;
  bids?: number;
  thumbnail?: string;
  url: string;
}

export interface SellerListings {
  active: SellerItem[];
  ended: SellerItem[];
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function pick(rec: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (rec[k] !== undefined) return rec[k];
  return undefined;
}

/** Walk parsed XML collecting listing-shaped nodes (id + a title or end date). */
function collectItems(node: unknown, out: SellerItem[], seen: Set<number>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectItems(n, out, seen);
    return;
  }
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;

  const id = toNumber(pick(rec, ["@_Id", "Id", "ItemId", "@_ItemId"]));
  const title = toStr(pick(rec, ["ShortDescription", "Heading", "Title", "LongDescription"]));
  const endDate = toStr(pick(rec, ["EndDate", "@_EndDate"]));
  if (id !== null && id > 0 && (title || endDate) && !seen.has(id)) {
    seen.add(id);
    out.push({
      id,
      title,
      endDate,
      price: toNumber(pick(rec, ["MaxBid", "BuyItNowPrice", "NextBid", "SellingPrice"])) ?? undefined,
      bids: toNumber(pick(rec, ["BidCount", "Bids", "TotalBids"])) ?? undefined,
      thumbnail: toStr(pick(rec, ["ThumbnailLink", "ImageLink", "ThumbnailUrl"])),
      url: toStr(pick(rec, ["ItemUrl", "Url"])) ?? `https://www.tradera.com/item/${id}`,
    });
  }
  for (const v of Object.values(rec)) collectItems(v, out, seen);
}

async function fetchSellerItems(
  userAuth: TraderaUserAuth,
  filterActive: "Active" | "Inactive",
  signal?: AbortSignal,
): Promise<SellerItem[]> {
  const res = await callTradera<unknown>({
    service: "restricted",
    operation: "GetSellerItems",
    bodyInnerXml:
      xmlElement("categoryId", 0) +
      xmlElement("filterItemType", "All") +
      xmlElement("filterActive", filterActive),
    userAuth,
    parseAttributes: true,
    signal,
  });
  const out: SellerItem[] = [];
  collectItems(res, out, new Set());
  // Most-recently-ending first.
  out.sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));
  return out;
}

export async function getSellerListings(
  userAuth: TraderaUserAuth,
  signal?: AbortSignal,
): Promise<SellerListings> {
  const [active, ended] = await Promise.all([
    fetchSellerItems(userAuth, "Active", signal).catch(() => []),
    fetchSellerItems(userAuth, "Inactive", signal).catch(() => []),
  ]);
  return { active: active.slice(0, 100), ended: ended.slice(0, 100) };
}

/** Diagnostic: raw GetSellerItems shape for the active filter, to fix parsing. */
export async function getSellerListingsDebug(userAuth: TraderaUserAuth): Promise<unknown> {
  const raw = await callTradera<unknown>({
    service: "restricted",
    operation: "GetSellerItems",
    bodyInnerXml:
      xmlElement("categoryId", 0) + xmlElement("filterItemType", "All") + xmlElement("filterActive", "All"),
    userAuth,
    parseAttributes: true,
  }).catch((e) => String(e));
  const out: SellerItem[] = [];
  collectItems(raw, out, new Set());
  return { parsedCount: out.length, sample: JSON.stringify(raw).slice(0, 2000) };
}
