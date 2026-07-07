/**
 * App version, inlined at build time via next.config.ts `env`.
 * Client-safe (no secrets). Falls back to "dev" outside a Next build (e.g. tests).
 */
export const APP_VERSION = process.env.APP_VERSION ?? "dev";
export const APP_COMMIT = process.env.APP_COMMIT ?? "";

/** e.g. "v0.2.0 · 44a3f74" — shown in the UI so you can confirm the deployed build. */
export const VERSION_LABEL = APP_COMMIT
  ? `v${APP_VERSION} · ${APP_COMMIT}`
  : `v${APP_VERSION}`;
