---
name: Screening Room architecture
description: Full stack setup for the Screening Room app — routes, env vars, artifact paths, and original design decisions
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
- `MediaDetailPanel` — slide-over from right, fetches detail+recs from API, has cast/rating/status
- `EpisodeBanner` — banner for new TV episodes on films page
- `MediaCard` — poster card with pscrim overlay (title inside poster), status row buttons

## ORIGINAL DESIGN — must preserve exactly
- Original app: https://souravroy93.github.io/screening-room/
- Hub: aurora bg, fixed top bar (hub-top/hub-brand/hub-user), animated shimmer intro-title, intro-eyebrow "✦ Your taste, beautifully kept", cat-grid with circular cat-medallion tiles (gradient border via mask trick), hub-hint "Tap a world to dive in"
- Cards: `.card` + `.poster` with `.pscrim` (title inside poster, gradient overlay), `.ptype` (Film/TV badge), `.badge-vote`, `.statusrow` buttons — want=#1098ad blue, watching=#f08c00 orange, watched=#2f9e44 green
- Films/Category header: `.cat-header-wrap` sticky bar, `.homebtn` "← Hub", `.cat-title-bar`, `.headright` with `.tabs`
- Stats: horizontal CSS `.bars` (genre → bar → count), NOT recharts charts
- Places: WARM CREAM editorial — `#places` scoped CSS, bg=#f4efe6, Cormorant Garamond, #a9803f gold — has onboarding flow (localStorage), mood filters, discover/map/saved views, detail overlay
- CSS variables: `--gold:#ffd36b`, `--pur:#8b5cf6`, `--grad:linear-gradient(135deg,#8b5cf6,#ec4899)`
- All original CSS lives in `src/index.css` (not Tailwind-only — a full CSS block at the bottom)

## Why: @supabase/supabase-js must be in dependencies (not just devDependencies) — was missing on first install, needed `pnpm add` to fix typecheck.
