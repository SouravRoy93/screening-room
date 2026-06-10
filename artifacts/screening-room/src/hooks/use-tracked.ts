import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { TrackedItem, MediaItem } from "@/types";

export type TrackKey = string; // "media_type:tmdb_id"

export function useTracked(vertical: string, userId: string | undefined) {
  const [tracked, setTracked] = useState<Record<TrackKey, TrackedItem>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setTracked({}); return; }
    setLoading(true);
    const { data } = await supabase
      .from("tracked_items")
      .select("*")
      .eq("user_id", userId)
      .eq("vertical", vertical);
    if (data) {
      const map: Record<TrackKey, TrackedItem> = {};
      data.forEach((r: TrackedItem) => { map[`${r.media_type}:${r.tmdb_id}`] = r; });
      setTracked(map);
    }
    setLoading(false);
  }, [userId, vertical]);

  useEffect(() => { load(); }, [load]);

  const setStatus = useCallback(async (item: MediaItem, status: "want" | "watching" | "watched") => {
    if (!userId) return;
    const key: TrackKey = `${item.media_type}:${item.tmdb_id}`;
    const existing = tracked[key];

    if (existing && existing.status === status) {
      await supabase.from("tracked_items").delete().eq("id", existing.id!);
      setTracked(prev => { const n = { ...prev }; delete n[key]; return n; });
    } else {
      const row = {
        user_id: userId,
        vertical,
        tmdb_id: String(item.tmdb_id),
        media_type: item.media_type,
        title: item.title,
        year: item.year,
        genres: item.genres,
        poster_path: item.poster_path,
        status,
        updated_at: new Date().toISOString(),
        ...(existing ? { rating: existing.rating, rated_at: existing.rated_at } : {}),
      };
      const { data } = await supabase
        .from("tracked_items")
        .upsert(row, { onConflict: "user_id,tmdb_id,media_type" })
        .select()
        .maybeSingle();
      setTracked(prev => ({ ...prev, [key]: data || row as TrackedItem }));
    }
  }, [userId, vertical, tracked]);

  const saveRating = useCallback(async (item: MediaItem, rating: number) => {
    if (!userId) return;
    const key: TrackKey = `${item.media_type}:${item.tmdb_id}`;
    const row = {
      user_id: userId,
      vertical,
      tmdb_id: String(item.tmdb_id),
      media_type: item.media_type,
      title: item.title,
      year: item.year,
      genres: item.genres,
      poster_path: item.poster_path,
      status: "watched" as const,
      rating,
      rated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data } = await supabase
      .from("tracked_items")
      .upsert(row, { onConflict: "user_id,tmdb_id,media_type" })
      .select()
      .maybeSingle();
    setTracked(prev => ({ ...prev, [key]: data || row as TrackedItem }));
  }, [userId, vertical]);

  return { tracked, loading, setStatus, saveRating, reload: load };
}
