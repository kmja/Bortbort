import { type NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import {
  cookieOptions,
  readSecretCookie,
  TRADERA_SECRET_COOKIE,
  TRADERA_TOKEN_COOKIE,
} from "@/lib/tradera/auth";
import { fetchToken } from "@/lib/tradera/client";
import { getAppBaseUrl } from "@/lib/tradera/config";
import type { TraderaUserAuth } from "@/lib/tradera/types";

export const dynamic = "force-dynamic";

/**
 * Token-login callback. Tradera redirects here after the user authorizes the app.
 * We read the returned user id, exchange (userId, secret) for a token via
 * FetchToken, and persist it.
 *
 * VERIFY the exact name of the user-id query parameter Tradera appends.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const userIdParam =
      params.get("userId") ?? params.get("uid") ?? params.get("UserId");
    const userId = Number(userIdParam);

    if (!Number.isInteger(userId) || userId <= 0) {
      return errorResponse(
        new Error(
          "Token callback is missing a valid user id. Verify the redirect parameter name Tradera uses, then retry the connect flow.",
        ),
      );
    }

    const secret = await readSecretCookie();
    if (!secret) {
      return errorResponse(
        new Error("Missing secret cookie — restart the Tradera connect flow."),
      );
    }

    const { token, hardExpirationTime } = await fetchToken(userId, secret);
    const auth: TraderaUserAuth = {
      userId,
      token,
      expiresAt: hardExpirationTime,
    };

    const res = NextResponse.redirect(
      new URL("/?tradera=connected", getAppBaseUrl()),
    );
    res.cookies.set(
      TRADERA_TOKEN_COOKIE,
      JSON.stringify(auth),
      cookieOptions(60 * 60 * 24 * 7),
    );
    res.cookies.set(TRADERA_SECRET_COOKIE, "", cookieOptions(0));
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
