import { type NextRequest, NextResponse } from "next/server";

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

/** Redirect back into the app so the user always lands on a real page, never a JSON dead-end. */
function backToApp(status: "connected" | "error", reason?: string): NextResponse {
  const url = new URL("/", getAppBaseUrl());
  url.searchParams.set("tradera", status);
  if (reason) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

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
      // The redirect reached us but without a userId — usually a param-name
      // mismatch or a return URL that dropped the query string.
      return backToApp(
        "error",
        "Tradera skickade tillbaka dig utan ett userId. Kontrollera Accept Return URL i portalen.",
      );
    }

    let token = directToken;
    let expiresAt: string | undefined;

    if (!token) {
      const secret = await readSecretCookie();
      if (!secret) {
        return backToApp(
          "error",
          "Secret-cookien saknas (gick den ut, eller blockerar webbläsaren cookies?). Starta om anslutningen.",
        );
      }
      const fetched = await fetchToken(userId, secret);
      token = fetched.token;
      expiresAt = fetched.hardExpirationTime;
    }

    const auth: TraderaUserAuth = { userId, token, expiresAt };
    const res = backToApp("connected");
    res.cookies.set(
      TRADERA_TOKEN_COOKIE,
      JSON.stringify(auth),
      cookieOptions(60 * 60 * 24 * 7),
    );
    res.cookies.set(TRADERA_SECRET_COOKIE, "", cookieOptions(0));
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Okänt fel vid token-hämtning.";
    return backToApp("error", message);
  }
}
