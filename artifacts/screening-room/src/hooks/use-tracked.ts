import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import {
  applyAnswer,
  applyDismiss,
  applyExplicit,
  parseAnswers,
  type Advocacy,
  type Question,
  type Verdict,
} from "@/lib/verdict";
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

  const promptSignIn = () => {
    toast({
      title: "Sign in to track",
      description: "Create a free account to save your watchlist and ratings.",
    });
  };

  const setStatus = useCallback(async (item: MediaItem, status: "want" | "watching" | "watched") => {
    if (!userId) { promptSignIn(); return; }
    const key: TrackKey = `${item.media_type}:${item.tmdb_id}`;
    const existing = tracked[key];

    if (existing && existing.status === status) {
      await supabase.from("tracked_items").delete().eq("id", existing.id!).eq("user_id", userId);
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
    if (!userId) { promptSignIn(); return; }
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

  /**
   * Shared writer for everything the verdict engine produces. Always upserts
   * `watched` — you only answer these questions about something you've seen —
   * and stores the derived score in the same `rating` column an explicit star
   * rating uses, so no downstream engine has to know which door was used.
   */
  const writeVerdict = useCallback(async (
    item: MediaItem,
    answers: Record<string, unknown>,
    rating: number | null,
  ) => {
    if (!userId) { promptSignIn(); return; }
    const key: TrackKey = `${item.media_type}:${item.tmdb_id}`;
    const existing = tracked[key];
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
      answers,
      ...(rating != null ? { rating, rated_at: new Date().toISOString() } : {
        rating: existing?.rating ?? null,
        rated_at: existing?.rated_at ?? null,
      }),
      updated_at: new Date().toISOString(),
    };
    const { data } = await supabase
      .from("tracked_items")
      .upsert(row, { onConflict: "user_id,tmdb_id,media_type" })
      .select()
      .maybeSingle();
    setTracked(prev => ({ ...prev, [key]: (data || row) as TrackedItem }));
  }, [userId, vertical, tracked]);

  /** They answered one of the two questions. */
  const answerVerdict = useCallback(async (
    item: MediaItem,
    question: Question,
    value: Verdict | Advocacy,
  ) => {
    const key: TrackKey = `${item.media_type}:${item.tmdb_id}`;
    const prev = parseAnswers(tracked[key]?.answers);
    const { answers, rating } = applyAnswer(prev, question, value);
    await writeVerdict(item, answers as unknown as Record<string, unknown>, rating);
  }, [tracked, writeVerdict]);

  /** They reached for the stars instead — questions stop for this title. */
  const rateExplicit = useCallback(async (item: MediaItem, rating: number) => {
    const key: TrackKey = `${item.media_type}:${item.tmdb_id}`;
    const prev = parseAnswers(tracked[key]?.answers);
    const answers = applyExplicit(prev);
    await writeVerdict(item, answers as unknown as Record<string, unknown>, rating);
  }, [tracked, writeVerdict]);

  /** "Later." Records the wave-off; never touches status or rating. */
  const dismissVerdict = useCallback(async (item: MediaItem) => {
    const key: TrackKey = `${item.media_type}:${item.tmdb_id}`;
    const prev = parseAnswers(tracked[key]?.answers);
    const answers = applyDismiss(prev);
    await writeVerdict(item, answers as unknown as Record<string, unknown>, null);
  }, [tracked, writeVerdict]);

  return {
    tracked, loading, setStatus, saveRating, reload: load,
    answerVerdict, rateExplicit, dismissVerdict,
  };
}
