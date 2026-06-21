// ============================================================================
//  GROW ENTERTAINMENT — daily growth engine for the Films/TV catalog.
//  Writes artifacts/screening-room/public/catalog.json (the file the app reads).
//
//  Source: TMDB. The catalog ACCUMULATES — each run merges new titles, refreshes
//  popularity, de-dupes by (media_type + tmdb_id), and re-sorts by popularity.
//
//  GROWTH STRATEGY (why this adds hundreds/day, not ~15):
//   • A small "freshness" set refreshes the staple popular/trending lists.
//   • A DEEP discover sweep walks a page-window that SHIFTS every day, so each
//     run explores a brand-new slice of TMDB instead of re-reading pages 1-3.
//   • A genre long-tail sweep rotates through genres and pages deep into each.
//
//  Schema (unchanged):
//   { tmdb_id, media_type, title, year, genres[], poster_path, vote_average,
//     popularity, release_date }
//
//  Env: TMDB_KEY (required). Optional: CATALOG_FILE, MAX_CATALOG (default 15000),
//       DISCOVER_PAGES (deep pages per media type per run, default 30).
// ============================================================================
import { loadJson, saveJson, intEnv } from "./_shared.mjs";

const TMDB_KEY = process.env.TMDB_KEY || process.env.TMDB_API_KEY;
const CATALOG_FILE = process.env.CATALOG_FILE || "artifacts/screening-room/public/catalog.json";
const MAX_CATALOG = intEnv("MAX_CATALOG", 15000);
const PER_RUN = intEnv("DISCOVER_PAGES", 30);

const GENRES = {
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",
  10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",
  878:"Science Fiction",10770:"TV Movie",53:"Thriller",10752:"War",37:"Western",
  10759:"Action & Adventure",10762:"Kids",10763:"News",10764:"Reality",10765:"Sci-Fi & Fantasy",
  10766:"Soap",10767:"Talk",10768:"War & Politics"
};

// Day index so consecutive runs explore different page-windows / sorts / genres.
const dayIdx = Math.floor(Date.now() / 86400000);
const SORTS_MOVIE = ["popularity.desc", "vote_count.desc", "revenue.desc", "primary_release_date.desc"];
const SORTS_TV    = ["popularity.desc", "vote_count.desc", "first_air_date.desc", "vote_average.desc"];
const MOVIE_GENRES = [28,12,16,35,80,99,18,10751,14,36,27,10402,9648,10749,878,53,10752,37];
const TV_GENRES    = [10759,16,35,80,99,18,10751,10762,9648,10763,10764,10765,10766,10767,10768,37];

async function tmdb(path, params = {}) {
  const url = new URL("https://api.themoviedb.org/3/" + path);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");
  for (const k of Object.keys(params)) url.searchParams.set(k, params[k]);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error("TMDB " + r.status + " " + path);
  return r.json();
}

const yearOf = d => (d && /^\d{4}/.test(d)) ? +d.slice(0, 4) : null;
const genreNames = ids => (ids || []).map(i => GENRES[i]).filter(Boolean);

function mapItem(it, mt) {
  const date = it.release_date || it.first_air_date || null;
  const title = it.title || it.name || "";
  if (!it.id || !title) return null;
  return {
    tmdb_id: it.id, media_type: mt, title, year: yearOf(date),
    genres: genreNames(it.genre_ids), poster_path: it.poster_path || null,
    vote_average: it.vote_average ?? null, popularity: it.popularity ?? null, release_date: date
  };
}

// Build the flat list of page-fetches for this run.
function buildUnits() {
  const u = [];
  const add = (path, mt, pages, params) => { for (let p = 1; p <= pages; p++) u.push({ path, mt, params, page: p }); };

  // (A) Freshness — keep the staples' popularity current (shallow).
  add("movie/popular", "movie", 3);
  add("tv/popular", "tv", 3);
  add("movie/now_playing", "movie", 2);
  add("movie/top_rated", "movie", 2);
  add("tv/top_rated", "tv", 2);
  add("trending/movie/week", "movie", 2);
  add("trending/tv/week", "tv", 2);

  // (B) Deep discover sweep — a fresh page-window every day (main growth driver).
  const sortM = SORTS_MOVIE[dayIdx % SORTS_MOVIE.length];
  const sortT = SORTS_TV[dayIdx % SORTS_TV.length];
  const start = ((dayIdx * PER_RUN) % 470) + 1;   // walk pages 1..~500 over time
  for (let i = 0; i < PER_RUN; i++) {
    u.push({ path: "discover/movie", mt: "movie", params: { sort_by: sortM, "vote_count.gte": 20 }, page: start + i });
    u.push({ path: "discover/tv",    mt: "tv",    params: { sort_by: sortT, "vote_count.gte": 10 }, page: start + i });
  }

  // (C) Genre long-tail — rotate 2 genres/day per type, page deep into each.
  const GP = 8;
  const gStart = ((dayIdx * GP) % 200) + 1;
  for (let k = 0; k < 2; k++) {
    const gm = MOVIE_GENRES[(dayIdx * 2 + k) % MOVIE_GENRES.length];
    const gt = TV_GENRES[(dayIdx * 2 + k) % TV_GENRES.length];
    for (let p = 0; p < GP; p++) {
      u.push({ path: "discover/movie", mt: "movie", params: { with_genres: gm, sort_by: "popularity.desc", "vote_count.gte": 15 }, page: gStart + p });
      u.push({ path: "discover/tv",    mt: "tv",    params: { with_genres: gt, sort_by: "popularity.desc", "vote_count.gte": 8 },  page: gStart + p });
    }
  }
  return u;
}

async function main() {
  if (!TMDB_KEY) { console.error("Missing TMDB_KEY"); process.exit(1); }
  const existing = loadJson(CATALOG_FILE);
  const byKey = new Map(existing.map(c => [c.media_type + ":" + c.tmdb_id, c]));
  const before = byKey.size;

  const units = buildUnits();
  let pages = 0, failed = 0;
  for (const un of units) {
    try {
      const res = await tmdb(un.path, { ...(un.params || {}), page: un.page });
      for (const it of (res.results || [])) {
        const mt = un.mt || (un.path.includes("/tv") ? "tv" : "movie");
        const m = mapItem(it, mt);
        if (!m) continue;
        byKey.set(m.media_type + ":" + m.tmdb_id, m);   // refresh/insert
      }
      pages++;
    } catch (e) { failed++; if (failed <= 5) console.warn("unit failed:", un.path, "p" + un.page, "-", e.message); }
  }

  let merged = [...byKey.values()].filter(c => c.poster_path);   // keep only titles with art
  merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (merged.length > MAX_CATALOG) merged = merged.slice(0, MAX_CATALOG);

  saveJson(CATALOG_FILE, merged, 0);
  console.log("Catalog: " + before + " -> " + merged.length + " titles  (added " + (merged.length - before) + "; fetched " + pages + " pages, " + failed + " failed; cap " + MAX_CATALOG + ").");
}
main().catch(e => { console.error(e); process.exit(1); });
