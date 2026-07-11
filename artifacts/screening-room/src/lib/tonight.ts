// ─────────────────────────────────────────────────────────────────────────────
// "Tonight" composer (Obsession roadmap #1 — the living, time-aware hub).
//
// Pure and deterministic: given the current time, the weather, the catalogs
// and the user's saves, compose a small plan — one place, one table, one
// film — each with a truthful one-line reason. No network, no randomness:
// the same inputs always produce the same plan (see tonight.selftest.ts).
// Data gathering lives in hooks/use-tonight.ts; UI in components/tonight-card.
// ─────────────────────────────────────────────────────────────────────────────
import {
  recommendNearbyDining,
  recognitionScore,
  daypartFromHour,
  type Daypart,
  type HistoryEntry,
} from "./pairing";
import type { DiningItem, MediaItem, PlaceItem } from "@/types";

// ── Inputs / outputs ─────────────────────────────────────────────────────────

/** Current conditions, WMO weather code + °F (matches the Places page fetch). */
export interface WeatherNow {
  code: number | null;
  temp: number | null;
}

/** A film from the user's tracked list (Supabase row shape, narrowed). */
export interface WatchlistFilm {
  tmdb_id: string;
  media_type: string;
  title: string;
  year?: number | null;
  genres?: string[] | null;
  status?: string;
}

export interface TonightInput {
  now: Date;
  /** Preferred display name; omitted → impersonal greeting. */
  name?: string | null;
  weather?: WeatherNow | null;
  places: PlaceItem[];
  savedPlaceIds?: number[];
  visitedPlaceIds?: number[];
  dining: DiningItem[];
  diningHistory?: HistoryEntry[];
  /** Fallback film pool (catalog-top), used when the watchlist is empty. */
  films?: MediaItem[];
  /** The user's want/watching films, most recently updated first. */
  watchlist?: WatchlistFilm[];
  /** Onboarding genres (localStorage `sr_taste_genres`). */
  tasteGenres?: string[];
}

export interface TonightPick {
  kind: "place" | "dining" | "film";
  title: string;
  sub: string;
  /** Truthful one-line "why this, why now". */
  reason: string;
  href: string;
}

export interface TonightPlan {
  /** "Tonight" / "This morning" / … */
  eyebrow: string;
  /** "Good evening, Sourav" */
  greeting: string;
  /** "Friday · 72° and clear — a fine night to be out" */
  context: string;
  picks: TonightPick[];
}

// ── Time & weather language ──────────────────────────────────────────────────

const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);

export function isWet(w?: WeatherNow | null): boolean {
  return !!w && w.code != null && (WET.has(w.code) || SNOW.has(w.code));
}

export function greetingFor(now: Date, name?: string | null): string {
  const h = now.getHours();
  const base =
    h < 5 ? "Up late" :
    h < 12 ? "Good morning" :
    h < 17 ? "Good afternoon" :
    h < 22 ? "Good evening" : "Up late";
  return name ? `${base}, ${name}` : base;
}

export function eyebrowFor(now: Date): string {
  const h = now.getHours();
  if (h < 5 || h >= 22) return "Late night";
  if (h < 12) return "This morning";
  if (h < 17) return "This afternoon";
  return "Tonight";
}

function weatherPhrase(w: WeatherNow | null | undefined, daypart: Daypart): string | null {
  if (!w || w.code == null || w.temp == null) return null;
  const t = Math.round(w.temp);
  const span = daypart === "dinner" || daypart === "late" ? "night" : "day";
  if (SNOW.has(w.code)) return `${t}° and snowing — the city goes quiet and beautiful`;
  if (WET.has(w.code)) return `${t}° and rainy — an indoors kind of ${span}`;
  if (w.code === 45 || w.code === 48) return `${t}° and foggy — moody skyline weather`;
  if (t >= 88) return `${t}° and hot — keep it shady or air-conditioned`;
  if (t >= 60 && w.code <= 3) return `${t}° and clear — a fine ${span} to be out`;
  if (t >= 45) return `${t}° and mild — good walking weather`;
  return `${t}° and cold — bundle up, or stay in beautifully`;
}

// ── Place ────────────────────────────────────────────────────────────────────

