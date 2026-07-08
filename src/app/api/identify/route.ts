import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { GeminiConfigError } from "@/lib/gemini/client";
import { identifyAndDraft, SUPPORTED_IMAGE_TYPES } from "@/lib/gemini/draft";

// Vision + adaptive thinking can take a while; give the function room.
export const maxDuration = 60;

const BodySchema = z.object({
  imageBase64: z.string().min(1, "imageBase64 is required"),
  mediaType: z.enum(SUPPORTED_IMAGE_TYPES),
  hint: z.string().max(500).optional(),
});

/**
 * POST /api/identify — accepts a base64 image and returns a structured Swedish
 * listing draft (category, title, description, condition, keywords, rough price).
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

  // Tolerate a data: URL prefix if the client forgot to strip it.
  const imageBase64 = parsed.data.imageBase64.replace(/^data:[^;]+;base64,/, "");

  try {
    const draft = await identifyAndDraft({
      imageBase64,
      mediaType: parsed.data.mediaType,
      hint: parsed.data.hint,
    });
    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    if (err instanceof GeminiConfigError) {
      return NextResponse.json(
        { ok: false, kind: "config", error: err.message },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, kind: "gemini", error: message },
      { status: 502 },
    );
  }
}
