import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-response";
import { getUserAuth } from "@/lib/tradera/auth";
import { addItem } from "@/lib/tradera/client";
import { isSandbox } from "@/lib/tradera/config";
import type { AddItemRequest } from "@/lib/tradera/types";

const BodySchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1),
  categoryId: z.number().int().positive(),
  startPrice: z.number().positive(),
  durationDays: z.number().int().positive().optional(),
  buyItNowPrice: z.number().nonnegative().optional(),
});

/**
 * POST /api/tradera/list — publishes the *current* draft via
 * RestrictedService.AddItem (the real auto-post path). Requires a connected user
 * (token pinned to the primary app) and a valid Tradera category id.
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

  try {
    const userAuth = await getUserAuth();
    if (!userAuth) {
      return NextResponse.json(
        {
          ok: false,
          kind: "auth",
          error:
            "Inget Tradera-konto anslutet. Anslut först, eller sätt TRADERA_USER_ID och TRADERA_USER_TOKEN.",
        },
        { status: 401 },
      );
    }

    const req: AddItemRequest = {
      title: parsed.data.title,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId,
      durationDays: parsed.data.durationDays ?? 7,
      restarts: 0,
      startPrice: parsed.data.startPrice,
      reservePrice: 0,
      buyItNowPrice: parsed.data.buyItNowPrice ?? 0,
      autoCommit: true,
    };

    const result = await addItem(req, userAuth);
    return NextResponse.json({ ok: true, sandbox: isSandbox(), request: req, result });
  } catch (err) {
    return errorResponse(err);
  }
}
