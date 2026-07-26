// ─────────────────────────────────────────────────────────────────────────────
// Data gathering for the "Tonight" hub card. Pulls together, cheaply:
//   • catalogs (places/dining via use-catalog; films via the small top file)
//   • the user's saves (places/dining from localStorage — the fast local
//     source of truth that cloud sync mirrors; films from Supabase when
//     signed in)
//   • current weather (Open-Meteo, keyless — same source the Places page uses)
// then hands everything to the pure composer in lib/tonight.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useDining, usePlaces } from "@/hooks/use-catalog";
import type { HistoryEntry } from "@/lib/pairing";
import { preferredName } from "@/lib/profile";
import {
  composeTonight,
  type TonightPlan,
  type WatchlistFilm,
  type WeatherNow,
} from "@/lib/tonight";
import type { MediaItem } from "@/types";

const BASE = import.meta.env.BASE_URL;
const _d = new Date();
const DAYV = `${_d.getUTCFullYear()}${String(_d.getUTCMonth() + 1).padStart(2, "0")}${String(_d.getUTCDate()).padStart(2, "0")}`;

/** Read a `{id: true}` map (pl_saved / pl_visited) into a number[] of ids. */
function lsIdMap(key: string): number[] {
  try {
    const m = JSON.parse(localStorage.getItem(key) || "{}") as Record<string, boolean>;
    return Object.keys(m).filter((k) => m[k]).map(Number).filter(Number.isFinite);
  } catch {
    return [];
  }
}

/** Scan dining save flags (sr_dining_<flag>_<id> = "1") into engine history. */
function scanDiningHistory(): HistoryEntry[] {
  const rank: Record<HistoryEntry["status"], number> = { want: 0, booked: 1, visited: 2 };
  const seen = new Map<number, HistoryEntry>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      const m = /^sr_dining_(saved|booked|visited)_(\d+)$/.exec(k);
      if (!m || localStorage.getItem(k) !== "1") continue;
      const id = Number(m[2]);
      const status: HistoryEntry["status"] =
        m[1] === "visited" ? "visited" : m[1] === "booked" ? "booked" : "want";
      const prev = seen.get(id);
      if (!prev || rank[status] > rank[prev.status]) seen.set(id, { diningId: id, status });
    }
  } catch { /* private mode etc. — cold start is fine */ }
  return [...seen.values()];
}

function tasteGenres(): string[] {
  try { return JSON.parse(localStorage.getItem("sr_taste_genres") || "[]"); } catch { return []; }
}

export function useTonight(): { plan: TonightPlan | null; ready: boolean } {
  const { user } = useAuth();
  const { places } = usePlaces();
  const { dining } = useDining();

  // Small film pool for the signed-out / empty-watchlist fallback.
  const [films, setFilms] = useState<MediaItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${BASE}catalog-top.json?v=${DAYV}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (alive) setFilms(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setFilms([]); });
    return () => { alive = false; };
  }, []);

  // The user's films, most recently touched first.
  const [watchlist, setWatchlist] = useState<WatchlistFilm[] | null>(null);
  useEffect(() => {
    if (!user) { setWatchlist([]); return; }
    let alive = true;
    supabase
      .from("tracked_items")
      .select("tmdb_id, media_type, title, year, genres, status")
      .eq("user_id", user.id)
      .eq("vertical", "films")
      .in("status", ["want", "watching"])
      .order("updated_at", { ascending: false })
      .limit(12)
      .then(({ data }) => { if (alive) setWatchlist((data as WatchlistFilm[]) || []); });
    return () => { alive = false; };
  }, [user]);

  // Current conditions, centred on the places catalog (mirrors places.tsx).
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  useEffect(() => {
    const pts = places.filter((p) => p.lat && p.lng);
    if (!pts.length) return;
    const lat = pts.reduce((s, p) => s + p.lat!, 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p.lng!, 0) / pts.length;
    let alive = true;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.current) return;
        setWeather({ code: d.current.weather_code ?? null, temp: d.current.temperature_2m ?? null });
      })
      .catch(() => { /* the plan composes fine without weather */ });
    return () => { alive = false; };
  }, [places]);

  const ready = places.length > 0 && dining.length > 0 && films !== null && watchlist !== null;

  const plan = useMemo(() => {
    if (!ready) return null;
    return composeTonight({
      now: new Date(),
      name: preferredName(user),
      weather,
      places,
      savedPlaceIds: lsIdMap("pl_saved"),
      visitedPlaceIds: lsIdMap("pl_visited"),
      dining,
      diningHistory: scanDiningHistory(),
      films: films || [],
      watchlist: watchlist || [],
      tasteGenres: tasteGenres(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, weather, places, dining, films, watchlist, user?.email]);

  return { plan, ready };
}
