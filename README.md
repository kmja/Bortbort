# Loppis Helper

Photograph an item → get an AI-drafted, priced Swedish listing → post it to
**Tradera** via API, or hand it off pre-filled to **Blocket / Facebook
Marketplace**. (Auto-posting is Tradera-only — Blocket and FB don't offer open
listing APIs, so those are a copy/deep-link handoff by design.)

The end-to-end flow is in place — **capture → identify → editable draft → price
→ publish to Tradera / hand off to Blocket & Facebook**. Tradera credentials are
configured (with multi-app rate-limit pooling) and the token-login URL is
verified against the developer portal. The live SOAP calls still need a network
that can reach `api.tradera.com` to fully confirm — see "Going live (Tradera)".

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind v4** + **shadcn/ui**
- Next.js **route handlers** as a thin backend so Tradera and Anthropic secrets
  never reach the client.

## What works vs. what needs real credentials

| Area | State |
| --- | --- |
| Project scaffold, UI, build, typecheck, lint | ✅ Verified locally |
| Capture → identify → editable draft → price → share flow (UI) | ✅ Verified locally |
| Tradera config + **multi-app key pooling** | ✅ Verified locally (status reports the pool size) |
| Tradera token-login URL | ✅ Verified — generated URL matches the portal's Authorization URL byte-for-byte |
| Blocket / Facebook handoff (copy text, deep-link, download photo) | ✅ Client-side, works now |
| Anthropic identify/draft route (`/api/identify`) | ✅ Functional with a real `ANTHROPIC_API_KEY` (defaults to cheap Haiku 4.5) |
| Tradera pricing query (`/api/tradera/price`) | ⚠️ Built; uses **active asking** prices, not sold — see below |
| Live Tradera SOAP (`GetOfficialTime`, `Search`, `FetchToken`, `AddItem`) | ⚠️ **Not yet confirmed live** — build env can't reach `api.tradera.com` |

**Honest status on the Tradera integration.** The Tradera Developer API is a
SOAP/ASMX API (`https://api.tradera.com/v3/*.asmx`). Real credentials are now
configured and the token-login URL is confirmed against the portal. What's still
**unconfirmed** is the live SOAP wire format, because **the build environment's
network policy blocks `api.tradera.com`** (every call returns "Host not in
allowlist"). A normal machine or deployment has no such restriction.

These spots are reconstructed from docs and marked with `VERIFY:` comments — the
first live run is their real test (routes surface the raw SOAP fault + HTTP
status so you can iterate fast):

- `FetchToken` result shape (token field name / expiry)
- `AddItem` field/wrapper names and which are required
- `SearchService.Search` item price fields (asking-price comps today)
- whether `ConfigurationHeader.Sandbox` is the correct sandbox toggle

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
   calls `GET /api/tradera/price` and fills the price.
3. **Steg 3 — Publicera på Tradera (API)**: enter a Tradera category id and
   publish the current draft via `POST /api/tradera/list` (`AddItem`). Needs a
   connected account.
4. **Steg 4 — Dela till Blocket & Facebook**: copy title/description, open their
   create page, and download the photo to re-attach.

A collapsible **Diagnostik & Tradera-spik** section holds the raw tools:
connection test (`ping`), the token-login flow, and the hardcoded `AddItem` test
listing.

See [`.env.example`](./.env.example) for every variable and where to get it.

## Going live (Tradera)

1. **Credentials & pooling.** Tradera limits each app to ~100 calls/endpoint/24h.
   Configure several registered apps — the **primary** (`TRADERA_APP_ID`) handles
   the token-login flow + `AddItem`; extras (`TRADERA_APP_ID_2`, `_3`, …) are
   rotated automatically for public read calls (`GetOfficialTime`, `Search`),
   multiplying read headroom. The status bar shows the pool size.
2. **Accept Return URL.** In each app's portal page, set **Accept Return URL** to
   `<APP_BASE_URL>/api/tradera/token/callback`. Tradera generally wants a public
   HTTPS URL, so `localhost` may be rejected — deploy (e.g. Vercel) or use a
   tunnel, and set `APP_BASE_URL` to match. Then click **Anslut Tradera-konto**.
3. **Sandbox.** `TRADERA_SANDBOX=true` (default) keeps you off the live
   marketplace. Read-only `Search` is safe against production — set it to `false`
   to get real pricing comparables.

## Deploy to Vercel

The app is Vercel-ready. `vercel.json` pins the Stockholm region (`arn1`) for low
latency to Swedish users and Tradera — change or remove `regions` for your plan.

1. Import the repo at <https://vercel.com/new>. Next.js is auto-detected; the
   committed `.npmrc` (`legacy-peer-deps`) keeps install happy under React 19.
2. Add environment variables (Project Settings → Environment Variables):
   - `TRADERA_APP_ID`, `TRADERA_APP_KEY`, `TRADERA_PUBLIC_KEY` (primary app)
   - `TRADERA_APP_ID_2` / `…_KEY_2` / `…_PUBLIC_KEY_2`, `…_3` for the key pool
   - `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`)
   - `TRADERA_SANDBOX` (`true`/`false`), `TRADERA_TEST_CATEGORY_ID` (optional)
   - `APP_BASE_URL` is derived from the Vercel production URL automatically.
3. Deploy, then set each Tradera app's **Accept Return URL** to
   `https://<your-project>.vercel.app/api/tradera/token/callback` and click
   **Anslut Tradera-konto**.

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
        list/route.ts            # AddItem — publishes the current draft
        price/route.ts           # price suggestion from Tradera comparables
        categories/route.ts      # flattened category list for the picker
      identify/route.ts          # Anthropic vision -> structured Swedish draft
  lib/
    tradera/                     # config, types, SOAP, client, auth, pricing, categories
    anthropic/                   # client + identify/draft logic
    handoff.ts                   # Blocket/FB text formatting + create-page links
    api-response.ts              # error -> JSON mapping for routes
  components/
    loppis-app.tsx               # the capture -> draft -> price -> share flow
    handoff-panel.tsx            # copy text / open marketplace / download photo
    category-picker.tsx          # searchable Tradera category picker
    ui/                          # shadcn/ui components
```

## Notes & next steps

- **Don't scrape Blocket or Facebook.** They're handoff targets, not data sources.
- **Sold ≠ asking prices.** `/api/tradera/price` is scaffolded but currently
  reads **active** listings (asking prices) via `SearchService.Search`, so it
  caps confidence and labels the basis honestly. The open task is verifying
  whether `SearchService.SearchAdvanced` can return ended/sold comparables —
  marked `VERIFY` in `src/lib/tradera/pricing.ts`.
- Build order from here: confirm the live SOAP calls (auth, `Search`,
  `GetCategories`, `AddItem`) on a network that can reach Tradera → verify
  sold-data for pricing. Category discovery, draft→`AddItem` publishing, the
  Blocket/FB handoff, and Vercel deploy config are all done.

> Token storage in this spike uses an httpOnly cookie, which is fine for a
> single-user dev setup. A real deployment should keep user tokens in a
> server-side session/store.
