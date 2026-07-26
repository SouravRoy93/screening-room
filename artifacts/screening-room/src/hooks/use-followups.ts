// ─────────────────────────────────────────────────────────────────────────────
// Data gathering + actions for follow-ups. Scans the dining flags/journal in
// localStorage and the user's unrated watched films in Supabase, hands them
// to the pure engine in lib/followups.ts, and exposes the single follow-up
// to show plus its three honest actions (go, not-now, didn't-go).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useDining } from "@/hooks/use-catalog";
import { pushSave } from "@/lib/cloud-saves";
import {
  computeFollowUps,
  pickFollowUp,
  SNOOZE_MS,
  type DiningActivity,
  type FilmActivity,
  type FollowUp,
  type FollowUpState,
} from "@/lib/followups";

const STATE_KEY = "sr_fu_state";

function readState(): FollowUpState {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); } catch { return {}; }
}
function writeState(s: FollowUpState) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
function ls(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}

/** Every dining table with a booked/visited flag, joined with its stamps. */
function scanDiningActivity(names: Map<number, string>): DiningActivity[] {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      const m = /^sr_dining_(booked|visited)_(.+)$/.exec(k);
      if (m && !m[2].includes("_at_") && localStorage.getItem(k) === "1") ids.add(m[2]);
    }
  } catch { return []; }
  return [...ids].map((key) => {
    const numeric = /^\d+$/.test(key) ? Number(key) : key;
    return {
      id: numeric,
      name: typeof numeric === "number" ? names.get(numeric) || "that table" : key,
      booked: ls(`sr_dining_booked_${key}`) === "1",
      bookedAt: ls(`sr_dining_booked_at_${key}`),
      visited: ls(`sr_dining_visited_${key}`) === "1",
      visitedAt: ls(`sr_dining_visited_at_${key}`),
      hasJournal: !!(ls(`sr_dining_notes_${key}`) || ls(`sr_dining_dish_${key}`)),
    };
  });
}

export function useFollowUps(): {
  followUp: FollowUp | null;
  snooze: () => void;
  didntGo: () => void;
} {
  const { user } = useAuth();
  const { dining } = useDining();
  const [films, setFilms] = useState<FilmActivity[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user) { setFilms([]); return; }
    let alive = true;
    supabase
      .from("tracked_items")
      .select("tmdb_id, media_type, title, status, rating, updated_at")
      .eq("user_id", user.id)
      .eq("vertical", "films")
      .eq("status", "watched")
      .is("rating", null)
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data }) => { if (alive) setFilms((data as FilmActivity[]) || []); });
    return () => { alive = false; };
  }, [user]);

  const followUp = useMemo(() => {
    if (films === null || dining.length === 0) return null;
    const names = new Map(dining.map((d) => [d.id, d.name]));
    const fus = computeFollowUps({
      dining: scanDiningActivity(names),
      films,
      now: new Date(),
    });
    return pickFollowUp(fus, readState(), new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [films, dining, version]);

  function snooze() {
    if (!followUp) return;
    const s = readState();
    s[followUp.id] = { ...s[followUp.id], snoozedUntil: new Date(Date.now() + SNOOZE_MS).toISOString() };
    writeState(s);
    setVersion(v => v + 1);
  }

  /** "I didn't go" — clear the booked flag truthfully, locally and in the cloud. */
  function didntGo() {
    if (!followUp || followUp.kind !== "dining-booked") return;
    const id = Number(followUp.id.split(":")[1]);
    try {
      localStorage.setItem(`sr_dining_booked_${id}`, "0");
      localStorage.removeItem(`sr_dining_booked_at_${id}`);
    } catch { /* private mode */ }
    const item = dining.find(d => d.id === id);
    if (item) {
      void pushSave("dining", id, item.name, {
        saved: ls(`sr_dining_saved_${id}`) === "1",
        booked: false,
        visited: ls(`sr_dining_visited_${id}`) === "1",
      });
    }
    const s = readState();
    s[followUp.id] = { ...s[followUp.id], doneAt: new Date().toISOString() };
    writeState(s);
    setVersion(v => v + 1);
  }

  return { followUp, snooze, didntGo };
}
