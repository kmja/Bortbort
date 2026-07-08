/**
 * Pure category-matching helpers (no secrets, safe on client and server).
 *
 * Two jobs:
 *  - retrieveCandidates: wide-net lexical recall — pull the plausible leaf
 *    categories for an item so an LLM can then pick precisely among them.
 *  - rankByBreadcrumb: the lightweight client-side fallback that maps the AI's
 *    category breadcrumb to leaves when the smart endpoint isn't available.
 */

export interface CategoryNode {
  id: number;
  name: string;
  path: string;
  parentId: number | null;
  leaf: boolean;
}

export function normalizeCat(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics so å/ä/ö compare cleanly
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Meaningful query tokens: drop 1–2 char noise but keep short numbers/models. */
function tokenize(s: string): string[] {
  return normalizeCat(s)
    .split(" ")
    .filter((t) => t.length >= 3 || /^\d+$/.test(t));
}

/**
 * Wide-net retrieval: score every leaf by how many query tokens appear in its
 * name (strong) or path (weak), and return the top `limit`. Optimized for
 * recall — the goal is to get the right category into the shortlist, not to
 * rank it first; an LLM rerank supplies the precision.
 */
export function retrieveCandidates(
  cats: CategoryNode[],
  query: string,
  limit: number,
): CategoryNode[] {
  const qtok = [...new Set(tokenize(query))];
  if (qtok.length === 0) return [];
  const scored: Array<{ c: CategoryNode; score: number }> = [];
  for (const c of cats) {
    if (!c.leaf) continue;
    const nameToks = normalizeCat(c.name).split(" ").filter(Boolean);
    const pathToks = new Set(normalizeCat(c.path).split(" ").filter(Boolean));
    let score = 0;
    for (const t of qtok) {
      if (nameToks.includes(t)) {
        score += 3;
      } else if (
        // Swedish compounds: "glasögonbågar" should still hit "glasögon".
        nameToks.some((nt) => nt.length >= 4 && (t.includes(nt) || nt.includes(t)))
      ) {
        score += 2;
      } else if (pathToks.has(t)) {
        score += 1;
      }
    }
    if (score > 0) scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.c);
}

/**
 * Client-side fallback: rank leaves against the AI's category breadcrumb,
 * weighting the most specific segment heaviest and rewarding parent-path
 * context so "Accessoarer > Solglasögon" beats "Barnkläder > Solglasögon".
 */
export function rankByBreadcrumb(
  suggestion: string,
  leaves: CategoryNode[],
  limit: number,
): CategoryNode[] {
  const tokens = normalizeCat(suggestion).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const leafTok = tokens[tokens.length - 1];
  const scored: Array<{ c: CategoryNode; score: number }> = [];
  for (const c of leaves) {
    const nameTokens = new Set(normalizeCat(c.name).split(" ").filter(Boolean));
    const path = normalizeCat(c.path);
    let score = 0;
    for (const t of tokens) {
      if (nameTokens.has(t)) score += 10;
      else if (path.includes(t)) score += 4;
    }
    if (nameTokens.has(leafTok)) score += 15;
    score += Math.min(c.path.split(">").length, 5) * 0.5;
    if (score >= 12) scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.c);
}

/** Compact label: the last two path segments, e.g. "Accessoarer › Solglasögon". */
export function shortPath(c: Pick<CategoryNode, "path">): string {
  return c.path.split(" > ").slice(-2).join(" › ");
}
