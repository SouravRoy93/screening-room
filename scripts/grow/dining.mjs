// ============================================================================
//  GROW DINING — daily growth engine for the Dining catalog.
//  Writes artifacts/screening-room/public/dining.json (the file the app reads).
//
//  City-driven (shares cities.json with places.mjs):
//   • discover : Google Places Text Search (New v1) → real restaurants per
//                CITY × CUISINE, with price level / rating / types / address.
//   • editorial: Claude writes the classification, grounded in the real facts.
//   • record   : dining schema + city/country (photos fetched LIVE by the app API).
//
//  Env (GitHub Actions secrets): GOOGLE_PLACES_API_KEY (or GOOGLE_API_KEY), ANTHROPIC_API_KEY
//  Optional env: NEW_PER_RUN (default 15), DINING_FILE, CITIES_FILE, CUISINES_FILE
// ============================================================================
import { anthropicJSON, loadJson, saveJson, pick, clamp, norm, keyOf, intEnv } from "./_shared.mjs";

const GKEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
const DINING_FILE  = process.env.DINING_FILE   || "artifacts/screening-room/public/dining.json";
const CITIES_FILE  = process.env.CITIES_FILE   || "scripts/grow/cities.json";
const CUISINES_FILE = process.env.CUISINES_FILE || "scripts/grow/dining-cuisines.json";
const NEW_PER_RUN  = intEnv("NEW_PER_RUN", 15);

// ---- controlled vocabulary the app understands ----
const OCCASION = ["Date night","Big night out","Celebration","Casual","Group dinner","Solo","Business","Brunch","Late night","Quick bite","Drinks & bites"];
const PRICE_MAP = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };

// ---- 1) DISCOVER (per city × cuisine) ----
async function discover(city, cuisine) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GKEY,
      "X-Goog-FieldMask": "places.id,places.location,places.displayName,places.priceLevel,places.rating,places.userRatingCount,places.types,places.primaryTypeDisplayName,places.shortFormattedAddress,places.formattedAddress"
    },
    body: JSON.stringify({
      textQuery: `best ${cuisine} restaurants in ${city.name}`,
      maxResultCount: 15,
      includedType: "restaurant",
      locationBias: (city.lat != null) ? { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 30000 } } : undefined
    })
  });
  if (!r.ok) throw new Error("Places HTTP " + r.status + " " + (await r.text()).slice(0, 120));
  const d = await r.json();
  return (d.places || [])
    .filter(p => (p.types || []).some(t => /restaurant|food|cafe|bar/.test(t)))
    .map(p => ({
      name: (p.displayName && p.displayName.text || "").trim(),
      placeId: p.id || null,
      lat: (p.location && p.location.latitude) || null,
      lng: (p.location && p.location.longitude) || null,
      priceLevel: p.priceLevel || null,
      rating: p.rating || null, ratings: p.userRatingCount || null,
      primaryType: p.primaryTypeDisplayName && p.primaryTypeDisplayName.text || null,
      address: p.shortFormattedAddress || p.formattedAddress || ""
    }))
    .filter(p => p.name);
}

// ---- 2) EDITORIAL ----
async function editorial(cand, city, cuisine) {
  const facts = { name: cand.name, city: city.short, country: city.country, cuisine_hint: cuisine,
    address: cand.address, google_price: cand.priceLevel, rating: cand.rating, ratings_count: cand.ratings, primary_type: cand.primaryType };
  const system = "You classify restaurants for a premium dining guide. Accurate and tasteful. Only claim a Michelin star / Bib Gourmand / James Beard award if it is genuinely well known; otherwise use 'Local favorite', 'Neighborhood gem', or ''. Output ONLY valid minified JSON.";
  const user = `Restaurant facts:
${JSON.stringify(facts)}

Return JSON with EXACTLY these keys:
{"cuisine":"clean cuisine label (e.g. Italian, Japanese, New American)","format":"short evocative format (e.g. 'Tasting-menu temple','Cozy trattoria','Buzzy izakaya','Counter-seat omakase')","neighborhood":"the neighborhood/district in ${city.short} (general if unsure)","occasion":["1-3 from: ${OCCASION.join(", ")}"],"rope":<1-4 reservation difficulty: 1 easy walk-in, 4 near-impossible>,"recognition":"award if truly notable (e.g. '★★ Michelin','Bib Gourmand','James Beard') else 'Local favorite' or ''","signature":"one signature dish (short)","blurb":"one elegant sentence (max ~16 words)","chef":"chef name/reputation if notable, else ''","noise":"Quiet|Moderate|Lively|Loud","dress":"dress code & crowd style (short, e.g. 'Smart casual, polished crowd')","bestTables":"which seats/tables are best (short, general if unsure)","arrival":"ease of arrival — valet/parking/transit note (short)","privateDining":"Yes|Limited|No (private dining rooms)","scores":{"food":<1-5 food quality>,"service":<1-5 service excellence>,"ambiance":<1-5 ambiance & design>,"clientele":<1-5 clientele quality>,"privacy":<1-5 privacy>,"beverage":<1-5 wine & beverage program>,"view":<1-5 view quality>,"value":<1-5 value for money>,"consistency":<1-5 consistency>,"romantic":<1-5 romantic suitability>,"business":<1-5 business-dining suitability>}}`;
  return anthropicJSON({ system, user, maxTokens: 800 });
}