export function pickPlace(input: TonightInput): { place: PlaceItem | null; reason: string } {
  const { places } = input;
  if (!places.length) return { place: null, reason: "" };
  const saved = new Set(input.savedPlaceIds || []);
  const visited = new Set(input.visitedPlaceIds || []);
  const wet = isWet(input.weather);
  const daypart = daypartFromHour(input.now.getHours());

  let best: PlaceItem | null = null;
  let bestScore = -Infinity;
  for (const p of places) {
    if (visited.has(p.id)) continue;
    let s = p.scores?.mustVisit ?? p.scores?.b ?? 5;
    if (saved.has(p.id)) s += 100; // a save should always win
    if (wet) s += p.rain ? 25 : -25; // rain-friendly flag from the catalog
    if (daypart === "dinner" || daypart === "late") s += p.scores?.night ?? 0;
    if (daypart === "afternoon" && !wet) {
      s += (p.scores?.photoWorth ?? 0) * 0.5;
      if (p.badges?.includes("Best at Sunset")) s += 6;
    }
    if (s > bestScore || (s === bestScore && best !== null && p.id < best.id)) {
      best = p;
      bestScore = s;
    }
  }
  if (!best) return { place: null, reason: "" };

  const isSaved = saved.has(best.id);
  let reason: string;
  if (isSaved && wet && best.rain) reason = "You saved this — and it holds up in the rain.";
  else if (isSaved && (daypart === "dinner" || daypart === "late")) reason = "You saved this — tonight looks right for it.";
  else if (isSaved) reason = "Still on your list — a good day to go.";
  else if (wet && best.rain) reason = "Made for a day like this — rain and all.";
  else if ((daypart === "dinner" || daypart === "late") && (best.scores?.night ?? 0) >= 7) reason = "At its best after dark.";
  else reason = "An icon to start with — worth every visit.";

  return { place: best, reason };
}

// ── Dining ───────────────────────────────────────────────────────────────────

// Curated dining coverage is NYC (mirrors use-nearby-dining's gate).
function isCuratedCity(place: PlaceItem): boolean {
  const city = (place.city || "").toLowerCase();
  return city === "" || city === "new york" || city === "nyc" || city === "new york city";
}

const DAYPART_TABLE_OCCASIONS: Record<Daypart, string[]> = {
  morning: ["Brunch", "Casual"],
  lunch: ["Power lunch", "Casual"],
  afternoon: ["Drinks & bites", "Casual"],
  dinner: ["Date night", "Casual", "Big night out"],
  late: ["Drinks & bites", "See & be seen"],
};

export function pickDining(input: TonightInput, anchor: PlaceItem | null): TonightPick | null {
  const { dining } = input;
  if (!dining.length) return null;
  const history = input.diningHistory || [];
  const daypart = daypartFromHour(input.now.getHours());

  // 1) Best case: pair with the chosen place via the pairing engine.
  if (anchor && typeof anchor.lat === "number" && typeof anchor.lng === "number" && isCuratedCity(anchor)) {
    const recs = recommendNearbyDining(anchor, dining, history, { now: input.now, limit: 1 });
    if (recs.length) {
      const r = recs[0];
      // The engine's reason already covers walk time; just anchor it.
      return {
        kind: "dining",
        title: r.item.name,
        sub: `${r.item.cuisine} · ${r.item.neighborhood}`,
        reason: `From ${anchor.name}: ${r.reason}`,
        href: `/dining/${r.item.id}`,
      };
    }
  }

  const byId = new Map(dining.map((d) => [d.id, d]));
  const visitedIds = new Set(history.filter((h) => h.status === "visited").map((h) => h.diningId));

  // 2) A table the user already saved (attainable tonight preferred).
  const savedTables = history
    .filter((h) => h.status === "want" && byId.has(h.diningId))
    .map((h) => byId.get(h.diningId)!)
    .sort((a, b) => (a.rope ?? 5) - (b.rope ?? 5) || a.id - b.id);
  if (savedTables.length) {
    const t = savedTables[0];
    return {
      kind: "dining",
      title: t.name,
      sub: `${t.cuisine} · ${t.neighborhood}`,
      reason: (t.rope ?? 5) <= 1
        ? "Saved for later — and it's walk-in friendly tonight."
        : "Saved for later — worth planning this one soon.",
      href: `/dining/${t.id}`,
    };
  }

  // 3) Cold start: a fitting, attainable table for this hour.
  const wanted = DAYPART_TABLE_OCCASIONS[daypart];
  let best: DiningItem | null = null;
  let bestScore = -Infinity;
  for (const d of dining) {
    if (visitedIds.has(d.id)) continue;
    let s = recognitionScore(d.recognition) * 10;
    s += Math.max(0, 3 - (d.rope ?? 5)) * 4; // attainable tonight beats trophy
    const occ = d.occasion || [];
    for (let i = 0; i < wanted.length; i++) if (occ.includes(wanted[i])) s += (wanted.length - i) * 6;
    if (s > bestScore || (s === bestScore && best !== null && d.id < best.id)) {
      best = d;
      bestScore = s;
    }
  }
  if (!best) return null;
  return {
    kind: "dining",
    title: best.name,
    sub: `${best.cuisine} · ${best.neighborhood}`,
    reason: (best.rope ?? 5) <= 1
      ? "No reservation needed — just show up hungry."
      : "A right-now kind of table for this hour.",
    href: `/dining/${best.id}`,
  };
}

