# Loppis Helper

Photograph an item → get an AI-drafted, priced Swedish listing → post it to
**Tradera** via API, or hand it off pre-filled to **Blocket / Facebook
Marketplace**. (Auto-posting is Tradera-only — Blocket and FB don't offer open
listing APIs, so those are a copy/deep-link handoff by design.)

The end-to-end flow is in place — **capture → identify → editable draft →
price → share** — with the Tradera auth + pricing integrations built against the
documented API shape (not yet verified live; see below).

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind v4** + **shadcn/ui**
- Next.js **route handlers** as a thin backend so Tradera and Anthropic secrets
  never reach the client.

## What works vs. what needs real credentials

| Area | State |
| --- | --- |
| Project scaffold, UI, build, typecheck, lint | ✅ Verified locally |
| Route handlers + typed Tradera SOAP client | ✅ Written & compiling |
| Capture → identify → editable draft → share flow (UI) | ✅ Verified locally |
| Blocket / Facebook handoff (copy text, deep-link, download photo) | ✅ Client-side, works now |
| Anthropic identify/draft route (`/api/identify`) | ✅ Functional with a real `ANTHROPIC_API_KEY` (defaults to cheap Haiku 4.5) |
| Tradera pricing query (`/api/tradera/price`) | ⚠️ Built; untested live. Uses **active asking** prices, not sold — see below |
| Live Tradera calls (`ping`, token flow, `AddItem`, `Search`) | ⚠️ **Untested against the live API** — see below |

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

The home page is the actual flow:

1. **Steg 1 — Fota & identifiera**: upload a photo (+ optional hint) →
   `POST /api/identify` (needs `ANTHROPIC_API_KEY`) → a structured draft.
2. **Steg 2 — Granska utkast**: every field is editable; **Hämta prisförslag**
   calls `GET /api/tradera/price` and fills the price (needs the Tradera app key).
3. **Steg 3 — Dela & publicera**: copy title/description, open Blocket or
   Facebook Marketplace, and download the photo to re-attach.

A collapsible **Diagnostik & Tradera-spik** section holds the raw spike tools:
connection test (`ping`), the token-login flow, and the hardcoded `AddItem` test
listing.

See [`.env.example`](./.env.example) for every variable and where to get it.

## Project layout

```
src/
  app/
    page.tsx                     # landing + flow
    api/
      tradera/
        ping/route.ts            # GetOfficialTime smoke test (app-level auth)
        status/route.ts          # config/connection state (no secrets)
        token/start/route.ts     # begin token-login redirect
        token/callback/route.ts  # FetchToken -> store user token
        test-listing/route.ts    # AddItem — the hardcoded test listing
        price/route.ts           # price suggestion from Tradera comparables
      identify/route.ts          # Anthropic vision -> structured Swedish draft
  lib/
    tradera/                     # config, types, SOAP transport, client, auth, pricing
    anthropic/                   # client + identify/draft logic
    handoff.ts                   # Blocket/FB text formatting + create-page links
    api-response.ts              # error -> JSON mapping for routes
  components/
    loppis-app.tsx               # the capture -> draft -> price -> share flow
    handoff-panel.tsx            # copy text / open marketplace / download photo
    ui/                          # shadcn/ui components
```

## Notes & next steps

- **Don't scrape Blocket or Facebook.** They're handoff targets, not data sources.
- **Sold ≠ asking prices.** `/api/tradera/price` is scaffolded but currently
  reads **active** listings (asking prices) via `SearchService.Search`, so it
  caps confidence and labels the basis honestly. The open task is verifying
  whether `SearchService.SearchAdvanced` can return ended/sold comparables —
  marked `VERIFY` in `src/lib/tradera/pricing.ts`.
- Build order from here: confirm the Tradera auth + AddItem spike live → verify
  sold-data for the pricing query → post the *current* draft to Tradera via
  `AddItem` (needs AI-category → Tradera-category-id mapping) → polish. The
  Blocket/FB handoff (copy + deep-link) is done.

> Token storage in this spike uses an httpOnly cookie, which is fine for a
> single-user dev setup. A real deployment should keep user tokens in a
> server-side session/store.
