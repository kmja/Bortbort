import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { pickCategory } from "@/lib/gemini/categorize";
import { getCategoriesFlat } from "@/lib/tradera/categories";
import { retrieveCandidates } from "@/lib/tradera/category-match";

export const maxDuration = 60;

const BodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  keywords: z.string().optional(),
  condition: z.string().optional(),
  aiCategory: z.string().optional(),
});

/**
 * POST /api/tradera/suggest-category — smart category suggestion.
 *
 * Retrieve (lexical, wide net) → rerank (Gemini picks semantically from the real
 * shortlist). Returns the best real leaf category + a few alternates. Degrades
 * to retrieval order if Gemini is unavailable, and to null if nothing matches
 * (the client then falls back to its own breadcrumb fuzzy-match).
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { title, description, keywords, condition, aiCategory } = parsed.data;

  try {
    const cats = await getCategoriesFlat();
    const query = [aiCategory, title, keywords].filter(Boolean).join(" ");
    const candidates = retrieveCandidates(cats, query, 40);

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, primaryId: null, alternates: [] });
    }

    const toPill = (c: { id: number; path: string }) => ({ id: c.id, path: c.path });

    let pick;
    try {
      pick = await pickCategory({ title, description, condition }, candidates.map((c) => c.path));
    } catch {
      // Gemini unavailable — return the lexical retrieval order instead.
      const [first, ...rest] = candidates;
      return NextResponse.json({
        ok: true,
        basis: "retrieval",
        confidence: "low",
        primaryId: first.id,
        primaryPath: first.path,
        alternates: rest.slice(0, 4).map(toPill),
      });
    }

    const at = (n: number) => candidates[n - 1]; // responses are 1-based
    const primary = at(pick.best) ?? candidates[0];
    const alternates = pick.alternates
      .map(at)
      .filter((c): c is (typeof candidates)[number] => Boolean(c) && c.id !== primary.id)
      .slice(0, 4)
      .map(toPill);

    return NextResponse.json({
      ok: true,
      basis: "ai",
      confidence: pick.confidence,
      primaryId: primary.id,
      primaryPath: primary.path,
      alternates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kunde inte föreslå kategori.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
