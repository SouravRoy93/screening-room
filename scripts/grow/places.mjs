// ============================================================================
//  GROW PLACES — daily growth engine for the Places catalog.
//  Writes artifacts/screening-room/public/places.json (the file the app reads).
//
//  Same shape as dining.mjs:  discover(Google) → editorial(Claude) → record → save
//   • discover : Google Places Text Search (New v1) → notable attractions/landmarks
//                per city, with location + types + editorial summary + a photo ref.
//   • editorial: Claude Haiku writes the guide copy, grounded in Google's facts.
//   • record   : stores place_id + photoName (NOT an image URL). The app resolves
//                the photo LIVE — exactly like restaurant cards — which is ToS-safe
//                (Google photo URLs may not be stored and expire).
//
//  Backward-compatible: existing curated places keep their `img`; new ones use
//  `photoName` (the app prefers `img`, then resolves `photoName` live).
//
//  Env (GitHub Actions secrets): GOOGLE_PLACES_API_KEY (or GOOGLE_API_KEY), ANTHROPIC_API_KEY
//  Optional env: NEW_PER_RUN (default 18), PLACES_FILE, CITIES_FILE
// ============================================================================
import { anthropicJSON, loadJson, saveJson, pick, clamp, norm, keyOf, intEnv } from "./_shared.mjs";

const GKEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
const PLACES_FILE = process.env.PLACES_FILE || "artifacts/screening-room/public/places.json";
const CITIES_FILE = process.env.CITIES_FILE || "scripts/grow/cities.json";
const NEW_PER_RUN = intEnv("NEW_PER_RUN", 18);

// ---- controlled vocabulary the app understands ----
const STYLES = ["Iconic","Hidden gems","Luxury","Romantic","Food & cafés","Culture","Nature & views","Nightlife","Shopping","Wellness","Photography","Family"];
const MOODS  = ["beautiful","romantic","calm","premium","hidden","iconic","photo","quick","avoid-crowds","classy","culture","wellness","family"];
const BADGES = ["Editor's Pick","First-Timer","Local Favorite","Quiet Luxury","Best at Sunset","Best for Couples","Worth the Price","Reservation Essential","Avoid Peak Hours","Tourist Heavy"];
const CROWD  = ["Low","Moderate","High"];
// rotated each run so a city keeps surfacing NEW places over time (text search caps ~20/query)
const CATEGORIES = ["top tourist attractions","famous landmarks","best museums","beautiful parks and gardens","scenic viewpoints and observation decks","historic sites and architecture","iconic cultural venues"];

// ---- 1) DISCOVER ----
async function discover(city, category) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GKEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types,places.rating,places.userRatingCount,places.editorialSummary,places.photos,places.shortFormattedAddress,places.formattedAddress"
    },
    body: JSON.stringify({
      textQuery: `${category} in ${city.name}`,
      maxResultCount: 20,
      locationBias: (city.lat != null) ? { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 40000 } } : undefined
    })
  });
  if (!r.ok) throw new Error("Places HTTP " + r.status + " " + (await r.text()).slice(0, 120));
  const d = await r.json();
  return (d.places || []).map(p => ({
    placeId: p.id,
    name: (p.displayName && p.displayName.text || "").trim(),
    lat: p.location && p.location.latitude, lng: p.location && p.location.longitude,
    types: p.types || [],
    summary: (p.editorialSummary && p.editorialSummary.text) || "",
    address: p.shortFormattedAddress || p.formattedAddress || "",
    photoName: (p.photos && p.photos[0] && p.photos[0].name) || null
  })).filter(p => p.name && p.placeId);
}

// ---- 2) EDITORIAL ----
async function editorial(cand, city) {
  const facts = { name: cand.name, city: city.short, country: city.country, address: cand.address, types: cand.types.slice(0, 6), google_summary: cand.summary };
  const system = "You are the editor of a premium, tasteful city-discovery guide. Concise, evocative, accurate. Never invent specific prices, exact hours, or named restaurants you are unsure about — keep it general when unsure. Output ONLY valid minified JSON.";
  const user = `Place facts:
${JSON.stringify(facts)}

Return JSON with EXACTLY these keys:
{"area":"neighborhood/district","vibe":"one evocative sentence (max ~14 words)","styles":["2-4 from: ${STYLES.join(", ")}"],"moods":["3-5 from: ${MOODS.join(", ")}"],"best":"best time (short)","dur":<minutes 30-180 int>,"crowd":"Low|Moderate|High","price":"Free|$|$$|$$$ (add ' (suggested)' for donation museums)","dress":"short guidance","hours":"typical hours, general if unsure","resv":"No|Recommended|Yes — timed ticket","photo":"the single best photo spot","cafe":"a fitting café nearby (general if unsure)","dinner":"a fitting dinner spot nearby (general if unsure)","insider":"one genuine insider tip (max ~22 words)","worth":"Worth it if …","skip":"Skip if …","badges":["1-3 from: ${BADGES.join(", ")}"],"scores":{"b":<1-5 beauty>,"u":<1-5 unique>,"c":<1-5 calm>,"e":<1-5 ease>,"v":<1-5 value>,"l":<1-5 luxury>},"rain":<true if pleasant in rain>}`;
  return anthropicJSON({ system, user, maxTokens: 900 });
}

