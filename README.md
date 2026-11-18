# Tinki

Share one link to all your social profiles, custom links, and customizable QR code.

## Architecture & Stack

- **Framework:** TanStack Start + TanStack Router (`src/routes/`) built with Vite (`vite.config.ts`) and React 19.
- **Auth, Database & Media Storage:** Firebase Authentication (Email/Password & Google Sign-In) and Cloud Firestore (`src/lib/firestore-repository.ts`, `firebase-applet-config.json`, `firestore.rules`).
- **Server API & Media Proxy:** Request handlers in `src/server/api-router.server.ts` serve Firestore-backed public reads, analytics ingestion (`POST /api/events`), Firebase Auth API proxying (`/api/firebase-proxy/*`), `/media/*` serving, and account deletion (`DELETE /api/auth/account`).

## Data Storage & Single Source of Truth

**Cloud Firestore is the single source of truth** for all application data and media in production and by default (`accounts`, `profiles`, `usernames`, `custom_links`, `social_link_settings`, `profile_events`, and `media_objects`).

### Key Architectural Decisions

- **No fallback-on-empty:** Read endpoints (`/api/profiles/by-username/*`, `/api/profiles/:id/custom-links`, `/api/profiles/:id/social-settings`, `/api/usernames/available`, `/media/*`) and client data fetchers treat Firestore as authoritative. Empty results from Firestore (for example, a profile with zero custom links) are returned directly and never fall back to the local JSON store. Upstream Firestore errors fail explicitly (`502`) rather than silently serving stale local data.
- **Local store is strictly dev/test-only:** The local JSON store (`TinkiStore`, backed by `db.json` in `TINKI_DATA_DIR`, defaulting to `/tmp/tinki-data`) is disabled by default and permanently blocked when `NODE_ENV=production`. It is only active in non-production environments when explicitly opted in via `ENABLE_LOCAL_STORE=true` for offline local development and automated test suites.
- **Debounced persistence & visible errors:** When active, `TinkiStore.persist()` coalesces rapid bursts of mutations (such as analytics events) via a debounced async atomic write (`flush()` writes a temporary file and renames it) instead of rewriting `db.json` synchronously on every mutation. Filesystem and parse errors are logged with `console.error` rather than swallowed silently.
- **Per-instance rate limiting & trusted proxy IP extraction:** `SlidingWindowRateLimiter` and `HourlyViewDeduplicator` in `src/server/api-router.server.ts` keep state in per-instance memory (each server replica tracks independent windows because the server runs without a Redis cluster or Firebase Admin credentials). Client IPs are extracted via `TRUSTED_PROXY_HEADER` when set (e.g. `cf-connecting-ip`, `x-vercel-forwarded-for`) or otherwise from the **last** entry appended to `X-Forwarded-For`, never the spoofable first entry.

## Environment Variables

No secrets or `.env` files live in this repository. Only `.env.example` is committed; `.env` and `.env.*` are ignored via `.gitignore`, and runtime secrets such as `AUTH_SECRET` must be provided through local environment files or deployment secrets.

Copy `.env.example` to `.env` if you need to override defaults locally:

```sh
cp .env.example .env
```

- `AUTH_SECRET` — HMAC session signing secret (`>= 32` characters; required in production).
- `FIREBASE_API_KEY` — Optional server override for the Firebase Web API key (defaults to `firebase-applet-config.json`).
- `FIREBASE_PROJECT_ID` — Optional server override for the Firebase project ID (defaults to `firebase-applet-config.json`).
- `TINKI_DATA_DIR` — Directory for local store files when `ENABLE_LOCAL_STORE=true` (default: `/tmp/tinki-data`).
- `ENABLE_LOCAL_STORE` — Set to `true` only to enable the local JSON fallback store during offline development or tests. Ignored when `NODE_ENV=production`. Defaults to disabled (`false`).
- `SEED_DEMO` — Set to `true` alongside `ENABLE_LOCAL_STORE=true` in non-production to seed a demo account (`@sara`). Never seeds in production.
- `TRUSTED_PROXY_HEADER` — Optional single trusted header name used by `getClientIp()` for rate limiting (e.g. `cf-connecting-ip` on Cloudflare or `x-vercel-forwarded-for` on Vercel). Defaults to the last `X-Forwarded-For` entry appended by the reverse proxy.

## Development & Verification

```sh
npm install
npm run dev
```

Run checks and tests:

```sh
npm test
npm run build
```
