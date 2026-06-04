# Loppis Helper

Photograph an item → get an AI-drafted, priced Swedish listing → post it to
**Tradera** via API, or hand it off pre-filled to **Blocket / Facebook
Marketplace**. (Auto-posting is Tradera-only — Blocket and FB don't offer open
listing APIs, so those are a copy/deep-link handoff by design.)

This repository is at its **first milestone**: the project scaffold plus the
**Tradera authentication spike** (the first thing to de-risk), with the
Anthropic identify/draft route wired in as the next satisfying bit.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind v4** + **shadcn/ui**
- Next.js **route handlers** as a thin backend so Tradera and Anthropic secrets
  never reach the client.

## What works vs. what needs real credentials

| Area | State |
| --- | --- |
| Project scaffold, UI, build, typecheck, lint | ✅ Verified locally |
| Route handlers + typed Tradera SOAP client | ✅ Written & compiling |
| Anthropic identify/draft route (`/api/identify`) | ✅ Functional with a real `ANTHROPIC_API_KEY` |
| Live Tradera calls (`ping`, token flow, `AddItem`) | ⚠️ **Untested against the live API** — see below |

**Honest status on the Tradera spike.** The Tradera Developer API is a
SOAP/ASMX API (`https://api.tradera.com/v3/*.asmx`). The integration here is
built to the documented shape — `AuthenticationHeader` (AppId/AppKey) +
`AuthorizationHeader` (UserId/Token), `GetOfficialTime` as the smoke test, and
`RestrictedService.AddItem` for the test listing — but it has **not** been run
against the live API yet, for two reasons:

1. It requires **real developer credentials** (an app registered at
   <https://api.tradera.com/>), which only you can create.
2. The original build environment's network policy blocked `api.tradera.com`, so
   a live call couldn't be made from there. A normal deployment has no such
   restriction.

Where the wire format is reconstructed from documentation rather than verified
against the live WSDL, the code is marked with `VERIFY:` comments (e.g. the
`FetchToken` result shape, the `AddItem` field names, the token-login query
params, and the sandbox toggle). Treat the first live run as the real test of
the spike — the routes return the raw SOAP fault and HTTP status so you can
iterate quickly.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

The home page is a small console for driving the spike:

1. **Test connection** → `GET /api/tradera/ping` (needs `TRADERA_APP_ID` + `TRADERA_APP_KEY`)
2. **Connect Tradera account** → token-login flow (`/api/tradera/token/start` → `…/callback`)
3. **Post test listing** → `POST /api/tradera/test-listing` (needs a connected user + `TRADERA_TEST_CATEGORY_ID`)
4. **Identify & draft** → `POST /api/identify` (needs `ANTHROPIC_API_KEY`)

See [`.env.example`](./.env.example) for every variable and where to get it.

## Project layout

```
src/
  app/
    page.tsx                     # spike console
    api/
      tradera/
        ping/route.ts            # GetOfficialTime smoke test (app-level auth)
        status/route.ts          # config/connection state (no secrets)
        token/start/route.ts     # begin token-login redirect
        token/callback/route.ts  # FetchToken -> store user token
        test-listing/route.ts    # AddItem — the hardcoded test listing
      identify/route.ts          # Anthropic vision -> structured Swedish draft
  lib/
    tradera/                     # config, types, SOAP transport, client, auth
    anthropic/                   # client + identify/draft logic
    api-response.ts              # error -> JSON mapping for routes
  components/
    loppis-spike.tsx             # the console UI
    ui/                          # shadcn/ui components
```

## Notes & next steps

- **Don't scrape Blocket or Facebook.** They're handoff targets, not data sources.
- **Sold ≠ asking prices.** Real pricing should come from Tradera completed/sold
  comparables (next milestone); the current AI price is a clearly-labelled guess.
- Build order from here: confirm the Tradera auth + AddItem spike live → pricing
  query against Tradera comparables → richer capture/draft UX → Blocket/FB
  prefilled handoff → polish.

> Token storage in this spike uses an httpOnly cookie, which is fine for a
> single-user dev setup. A real deployment should keep user tokens in a
> server-side session/store.
