// ─────────────────────────────────────────────────────────────────────────────
// Data gathering for Table Watch (roadmap #8).
//
// Reads the member's watches from Supabase, fetches the two things the engine
// can't compute — a 7-day forecast and upcoming episodes — and hands it all to
// the pure composer in lib/watch.ts.
//
// Writes go through here too: adding, dropping, retargeting and dismissing a
// watch. Dismissal is the interesting one — it stamps `last_fired_key` with
// the moment the member just saw, which is what stops the app repeating itself.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useDining, usePlaces } from "@/hooks/use-catalog";
import {
  composeMoments,
  liveMoments,
  type EpisodeInfo,
  type ForecastDay,
  type Moment,
  type Watch,
  type WatchKind,
} from "@/lib/watch";

const API_BASE = import.meta.env.VITE_API_URL || "";

const WATCH_COLUMNS =
  "id, kind, ref, title, subtitle, note, target_date, party_size, active, last_fired_key";

export interface NewWatch {
  kind: WatchKind;
  ref: string | number;
  title: string;
  subtitle?: string | null;
  note?: string | null;
  targetDate?: string | null;
  partySize?: number | null;
}

export interface UseWatch {
  watches: Watch[];
  moments: Moment[];
  /** The short list the hub is allowed to show. */
  live: Moment[];
  loading: boolean;
  add: (w: NewWatch) => Promise<void>;
  remove: (id: string) => Promise<void>;
  update: (id: string, patch: Partial<Pick<Watch, "target_date" | "note" | "party_size" | "active">>) => Promise<void>;
  /** Mark a moment as seen so it doesn't come back. */
  dismiss: (m: Moment) => Promise<void>;
  /** True when the member is watching a given thing already. */
  isWatching: (kind: WatchKind, ref: string | number) => boolean;
}

export function useWatch(): UseWatch {
  const { user } = useAuth();
  const { places } = usePlaces();
  const { dining } = useDining();

  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);

  // ── Watches ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) { setWatches([]); setLoading(false); return; }
    const { data } = await supabase
      .from("watches")
      .select(WATCH_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    setWatches((data as Watch[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // ── Forecast (Open-Meteo, keyless — same source as the Places page) ────────
  useEffect(() => {
    const pts = places.filter((p) => p.lat && p.lng);
    if (!pts.length) return;
    const lat = pts.reduce((s, p) => s + p.lat!, 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p.lng!, 0) / pts.length;
    let alive = true;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.daily?.time) return;
        const days: ForecastDay[] = d.daily.time.map((date: string, i: number) => ({
          date,
          code: d.daily.weather_code?.[i] ?? 0,
          tempMax: d.daily.temperature_2m_max?.[i] ?? 0,
          tempMin: d.daily.temperature_2m_min?.[i] ?? 0,
          precipProb: d.daily.precipitation_probability_max?.[i] ?? 0,
        }));
        setForecast(days);
      })
      .catch(() => { /* weather moments simply won't fire */ });
    return () => { alive = false; };
  }, [places]);

  // ── Episodes, only for the shows actually being watched ────────────────────
  const showIds = useMemo(
    () => watches.filter((w) => w.kind === "show").map((w) => Number(w.ref)).filter(Number.isFinite),
    [watches],
  );
  const showKey = showIds.join(",");

  useEffect(() => {
    if (!showIds.length) { setEpisodes([]); return; }
    let alive = true;
    fetch(`${API_BASE}/notifications/episodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdb_ids: showIds.slice(0, 50), days_back: 7, days_ahead: 14 }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (alive) setEpisodes(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setEpisodes([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKey]);

  // ── Compose ────────────────────────────────────────────────────────────────
  const moments = useMemo(
    () => composeMoments({ now: new Date(), watches, dining, places, forecast, episodes }),
    [watches, dining, places, forecast, episodes],
  );

  const live = useMemo(
    () => liveMoments({ now: new Date(), watches, dining, places, forecast, episodes }, 3),
    [watches, dining, places, forecast, episodes],
  );

  // ── Writes ─────────────────────────────────────────────────────────────────
  const add = useCallback(async (w: NewWatch) => {
    if (!user) return;
    await supabase.from("watches").upsert(
      {
        user_id: user.id,
        kind: w.kind,
        ref: String(w.ref),
        title: w.title,
        subtitle: w.subtitle ?? null,
        note: w.note ?? null,
        target_date: w.targetDate ?? null,
        party_size: w.partySize ?? null,
        active: true,
        // A re-added watch should speak again.
        last_fired_at: null,
        last_fired_key: null,
      },
      { onConflict: "user_id,kind,ref" },
    );
    await load();
  }, [user, load]);

  const remove = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from("watches").delete().eq("id", id).eq("user_id", user.id);
    await load();
  }, [user, load]);

  const update = useCallback(async (
    id: string,
    patch: Partial<Pick<Watch, "target_date" | "note" | "party_size" | "active">>,
  ) => {
    if (!user) return;
    // Retargeting invalidates whatever we last said about the old date.
    const clears = "target_date" in patch ? { last_fired_at: null, last_fired_key: null } : {};
    await supabase.from("watches").update({ ...patch, ...clears }).eq("id", id).eq("user_id", user.id);
    await load();
  }, [user, load]);

  const dismiss = useCallback(async (m: Moment) => {
    if (!user) return;
    await supabase
      .from("watches")
      .update({ last_fired_at: new Date().toISOString(), last_fired_key: m.fireKey })
      .eq("id", m.watchId)
      .eq("user_id", user.id);
    await load();
  }, [user, load]);

  const isWatching = useCallback(
    (kind: WatchKind, ref: string | number) =>
      watches.some((w) => w.kind === kind && w.ref === String(ref)),
    [watches],
  );

  return { watches, moments, live, loading, add, remove, update, dismiss, isWatching };
}