// ── Film ─────────────────────────────────────────────────────────────────────

export function pickFilm(input: TonightInput): TonightPick | null {
  const wl = input.watchlist || [];
  if (wl.length) {
    // Prefer a plain "want" over something mid-watch; caller sorts by recency.
    const f = wl.find((x) => x.status === "want") ?? wl[0];
    const sub = [f.media_type === "tv" ? "Series" : "Film", f.year ?? undefined]
      .filter(Boolean)
      .join(" · ");
    return {
      kind: "film",
      title: f.title,
      sub,
      reason: f.status === "watching"
        ? "You're mid-story — pick it back up tonight."
        : "It's been waiting on your list — tonight could be the night.",
      href: `/films/${f.media_type}/${f.tmdb_id}`,
    };
  }

  const films = input.films || [];
  if (!films.length) return null;
  const taste = new Set(input.tasteGenres || []);
  const pool = taste.size ? films.filter((f) => f.genres?.some((g) => taste.has(g))) : films;
  const source = pool.length ? pool : films;
  let best: MediaItem | null = null;
  for (const f of source) {
    if (
      best === null ||
      (f.popularity ?? 0) > (best.popularity ?? 0) ||
      ((f.popularity ?? 0) === (best.popularity ?? 0) && f.tmdb_id < best.tmdb_id)
    ) best = f;
  }
  if (!best) return null;
  const matched = taste.size ? best.genres?.find((g) => taste.has(g)) : undefined;
  return {
    kind: "film",
    title: best.title,
    sub: [best.media_type === "tv" ? "Series" : "Film", best.year ?? undefined].filter(Boolean).join(" · "),
    reason: matched
      ? `Big right now — and it's ${matched}, your lane.`
      : "What everyone's watching right now.",
    href: `/films/${best.media_type}/${best.tmdb_id}`,
  };
}

// ── Compose ──────────────────────────────────────────────────────────────────

export function composeTonight(input: TonightInput): TonightPlan {
  const daypart = daypartFromHour(input.now.getHours());
  const { place, reason } = pickPlace(input);

  const picks: TonightPick[] = [];
  if (place) {
    picks.push({
      kind: "place",
      title: place.name,
      sub: [place.city || "New York", place.area].filter(Boolean).join(" · "),
      reason,
      href: `/places/${place.id}`,
    });
  }
  const table = pickDining(input, place);
  if (table) picks.push(table);
  const film = pickFilm(input);
  if (film) picks.push(film);

  const weekday = input.now.toLocaleDateString("en-US", { weekday: "long" });
  const wx = weatherPhrase(input.weather, daypart);
  return {
    eyebrow: eyebrowFor(input.now),
    greeting: greetingFor(input.now, input.name),
    context: wx ? `${weekday} · ${wx}` : weekday,
    picks,
  };
}

/** "sourav.oyr" → "Sourav". Best-effort warmth until real profiles land. */
export function nameFromEmail(email?: string | null): string | null {
  if (!email) return null;
  const raw = email.split("@")[0].split(/[._\-+\d]/).find((s) => s.length > 1);
  if (!raw) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}
