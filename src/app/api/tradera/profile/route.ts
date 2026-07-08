import { NextResponse } from "next/server";

import { getUserAuth } from "@/lib/tradera/auth";
import { getProfile } from "@/lib/tradera/profile";

export const dynamic = "force-dynamic";

/** GET /api/tradera/profile — connection state + (best-effort) alias for the sidebar. */
export async function GET() {
  const userAuth = await getUserAuth();
  if (!userAuth) return NextResponse.json({ ok: true, connected: false });
  const profile = await getProfile(userAuth);
  return NextResponse.json({ ok: true, connected: true, ...profile });
}
