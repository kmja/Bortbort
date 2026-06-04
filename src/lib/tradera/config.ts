import "server-only";

/**
 * Tradera API configuration.
 *
 * All secrets are read from environment variables on the server only. Nothing in
 * this module is safe to import from a Client Component.
 *
 * The Tradera Developer API is a SOAP/ASMX API. You must register an application
 * at https://api.tradera.com/ to obtain:
 *   - Application ID  (an integer)            -> TRADERA_APP_ID
 *   - Service Key     (a GUID-like string)    -> TRADERA_APP_KEY  (a.k.a. "AppKey")
 *   - Public Key      (used in the token flow) -> TRADERA_PUBLIC_KEY
 *
 * To act on behalf of a user (e.g. AddItem) you additionally need a per-user
 * token obtained through the token-login flow (see lib/tradera/client.ts).
 */

/** SOAP XML namespace shared by all Tradera operations and headers. */
export const TRADERA_NS = "http://api.tradera.com";

/** Base URL for the v3 ASMX services. Override only for testing. */
export const TRADERA_API_BASE =
  process.env.TRADERA_API_BASE_URL?.replace(/\/$/, "") ??
  "https://api.tradera.com/v3";

/** Public token-login endpoint the user is redirected to in order to authorize the app. */
export const TRADERA_TOKEN_LOGIN_URL =
  process.env.TRADERA_TOKEN_LOGIN_URL ?? "https://api.tradera.com/tokenlogin.aspx";

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
  /** "Service Key" in the Tradera developer portal. Sent as <AppKey> in the SOAP header. */
  appKey: string;
}

/** App-level credentials, required for every call (even public ones). */
export function getAppCredentials(): TraderaAppCredentials {
  const appId = Number(process.env.TRADERA_APP_ID);
  const appKey = process.env.TRADERA_APP_KEY ?? process.env.TRADERA_SERVICE_KEY ?? "";

  if (!Number.isInteger(appId) || appId <= 0 || appKey.length === 0) {
    throw new TraderaConfigError(
      "Tradera app credentials are missing. Set TRADERA_APP_ID and TRADERA_APP_KEY in your environment (.env.local). Register an app at https://api.tradera.com/ to get them.",
    );
  }
  return { appId, appKey };
}

/** Returns whether app-level credentials are present, without throwing. */
export function hasAppCredentials(): boolean {
  try {
    getAppCredentials();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether to run against Tradera's sandbox. Defaults to ON so we never touch the
 * live marketplace by accident during the spike. Set TRADERA_SANDBOX=false to go live.
 *
 * VERIFY: confirm how Tradera toggles sandbox mode (ConfigurationHeader.Sandbox vs.
 * separate sandbox app credentials) against the live docs:
 * https://api.tradera.com/v3/documentation/static.aspx?page=Sandbox
 */
export function isSandbox(): boolean {
  return (process.env.TRADERA_SANDBOX ?? "true").toLowerCase() !== "false";
}

/** Public key used to identify the app during the token-login redirect. */
export function getPublicKey(): string {
  const key = process.env.TRADERA_PUBLIC_KEY ?? "";
  if (key.length === 0) {
    throw new TraderaConfigError(
      "TRADERA_PUBLIC_KEY is missing. It is required for the user token-login flow.",
    );
  }
  return key;
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
