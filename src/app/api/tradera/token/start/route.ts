import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { cookieOptions, TRADERA_SECRET_COOKIE } from "@/lib/tradera/auth";
import { getTokenLoginUrl } from "@/lib/tradera/client";

export const dynamic = "force-dynamic";

/**
 * Starts the token-login flow: generates a one-time secret key, stashes it in a
 * short-lived cookie, and redirects the user to Tradera to authorize this app.
 */
export async function GET() {
  try {
    const secret = crypto.randomUUID();
    const loginUrl = getTokenLoginUrl(secret);

    const res = NextResponse.redirect(loginUrl);
    res.cookies.set(TRADERA_SECRET_COOKIE, secret, cookieOptions(60 * 15));
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
