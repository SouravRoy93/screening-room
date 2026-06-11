# Screening Room — Claude Context File

Paste this file at the start of any Claude conversation to build new features without breaking existing architecture, UI, or conventions.

---

## What This App Is

**Screening Room** is a personal city guide and media tracker for NYC. It has three verticals:
- **Films** — track movies and TV shows (want to watch, watching, watched + ratings)
- **Dining** — curated NYC restaurant guide with Google Places integration
- **Places** — curated NYC landmarks, experiences, and hidden gems

Users sign in via Supabase Auth. Their tracking data (watched, want, ratings, notes) is stored in Supabase. The JSON data files (catalog, restaurants, places) are static files served from `public/`.

---

## Repository Structure

```
screening-room/                        ← repo root
├── artifacts/
│   ├── screening-room/                ← React + Vite frontend (the main app)
│   │   ├── src/
│   │   │   ├── App.tsx                ← routing (wouter), auth gate
│   │   │   ├── types.ts               ← all shared TypeScript interfaces
│   │   │   ├── index.css              ← all global styles + CSS variables
│   │   │   ├── main.tsx               ← React entry point
│   │   │   ├── pages/                 ← one file per route
│   │   │   │   ├── hub.tsx            ← home screen with 3 vertical tiles
│   │   │   │   ├── films.tsx          ← Films tab
│   │   │   │   ├── media-detail-page.tsx ← film/show detail
│   │   │   │   ├── dining.tsx         ← Dining tab
│   │   │   │   ├── dining-detail-page.tsx
│   │   │   │   ├── places.tsx         ← Places tab
│   │   │   │   ├── place-detail-page.tsx
│   │   │   │   ├── social.tsx         ← Social tab (stub, ready to build)
│   │   │   │   ├── auth.tsx           ← Supabase Auth UI
│   │   │   │   └── not-found.tsx
│   │   │   ├── components/
│   │   │   │   ├── aurora-bg.tsx      ← animated gradient background
│   │   │   │   ├── media-card.tsx     ← film/show card
│   │   │   │   ├── media-detail-panel.tsx
│   │   │   │   ├── episode-banner.tsx
│   │   │   │   ├── ratings-chart.tsx
│   │   │   │   └── ui/                ← shadcn/ui components (don't modify)
│   │   │   ├── hooks/
│   │   │   │   ├── use-auth.ts        ← Supabase session + user
│   │   │   │   ├── use-catalog.ts     ← loads films, dining, places JSON
│   │   │   │   ├── use-tracked.ts     ← read/write tracked items to Supabase
│   │   │   │   ├── use-toast.ts
│   │   │   │   └── use-mobile.tsx
│   │   │   └── lib/
│   │   │       ├── supabase.ts        ← Supabase client (reads env vars)
│   │   │       └── utils.ts           ← cn() utility
│   │   ├── public/
│   │   │   ├── catalog.json           ← films/shows data
│   │   │   ├── dining.json            ← restaurant data
│   │   │   ├── places.json            ← places data (43 NYC entries)
│   │   │   └── cities.json            ← city metadata
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── api-server/                    ← Express + TypeScript backend
│       └── src/
│           ├── app.ts                 ← Express app setup
│           ├── index.ts               ← server entry (reads PORT env var)
│           └── routes/
│               ├── index.ts           ← mounts all routers
│               ├── health.ts          ← GET /health
│               ├── tmdb.ts            ← TMDB proxy (films/shows search + detail)
│               ├── places.ts          ← Google Places routes
│               └── notifications.ts
├── lib/                               ← shared TypeScript packages
│   ├── api-spec/                      ← OpenAPI spec (orval codegen)
│   ├── api-client-react/              ← generated React Query hooks
│   └── api-zod/                       ← generated Zod schemas
└── pnpm-workspace.yaml
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Routing | wouter (NOT react-router) |
| Styling | Tailwind CSS v4, shadcn/ui components |
| State / data fetching | TanStack React Query |
| Auth | Supabase Auth |
| Database | Supabase (PostgreSQL) |
| Backend | Express.js + TypeScript |
| Package manager | pnpm (monorepo via pnpm-workspace) |
| Film/show data | TMDB API (via backend proxy) |
| Restaurant live data | Google Places API (via backend proxy) |

---

## Design System — Do Not Change

The app has a fixed dark theme. Never change these:

**Colours:**
- Background: near-black navy `hsl(240 23.5% 4.1%)`
- Cards: `hsl(240 18.4% 9.6%)`
- Primary accent: purple `hsl(258 90.5% 66.3%)`
- Pink accent / CTA gradient: `#ec4899` → `#be185d`
- Full accent gradient: `linear-gradient(135deg, #8b5cf6, #ec4899)`

**Fonts (defined as CSS variables):**
- `font-display` → Oswald (headings, section titles)
- `font-serif` → Cormorant Garamond (editorial callouts)
- `font-sans` → Inter (body, labels, UI)

**Components:** Always use shadcn/ui from `@/components/ui/`. Never write raw `<button>` or `<input>` elements — use `<Button>`, `<Input>` etc.

**Icons:** Use `lucide-react` only.

---

## Routing Pattern

Routes are defined in `App.tsx` using wouter. To add a new page:

