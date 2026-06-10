import { Router, type IRouter } from "express";
import { CheckNewEpisodesBody } from "@workspace/api-zod";

const router: IRouter = Router();

const TMDB_KEY = process.env.TMDB_KEY || process.env.VITE_TMDB_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch(path: string) {
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

  const { tmdb_ids } = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const alerts: {
    tmdb_id: number;
    title: string;
    season_number: number;
    episode_number: number;
    episode_name: string;
    air_date: string;
    poster_path: string | null;
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

        if (
          next?.air_date &&
          next.air_date >= sevenDaysAgo &&
          next.air_date <= today
        ) {
          alerts.push({
            tmdb_id: id,
            title: show.name as string,
            season_number: next.season_number ?? 0,
            episode_number: next.episode_number ?? 0,
            episode_name: next.name ?? "",
            air_date: next.air_date,
            poster_path: (show.poster_path as string | null) ?? null,
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
