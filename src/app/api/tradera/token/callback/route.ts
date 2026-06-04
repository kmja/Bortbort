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
 * Token-login callback. Tradera redirects here (the app's "Accept Return URL")
 * after the user authorizes the app. Two modes:
 *   - "Display token on return URL" OFF (default): we get a userId and exchange
 *     (userId, secret) for a token via FetchToken.
 *   - "Display token on return URL" ON: the token is on the URL directly.
 *
 * VERIFY the exact query-parameter names Tradera appends on first live run.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const userId = Number(
      params.get("userId") ?? params.get("uid") ?? params.get("UserId"),
    );
    const directToken =
      params.get("token") ?? params.get("authToken") ?? params.get("Token");

    if (!Number.isInteger(userId) || userId <= 0) {
      return errorResponse(
        new Error(
          "Token-callbacken saknar ett giltigt userId. Kontrollera Accept Return URL i Tradera-portalen och försök igen.",
        ),
      );
    }

    let token = directToken;
    let expiresAt: string | undefined;

    if (!token) {
      const secret = await readSecretCookie();
      if (!secret) {
        return errorResponse(
          new Error("Saknar secret-cookie — starta om Tradera-anslutningen."),
        );
      }
      const fetched = await fetchToken(userId, secret);
      token = fetched.token;
      expiresAt = fetched.hardExpirationTime;
    }

    const auth: TraderaUserAuth = { userId, token, expiresAt };
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
