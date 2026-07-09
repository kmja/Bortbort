import "server-only";

import { callTradera } from "./soap";

/**
 * Tradera's structured condition ("Skick") options, from
 * PublicService.GetAttributeDefinitions (global, no params). Each option's id is
 * an ItemAttributes value to send on AddItem. Parsed defensively — the response
 * shape (elements vs attributes, term wrapper name) isn't documented.
 */

export interface ConditionOption {
  id: number;
  name: string;
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
function nameOf(rec: Record<string, unknown>): string | undefined {
  return toStr(pick(rec, ["@_Name", "Name", "@_Term", "Term", "Value", "@_Value"]));
}
function idOf(rec: Record<string, unknown>): number | null {
  return toNumber(pick(rec, ["@_Id", "Id", "@_TermId", "TermId", "@_AttributeId"]));
}

/** Find the attribute-definition node whose name looks like condition/"Skick". */
function findConditionNode(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findConditionNode(n);
      if (r) return r;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const rec = node as Record<string, unknown>;
  const name = nameOf(rec);
  if (name && /\bskick\b|condition/i.test(name)) return rec;
  for (const v of Object.values(rec)) {
    const r = findConditionNode(v);
    if (r) return r;
  }
  return null;
}

/** Collect {id,name} term pairs under a node (excluding the attribute's own id). */
function collectTerms(node: unknown, out: ConditionOption[], ownId: number): void {
  if (Array.isArray(node)) {
    for (const n of node) collectTerms(n, out, ownId);
    return;
  }
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  const id = idOf(rec);
  const name = nameOf(rec);
  if (id !== null && id > 0 && id !== ownId && name && !out.some((o) => o.id === id)) {
    out.push({ id, name });
  }
  for (const v of Object.values(rec)) collectTerms(v, out, ownId);
}

async function fetchAttributeDefinitions(signal?: AbortSignal): Promise<unknown> {
  return callTradera<unknown>({
    service: "public",
    operation: "GetAttributeDefinitions",
    rotateApp: true,
    parseAttributes: true,
    signal,
  });
}

function parseConditionOptions(raw: unknown): ConditionOption[] {
  const node = findConditionNode(raw);
  if (!node) return [];
  const out: ConditionOption[] = [];
  collectTerms(node, out, idOf(node) ?? -1);
  return out;
}

let cache: { at: number; data: ConditionOption[] } | null = null;
const TTL_MS = 1000 * 60 * 60 * 12;

export async function getConditionOptions(signal?: AbortSignal): Promise<ConditionOption[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const options = parseConditionOptions(await fetchAttributeDefinitions(signal));
  if (options.length > 0) cache = { at: Date.now(), data: options };
  return options;
}

export async function getConditionOptionsDebug(signal?: AbortSignal): Promise<unknown> {
  const raw = await fetchAttributeDefinitions(signal);
  return {
    options: parseConditionOptions(raw),
    sample: JSON.stringify(raw).slice(0, 2500),
  };
}
