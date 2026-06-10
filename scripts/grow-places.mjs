// ============================================================================
//  GROW-PLACES — daily catalog growth engine for the Places vertical.
//
//  Every run it adds NEW_PER_RUN (default 18) brand-new places to places.json,
//  each with a full set of editorial details and a real, accurate photo.
//
//  HOW IT STAYS ACCURATE & SCALES TO ANY CITY/COUNTRY:
//   1. Real places + real photos come from Wikidata/Wikimedia (free, no key):
//      - Wikidata SPARQL finds notable points of interest inside a city
//        (museums, parks, gardens, landmarks, viewpoints, bridges, etc.)
//        that HAVE a photo (P18) and an English Wikipedia article.
//      - Ordered by global notability (sitelink count) so the best-known,
//        most beautiful places are added first.
//   2. The editorial copy (vibe, insider tip, "worth it / skip if", scores,
//      best time, nearby coffee & dinner) is written by Claude Haiku, grounded
//      in the place's Wikipedia summary so it stays on-topic.
//   3. Photos are Wikimedia Commons (the file in Wikidata P18) — correct by
//      construction, with attribution + link.
//
//  To expand beyond NYC: just add cities to cities.json. The engine finishes a
//  city (adds every notable POI) then automatically moves to the next one.
//
//  Required env (GitHub Actions secret): ANTHROPIC_API_KEY
//  Optional env: NEW_PER_RUN (default 18)
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const NEW_PER_RUN   = parseInt(process.env.NEW_PER_RUN || "18", 10);
const UA = "ScreeningRoom-Places/1.0 (personal catalog; contact: app owner)";

// ---- controlled vocabulary the app understands -----------------------------
const STYLES = ["Iconic","Hidden gems","Luxury","Romantic","Food & cafés","Culture","Nature & views","Nightlife","Shopping","Wellness","Photography","Family"];
const MOODS  = ["beautiful","romantic","calm","premium","hidden","iconic","photo","quick","avoid-crowds","classy","culture","wellness","family"];
const BADGES = ["Editor's Pick","First-Timer","Local Favorite","Quiet Luxury","Best at Sunset","Best for Couples","Worth the Price","Reservation Essential","Avoid Peak Hours","Tourist Heavy"];
const CROWD  = ["Low","Moderate","High"];

// POI instance types to pull from Wikidata (broad but quality-leaning)
const TYPES = [
  "Q570116",  // tourist attraction
  "Q33506",   // museum
  "Q22698",   // park
  "Q1107656", // garden
  "Q207694",  // art museum
  "Q2319498", // landmark
  "Q16560",   // palace
  "Q33837",   // archipelago/island (e.g. Little Island)
  "Q12518",   // tower
  "Q44782",   // port/pier
  "Q811979",  // architectural structure
  "Q1370598", // place of worship
  "Q3917681", // embassy? (skip) -> kept list tight below
  "Q24354",   // theater
  "Q7075",    // library
  "Q4989906", // monument
  "Q174782",  // square/plaza
  "Q12280",   // bridge
  "Q839954",  // archaeological/observation? viewpoint
  "Q2080521"  // observation deck
];

// ---------------------------------------------------------------------------
async function jget(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!r.ok) throw new Error("HTTP " + r.status + " for " + url.slice(0, 80));
  return r.json();
}

// Turn a Wikidata image value (Commons file) into a stable, sized photo URL.
const commonsUrl = file => "https://commons.wikimedia.org/wiki/Special:FilePath/" +
  encodeURIComponent(file) + "?width=1600";
// Bare Commons filename (used as the conflict key — same file = same picture).
const fileKey = u => { try { return decodeURIComponent(u.split("/").pop().split("?")[0]).toLowerCase(); } catch { return u; } };

