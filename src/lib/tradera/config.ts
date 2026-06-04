import "server-only";

/**
 * Tradera API configuration.
 *
 * All secrets are read from environment variables on the server only. Nothing in
 * this module is safe to import from a Client Component.
 *
 * Register an application at https://api.tradera.com/ to obtain, per app:
 *   - Application ID  (integer)               -> TRADERA_APP_ID
 *   - App Key         (a.k.a. "Service Key")  -> TRADERA_APP_KEY
 *   - Public Key      (token-login flow)      -> TRADERA_PUBLIC_KEY
 *
 * RATE-LIMIT POOLING: Tradera limits each *app* to ~100 calls per endpoint per
 * 24h. To raise read headroom, configure several apps and we rotate across them
 * for public read calls (see {@link pickAppCredentials}). Add more apps with
 * numbered suffixes: TRADERA_APP_ID_2/TRADERA_APP_KEY_2/TRADERA_PUBLIC_KEY_2, _3, …
 *
 * The PRIMARY app (unsuffixed) is special: the token-login flow and every
 * RestrictedService call (AddItem) use it, because a user token is only valid
 * for the app it was authorized under. Keep the primary app stable.
 */

/** SOAP XML namespace shared by all Tradera operations and headers. */
export const TRADERA_NS = "http://api.tradera.com";

/** Base URL for the v3 ASMX services. Override only for testing. */
export const TRADERA_API_BASE =
  process.env.TRADERA_API_BASE_URL?.replace(/\/$/, "") ??
  "https://api.tradera.com/v3";

/** Public token-login endpoint the user is redirected to in order to authorize the app. */
export const TRADERA_TOKEN_LOGIN_URL =
  process.env.TRADERA_TOKEN_LOGIN_URL ?? "https://api.tradera.com/token-login";

/** The ASMX services we talk to. */
export const TRADERA_SERVICES = {
  public: "PublicService.asmx",
  restricted: "RestrictedService.asmx",
  search: "SearchService.asmx",
} as const;

export type TraderaService = keyof typeof TRADERA_SERVICES;

export function serviceUrl(service: TraderaService): string {
  return `${TRADERA_API_BASE}/${TRADERA_SERVICES[service]}`;
}

/** Thrown when required configuration is missing. Surfaced to the client as a clear setup message. */
export class TraderaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraderaConfigError";
  }
}

export interface TraderaAppCredentials {
  appId: number;
  /** "App Key" / "Service Key" in the developer portal. Sent as <AppKey>. */
  appKey: string;
  /** Per-app public key, used in the token-login URL. */
  publicKey?: string;
}

function readApp(suffix: string): TraderaAppCredentials | null {
  const appId = Number(process.env[`TRADERA_APP_ID${suffix}`]);
  const appKey =
    process.env[`TRADERA_APP_KEY${suffix}`] ??
    (suffix === "" ? process.env.TRADERA_SERVICE_KEY : undefined) ??
    "";
  const publicKey = process.env[`TRADERA_PUBLIC_KEY${suffix}`];
  if (!Number.isInteger(appId) || appId <= 0 || appKey.length === 0) return null;
  return { appId, appKey, publicKey: publicKey || undefined };
}

const MISSING_CREDS_MESSAGE =
  "Tradera app credentials are missing. Set TRADERA_APP_ID and TRADERA_APP_KEY in your environment (.env.local). Register an app at https://api.tradera.com/ to get them.";

/** All configured app credentials, primary first. Used for rate-limit pooling. */
export function getAppPool(): TraderaAppCredentials[] {
  const pool: TraderaAppCredentials[] = [];
  const primary = readApp("");
  if (primary) pool.push(primary);
  for (let i = 2; i <= 10; i++) {
    const app = readApp(`_${i}`);
    if (app) pool.push(app);
  }
  return pool;
}

/**
 * The primary app — used for the token-login flow and RestrictedService (AddItem)
 * calls, which must use the app the user token was authorized under.
 */
export function getAppCredentials(): TraderaAppCredentials {
  const pool = getAppPool();
  if (pool.length === 0) throw new TraderaConfigError(MISSING_CREDS_MESSAGE);
  return pool[0];
}

/**
 * A pseudo-random app from the pool. Use for PUBLIC read calls (GetOfficialTime,
 * Search) to spread each app's per-endpoint daily quota. Random keeps it
 * stateless-friendly on serverless. Falls back to the only app when pool size 1.
 */
export function pickAppCredentials(): TraderaAppCredentials {
  const pool = getAppPool();
  if (pool.length === 0) throw new TraderaConfigError(MISSING_CREDS_MESSAGE);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Whether at least one app is configured (no throw). */
export function hasAppCredentials(): boolean {
  return getAppPool().length > 0;
}

/** Number of pooled apps, for status reporting. */
export function getAppPoolSize(): number {
  return getAppPool().length;
}

/** Public key of the primary app, for the token-login URL. */
export function getPublicKey(): string {
  const key = getAppCredentials().publicKey ?? process.env.TRADERA_PUBLIC_KEY ?? "";
  if (key.length === 0) {
    throw new TraderaConfigError(
      "TRADERA_PUBLIC_KEY is missing for the primary app. It is required for the user token-login flow.",
    );
  }
  return key;
}

/**
 * Whether to run against Tradera's sandbox. Defaults to ON so we never touch the
 * live marketplace by accident. Set TRADERA_SANDBOX=false to go live (needed for
 * real pricing comparables).
 */
export function isSandbox(): boolean {
  return (process.env.TRADERA_SANDBOX ?? "true").toLowerCase() !== "false";
}

/**
 * Base URL of this app, used to build the token-login return URL.
 * On Vercel this is provided automatically; locally it defaults to localhost:3000.
 */
export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
