import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getCategoriesFlat } from "@/lib/tradera/categories";

export const dynamic = "force-dynamic";

/**
 * GET /api/tradera/categories — flattened, searchable Tradera category list.
 * App-level auth only (rotates across the key pool); cached server-side 12h.
 */
export async function GET() {
  try {
    const categories = await getCategoriesFlat();
    return NextResponse.json({ ok: true, count: categories.length, categories });
  } catch (err) {
    return errorResponse(err);
  }
}
