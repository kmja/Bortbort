import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AnthropicConfigError } from "@/lib/anthropic/client";
import { valuateItem } from "@/lib/anthropic/valuation";
import { priceStats } from "@/lib/tradera/pricing";
import { searchComparables } from "@/lib/tradera/pricing";
import { fetchSoldComparables } from "@/lib/tradera/sold";

// Scrape + two comparable searches + an AI call — give it room.
export const maxDuration = 60;

const BodySchema = z.object({
  title: z.string().min(1),
  keywords: z.string().optional(),
  condition: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.number().int().positive().optional(),
});

/**
 * POST /api/tradera/value — a proper valuation.
 *
 * Combines REAL sold prices (scraped from tradera.com) with ACTIVE asking prices
 * (SearchService) and lets the model reason to an opening price + buyout. Each
 * data source is best-effort; the response reports what was actually used so the
 * UI (and we) can see how much to trust the number.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, kind: "config", error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, kind: "config", error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { title, keywords, condition, description, categoryId } = parsed.data;
  const query = (title.trim() || keywords?.trim() || "").slice(0, 120);

  try {
    // Both sources are best-effort — a failure in either must not sink the call.
    const [active, sold] = await Promise.all([
      searchComparables({ query, categoryId }).catch(() => []),
      fetchSoldComparables(query).catch(() => []),
    ]);

    const soldStats = priceStats(sold.map((s) => s.price));
    const activeStats = priceStats(active.map((c) => c.price));

    const valuation = await valuateItem({
      title,
      keywords,
      condition,
      description,
      sold: soldStats,
      active: activeStats,
    });

    return NextResponse.json({
      ok: true,
      ...valuation,
      basis: soldStats.count > 0 ? "sold+active" : activeStats.count > 0 ? "active-only" : "ai-only",
      sold: { count: soldStats.count, median: soldStats.median, p25: soldStats.p25, p75: soldStats.p75 },
      active: { count: activeStats.count, median: activeStats.median, p25: activeStats.p25, p75: activeStats.p75 },
    });
  } catch (err) {
    if (err instanceof AnthropicConfigError) {
      return NextResponse.json(
        { ok: false, kind: "config", error: err.message },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Okänt fel vid värdering.";
    return NextResponse.json({ ok: false, kind: "value", error: message }, { status: 502 });
  }
}
