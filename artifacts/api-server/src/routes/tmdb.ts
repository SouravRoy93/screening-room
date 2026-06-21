import { Router, type IRouter } from "express";
import {
  GetMovieDetailParams,
  GetMovieRecommendationsParams,
  GetTvDetailParams,
  GetTvRecommendationsParams,
  SearchMediaQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const TMDB_KEY = process.env.TMDB_KEY || process.env.VITE_TMDB_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";

const GENRES_MOVIE: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
};
const GENRES_TV: Record<number, string> = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 10762: "Kids", 9648: "Mystery",
  10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics", 37: "Western",
};

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_BASE}/${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  if (!r.ok) throw Object.assign(new Error("TMDB error"), { status: r.status });
  return r.json();
}

function genreNames(genreIds: number[], mt: "movie" | "tv"): string[] {
  const map = mt === "tv" ? GENRES_TV : GENRES_MOVIE;
  return genreIds.map((id) => map[id]).filter(Boolean);
}

function toMediaCard(item: Record<string, unknown>, mt: "movie" | "tv") {
  const date = (item.release_date || item.first_air_date || "") as string;
  return {
    tmdb_id: item.id,
    media_type: mt,
    title: item.title || item.name,
    year: date ? parseInt(date.slice(0, 4), 10) : null,
    genres: genreNames((item.genre_ids as number[]) || [], mt),
    poster_path: item.poster_path || null,
    vote_average: item.vote_average || null,
    popularity: item.popularity || null,
  };
}

// Streaming availability (TMDB watch/providers, powered by JustWatch).
// Returns the region's Stream / Rent / Buy provider lists plus the JustWatch link.
function pickWatch(wp: any, region = "US") {
  const r = wp && wp.results ? wp.results[region] : null;
  if (!r) return null;
  const map = (arr: any): { provider_id: number; name: string; logo_path: string | null }[] =>
    (Array.isArray(arr) ? arr : []).map((x: any) => ({ provider_id: x.provider_id, name: x.provider_name, logo_path: x.logo_path || null }));
  const seen = new Set<number>();
  const stream = [...map(r.flatrate), ...map(r.free), ...map(r.ads)]
    .filter((x) => (seen.has(x.provider_id) ? false : (seen.add(x.provider_id), true)));
  const rent = map(r.rent);
  const buy = map(r.buy);
  if (!stream.length && !rent.length && !buy.length) return null;
  return { link: (r.link as string) || null, stream, rent, buy };
}

router.get("/tmdb/movie/:tmdb_id", async (req, res): Promise<void> => {
  const p = GetMovieDetailParams.safeParse({ tmdb_id: Number(req.params.tmdb_id) });
  if (!p.success) { res.status(400).json({ error: "Invalid tmdb_id" }); return; }

  try {
    const [detail, credits, videos, providers] = await Promise.all([
      tmdbFetch(`movie/${p.data.tmdb_id}`),
      tmdbFetch(`movie/${p.data.tmdb_id}/credits`),
      tmdbFetch(`movie/${p.data.tmdb_id}/videos`),
      tmdbFetch(`movie/${p.data.tmdb_id}/watch/providers`).catch(() => null),
    ]);

    const trailer = (videos.results as Record<string, string>[])
      ?.find((v) => v.site === "YouTube" && v.type === "Trailer") || null;

    res.json({
      tmdb_id: detail.id,
      media_type: "movie",
      title: detail.title,
      overview: detail.overview || null,
      year: detail.release_date ? parseInt(detail.release_date.slice(0, 4), 10) : null,
      genres: (detail.genres as { name: string }[])?.map((g) => g.name) || [],
      poster_path: detail.poster_path || null,
      backdrop_path: detail.backdrop_path || null,
      vote_average: detail.vote_average || null,
      runtime: detail.runtime || null,
      status: detail.status || null,
      tagline: detail.tagline || null,
      cast: ((credits.cast as Record<string, unknown>[]) || []).slice(0, 15).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path || null,
        order: c.order,
      })),
      trailer: trailer ? { key: trailer.key, name: trailer.name, site: trailer.site, type: trailer.type } : null,
      watch: pickWatch(providers),
      number_of_seasons: null,
      next_episode_to_air: null,
    });
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 404) { res.status(404).json({ error: "Not found" }); return; }
    req.log.error({ err: e }, "TMDB movie detail error");
    res.status(502).json({ error: "TMDB unavailable" });
  }
});

