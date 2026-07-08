import { type NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getUserAuth } from "@/lib/tradera/auth";
import { getSellerListings, getSellerListingsDebug } from "@/lib/tradera/listings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/tradera/listings — the connected seller's active + ended items.
 * `?debug=1` returns the raw GetSellerItems shape for fixing parsing.
 */
export async function GET(request: NextRequest) {
  const userAuth = await getUserAuth();
  if (!userAuth) {
    return NextResponse.json(
      { ok: false, kind: "auth", error: "Inget Tradera-konto anslutet." },
      { status: 401 },
    );
  }
  try {
    if (request.nextUrl.searchParams.get("debug")) {
      return NextResponse.json({ ok: true, ...(await getSellerListingsDebug(userAuth) as object) });
    }
    const listings = await getSellerListings(userAuth);
    return NextResponse.json({ ok: true, ...listings });
  } catch (err) {
    return errorResponse(err);
  }
}
