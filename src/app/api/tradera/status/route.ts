import { NextResponse } from "next/server";

import { getUserAuth } from "@/lib/tradera/auth";
import { hasAppCredentials, isSandbox } from "@/lib/tradera/config";

export const dynamic = "force-dynamic";

/** Reports configuration/connection state. Never returns any secret value. */
export async function GET() {
  const userAuth = await getUserAuth();
  return NextResponse.json({
    appConfigured: hasAppCredentials(),
    sandbox: isSandbox(),
    userConnected: userAuth !== null,
    userId: userAuth?.userId ?? null,
  });
}
