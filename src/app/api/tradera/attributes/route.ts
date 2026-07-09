import { type NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getConditionOptions, getConditionOptionsDebug } from "@/lib/tradera/attributes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/tradera/attributes — the structured condition ("Skick") options.
 * `?debug=1` returns the raw attribute-definitions shape for fixing parsing.
 */
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("debug")) {
      return NextResponse.json({ ok: true, ...(await getConditionOptionsDebug() as object) });
    }
    const condition = await getConditionOptions();
    return NextResponse.json({ ok: true, condition });
  } catch (err) {
    return errorResponse(err);
  }
}
