import "server-only";

import { callTradera } from "./soap";
import type { TraderaUserAuth } from "./types";

/** The connected user's Tradera profile. Alias is best-effort. */
export interface TraderaProfile {
  userId: number;
  alias?: string;
}

/** Recursively find the first string value under any of `keys`. */
function findString(node: unknown, keys: string[]): string | undefined {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findString(n, keys);
      if (r) return r;
    }
    return undefined;
  }
  if (!node || typeof node !== "object") return undefined;
  const rec = node as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  for (const v of Object.values(rec)) {
    const r = findString(v, keys);
    if (r) return r;
  }
  return undefined;
}

export async function getProfile(userAuth: TraderaUserAuth): Promise<TraderaProfile> {
  try {
    const res = await callTradera<unknown>({
      service: "restricted",
      operation: "GetUserInfo",
      userAuth,
      parseAttributes: true,
    });
    const alias = findString(res, [
      "Alias",
      "UserName",
      "Username",
      "UserAlias",
      "MemberAlias",
      "LoginName",
    ]);
    return { userId: userAuth.userId, alias };
  } catch {
    return { userId: userAuth.userId };
  }
}
