// ─────────────────────────────────────────────────────────────────────────────
// "Choose for me" (Obsession roadmap #5 — the anti-choice button). Luxury is
// editing: one confident pick from whatever list the user is looking at,
// with a truthful one-line reason. Deterministic: same inputs → same pick;
// "another, please" works by exclusion, not randomness.
// Reuses the taste/context machinery already in pairing.ts and tonight.ts.
// ─────────────────────────────────────────────────────────────────────────────
import {
  buildTasteProfile,
  recognitionScore,
  daypartFromHour,
  type Daypart,
  type HistoryEntry,
} from "./pairing";
import {
  pickPlace,
  pickFilm,
  type WatchlistFilm,
  type WeatherNow,
} from "./tonight";
import type { DiningItem, MediaItem, PlaceItem } from "@/types";

export interface Choice {
  /** Stable id used for "another, please" exclusion. */
  id: string;
  title: string;
  sub: string;
  reason: string;
  href: string;
}

// ── Dining ───────────────────────────────────────────────────────────────────

const DAYPART_OCCASIONS: Record<Daypart, string[]> = {
  morning: ["Brunch", "Casual"],
  lunch: ["Power lunch", "Casual"],
  afternoon: ["Drinks & bites", "Casual"],
  dinner: ["Date night", "Casual", "Big night out"],
  late: ["Drinks & bites", "See & be seen"],
};

export function chooseDining(opts: {
  /** What the user is currently looking at (respects their filters/tab). */
  candidates: DiningItem[];
  /** Full catalog, for taste-profile lookups. */
  all?: DiningItem[];
  history?: HistoryEntry[];
  now: Date;
  exclude?: Set<string>;
}): Choice | null {
  const { candidates, now } = opts;
  if (!candidates.length) return null;
  const exclude = opts.exclude ?? new Set<string>();
  const history = opts.history ?? [];
  const byId = new Map((opts.all ?? candidates).map((d) => [d.id, d]));
  const taste = buildTasteProfile(history, byId, now);
  const daypart = daypartFromHour(now.getHours());
  const wanted = DAYPART_OCCASIONS[daypart];

  // Prefer somewhere new; only resurface visited tables if little else remains.
  let pool = candidates.filter((d) => !exclude.has(String(d.id)) && !taste.visitedIds.has(d.id));
  if (pool.length < 3) pool = candidates.filter((d) => !exclude.has(String(d.id)));
  if (!pool.length) return null;

  type Scored = { d: DiningItem; s: number; why: string[] };
  let best: Scored | null = null;
  for (const d of pool) {
    const why: string[] = [];
    let s = 0;

    const aff = taste.cuisine.get(d.cuisine) ?? 0;
    if (taste.sampleSize >= 3 && taste.topCuisines.has(d.cuisine)) {
      s += 30 * aff + 10;
      why.push(`${d.cuisine.toLowerCase()} has been your lane lately`);
    } else {
      s += 30 * aff;
    }

    const occ = d.occasion || [];
    for (let i = 0; i < wanted.length; i++) {
      if (occ.includes(wanted[i])) {
        s += (wanted.length - i) * 8;
        if (i === 0) why.push(`right for ${wanted[0].toLowerCase()} at this hour`);
        break;
      }
    }

    const rec = recognitionScore(d.recognition);
    s += rec * 12;
    if (rec >= 0.6 && d.recognition) why.push(d.recognition.toLowerCase());

    const rope = d.rope ?? 5;
    s += Math.max(0, 3 - rope) * 4;
    if (rope <= 1) why.push("no reservation needed");

    if (taste.sampleSize >= 3 && typeof d.price === "number" && d.price > 0) {
      s -= Math.abs(d.price - taste.priceMean) * 3;
    }

    if (!best || s > best.s || (s === best.s && d.id < best.d.id)) best = { d, s, why };
  }
  if (!best) return null;

  const reason = best.why.length
    ? best.why.slice(0, 2).join(" — and ")
    : "a table I'd stake my name on";
  return {
    id: String(best.d.id),
    title: best.d.name,
    sub: [best.d.cuisine, best.d.neighborhood || best.d.city].filter(Boolean).join(" · "),
    reason: reason.charAt(0).toUpperCase() + reason.slice(1) + ".",
    href: `/dining/${best.d.id}`,
  };
}

// ── Places ───────────────────────────────────────────────────────────────────

export function choosePlace(opts: {
  candidates: PlaceItem[];
  savedIds?: number[];
  visitedIds?: number[];
  weather?: WeatherNow | null;
  now: Date;
  exclude?: Set<string>;
}): Choice | null {
  const exclude = opts.exclude ?? new Set<string>();
  const pool = opts.candidates.filter((p) => !exclude.has(String(p.id)));
  if (!pool.length) return null;
  const { place, reason } = pickPlace({
    now: opts.now,
    weather: opts.weather,
    places: pool,
    savedPlaceIds: opts.savedIds,
    visitedPlaceIds: opts.visitedIds,
    dining: [],
  });
  if (!place) return null;
  return {
    id: String(place.id),
    title: place.name,
    sub: [place.city || "New York", place.area].filter(Boolean).join(" · "),
    reason,
    href: `/places/${place.id}`,
  };
}

// ── Films ────────────────────────────────────────────────────────────────────

export function chooseFilm(opts: {
  candidates: MediaItem[];
  watchlist?: WatchlistFilm[];
  tasteGenres?: string[];
  now: Date;
  exclude?: Set<string>;
}): Choice | null {
  const exclude = opts.exclude ?? new Set<string>();
  const key = (t: string, id: string | number) => `${t}:${id}`;
  const wl = (opts.watchlist ?? []).filter((f) => !exclude.has(key(f.media_type, f.tmdb_id)));
  const films = opts.candidates.filter((f) => !exclude.has(key(f.media_type, f.tmdb_id)));
  if (!wl.length && !films.length) return null;
  const pick = pickFilm({
    now: opts.now,
    places: [],
    dining: [],
    films,
    watchlist: wl,
    tasteGenres: opts.tasteGenres,
  });
  if (!pick) return null;
  // href is "/films/<type>/<id>" — derive the stable id from it.
  const [, , type, id] = pick.href.split("/");
  return { id: key(type, id), title: pick.title, sub: pick.sub, reason: pick.reason, href: pick.href };
}
