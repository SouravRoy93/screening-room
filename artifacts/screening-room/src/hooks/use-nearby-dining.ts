import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDining } from "@/hooks/use-catalog";
import { recommendNearbyDining, type HistoryEntry, type Recommendation } from "@/lib/pairing";
import type { PlaceItem, DiningItem } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "";

/** A restaurant returned from the live Google fallback, shaped for the card UI. */
export interface LiveRec {
  name: string;
  cuisine: string | null;
  reason: string;
  rating: number | null;
  user_rating_count: number | null;
  photo_url: string | null;
  maps_url: string | null;
  walkMin: number | null;
}

export type NearbyResult =
  | { source: "curated"; loading: boolean; recs: Recommendation[]; live: null }
  | { source: "live"; loading: boolean; recs: null; live: LiveRec[] }
  | { source: "none"; loading: boolean; recs: null; live: null };

// A place is "curated-dining eligible" only where our dining catalog has coverage.
function isCuratedCity(place: PlaceItem): boolean {
  const city = (place.city || "").toLowerCase();
  return city === "" || city === "new york" || city === "nyc" || city === "new york city";
}

// tracked_items dining status → engine status.
function toStatus(s: string | null | undefined): HistoryEntry["status"] {
  if (s === "watched") return "visited";
  if (s === "booked") return "booked";
  return "want";
}

/**
 * Recommends nearby dining for a place the user is interested in.
 * - NYC places → the local pairing engine (free, private, personalized from history).
 * - Other cities → the live Google fallback route, context-biased.
 * `enabled` gates the work so it only runs once the user signals interest.
 */
export function useNearbyDining(
  place: PlaceItem | undefined,
  userId: string | undefined,
  enabled: boolean,
): NearbyResult {
  const { dining } = useDining();
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [live, setLive] = useState<LiveRec[] | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  // Pull the user's dining history once (for taste). Anonymous → cold start.
  useEffect(() => {
    if (!enabled) return;
    if (!userId) { setHistory([]); return; }
    let alive = true;
    supabase
      .from("tracked_items")
      .select("tmdb_id, status, updated_at")
      .eq("user_id", userId)
      .eq("media_type", "dining")
      .then(({ data }) => {
        if (!alive) return;
        const h = (data || [])
          .map((r: { tmdb_id: string | number; status: string | null; updated_at: string | null }) => ({
            diningId: Number(r.tmdb_id),
            status: toStatus(r.status),
            updatedAt: r.updated_at,
          }))
          .filter((r: HistoryEntry) => Number.isFinite(r.diningId));
        setHistory(h);
      });
    return () => { alive = false; };
  }, [enabled, userId]);

  // Live fallback for non-curated cities.
  const curated = place ? isCuratedCity(place) : false;
  useEffect(() => {
    if (!enabled || !place || curated) return;
    if (typeof place.lat !== "number" || typeof place.lng !== "number") { setLive([]); return; }
    let alive = true;
    setLiveLoading(true);
    const ctx = buildContextHint(place);
    const url = `${API_BASE}/places/dining-nearby?lat=${place.lat}&lng=${place.lng}&context=${encodeURIComponent(ctx)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: LiveRec[]) => { if (alive) setLive(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setLive([]); })
      .finally(() => { if (alive) setLiveLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, place?.id, curated]);

  if (!enabled || !place) return { source: "none", loading: false, recs: null, live: null };

  if (curated) {
    const loading = history === null || dining.length === 0;
    const recs = loading
      ? []
      : recommendNearbyDining(place, dining as DiningItem[], history as HistoryEntry[]);
    return { source: "curated", loading, recs, live: null };
  }

  return { source: "live", loading: liveLoading || live === null, recs: null, live: live || [] };
}

// A compact hint the live route turns into a query bias (mirrors the engine's mapping).
function buildContextHint(place: PlaceItem): string {
  const t = [...(place.moods || []), ...(place.styles || [])].map((x) => String(x).toLowerCase());
  if (t.some((x) => x.includes("romantic"))) return "romantic dinner";
  if (t.some((x) => x.includes("premium") || x.includes("classy") || x.includes("luxury"))) return "upscale dinner";
  if (t.some((x) => x.includes("family"))) return "family friendly restaurant";
  if (t.some((x) => x.includes("nightlife"))) return "late night bar restaurant";
  if (t.some((x) => x.includes("quick"))) return "quick casual restaurant";
  return "popular restaurant";
}
