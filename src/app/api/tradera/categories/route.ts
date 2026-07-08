import { type NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getCategoriesDebug, getCategoriesFlat } from "@/lib/tradera/categories";

export const dynamic = "force-dynamic";
// The full Tradera category tree is large to fetch + parse; don't let it hit the
// default 10s serverless limit and surface as a generic failure.
export const maxDuration = 60;

/**
 * GET /api/tradera/categories — flattened, searchable Tradera category list.
 * App-level auth only (rotates across the key pool); cached server-side 12h.
 * `?debug=1` returns the raw response shape for diagnosing an empty list.
 */
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("debug")) {
      return NextResponse.json({ ok: true, ...(await getCategoriesDebug()) });
    }
    const categories = await getCategoriesFlat();
    return NextResponse.json({ ok: true, count: categories.length, categories });
  } catch (err) {
    return errorResponse(err);
  }
}
