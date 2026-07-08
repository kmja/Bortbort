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
  /** Parent category id, or null for a top-level category. Enables a tree UI. */
  parentId: number | null;
  /** True when this category has no children — only leaves are listable on Tradera. */
  leaf: boolean;
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

/** Children appear under different wrappers across the tree — handle them all. */
function childrenOf(rec: Record<string, unknown>): unknown[] {
  const children =
    rec.Category ??
    asRecord(rec.Categories)?.Category ??
    rec.Categories ??
    asRecord(rec.SubCategories)?.Category ??
    rec.SubCategories;
  return asArray(children);
}

function flatten(
  node: unknown,
  trail: string[],
  parentId: number | null,
  out: TraderaCategory[],
): void {
  const rec = asRecord(node);
  if (!rec) return;

  const id = toNumber(rec.Id);
  const name = typeof rec.Name === "string" ? rec.Name : undefined;
  const nextTrail = name ? [...trail, name] : trail;
  const children = childrenOf(rec);

  if (id !== null && id > 0 && name) {
    out.push({
      id,
      name,
      path: nextTrail.join(" > "),
      parentId,
      leaf: children.length === 0,
    });
  }

  const nextParent = id !== null && id > 0 ? id : parentId;
  for (const child of children) flatten(child, nextTrail, nextParent, out);
}

let cache: { at: number; data: TraderaCategory[] } | null = null;
const TTL_MS = 1000 * 60 * 60 * 12;

/**
 * Pure flatten of a GetCategories result (the `GetCategoriesResponse` node, or
 * its inner `GetCategoriesResult`) into a list of {id, name, path}. Testable.
 */
export function parseCategories(result: unknown): TraderaCategory[] {
  const out: TraderaCategory[] = [];
  const root = asRecord(result)?.GetCategoriesResult ?? result;
  for (const top of asArray(root)) flatten(top, [], null, out);
  return out;
}

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

  const data = parseCategories(res);
  cache = { at: Date.now(), data };
  return data;
}