// ---- 3) RECORD (exact app schema; photo resolved LIVE via place_id/photoName) ----
function record(id, cand, e, city) {
  const s = e.scores || {};
  return {
    id, name: cand.name,
    area: norm(e.area) || "—",
    vibe: norm(e.vibe),
    styles: pick(e.styles, STYLES, 2, 4),
    moods: pick(e.moods, MOODS, 3, 5),
    best: norm(e.best) || "Anytime",
    dur: Math.max(20, Math.min(240, parseInt(e.dur, 10) || 60)),
    crowd: CROWD.includes(e.crowd) ? e.crowd : "Moderate",
    price: norm(e.price) || "Free",
    dress: norm(e.dress) || "Comfortable",
    hours: norm(e.hours) || "Varies",
    resv: norm(e.resv) || "No",
    photo: norm(e.photo),
    cafe: norm(e.cafe) || "A café nearby",
    dinner: norm(e.dinner) || "Dinner nearby",
    insider: norm(e.insider),
    worth: norm(e.worth),
    skip: norm(e.skip),
    badges: pick(e.badges, BADGES, 1, 3),
    scores: { b: clamp(s.b), u: clamp(s.u), c: clamp(s.c), e: clamp(s.e), v: clamp(s.v), l: clamp(s.l) },
    rain: !!e.rain,
    img: null, placeId: cand.placeId, photoName: cand.photoName, imgAttr: "via Google",
    imgLink: cand.placeId ? ("https://www.google.com/maps/place/?q=place_id:" + cand.placeId) : null,
    lat: cand.lat, lng: cand.lng, city: city.short, country: city.country
  };
}

// ---- 4) MAIN ----
async function main() {
  if (!GKEY) { console.error("Missing GOOGLE_PLACES_API_KEY / GOOGLE_API_KEY"); process.exit(1); }
  const cities = loadJson(CITIES_FILE, null);
  if (!cities) { console.error("cities.json not found at " + CITIES_FILE); process.exit(1); }
  const places = loadJson(PLACES_FILE);
  for (const p of places) { if (!p.city) p.city = "New York"; if (!p.country) p.country = "United States"; }

  const haveNames = new Set(places.map(p => keyOf(p.name)));
  const havePids  = new Set(places.map(p => p.placeId).filter(Boolean));
  let maxId = places.reduce((m, p) => Math.max(m, +p.id || 0), 0);
  // rotate the discovery category by day so each run surfaces new places
  const dayIdx = Math.floor(Date.now() / 86400000);

  let added = 0;
  for (const city of cities) {
    if (added >= NEW_PER_RUN) break;
    for (let k = 0; k < CATEGORIES.length && added < NEW_PER_RUN; k++) {
      const category = CATEGORIES[(dayIdx + k) % CATEGORIES.length];
      let cands;
      try { cands = await discover(city, category); }
      catch (e) { console.warn("discover failed:", city.short, category, "-", e.message); continue; }
      const fresh = cands.filter(c => !havePids.has(c.placeId) && !haveNames.has(keyOf(c.name)));
      if (!fresh.length) continue;
      console.log(city.short, "/", category, "—", fresh.length, "new candidates.");
      for (const c of fresh) {
        if (added >= NEW_PER_RUN) break;
        try {
          const e = await editorial(c, city);
          places.push(record(++maxId, c, e, city));
          haveNames.add(keyOf(c.name)); havePids.add(c.placeId);
          added++; console.log("  + [" + maxId + "] " + c.name + "  (" + city.short + ")");
        } catch (err) { console.warn("  ! skipped", c.name, "-", err.message); }
      }
    }
  }
  saveJson(PLACES_FILE, places);
  console.log("\nAdded " + added + " places. Catalog now " + places.length + " total.");
}
main().catch(e => { console.error(e); process.exit(1); });
