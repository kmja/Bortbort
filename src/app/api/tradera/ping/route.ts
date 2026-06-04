import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getOfficialTime } from "@/lib/tradera/client";
import { isSandbox } from "@/lib/tradera/config";

export const dynamic = "force-dynamic";

/**
 * Smoke test: calls PublicService.GetOfficialTime using only app-level
 * credentials. A success proves TRADERA_APP_ID / TRADERA_APP_KEY are valid.
 */
export async function GET() {
  try {
    const officialTime = await getOfficialTime();
    return NextResponse.json({ ok: true, sandbox: isSandbox(), officialTime });
  } catch (err) {
    return errorResponse(err);
  }
}