1. Create `artifacts/screening-room/src/pages/your-page.tsx`
2. Add the import and `<Route>` to `App.tsx`

```tsx
// App.tsx
import YourPage from "@/pages/your-page";
// inside <Switch>:
<Route path="/your-path" component={YourPage} />
```

All routes are behind the auth gate — unauthenticated users always see `<Auth />`.

---

## Adding a New API Endpoint

1. Create `artifacts/api-server/src/routes/your-route.ts`
2. Export a Router and mount it in `artifacts/api-server/src/routes/index.ts`

```ts
// your-route.ts
import { Router } from "express";
const router = Router();
router.get("/your-endpoint", async (req, res) => { ... });
export default router;
```

```ts
// routes/index.ts — add:
import yourRouter from "./your-route";
router.use(yourRouter);
```

**Important:** The API server does NOT hot-reload TypeScript. After any `.ts` change in `api-server/`, restart its workflow.

The frontend calls the API at `import.meta.env.VITE_API_URL` (set to `/api` in dev). Always use:
```ts
const API_BASE = import.meta.env.VITE_API_URL || "";
fetch(`${API_BASE}/your-endpoint`)
```

---

## Auth Pattern

```ts
import { useAuth } from "@/hooks/use-auth";
const { user, loading } = useAuth();
// user is a Supabase User object or null
// loading is true while session is being checked
```

The Supabase client is a singleton at `@/lib/supabase`. Import it directly when you need raw Supabase access:
```ts
import { supabase } from "@/lib/supabase";
```

---

## Data & Types

All shared TypeScript types live in `artifacts/screening-room/src/types.ts`. The key types are:

- `MediaItem` — a film or TV show
- `TrackedItem` — a user's tracked entry (status, rating, notes)
- `DiningItem` — a restaurant from `dining.json`
- `PlaceItem` — a place from `places.json`

**Always add new types to `types.ts`, never inline them in page files.**

JSON data is loaded via hooks in `use-catalog.ts`:
```ts
import { usePlaces, useDining, useCatalog } from "@/hooks/use-catalog";
```

---

## Supabase Schema

Table: `tracked_items`

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK to auth.users |
| vertical | text | `"films"`, `"dining"`, `"places"` |
| tmdb_id | text | unique item identifier |
| media_type | text | `"movie"`, `"tv"`, `"dining"`, `"places"` |
| title | text | |
| status | text | `"want"`, `"watching"`, `"watched"` |
| rating | numeric | nullable |
| meta | jsonb | notes, tags, custom data |
| updated_at | timestamptz | |

Upsert key: `(user_id, vertical, tmdb_id)` — never insert duplicates, always upsert.

---

## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase anon key |
| `VITE_API_URL` | Frontend | Points to `/api` in dev |
| `GOOGLE_API_KEY` | Backend | Google Places API |
| `GOOGLE_PLACES_API_KEY` | Backend | Google Places (new API) |
| `TMDB_API_KEY` | Backend | TMDB for films/shows |
| `PORT` | Backend | Set by Replit; server must use this |

Never hardcode API keys. Never add keys to the frontend — proxy all external API calls through the Express backend.

---

## How to Add a New Feature (checklist for Claude)

### New page / tab
- [ ] Create `src/pages/feature.tsx` — export a default React component
- [ ] Add route in `App.tsx`
- [ ] Add nav tile in `src/pages/hub.tsx` if it's a top-level vertical
- [ ] Add any new types to `src/types.ts`

### New backend endpoint
- [ ] Create `api-server/src/routes/feature.ts`
- [ ] Mount in `api-server/src/routes/index.ts`
- [ ] Restart the API server workflow after changes

### New data in JSON
- [ ] Edit `artifacts/screening-room/public/places.json` / `dining.json` / `catalog.json`
- [ ] Keep the existing schema — add fields, never remove or rename existing ones
- [ ] Update the corresponding TypeScript type in `types.ts` if adding fields

### UI components
- [ ] Always use shadcn/ui from `@/components/ui/`
- [ ] Use the accent gradient `linear-gradient(135deg, #8b5cf6, #ec4899)` for primary CTAs
- [ ] Use `font-display` (Oswald) for headings, `font-sans` (Inter) for body
- [ ] Dark backgrounds only — this is a dark-only app, no light mode

---

## What's Already Built

- ✅ Auth (Supabase — email/password + magic link)
- ✅ Hub home screen
- ✅ Films tab — search TMDB, track status, rate, detail page
- ✅ Dining tab — curated NYC restaurants, filters, Google Places live data, detail page
- ✅ Places tab — 43 curated NYC places, mood/style filters, live Google Places search, detail page, weather widget
- ✅ Tracking persisted to Supabase
- ✅ Social page stub (route exists, ready to build)

## What's Not Built Yet (next steps)

- ❌ Social / shared lists — friends, shared watchlists, activity feed
- ❌ Notifications — new episode alerts, friend activity
- ❌ More cities — London, LA, Paris (architecture already supports it via `city` field on PlaceItem)
- ❌ GitHub Actions data pipeline — auto-refresh `places.json` and `catalog.json` on a schedule
- ❌ Monetisation — affiliate links, premium tier
