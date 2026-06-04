import { type NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { suggestPrice } from "@/lib/tradera/pricing";

export const dynamic = "force-dynamic";

/**
 * GET /api/tradera/price?q=<term>&categoryId=<id>
 * Suggests a price range from Tradera comparables. Needs only app-level
 * credentials (no user token), so it can be tested as soon as the app key works.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? params.get("query") ?? "").trim();
  if (!query) {
    return NextResponse.json(
      { ok: false, kind: "config", error: "Ange en sökterm (?q=...)." },
      { status: 400 },
    );
  }

  const categoryRaw = params.get("categoryId");
  const categoryId = categoryRaw ? Number(categoryRaw) : undefined;

  try {
    const suggestion = await suggestPrice({
      query,
      categoryId:
        categoryId !== undefined && Number.isFinite(categoryId)
          ? categoryId
          : undefined,
    });
    return NextResponse.json({ ok: true, ...suggestion });
  } catch (err) {
    return errorResponse(err);
  }
}
