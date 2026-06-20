// ============================================================================
//  GROW DINING — daily growth engine for the Dining catalog.
//  Writes artifacts/screening-room/public/dining.json (the file the app reads).
//
//  Shape (shared with places.mjs):  discover → editorial(Claude) → record → save
//   • discover : Google Places Text Search (New v1) → real NYC restaurants by
//                cuisine × area, with price level / rating / types.
//   • editorial: Claude Haiku writes the classification, grounded in the real facts.
//   • record   : exact dining schema. (Photos are fetched LIVE by the app's API,
//                so nothing photo-related is stored here — ToS-safe.)
//
//  Env (GitHub Actions secrets): GOOGLE_PLACES_API_KEY (or GOOGLE_API_KEY), ANTHROPIC_API_KEY
//  Optional env: NEW_PER_RUN (default 15), DINING_FILE, DINING_QUERIES_FILE
// ============================================================================
import { anthropicJSON, loadJson, saveJson, pick, clamp, norm, keyOf, intEnv } from "./_shared.mjs";

const GKEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
const DINING_FILE = process.env.DINING_FILE || "artifacts/screening-room/public/dining.json";
const QUERIES_FILE = process.env.DINING_QUERIES_FILE || "scripts/grow/dining-queries.json";
const NEW_PER_RUN = intEnv("NEW_PER_RUN", 15);

// ---- controlled vocabulary the app understands ----
const OCCASION = ["Date night","Big night out","Celebration","Casual","Group dinner","Solo","Business","Brunch","Late night","Quick bite","Drinks & bites"];
const PRICE_MAP = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
const NYC_BIAS = { rectangle: { low: { latitude: 40.49, longitude: -74.27 }, high: { latitude: 40.92, longitude: -73.68 } } };

// ---- 1) DISCOVER ----
async function discover(unit) {
  const query = `best ${unit.cuisine} restaurants in ${unit.neighborhood} ${unit.borough} New York`;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GKEY,
      "X-Goog-FieldMask": "places.displayName,places.priceLevel,places.rating,places.userRatingCount,places.types,places.primaryTypeDisplayName"
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 12, locationBias: NYC_BIAS, includedType: "restaurant" })
  });
  if (!r.ok) throw new Error("Places HTTP " + r.status + " " + (await r.text()).slice(0, 120));
  const d = await r.json();
  return (d.places || [])
    .filter(p => (p.types || []).some(t => /restaurant|food|cafe|bar/.test(t)))
    .map(p => ({
      name: (p.displayName && p.displayName.text || "").trim(),
      priceLevel: p.priceLevel || null,
      rating: p.rating || null, ratings: p.userRatingCount || null,
      primaryType: p.primaryTypeDisplayName && p.primaryTypeDisplayName.text || null
    }))
    .filter(p => p.name);
}

// ---- 2) EDITORIAL ----
async function editorial(cand, unit) {
  const facts = { name: cand.name, cuisine_hint: unit.cuisine, neighborhood: unit.neighborhood, borough: unit.borough,
    google_price: cand.priceLevel, rating: cand.rating, ratings_count: cand.ratings, primary_type: cand.primaryType };
  const system = "You classify NYC restaurants for a premium dining guide. Accurate and tasteful. Only claim a Michelin star / Bib Gourmand / James Beard award if it is genuinely well known; otherwise use 'Local favorite', 'Neighborhood gem', or ''. Output ONLY valid minified JSON.";
  const user = `Restaurant facts:
${JSON.stringify(facts)}

Return JSON with EXACTLY these keys:
{"cuisine":"clean cuisine label (e.g. Italian, Japanese, New American)","format":"short evocative format (e.g. 'Tasting-menu temple','Cozy trattoria','Buzzy izakaya','Counter-seat omakase')","occasion":["1-3 from: ${OCCASION.join(", ")}"],"rope":<1-4 booking difficulty: 1 easy walk-in, 4 near-impossible>,"recognition":"award if truly notable else 'Local favorite' or ''","signature":"one signature dish or experience (short)","blurb":"one elegant sentence (max ~16 words)"}`;
  return anthropicJSON({ system, user, maxTokens: 500 });
}

// ---- 3) RECORD (exact app schema) ----
function record(id, cand, e, unit) {
  return {
    id, name: cand.name,
    cuisine: norm(e.cuisine) || unit.cuisine,
    format: norm(e.format) || "Restaurant",
    neighborhood: unit.neighborhood,
    borough: unit.borough,
    price: PRICE_MAP[cand.priceLevel] || clamp(e.price, 1, 4, 2),
    rope: clamp(e.rope, 1, 4, 2),
    occasion: pick(e.occasion, OCCASION, 1, 3),
    recognition: norm(e.recognition),
    signature: norm(e.signature),
    blurb: norm(e.blurb)
  };
}

// ---- 4) MAIN ----
async function main() {
  if (!GKEY) { console.error("Missing GOOGLE_PLACES_API_KEY / GOOGLE_API_KEY"); process.exit(1); }
  const queries = loadJson(QUERIES_FILE, null);
  if (!queries) { console.error("queries file not found at " + QUERIES_FILE); process.exit(1); }
  const dining = loadJson(DINING_FILE);

  const haveNames = new Set(dining.map(d => keyOf(d.name)));
  let maxId = dining.reduce((m, d) => Math.max(m, +d.id || 0), 1000);

  let added = 0;
  for (const unit of queries) {
    if (added >= NEW_PER_RUN) break;
    let cands;
    try { cands = await discover(unit); }
    catch (e) { console.warn("discover failed:", unit.cuisine, unit.neighborhood, "-", e.message); continue; }
    const fresh = cands.filter(c => !haveNames.has(keyOf(c.name)));
    if (!fresh.length) { console.log("· no new for", unit.cuisine, unit.neighborhood); continue; }
    for (const c of fresh) {
      if (added >= NEW_PER_RUN) break;
      try {
        const e = await editorial(c, unit);
        dining.push(record(++maxId, c, e, unit));
        haveNames.add(keyOf(c.name));
        added++; console.log("  + [" + maxId + "] " + c.name + "  (" + unit.cuisine + ", " + unit.neighborhood + ")");
      } catch (err) { console.warn("  ! skipped", c.name, "-", err.message); }
    }
  }
  saveJson(DINING_FILE, dining);
  console.log("\nAdded " + added + " restaurants. Catalog now " + dining.length + " total.");
}
main().catch(e => { console.error(e); process.exit(1); });
