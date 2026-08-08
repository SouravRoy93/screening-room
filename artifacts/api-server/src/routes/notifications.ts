import { Router, type IRouter } from "express";
import { CheckNewEpisodesBody } from "@workspace/api-zod";

const router: IRouter = Router();

const TMDB_KEY = process.env.TMDB_KEY || process.env.VITE_TMDB_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tmdbFetch(path: string): Promise<any> {
  const url = new URL(`${TMDB_BASE}/${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

router.post("/notifications/episodes", async (req, res): Promise<void> => {
  const parsed = CheckNewEpisodesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const MAX_IDS = 50;
  if (parsed.data.tmdb_ids.length > MAX_IDS) {
    res.status(400).json({ error: `Too many ids (max ${MAX_IDS})` });
    return;
  }
  const { tmdb_ids } = parsed.data;

  // days_back preserves the original behaviour (what aired recently); days_ahead
  // is what Table Watch needs (what's coming). Defaults keep existing callers —
  // the Films page banner — behaving exactly as before.
  const daysBack = parsed.data.days_back ?? 7;
  const daysAhead = parsed.data.days_ahead ?? 0;

  const day = (offset: number) =>
    new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = day(0);
  const from = day(-daysBack);
  const until = day(daysAhead);

  const alerts: {
    tmdb_id: number;
    title: string;
    season_number: number;
    episode_number: number;
    episode_name: string;
    air_date: string;
    poster_path: string | null;
    status: "aired" | "upcoming";
  }[] = [];

  await Promise.allSettled(
    tmdb_ids.map(async (id) => {
      try {
        const show = await tmdbFetch(`tv/${id}`);
        const next = show.next_episode_to_air as {
          air_date?: string;
          season_number?: number;
          episode_number?: number;
          name?: string;
        } | null;

        // next_episode_to_air is TMDB's "what's next"; once an episode airs it
        // lingers there briefly, which is what makes the backward window work.
        // last_episode_to_air covers the case where the show has already moved on.
        const last = show.last_episode_to_air as {
          air_date?: string;
          season_number?: number;
          episode_number?: number;
          name?: string;
        } | null;

        for (const ep of [next, last]) {
          if (!ep?.air_date) continue;
          if (ep.air_date < from || ep.air_date > until) continue;
          if (alerts.some((a) => a.tmdb_id === id && a.air_date === ep.air_date)) continue;

          alerts.push({
            tmdb_id: id,
            title: show.name as string,
            season_number: ep.season_number ?? 0,
            episode_number: ep.episode_number ?? 0,
            episode_name: ep.name ?? "",
            air_date: ep.air_date,
            poster_path: (show.poster_path as string | null) ?? null,
            status: ep.air_date > today ? "upcoming" : "aired",
          });
        }
      } catch {
        // silently skip shows that fail
      }
    })
  );

  res.json(alerts);
});

export default router;