// Find notable POIs inside a city (by Wikidata QID), with photo, coords + enwiki article.
async function cityCandidates(cityQID) {
  const values = TYPES.map(t => "wd:" + t).join(" ");
  const q = `
    SELECT ?item ?itemLabel ?img ?coord ?article ?links WHERE {
      ?item wdt:P131* wd:${cityQID} .
      VALUES ?type { ${values} }
      ?item wdt:P31 ?type .
      ?item wdt:P18 ?img .
      OPTIONAL { ?item wdt:P625 ?coord . }
      ?item wikibase:sitelinks ?links .
      ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY DESC(?links) LIMIT 400`;
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q);
  const d = await jget(url, { Accept: "application/sparql-results+json" });
  const seen = new Set();
  const out = [];
  for (const b of d.results.bindings) {
    const qid = b.item.value.split("/").pop();
    if (seen.has(qid)) continue; seen.add(qid);
    let lat = null, lng = null;
    if (b.coord && /Point\(([-\d.]+) ([-\d.]+)\)/.test(b.coord.value)) {
      const m = b.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
      lng = +m[1]; lat = +m[2];
    }
    const file = b.img.value.split("/").pop();
    out.push({
      qid,
      name: b.itemLabel.value,
      title: decodeURIComponent(b.article.value.split("/wiki/").pop()).replace(/_/g, " "),
      img: commonsUrl(file),
      imgKey: fileKey(file),
      article: b.article.value,
      lat, lng,
      links: parseInt(b.links.value, 10) || 0
    });
  }
  return out;
}

// Conflict resolver: if a place's photo is already used, find a DIFFERENT one from
// the same Wikipedia article's media. Returns {img,key} or null if no unique photo.
async function uniquePhoto(cand, usedKeys) {
  if (!usedKeys.has(cand.imgKey)) return { img: cand.img, key: cand.imgKey };
  try {
    const d = await jget("https://en.wikipedia.org/api/rest_v1/page/media-list/" + encodeURIComponent(cand.title));
    for (const it of (d.items || [])) {
      if (it.type !== "image" || !it.title) continue;
      const file = it.title.replace(/^File:/i, "");
      const key = fileKey(file);
      if (/\.(svg|gif)$/i.test(file)) continue;          // skip logos / icons
      if (usedKeys.has(key)) continue;                    // still taken
      return { img: commonsUrl(file), key };
    }
  } catch {}
  return null;  // no unique photo available → caller skips this place
}

