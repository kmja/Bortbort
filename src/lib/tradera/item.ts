import "server-only";

import { callTradera, xmlElement } from "./soap";

/** Full item details via PublicService.GetItem (app-level auth). */
export interface ItemDetails {
  id: number;
  title?: string;
  description?: string;
  images: string[];
  price?: number;
  bids?: number;
  endDate?: string;
  url: string;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
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

/** Collect http(s) URL strings that live under any "image"-named field. */
function collectImages(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectImages(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (/image/i.test(k)) collectStrings(v, out);
    else collectImages(v, out);
  }
}
function collectStrings(node: unknown, out: Set<string>): void {
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node)) out.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) collectStrings(n, out);
    return;
  }
  if (node && typeof node === "object") for (const v of Object.values(node)) collectStrings(v, out);
}

export async function getItemDetails(itemId: number, signal?: AbortSignal): Promise<ItemDetails> {
  const res = await callTradera<unknown>({
    service: "public",
    operation: "GetItem",
    bodyInnerXml: xmlElement("itemId", itemId),
    rotateApp: true,
    parseAttributes: true,
    signal,
  });

  const item = asRecord(asRecord(res)?.GetItemResult) ?? asRecord(res) ?? {};
  const images = new Set<string>();
  collectImages(item, images);

  const id = toNumber(pick(item, ["@_Id", "Id", "ItemId"])) ?? itemId;
  const description = toStr(pick(item, ["LongDescription", "Description", "BodyText"]));

  return {
    id,
    title: toStr(pick(item, ["ShortDescription", "Heading", "Title"])),
    description: description?.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim(),
    images: [...images],
    price: toNumber(pick(item, ["MaxBid", "NextBid", "BuyItNowPrice", "SellingPrice"])) ?? undefined,
    bids: toNumber(pick(item, ["BidCount", "TotalNumberOfBids", "TotalBids"])) ?? undefined,
    endDate: toStr(pick(item, ["EndDate"])),
    url: toStr(pick(item, ["ItemUrl", "Url"])) ?? `https://www.tradera.com/item/${id}`,
  };
}
