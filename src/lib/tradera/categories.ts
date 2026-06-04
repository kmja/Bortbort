import "server-only";

import { callTradera } from "./soap";

/**
 * PublicService.GetCategories → a flat, searchable list of {id, name, path}.
 *
 * The result is cached in-memory (12h) because the tree is large and changes
 * rarely — one GetCategories call then serves many searches without burning the
 * per-app daily quota. VERIFY the node shape (Id / Name / nested Categories)
 * against the live response on first run.
 */

export interface TraderaCategory {
  id: number;
  name: string;
  /** Full breadcrumb, e.g. "Hem & Hushåll > Möbler > Stolar & fåtöljer". */
  path: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
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

function flatten(node: unknown, trail: string[], out: TraderaCategory[]): void {
  const rec = asRecord(node);
  if (!rec) return;

  const id = toNumber(rec.Id);
  const name = typeof rec.Name === "string" ? rec.Name : undefined;
  const nextTrail = name ? [...trail, name] : trail;

  if (id !== null && id > 0 && name) {
    out.push({ id, name, path: nextTrail.join(" > ") });
  }

  // Children appear under different wrappers across the tree — handle them all.
  const children =
    rec.Category ??
    asRecord(rec.Categories)?.Category ??
    rec.Categories ??
    asRecord(rec.SubCategories)?.Category ??
    rec.SubCategories;
  for (const child of asArray(children)) flatten(child, nextTrail, out);
}

let cache: { at: number; data: TraderaCategory[] } | null = null;
const TTL_MS = 1000 * 60 * 60 * 12;

export async function getCategoriesFlat(
  signal?: AbortSignal,
): Promise<TraderaCategory[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const res = await callTradera<Record<string, unknown>>({
    service: "public",
    operation: "GetCategories",
    rotateApp: true,
    signal,
  });

  const out: TraderaCategory[] = [];
  const root = asRecord(res)?.GetCategoriesResult ?? res;
  for (const top of asArray(root)) flatten(top, [], out);

  cache = { at: Date.now(), data: out };
  return out;
}
