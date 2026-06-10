---
name: Screening Room architecture
description: Full stack setup for the Screening Room app — routes, env vars, artifact paths
---

## Architecture
- **Frontend**: React+Vite at `artifacts/screening-room`, previewPath `/`, port 24459
- **API server**: Express at `artifacts/api-server`, previewPath `/api`, port 8080
- **Supabase**: client-side auth + DB queries via `@supabase/supabase-js`

## Key env vars (set in .replit [userenv.shared])
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TMDB_KEY`, `VITE_API_URL=/api`, `TMDB_KEY`

## API routes (artifacts/api-server/src/routes/)
- `tmdb.ts`: GET /tmdb/movie/:id, /tmdb/movie/:id/recommendations, /tmdb/tv/:id, /tmdb/tv/:id/recommendations, /tmdb/search
- `notifications.ts`: POST /notifications/episodes — checks TMDB for episodes aired in last 7 days

## Frontend pages (artifacts/screening-room/src/pages/)
- auth.tsx → hub.tsx → films.tsx / dining.tsx / places.tsx / social.tsx

## Key components
- `MediaDetailPanel` — slide-over from right, fetches detail+recs from API, has trailer/cast/rating/status
- `EpisodeBanner` — bottom-right toast for new TV episodes
- `RatingsBarChart`, `WatchedOverTimeChart`, `GenrePieChart` — recharts stats

## Why: @supabase/supabase-js must be in dependencies (not just devDependencies) — was missing on first install, needed `pnpm add` to fix typecheck.
