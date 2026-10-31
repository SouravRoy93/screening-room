# Screening Room

A multi-vertical "track your taste in everything" app — **Entertainment** (movies & TV),
**Dining**, and **Places** (a curated city guide) — with a warm, concierge-style layer:
a time- and weather-aware "Tonight" hub, post-visit follow-ups, a preferred-name greeting,
a "Choose for me" button, and booking/calendar handoffs.

## Stack

- **Frontend** — React + Vite + Wouter + TanStack Query (`artifacts/screening-room/`), deployed as a Render **static site**.
- **API** — Express 5 (`artifacts/api-server/`), a Render **web service**; proxies TMDB + Google Places so keys stay server-side.
- **Auth + data** — Supabase (`@supabase/supabase-js`), table `tracked_items` (owner-only RLS).
- **Catalogs** — static JSON in `artifacts/screening-room/public/`, grown daily via GitHub Actions scheduled workflows + Claude editorial scripts (`scripts/grow/`).
- **Monorepo** — pnpm workspaces, TypeScript. CI runs typecheck and deterministic engine self-tests.

## Local development

```bash
pnpm install
cp .env.example .env          # fill in your own keys
pnpm run typecheck            # full typecheck across all packages
pnpm --filter @workspace/screening-room run dev   # frontend
pnpm --filter @workspace/api-server run dev        # API (separate terminal)
```

Self-contained engine tests (no test runner needed):

```bash
pnpm run selftest
```

## Deploy on Render

The repo ships a **`render.yaml`** blueprint (static frontend + Express API, both free tier).

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, point it at the repo. It creates both services from `render.yaml`.
3. Set the `sync: false` env vars in each service's dashboard (see `.env.example`):
   - **Frontend:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (= your API URL + `/api`).
   - **API:** `GOOGLE_PLACES_API_KEY`, `TMDB_KEY`, `ALLOWED_ORIGINS` (your frontend URL), `DATABASE_URL` (optional).
4. In Supabase → Auth → URL Configuration, add `https://<frontend>/reset` to the redirect allowlist.
5. For the daily catalog-grow workflows, add GitHub Actions secrets: `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `TMDB_KEY`. Also set Settings → Actions → General → Workflow permissions to **Read and write** so the bots can commit.

## Security notes

- **No secrets are committed.** All config comes from environment variables (`.env` locally, Render dashboard in prod). `.env` and Replit files are git-ignored.
- The Supabase **anon/publishable** key is safe to expose in the frontend bundle — access is enforced by row-level security. The Google Places and TMDB keys are kept **server-side only** and should be restricted (Google: limit by API + HTTP referrer).
