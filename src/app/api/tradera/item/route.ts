import { type NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getItemDetails } from "@/lib/tradera/item";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/tradera/item?id=<itemId> — full details for one item (app auth). */
export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Ogiltigt item-id." }, { status: 400 });
  }
  try {
    const details = await getItemDetails(id);
    return NextResponse.json({ ok: true, ...details });
  } catch (err) {
    return errorResponse(err);
  }
}
