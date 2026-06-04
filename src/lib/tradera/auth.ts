import "server-only";

import { cookies } from "next/headers";

import type { TraderaUserAuth } from "./types";

/** Cookie holding the JSON-encoded {@link TraderaUserAuth}. */
export const TRADERA_TOKEN_COOKIE = "tradera_user_auth";
/** Short-lived cookie holding the secret key during the token-login round-trip. */
export const TRADERA_SECRET_COOKIE = "tradera_token_secret";

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Resolves the current user's Tradera authorization.
 *
 * Order of precedence:
 *   1. TRADERA_USER_ID + TRADERA_USER_TOKEN env vars — convenient for running the
 *      hardcoded test-listing spike without the interactive token-login flow.
 *   2. The cookie set by the token-login callback.
 *
 * NOTE: storing the token in a cookie is fine for a single-user dev spike. A real
 * deployment should keep user tokens in a server-side session/store.
 */
export async function getUserAuth(): Promise<TraderaUserAuth | null> {
  const envUserId = Number(process.env.TRADERA_USER_ID);
  const envToken = process.env.TRADERA_USER_TOKEN;
  if (Number.isInteger(envUserId) && envUserId > 0 && envToken) {
    return { userId: envUserId, token: envToken };
  }

  const store = await cookies();
  const raw = store.get(TRADERA_TOKEN_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TraderaUserAuth>;
    if (typeof parsed.userId === "number" && typeof parsed.token === "string") {
      return {
        userId: parsed.userId,
        token: parsed.token,
        expiresAt: parsed.expiresAt,
      };
    }
  } catch {
    // fall through to null on malformed cookie
  }
  return null;
}

/** Reads the in-flight secret key from its cookie during the token-login callback. */
export async function readSecretCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(TRADERA_SECRET_COOKIE)?.value ?? null;
}
