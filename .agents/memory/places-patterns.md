---
name: Places tab patterns
description: Key decisions for the Places tab — routing, localStorage, live search, dataset
---

## Routing
- Place detail is a full-page route `/places/:id` → `PlaceDetailPage` (matches Entertainment's `/films/:type/:id` pattern)
- Uses `mdp-root` / `mdp-hero` / `mdp-back` CSS classes (shared with Entertainment detail)
- Back button navigates to `/places`

## localStorage keys
- `pl_saved` — Record<number, boolean> — curated "Want to go" (keyed by place numeric id)
- `pl_visited` — Record<number, boolean> — curated "Been there"
- `gpl_saved` — Record<string, boolean> — Google live results "Want to go" (keyed by Google place_id)
- `gpl_visited` — Record<string, boolean> — Google live results "Been there"
- `pl_styles`, `pl_pace` — onboarding preferences

## Live Google search
- API endpoint: `GET /api/places/explore?q=...` (general landmark/attraction search, not restaurant-specific)
- Existing `/api/places/search` is restaurant-only (used by Dining tab) — don't modify it
- Frontend: 700ms debounce on `searchQ`, calls explore endpoint, shows skeleton cards while loading
- Google API key never sent to browser — CDN photo URLs resolved server-side in `resolveCdnUrl()`

## Dataset
- `public/places.json` — 43 curated NYC places as of last session
- All major NYC landmarks covered: Central Park, Met, High Line, Statue of Liberty, Empire State, MoMA, Guggenheim, Rockefeller Center, Flatiron, Washington Square Park, Brooklyn Bridge Park, Governors Island, Coney Island, and more
- Schema fields: id, name, area, vibe, styles[], moods[], best, dur, crowd, price, dress, hours, resv, photo, cafe, dinner, insider, worth, skip, badges[], scores{b,u,c,e,v,l}, rain, img, imgAttr, imgLink, lat, lng, city, country

## Search logic
- Searches: name, area, vibe, badges[], styles[]
- Local results shown under "In our guide"; Google results shown under "Live from Google"
- Both sections shown simultaneously when searchQ is active

## API server note
- API server does NOT hot-reload TypeScript — must restart workflow after any `.ts` changes
