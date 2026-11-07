// The recommender's single integration point.
//
// Everything about "More like this" lives in four self-contained files:
//
//   lib/recommend.ts            the scoring engine (pure, no React)
//   lib/recommend.selftest.ts   its tests
//   components/more-like-this.* the sheet
//   hooks/use-suggestions.tsx   this file — the only thing a page imports
//
// A page gets the whole feature with two lines: call the hook, render
// `sheet`, and call `maybeSuggest` when a status changes. Changing the
// popup, the scoring, or the restraint rules should never require touching
// a page file again.
import { useCallback, useRef, useState } from "react";
import { MoreLikeThis } from "@/components/more-like-this";
import {
  recommendLike,
  shouldSuggest,
  type Recommendation,
  type TrackStatus,
} from "@/lib/recommend";
import type { MediaItem, TrackedItem } from "@/types";

export interface SuggestContext {
  /** The verdict question is on screen — don't stack a second popup. */
  questionOpen?: boolean;
  /** A bulk-marking run was detected this session. */
  bulkSuppressed?: boolean;
  /** The mark was a toggle-off, not a new one. */
  turnedOff?: boolean;
}

interface Options {
  catalog: MediaItem[];
  tracked: Record<string, TrackedItem>;
  /** Same setter the page uses; the sheet's "+ Watchlist" calls it. */
  setStatus: (item: MediaItem, status: "want" | "watching" | "watched") => Promise<void> | void;
}

interface Suggestion {
  seed: MediaItem;
  status: TrackStatus;
  recs: Recommendation[];
}

export function useSuggestions({ catalog, tracked, setStatus }: Options) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const lastShownRef = useRef<number | null>(null);

  const maybeSuggest = useCallback(
    (seed: MediaItem, status: TrackStatus, ctx: SuggestContext = {}) => {
      // Cheap exits before the catalog scan — this runs on every mark.
      if (ctx.turnedOff || status === "watching" || ctx.questionOpen || ctx.bulkSuppressed) return;
      if (!catalog.length) return;

      const recs = recommendLike(seed, catalog, Object.values(tracked), { limit: 4 });
      if (!shouldSuggest({ status, count: recs.length, lastShownAt: lastShownRef.current, ...ctx })) return;

      lastShownRef.current = Date.now();
      setSuggestion({ seed, status, recs });
    },
    [catalog, tracked],
  );

  const close = useCallback(() => setSuggestion(null), []);

  const sheet = suggestion ? (
    <MoreLikeThis
      seed={suggestion.seed}
      status={suggestion.status}
      recs={suggestion.recs}
      onAdd={item => setStatus(item, "want")}
      onClose={close}
    />
  ) : null;

  return { maybeSuggest, sheet };
}
