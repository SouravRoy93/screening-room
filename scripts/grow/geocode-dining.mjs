// ============================================================================
//  geocode-dining.mjs — one-time / occasional backfill of lat,lng onto dining
//  items that lack coordinates, so the cross-vertical pairing engine can rank
//  every curated restaurant by real walking distance (not just the ~60% that
//  already have coords). Idempotent: only touches items missing lat/lng.
//
//  Env: GOOGLE_PLACES_API_KEY (or GOOGLE_API_KEY). Run: node scripts/grow/geocode-dining.mjs
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const FILE = process.env.DINING_FILE || "artifacts/screening-room/public/dining.json";
const KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY || "";
const BASE = "https://places.googleapis.com/v1";

if (!KEY) { console.error("Missing GOOGLE_PLACES_API_KEY"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(name, neighborhood, borough) {
  const query = `${name} ${neighborhood || ""} ${borough || ""} New York`.replace(/\s+/g, " ").trim();
  const r = await fetch(`${BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.location",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  const loc = d.places?.[0]?.location;
  return loc ? { lat: loc.latitude, lng: loc.longitude } : null;
}

const items = JSON.parse(readFileSync(FILE, "utf8"));
const missing = items.filter((x) => typeof x.lat !== "number" || typeof x.lng !== "number");
console.log(`${items.length} items, ${missing.length} missing coordinates.`);

let filled = 0;
for (const item of missing) {
  try {
    const geo = await geocode(item.name, item.neighborhood, item.borough);
    if (geo) { item.lat = geo.lat; item.lng = geo.lng; filled++; }
  } catch (e) {
    console.warn("skip", item.name, String(e).slice(0, 60));
  }
  await sleep(120); // stay polite / within rate limits
}

writeFileSync(FILE, JSON.stringify(items, null, 1));
console.log(`Filled ${filled}/${missing.length}. Wrote ${FILE}.`);
