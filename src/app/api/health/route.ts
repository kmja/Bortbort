import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Lightweight liveness probe for uptime checks / deploy health. */
export function GET() {
  return NextResponse.json({
    ok: true,
    service: "loppis-helper",
    time: new Date().toISOString(),
  });
}
