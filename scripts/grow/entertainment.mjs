// ============================================================================
//  GROW ENTERTAINMENT — daily growth engine for the Films/TV catalog.
//  Writes artifacts/screening-room/public/catalog.json (the file the app reads).
//
//  Source: TMDB (popular / top-rated / trending / recent discover). The catalog
//  ACCUMULATES — each run merges in new titles, refreshes popularity, de-dupes
//  by (media_type + tmdb_id), and re-sorts by popularity.
//
//  Matches the app schema EXACTLY:
//   { tmdb_id, media_type, title, year, genres[], poster_path, vote_average,
//     popularity, release_date }
//
//  Env (GitHub Actions secret): TMDB_KEY (TMDB v3 api_key)
//  Optional env: CATALOG_FILE, MAX_CATALOG (cap, default 4000)
// ============================================================================
import { loadJson, saveJson, intEnv } from "./_shared.mjs";

const TMDB_KEY = process.env.TMDB_KEY || process.env.TMDB_API_KEY;
const CATALOG_FILE = process.env.CATALOG_FILE || "artifacts/screening-room/public/catalog.json";
const MAX_CATALOG = intEnv("MAX_CATALOG", 4000);

const GENRES = {
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",
  10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",
  878:"Science Fiction",10770:"TV Movie",53:"Thriller",10752:"War",37:"Western",
  10759:"Action & Adventure",10762:"Kids",10763:"News",10764:"Reality",10765:"Sci-Fi & Fantasy",
  10766:"Soap",10767:"Talk",10768:"War & Politics"
};

const thisYear = new Date().getUTCFullYear();
const JOBS = [
  { path: "movie/popular",  mt: "movie", pages: 5 },
  { path: "movie/top_rated",mt: "movie", pages: 3 },
  { path: "movie/now_playing", mt: "movie", pages: 3 },
  { path: "tv/popular",     mt: "tv",    pages: 5 },
  { path: "tv/top_rated",   mt: "tv",    pages: 3 },
  { path: "trending/movie/week", mt: "movie", pages: 2 },
  { path: "trending/tv/week",    mt: "tv",    pages: 2 },
  { path: "discover/movie", mt: "movie", pages: 3, params: { sort_by: "popularity.desc", "primary_release_date.gte": (thisYear - 2) + "-01-01" } },
  { path: "discover/tv",    mt: "tv",    pages: 3, params: { sort_by: "popularity.desc", "first_air_date.gte": (thisYear - 2) + "-01-01" } }
];

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

async function main() {
  if (!TMDB_KEY) { console.error("Missing TMDB_KEY"); process.exit(1); }
  const existing = loadJson(CATALOG_FILE);
  const byKey = new Map(existing.map(c => [c.media_type + ":" + c.tmdb_id, c]));
  const before = byKey.size;

  for (const job of JOBS) {
    for (let page = 1; page <= job.pages; page++) {
      try {
        const res = await tmdb(job.path, { ...(job.params || {}), page });
        for (const it of (res.results || [])) {
          const mt = job.path.includes("/tv") || job.mt === "tv" ? "tv" : "movie";
          const m = mapItem(it, job.mt || mt);
          if (!m) continue;
          byKey.set(m.media_type + ":" + m.tmdb_id, m);  // refresh/insert
        }
      } catch (e) { console.warn("job failed:", job.path, "p" + page, "-", e.message); }
    }
  }

  let merged = [...byKey.values()].filter(c => c.poster_path);   // keep only titles with art
  merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (merged.length > MAX_CATALOG) merged = merged.slice(0, MAX_CATALOG);

  saveJson(CATALOG_FILE, merged, 0);
  console.log("Catalog: " + before + " → " + merged.length + " titles (added/refreshed; capped at " + MAX_CATALOG + ").");
}
main().catch(e => { console.error(e); process.exit(1); });