// Short factual grounding text for the LLM.
async function wikiSummary(title) {
  try {
    const d = await jget("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title));
    return (d.extract || "").slice(0, 900);
  } catch { return ""; }
}

// Ask Claude Haiku for the editorial fields as strict JSON, grounded in facts.
async function enrich(cand, city) {
  const extract = await wikiSummary(cand.title);
  const sys = "You are the editor of a premium, tasteful city-discovery guide. " +
    "You write concise, evocative, accurate copy. Never invent specific prices, " +
    "exact hours, or named restaurants you are unsure about — when unsure, keep it " +
    "general (e.g. 'a nearby café'). Output ONLY valid minified JSON, no prose.";
  const user = `Place: "${cand.name}" in ${city.short}, ${city.country}.
Wikipedia summary for grounding:
"""${extract}"""

Return JSON with EXACTLY these keys:
{
 "area": "neighborhood/district name",
 "vibe": "one evocative sentence (max ~14 words)",
 "styles": ["2-4 from: ${STYLES.join(", ")}"],
 "moods": ["3-5 from: ${MOODS.join(", ")}"],
 "best": "best time to go (short)",
 "dur": <typical minutes, integer 30-180>,
 "crowd": "one of Low | Moderate | High",
 "price": "Free | $ | $$ | $$$  (add ' (suggested)' for donation museums)",
 "dress": "short dress guidance",
 "hours": "typical opening hours, general if unsure",
 "resv": "No | Recommended | Yes — timed ticket",
 "photo": "the single best photo spot",
 "cafe": "a fitting coffee/café nearby (general if unsure)",
 "dinner": "a fitting dinner spot nearby (general if unsure)",
 "insider": "one genuine insider tip (max ~22 words)",
 "worth": "Worth it if … (complete the thought)",
 "skip": "Skip if … (complete the thought)",
 "badges": ["1-3 from: ${BADGES.join(", ")}"],
 "scores": {"b":<1-5 beauty>,"u":<1-5 uniqueness>,"e":<1-5 ease>,"c":<1-5 calm>,"v":<1-5 value>,"l":<1-5 luxury>},
 "rain": <true if pleasant in rain (mostly indoor), else false>
}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 900, system: sys,
      messages: [{ role: "user", content: user }] })
  });
  if (!r.ok) throw new Error("Anthropic HTTP " + r.status);
  const d = await r.json();
  let txt = (d.content && d.content[0] && d.content[0].text || "").trim();
  const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("no JSON in model reply");
  return JSON.parse(txt.slice(a, b + 1));
}

// keep only allowed values; coerce/clamp to the app's expectations
const pick = (arr, allowed, min, max) => {
  const v = (Array.isArray(arr) ? arr : []).filter(x => allowed.includes(x));
  return v.length ? v.slice(0, max) : allowed.slice(0, min);
};
const clamp = n => Math.max(1, Math.min(5, Math.round(+n || 3)));

function normalize(e) {
  const s = e.scores || {};
  return {
    area: String(e.area || "").trim() || "—",
    vibe: String(e.vibe || "").trim(),
    styles: pick(e.styles, STYLES, 2, 4),
    moods: pick(e.moods, MOODS, 3, 5),
    best: String(e.best || "Anytime").trim(),
    dur: Math.max(20, Math.min(240, parseInt(e.dur, 10) || 60)),
    crowd: CROWD.includes(e.crowd) ? e.crowd : "Moderate",
    price: String(e.price || "Free").trim(),
    dress: String(e.dress || "Comfortable").trim(),
    hours: String(e.hours || "Varies").trim(),
    resv: String(e.resv || "No").trim(),
    photo: String(e.photo || "").trim(),
    cafe: String(e.cafe || "A café nearby").trim(),
    dinner: String(e.dinner || "Dinner nearby").trim(),
    insider: String(e.insider || "").trim(),
    worth: String(e.worth || "").trim(),
    skip: String(e.skip || "").trim(),
    badges: pick(e.badges, BADGES, 1, 3),
    scores: { b: clamp(s.b), u: clamp(s.u), e: clamp(s.e), c: clamp(s.c), v: clamp(s.v), l: clamp(s.l) },
    rain: !!e.rain
  };
}

// ---------------------------------------------------------------------------
async function main() {
  if (!ANTHROPIC_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }
  if (!existsSync("cities.json")) { console.error("cities.json not found"); process.exit(1); }

  const cities = JSON.parse(readFileSync("cities.json", "utf8"));
  const places = existsSync("places.json") ? JSON.parse(readFileSync("places.json", "utf8")) : [];

  // backfill city/country on legacy entries so the data is uniform going forward
  for (const p of places) { if (!p.city) p.city = "New York"; if (!p.country) p.country = "United States"; }

  const haveNames = new Set(places.map(p => (p.name || "").toLowerCase().trim()));
  const haveQids  = new Set(places.map(p => p.wd).filter(Boolean));
  // every photo already in the catalog — the conflict ledger (no two places share a picture)
  const usedKeys  = new Set(places.map(p => fileKey(p.img || "")).filter(Boolean));
  let maxId = places.reduce((m, p) => Math.max(m, +p.id || 0), 0);

  let added = 0;
  for (const city of cities) {
    if (added >= NEW_PER_RUN) break;
    let cands;
    try { cands = await cityCandidates(city.wikidata); }
    catch (e) { console.warn("candidate fetch failed for", city.short, "-", e.message); continue; }

    // skip ones we already have (by Wikidata id or name)
    const fresh = cands.filter(c => !haveQids.has(c.qid) && !haveNames.has(c.name.toLowerCase().trim()));
    if (!fresh.length) { console.log(city.short, "— no new candidates, city complete."); continue; }
    console.log(city.short, "—", fresh.length, "candidates available.");

    for (const c of fresh) {
      if (added >= NEW_PER_RUN) break;
      try {
        // resolve a UNIQUE photo first — skip the place if it can't get one
        const photo = await uniquePhoto(c, usedKeys);
        if (!photo) { console.warn("  ~ skipped (no unique photo):", c.name); continue; }
        const e = normalize(await enrich(c, city));
        maxId += 1;
        places.push({
          id: maxId, name: c.name, city: city.short, country: city.country, ...e,
          lat: c.lat, lng: c.lng,
          img: photo.img, imgAttr: "via Wikimedia Commons", imgLink: c.article, wd: c.qid
        });
        haveNames.add(c.name.toLowerCase().trim()); haveQids.add(c.qid); usedKeys.add(photo.key);
        added += 1;
        console.log("  + [" + maxId + "] " + c.name + "  (" + city.short + ")");
      } catch (err) {
        console.warn("  ! skipped", c.name, "-", err.message);
      }
    }
  }

  writeFileSync("places.json", JSON.stringify(places, null, 1));
  console.log("\nAdded " + added + " new places. Catalog now has " + places.length + " total.");
}
main().catch(e => { console.error(e); process.exit(1); });
