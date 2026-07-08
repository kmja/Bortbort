import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Reports the commit/version this deployment was built from (inlined at build
 * time via next.config `env`). A client running older JS can poll this and
 * detect that a newer build is live, then prompt the user to reload.
 */
export function GET() {
  return NextResponse.json({
    version: process.env.APP_VERSION ?? "dev",
    commit: process.env.APP_COMMIT ?? "",
  });
}
