import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-response";
import { getUserAuth } from "@/lib/tradera/auth";
import { addItem, addItemImage, commitItem, type TraderaImageFormat } from "@/lib/tradera/client";
import { isSandbox } from "@/lib/tradera/config";
import { getListingOptions } from "@/lib/tradera/options";
import type { AddItemRequest } from "@/lib/tradera/types";

// Staged image upload = several sequential Tradera calls; give it room.
export const maxDuration = 60;

const BodySchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1),
  categoryId: z.number().int().positive(),
  startPrice: z.number().positive(),
  durationDays: z.number().int().positive().optional(),
  buyItNowPrice: z.number().nonnegative().optional(),
  /** Shipping cost in SEK for the default shipping option (0 = free/pickup). */
  shippingCost: z.number().nonnegative().optional(),
  /** Data-URL images (data:image/jpeg;base64,...). Attached via the staged flow. */
  images: z.array(z.string()).max(12).optional(),
});

const FORMAT_BY_MEDIA: Record<string, TraderaImageFormat> = {
  "image/jpeg": "Jpeg",
  "image/jpg": "Jpeg",
  "image/png": "Png",
  "image/gif": "Gif",
  "image/bmp": "Bmp",
};

function parseDataUrl(dataUrl: string): { format: TraderaImageFormat; base64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const format = FORMAT_BY_MEDIA[m[1].toLowerCase()];
  if (!format) return null;
  return { format, base64: m[2] };
}

/**
 * POST /api/tradera/list — publishes the current draft via RestrictedService.
 *
 * Text-only: AddItem(AutoCommit=true).
 * With photos: AddItem(AutoCommit=false) → AddItemImage×N → AddItemCommit.
 * Requires a connected user (token pinned to the primary app) and a valid category.
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

    const images = (parsed.data.images ?? [])
      .map(parseDataUrl)
      .filter((x): x is { format: TraderaImageFormat; base64: string } => x !== null);
    const hasImages = images.length > 0;

    // Shipping + payment require real ids from Tradera; fetch and default them so
    // the seller doesn't have to. A shipping option is mandatory (non-empty).
    const options = await getListingOptions().catch(() => ({ shipping: [], payment: [] }));
    const shippingOptionId = options.shipping[0]?.id;
    const shippingOptions = shippingOptionId
      ? [{ shippingOptionId, cost: parsed.data.shippingCost ?? 0 }]
      : [];
    const paymentOptionIds = options.payment.map((o) => o.id);

    const req: AddItemRequest = {
      title: parsed.data.title,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId,
      durationDays: parsed.data.durationDays ?? 7,
      restarts: 0,
      startPrice: parsed.data.startPrice,
      reservePrice: 0,
      buyItNowPrice: parsed.data.buyItNowPrice ?? 0,
      acceptedBidderId: 1, // Sweden
      shippingOptions,
      paymentOptionIds,
      shippingCondition: "Köparen betalar frakten om inget annat anges.",
      // Staged (commit later) only when we have images to attach first.
      autoCommit: !hasImages,
    };

    if (shippingOptions.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          kind: "config",
          error:
            "Kunde inte hämta giltiga fraktalternativ från Tradera (tomt). Kör 'Testa frakt/betalning' i diagnostiken.",
        },
        { status: 502 },
      );
    }

    const result = await addItem(req, userAuth);

    if (!hasImages) {
      return NextResponse.json({ ok: true, sandbox: isSandbox(), request: req, result });
    }

    // Staged flow: attach each image, then commit. Individual image failures are
    // collected but don't block the listing — we still commit so it goes live.
    if (result.requestId === undefined) {
      return NextResponse.json(
        { ok: false, kind: "tradera", error: "AddItem gav inget requestId — kan inte bifoga bilder.", result },
        { status: 502 },
      );
    }

    const imageErrors: string[] = [];
    for (let i = 0; i < images.length; i++) {
      try {
        await addItemImage(result.requestId, images[i].base64, images[i].format, userAuth, i === 0);
      } catch (err) {
        imageErrors.push(err instanceof Error ? err.message : "okänt bildfel");
      }
    }

    await commitItem(result.requestId, userAuth);

    return NextResponse.json({
      ok: true,
      sandbox: isSandbox(),
      request: { ...req, images: images.length },
      result,
      images: { attached: images.length - imageErrors.length, errors: imageErrors },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