router.get("/tmdb/movie/:tmdb_id/recommendations", async (req, res): Promise<void> => {
  const p = GetMovieRecommendationsParams.safeParse({ tmdb_id: Number(req.params.tmdb_id) });
  if (!p.success) { res.status(400).json({ error: "Invalid tmdb_id" }); return; }

  try {
    const data = await tmdbFetch(`movie/${p.data.tmdb_id}/recommendations`);
    const results = ((data.results as Record<string, unknown>[]) || [])
      .slice(0, 12)
      .map((item) => toMediaCard(item, "movie"));
    res.json(results);
  } catch (e) {
    req.log.error({ err: e }, "TMDB movie recommendations error");
    res.status(502).json({ error: "TMDB unavailable" });
  }
});

router.get("/tmdb/tv/:tmdb_id", async (req, res): Promise<void> => {
  const p = GetTvDetailParams.safeParse({ tmdb_id: Number(req.params.tmdb_id) });
  if (!p.success) { res.status(400).json({ error: "Invalid tmdb_id" }); return; }

  try {
    const [detail, credits, videos, providers] = await Promise.all([
      tmdbFetch(`tv/${p.data.tmdb_id}`),
      tmdbFetch(`tv/${p.data.tmdb_id}/credits`),
      tmdbFetch(`tv/${p.data.tmdb_id}/videos`),
      tmdbFetch(`tv/${p.data.tmdb_id}/watch/providers`).catch(() => null),
    ]);

    const trailer = (videos.results as Record<string, string>[])
      ?.find((v) => v.site === "YouTube" && v.type === "Trailer") || null;

    res.json({
      tmdb_id: detail.id,
      media_type: "tv",
      title: detail.name,
      overview: detail.overview || null,
      year: detail.first_air_date ? parseInt(detail.first_air_date.slice(0, 4), 10) : null,
      genres: (detail.genres as { name: string }[])?.map((g) => g.name) || [],
      poster_path: detail.poster_path || null,
      backdrop_path: detail.backdrop_path || null,
      vote_average: detail.vote_average || null,
      runtime: detail.episode_run_time?.[0] || null,
      status: detail.status || null,
      tagline: detail.tagline || null,
      cast: ((credits.cast as Record<string, unknown>[]) || []).slice(0, 15).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path || null,
        order: c.order,
      })),
      trailer: trailer ? { key: trailer.key, name: trailer.name, site: trailer.site, type: trailer.type } : null,
      watch: pickWatch(providers),
      number_of_seasons: detail.number_of_seasons || null,
      next_episode_to_air: detail.next_episode_to_air || null,
    });
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 404) { res.status(404).json({ error: "Not found" }); return; }
    req.log.error({ err: e }, "TMDB tv detail error");
    res.status(502).json({ error: "TMDB unavailable" });
  }
});

router.get("/tmdb/tv/:tmdb_id/recommendations", async (req, res): Promise<void> => {
  const p = GetTvRecommendationsParams.safeParse({ tmdb_id: Number(req.params.tmdb_id) });
  if (!p.success) { res.status(400).json({ error: "Invalid tmdb_id" }); return; }

  try {
    const data = await tmdbFetch(`tv/${p.data.tmdb_id}/recommendations`);
    const results = ((data.results as Record<string, unknown>[]) || [])
      .slice(0, 12)
      .map((item) => toMediaCard(item, "tv"));
    res.json(results);
  } catch (e) {
    req.log.error({ err: e }, "TMDB tv recommendations error");
    res.status(502).json({ error: "TMDB unavailable" });
  }
});

router.get("/tmdb/search", async (req, res): Promise<void> => {
  const p = SearchMediaQueryParams.safeParse(req.query);
  if (!p.success) { res.status(400).json({ error: "Invalid query" }); return; }

  try {
    const data = await tmdbFetch("search/multi", {
      query: p.data.query,
      include_adult: "false",
      page: "1",
    });
    let results = ((data.results as Record<string, unknown>[]) || [])
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => toMediaCard(r, r.media_type as "movie" | "tv"));

    if (p.data.type && p.data.type !== "all") {
      results = results.filter((r) => r.media_type === p.data.type);
    }

    res.json(results.slice(0, 20));
  } catch (e) {
    req.log.error({ err: e }, "TMDB search error");
    res.status(502).json({ error: "TMDB unavailable" });
  }
});

export default router;