// ---- 3) RECORD ----
function record(id, cand, e, city, cuisine) {
  const s = e.scores || {};
  return {
    id, name: cand.name,
    placeId: cand.placeId || null,
    lat: cand.lat || null, lng: cand.lng || null,
    cuisine: norm(e.cuisine) || cuisine,
    format: norm(e.format) || "Restaurant",
    neighborhood: norm(e.neighborhood) || city.short,
    borough: city.short,
    city: city.short, country: city.country,
    price: PRICE_MAP[cand.priceLevel] || clamp(e.price, 1, 4, 2),
    rope: clamp(e.rope, 1, 4, 2),
    occasion: pick(e.occasion, OCCASION, 1, 3),
    recognition: norm(e.recognition),
    signature: norm(e.signature),
    blurb: norm(e.blurb),
    chef: norm(e.chef),
    noise: ["Quiet","Moderate","Lively","Loud"].includes(e.noise) ? e.noise : "Moderate",
    dress: norm(e.dress) || "Smart casual",
    bestTables: norm(e.bestTables),
    arrival: norm(e.arrival),
    privateDining: ["Yes","Limited","No"].includes(e.privateDining) ? e.privateDining : "No",
    scores: {
      food: clamp(s.food), service: clamp(s.service), ambiance: clamp(s.ambiance),
      clientele: clamp(s.clientele), privacy: clamp(s.privacy), beverage: clamp(s.beverage),
      view: clamp(s.view), value: clamp(s.value), consistency: clamp(s.consistency),
      romantic: clamp(s.romantic), business: clamp(s.business)
    }
  };
}

const dkey = (name, city) => keyOf(name) + "|" + keyOf(city);

// ---- 4) MAIN (cities × cuisines, rotating the cuisine by day) ----
async function main() {
  if (!GKEY) { console.error("Missing GOOGLE_PLACES_API_KEY / GOOGLE_API_KEY"); process.exit(1); }
  const cities = loadJson(CITIES_FILE, null);
  const cuisines = loadJson(CUISINES_FILE, null);
  if (!cities)   { console.error("cities.json not found at " + CITIES_FILE); process.exit(1); }
  if (!cuisines) { console.error("cuisines file not found at " + CUISINES_FILE); process.exit(1); }
  const dining = loadJson(DINING_FILE);
  for (const d of dining) { if (!d.city) d.city = "New York"; if (!d.country) d.country = "United States"; }

  const have = new Set(dining.map(d => dkey(d.name, d.city)));
  let maxId = dining.reduce((m, d) => Math.max(m, +d.id || 0), 1000);
  const dayIdx = Math.floor(Date.now() / 86400000);

  let added = 0;
  for (const city of cities) {
    if (added >= NEW_PER_RUN) break;
    for (let k = 0; k < cuisines.length && added < NEW_PER_RUN; k++) {
      const cuisine = cuisines[(dayIdx + k) % cuisines.length];
      let cands;
      try { cands = await discover(city, cuisine); }
      catch (e) { console.warn("discover failed:", city.short, cuisine, "-", e.message); continue; }
      const fresh = cands.filter(c => !have.has(dkey(c.name, city.short)));
      if (!fresh.length) continue;
      console.log(city.short, "/", cuisine, "—", fresh.length, "new candidates.");
      for (const c of fresh) {
        if (added >= NEW_PER_RUN) break;
        try {
          const e = await editorial(c, city, cuisine);
          dining.push(record(++maxId, c, e, city, cuisine));
          have.add(dkey(c.name, city.short));
          added++; console.log("  + [" + maxId + "] " + c.name + "  (" + cuisine + ", " + city.short + ")");
        } catch (err) { console.warn("  ! skipped", c.name, "-", err.message); }
      }
    }
  }
  saveJson(DINING_FILE, dining);
  console.log("\nAdded " + added + " restaurants. Catalog now " + dining.length + " total.");
}
main().catch(e => { console.error(e); process.exit(1); });
