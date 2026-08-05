// ─────────────────────────────────────────────────────────────────────────────
// Data gathering for "Perfect Evening" (roadmap #7). Same sources as the
// Tonight card — catalogs, local saves, Supabase watchlist, keyless weather —
// handed to the pure composer in lib/evening.ts.
//
// This hook also owns the two pieces of interaction state the page needs:
// which occasion is selected, and which acts the member has swapped away
// from. Swapping one act pins the others, so the rest of the evening holds
// still while a single slot changes.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useDining, usePlaces } from "@/hooks/use-catalog";
import type { HistoryEntry } from "@/lib/pairing";
import { type WatchlistFilm, type WeatherNow } from "@/lib/tonight";
import {
  composeEvening,
  eveningCities,
  type ActKind,
  type EveningPlan,
  type OccasionId,
} from "@/lib/evening";
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

export interface UseEvening {
  plan: EveningPlan | null;
  ready: boolean;
  /** Cities with enough catalog on both sides to compose an evening. */
  cities: string[];
  city: string | null;
  setCity: (city: string) => void;
  occasion: OccasionId;
  setOccasion: (id: OccasionId) => void;
  /** "Another, please" for one act; the other two hold still. */
  swap: (kind: ActKind) => void;
  /** Back to the evening as first composed. */
  reset: () => void;
  /** True once anything has been swapped — drives the "start over" affordance. */
  touched: boolean;
}

export function useEvening(initial: OccasionId = "date-night"): UseEvening {
  const { user } = useAuth();
  const { places } = usePlaces();
  const { dining } = useDining();

  const [occasion, setOccasionState] = useState<OccasionId>(initial);
  const [city, setCityState] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);

  // Small film pool for the "end at home" finale when the watchlist is empty.
  const [films, setFilms] = useState<MediaItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${BASE}catalog-top.json?v=${DAYV}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (alive) setFilms(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setFilms([]); });
    return () => { alive = false; };
  }, []);

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
      .catch(() => { /* the evening composes fine without weather */ });
    return () => { alive = false; };
  }, [places]);

  const ready = places.length > 0 && dining.length > 0 && films !== null && watchlist !== null;

  const cities = useMemo(
    () => (ready ? eveningCities(places, dining) : []),
    [ready, places, dining],
  );

  // Saves are read once per compose rather than watched — they only change on
  // another page, and the member returns here to a freshly composed evening.
  const plan = useMemo(() => {
    if (!ready) return null;
    return composeEvening({
      occasion,
      now: new Date(),
      city: city ?? undefined,
      weather,
      places,
      savedPlaceIds: lsIdMap("pl_saved"),
      visitedPlaceIds: lsIdMap("pl_visited"),
      dining,
      diningHistory: scanDiningHistory(),
      films: films || [],
      watchlist: watchlist || [],
      tasteGenres: tasteGenres(),
      exclude: new Set(excluded),
      pin: new Set(pinned),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, occasion, city, weather, places, dining, films, watchlist, excluded, pinned]);

  const setOccasion = useCallback((id: OccasionId) => {
    setOccasionState(id);
    // A new occasion is a new evening — old swaps don't carry over.
    setExcluded([]);
    setPinned([]);
  }, []);

  const setCity = useCallback((c: string) => {
    setCityState(c);
    setExcluded([]);
    setPinned([]);
  }, []);

  const swap = useCallback((kind: ActKind) => {
    if (!plan) return;
    const target = plan.acts.find((a) => a.kind === kind);
    if (!target) return;
    setExcluded((prev) => (prev.includes(target.id) ? prev : [...prev, target.id]));
    // Hold everything else exactly where it is.
    setPinned(plan.acts.filter((a) => a.kind !== kind).map((a) => a.id));
  }, [plan]);

  const reset = useCallback(() => { setExcluded([]); setPinned([]); }, []);

  return {
    plan,
    ready,
    cities,
    city: plan?.city ?? city,
    setCity,
    occasion,
    setOccasion,
    swap,
    reset,
    touched: excluded.length > 0,
  };
}
