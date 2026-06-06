// Daily catalog updater — runs in GitHub Actions (Node 20+, global fetch).
// Fetches fresh movies/TV from TMDB and MERGES them into catalog.json so the
// list grows over time. Reads the TMDB key from the TMDB_KEY env/secret.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const KEY = process.env.TMDB_KEY;
if (!KEY) { console.error("Missing TMDB_KEY env var/secret."); process.exit(1); }

const GENRES_MOVIE = {28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Sci-Fi",10770:"TV Movie",53:"Thriller",10752:"War",37:"Western"};
const GENRES_TV = {10759:"Action & Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",10762:"Kids",9648:"Mystery",10763:"News",10764:"Reality",10765:"Sci-Fi & Fantasy",10766:"Soap",10767:"Talk",10768:"War & Politics",37:"Western"};

const YEAR = new Date().getFullYear();

// [mediaType, path, pages, extraParams]
const JOBS = [
  ["movie","movie/popular",25,{}],
  ["movie","movie/top_rated",20,{}],
  ["movie","movie/now_playing",6,{}],
  ["movie","movie/upcoming",6,{}],
  ["movie","trending/movie/week",2,{}],
  ["movie","discover/movie",12,{ sort_by:"popularity.desc", primary_release_year:String(YEAR) }],
  ["movie","discover/movie",12,{ sort_by:"popularity.desc", primary_release_year:String(YEAR-1) }],
  ["tv","tv/popular",20,{}],
  ["tv","tv/top_rated",15,{}],
  ["tv","tv/on_the_air",6,{}],
  ["tv","trending/tv/week",2,{}],
  ["tv","discover/tv",12,{ sort_by:"popularity.desc", first_air_date_year:String(YEAR) }],
  ["tv","discover/tv",12,{ sort_by:"popularity.desc", first_air_date_year:String(YEAR-1) }],
];

function genreNames(ids, mt){
  const map = mt === "tv" ? GENRES_TV : GENRES_MOVIE;
  return (ids || []).map(id => map[id]).filter(Boolean);
}
function mapItem(it, mt){
  if (!it.poster_path) return null;
  const title = it.title || it.name;
  if (!title) return null;
  const date = it.release_date || it.first_air_date || null;
  return {
    tmdb_id: it.id,
    media_type: mt,
    title,
    year: date ? parseInt(String(date).slice(0,4),10) : null,
    genres: genreNames(it.genre_ids, mt),
    poster_path: it.poster_path,
    vote_average: it.vote_average ?? null,
    popularity: it.popularity ?? null,
    release_date: date
  };
}
async function tmdb(path, params){
  const url = new URL("https://api.themoviedb.org/3/" + path);
  url.searchParams.set("api_key", KEY);
  url.searchParams.set("language", "en-US");
  for (const k in params) url.searchParams.set(k, params[k]);
  const r = await fetch(url);
  if (!r.ok) throw new Error(path + " -> HTTP " + r.status);
  return r.json();
}

// Load existing catalog and key it
const existing = existsSync("catalog.json")
  ? JSON.parse(readFileSync("catalog.json","utf8")) : [];
const byKey = {};
for (const e of existing) byKey[e.media_type + ":" + e.tmdb_id] = e;
const before = Object.keys(byKey).length;

let fetched = 0;
for (const [mt, path, pages, extra] of JOBS){
  for (let p = 1; p <= pages; p++){
    try {
      const res = await tmdb(path, { page: String(p), ...extra });
      for (const it of (res.results || [])){
        // trending/multi rows carry their own media_type; respect it
        const type = it.media_type && (it.media_type==="movie"||it.media_type==="tv") ? it.media_type : mt;
        const row = mapItem(it, type);
        if (!row) continue;
        fetched++;
        byKey[row.media_type + ":" + row.tmdb_id] = row; // upsert (refresh popularity etc.)
      }
    } catch (e){ console.warn("skip", path, "p"+p, e.message); }
  }
}

const merged = Object.values(byKey).sort((a,b)=>(b.popularity||0)-(a.popularity||0));
writeFileSync("catalog.json", JSON.stringify(merged));
const after = merged.length;
console.log(`Catalog: ${before} -> ${after} titles (+${after-before} new, ${fetched} fetched).`);
