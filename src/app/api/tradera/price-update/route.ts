import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-response";
import { getUserAuth } from "@/lib/tradera/auth";
import { setItemPrices } from "@/lib/tradera/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  itemId: z.number().int().positive(),
  openingPrice: z.number().int().positive(),
  reservedPrice: z.number().int().nonnegative().optional(),
  binPrice: z.number().int().nonnegative().optional(),
});

/** POST /api/tradera/price-update — change prices on an active (non-shop) listing. */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Ogiltiga priser." }, { status: 400 });
  }

  const userAuth = await getUserAuth();
  if (!userAuth) {
    return NextResponse.json({ ok: false, kind: "auth", error: "Inget Tradera-konto anslutet." }, { status: 401 });
  }

  try {
    const result = await setItemPrices(
      parsed.data.itemId,
      {
        openingPrice: parsed.data.openingPrice,
        reservedPrice: parsed.data.reservedPrice,
        binPrice: parsed.data.binPrice,
      },
      userAuth,
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return errorResponse(err);
  }
}
