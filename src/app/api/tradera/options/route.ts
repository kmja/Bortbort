import { type NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getListingOptions, getListingOptionsDebug } from "@/lib/tradera/options";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/tradera/options — valid shipping + payment option ids for listings.
 * `?debug=1` also returns the raw response shape, for fixing parsing if empty.
 */
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("debug")) {
      return NextResponse.json({ ok: true, ...(await getListingOptionsDebug() as object) });
    }
    const options = await getListingOptions();
    return NextResponse.json({ ok: true, ...options });
  } catch (err) {
    return errorResponse(err);
  }
}
