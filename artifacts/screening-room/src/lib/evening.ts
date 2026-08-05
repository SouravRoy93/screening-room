// ─────────────────────────────────────────────────────────────────────────────
// "Perfect Evening" (Obsession roadmap #7 — occasion-first planning).
//
// Tonight answers "what should I do?". Perfect Evening answers a harder,
// more human question: "someone's coming into town / it's our anniversary /
// she got the job — what do I *do* with the night?" The occasion is the input;
// a composed three-act arc is the output.
//
//   Act I  — the opener   a place, chosen for the occasion and the light
//   Act II — the table    dinner, near the opener, matched to the occasion
//   Act III— the finale   a nightcap, a last look at the city, or a film home
//
// Each occasion composes a genuinely different shape: a date night ends
// quietly and can finish at home; friends in from out of town end on a view;
// a celebration earns the trophy table and a proper nightcap.
//
// Pure and deterministic — same inputs always produce the same evening, so
// it is testable and a reload never quietly changes the plan
// (see evening.selftest.ts). "Another, please" works by exclusion, and any
// act can be pinned while a neighbouring one is swapped. Data gathering lives
// in hooks/use-evening.ts; UI in components/evening-plan + pages/evening.
// ─────────────────────────────────────────────────────────────────────────────
import {
  buildTasteProfile,
  haversineMeters,
  recognitionScore,
  walkMinutes,
  type HistoryEntry,
} from "./pairing";
import { isWet, type WatchlistFilm, type WeatherNow } from "./tonight";
import type { DiningItem, MediaItem, PlaceItem } from "@/types";

// ── Occasions ────────────────────────────────────────────────────────────────

export type OccasionId = "date-night" | "out-of-towners" | "celebration";

export interface Occasion {
  id: OccasionId;
  /** Picker title. */
  label: string;
  /** Picker subtitle — what this evening is for. */
  tagline: string;
  /** Sits above the composed plan. */
  eyebrow: string;
  /** Where the arc starts when there's still a whole evening ahead. */
  startHour: number;
}

export const OCCASIONS: readonly Occasion[] = [
  {
    id: "date-night",
    label: "Date night",
    tagline: "Somewhere you can hear each other.",
    eyebrow: "An evening for two",
    startHour: 18,
  },
  {
    id: "out-of-towners",
    label: "Friends in town",
    tagline: "The city, at its most itself.",
    eyebrow: "An evening worth the airfare",
    startHour: 17,
  },
  {
    id: "celebration",
    label: "A celebration",
    tagline: "Something happened. Mark it properly.",
    eyebrow: "An evening that earns the fuss",
    startHour: 19,
  },
] as const;

export function occasionById(id: OccasionId): Occasion {
  return OCCASIONS.find((o) => o.id === id) ?? OCCASIONS[0];
}

// ── Plan shape ───────────────────────────────────────────────────────────────

export type ActKind = "opener" | "table" | "finale";

export interface EveningAct {
  kind: ActKind;
  /** Stable id for swap-by-exclusion and pinning: "place:12", "dining:1001", "film:movie:550". */
  id: string;
  /** "First, a walk" — the act's editorial job, not its category. */
  label: string;
  /** "6:30 pm" — a suggestion, never a booking. */
  at: string;
  /** The same moment as an ISO string, for calendar handoffs. */
  atISO: string;
  title: string;
  sub: string;
  /** Truthful one-line "why this, for this occasion". */
  reason: string;
  href: string;
  /** True when the pick came from something the member had already saved. */
  fromSaves: boolean;
  /** Walking minutes from the previous act, when both have coordinates. */
  walkMin: number | null;
}

export interface EveningPlan {
  occasion: Occasion;
  city: string;
  /** "Friday evening in New York" / "Tomorrow evening in New York". */
  context: string;
  /** One line of editorial framing for the whole arc. */
  note: string;
  acts: EveningAct[];
}

export interface EveningInput {
  occasion: OccasionId;
  now: Date;
  /** Force a city; otherwise inferred from saves, then coverage. */
  city?: string;
  weather?: WeatherNow | null;
  places: PlaceItem[];
  savedPlaceIds?: number[];
  visitedPlaceIds?: number[];
  dining: DiningItem[];
  diningHistory?: HistoryEntry[];
  /** Fallback film pool for the "end at home" finale. */
  films?: MediaItem[];
  watchlist?: WatchlistFilm[];
  tasteGenres?: string[];
  /** Act ids to skip — "another, please", one slot at a time. */
  exclude?: Set<string>;
  /** Act ids to hold fixed while a neighbouring slot is swapped. */
  pin?: Set<string>;
}

// ── City ─────────────────────────────────────────────────────────────────────

/** Curated dining predates the multi-city catalogs; a missing city means NYC. */
export function diningCity(d: DiningItem): string {
  return d.city || "New York";
}

export function placeCity(p: PlaceItem): string {
  return p.city || "New York";
}

/** An evening needs both halves of the city to exist, or it isn't an evening. */
const MIN_TABLES = 12;
const MIN_PLACES = 10;

/**
 * Cities with enough of both catalogs to compose a real evening. Today that's
 * effectively New York; it widens on its own as the grow jobs fill LA and
 * Chicago, with no code change here.
 */
export function eveningCities(places: PlaceItem[], dining: DiningItem[]): string[] {
  const pc = new Map<string, number>();
  for (const p of places) pc.set(placeCity(p), (pc.get(placeCity(p)) ?? 0) + 1);
  const dc = new Map<string, number>();
  for (const d of dining) dc.set(diningCity(d), (dc.get(diningCity(d)) ?? 0) + 1);

  const out: string[] = [];
  for (const [city, n] of pc) {
    if (n >= MIN_PLACES && (dc.get(city) ?? 0) >= MIN_TABLES) out.push(city);
  }
  // Deterministic: most tables first, then alphabetical.
  return out.sort((a, b) => (dc.get(b)! - dc.get(a)!) || a.localeCompare(b));
}

/** Their city if we can tell, else the best-covered one. */
export function pickCity(input: EveningInput): string | null {
  const ready = eveningCities(input.places, input.dining);
  if (!ready.length) return null;
  if (input.city && ready.includes(input.city)) return input.city;

  // Where their saves live — a genuine signal of where they actually are.
  const saved = new Set(input.savedPlaceIds ?? []);
  if (saved.size) {
    const tally = new Map<string, number>();
    for (const p of input.places) {
      if (!saved.has(p.id)) continue;
      const c = placeCity(p);
      if (ready.includes(c)) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    for (const c of ready) {
      const n = tally.get(c) ?? 0;
      if (n > bestN) { best = c; bestN = n; }
    }
    if (best) return best;
  }
  return ready[0];
}

// ── Scoring profiles ─────────────────────────────────────────────────────────

interface OpenerRule {
  label: string;
  /** Place mood tags worth points, most telling first. */
  moods: string[];
  /** How the top mood reads in a reason line. */
  moodPhrase: string;
  /** Badge names worth points. */
  badges: string[];
  /** Relative weights over place score keys; see scoreFit. */
  scores: Partial<Record<keyof PlaceItem["scores"], number>>;
  /** Overall pull of those scores, 0..this many points. */
  qualityWeight: number;
  /** How much a crowd hurts (0 = crowds are the point). */
  crowdPenalty: number;
  /** Minutes the opener should not overrun. */
  maxDur: number;
}

interface TableRule {
  label: string;
  /** Dining occasion tags, most telling first. */
  occasions: string[];
  /** Above this, the table is a fantasy rather than a plan. */
  maxRope: number;
  /** Positive prefers an attainable table; negative rewards the trophy. */
  ropeBias: number;
  recognitionWeight: number;
  /** Relative weights over dining score keys; see scoreFit. */
  scores: Partial<Record<keyof NonNullable<DiningItem["scores"]>, number>>;
  /** Overall pull of those scores, 0..this many points. */
  qualityWeight: number;
  /** Penalty per step of noise above "Moderate". */
  noisePenalty: number;
  /** Positive rewards spending; 0 is price-blind. */
  priceBias: number;
}

type FinaleSource = "nightcap" | "nightview" | "film";

interface FinaleRule {
  label: string;
  /** Tried in order; the first that yields a candidate wins. */
  sources: FinaleSource[];
}

interface Profile {
  opener: OpenerRule;
  table: TableRule;
  finale: FinaleRule;
  /** Editorial framing for the whole arc. */
  note: string;
  /** Used when rain rewrites the plan. */
  wetNote: string;
}

const PROFILES: Record<OccasionId, Profile> = {
  "date-night": {
    opener: {
      label: "First, somewhere lovely",
      moods: ["romantic", "beautiful", "calm"],
      moodPhrase: "quietly romantic, the way the evening wants",
      badges: ["Best for Couples", "Best at Sunset"],
      scores: { memory: 1.4, b: 1.2, night: 0.6 },
      qualityWeight: 12,
      crowdPenalty: 3,
      maxDur: 90,
    },
    table: {
      label: "Then the table",
      occasions: ["Date night", "Drinks & bites", "Casual"],
      maxRope: 3,
      ropeBias: 3,
      recognitionWeight: 8,
      scores: { romantic: 5, ambiance: 3.5, privacy: 2.5, food: 2 },
      qualityWeight: 34,
      noisePenalty: 6,
      priceBias: 0,
    },
    finale: { label: "And to end", sources: ["nightcap", "film"] },
    note: "Close enough to walk between, quiet enough to talk.",
    wetNote: "Rain tonight — this arc stays under cover and close together.",
  },
  "out-of-towners": {
    opener: {
      label: "Start with the view",
      moods: ["iconic", "photo", "beautiful"],
      moodPhrase: "the postcard shot, and worth it",
      badges: ["First-Timer", "Only in New York", "Must-See", "Iconic"],
      scores: { mustVisit: 1.6, significance: 1.2, photoWorth: 0.8, view: 0.8 },
      qualityWeight: 20,
      crowdPenalty: 0,
      maxDur: 120,
    },
    table: {
      label: "Dinner they'll talk about",
      occasions: ["Big night out", "See & be seen", "Group dinner", "Date night"],
      maxRope: 3,
      ropeBias: 1,
      recognitionWeight: 22,
      scores: { food: 3, clientele: 2.5, ambiance: 2, consistency: 1.5 },
      qualityWeight: 26,
      noisePenalty: 0,
      priceBias: 1.5,
    },
    finale: { label: "One last look", sources: ["nightview", "nightcap"] },
    note: "The version of the city you'd want a stranger to see first.",
    wetNote: "Rain — so the icons that work indoors, and a warm room after.",
  },
  celebration: {
    opener: {
      label: "A drink before",
      moods: ["classy", "premium", "beautiful"],
      moodPhrase: "dressed-up without trying too hard",
      badges: ["Quiet Luxury", "Best at Sunset", "Editor's Pick"],
      scores: { memory: 1.3, view: 1.1, b: 0.8 },
      qualityWeight: 14,
      crowdPenalty: 2,
      maxDur: 60,
    },
    table: {
      label: "The table that matters",
      occasions: ["Celebration", "Big night out", "Date night"],
      maxRope: 5,
      ropeBias: -2,
      recognitionWeight: 40,
      scores: { food: 4, service: 4, ambiance: 3, beverage: 1.5 },
      qualityWeight: 26,
      noisePenalty: 2,
      priceBias: 4,
    },
    finale: { label: "A nightcap", sources: ["nightcap", "nightview"] },
    note: "Tonight is not the night to be sensible about the reservation.",
    wetNote: "Rain — which never once ruined a good dining room.",
  },
};

// ── Small helpers ────────────────────────────────────────────────────────────

const CROWD_RANK: Record<string, number> = {
  Low: 0, "Low–Moderate": 0.5, Moderate: 1, "Moderate–High": 1.5, High: 2, "High in summer": 1.5,
};

function crowdRank(crowd?: string | null): number {
  return CROWD_RANK[crowd ?? ""] ?? 1;
}

/**
 * A 0..1 fit over a weighted set of 1–5 catalog scores.
 *
 * Editorial scores are only on part of each catalog — roughly two thirds of
 * the tables carry them. Summing raw values would quietly punish everything
 * that hasn't been scored yet, which is how a three-star temple loses to a
 * well-documented neighbourhood spot. So: average over the requested keys and
 * treat a missing one as unremarkable-but-fine rather than as a zero.
 */
const NEUTRAL_SCORE = 3;

function scoreFit(
  scores: Record<string, number | undefined> | undefined,
  weights: Record<string, number | undefined>,
): number {
  let num = 0;
  let den = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (!w) continue;
    const v = scores?.[k];
    num += (typeof v === "number" ? v : NEUTRAL_SCORE) * w;
    den += w;
  }
  if (!den) return NEUTRAL_SCORE / 5;
  return num / den / 5;
}

const NOISE_RANK: Record<string, number> = { Quiet: 0, Moderate: 0, Lively: 1, Loud: 2 };

function noiseRank(noise?: string | null): number {
  return NOISE_RANK[noise ?? ""] ?? 0;
}

/** A bar rather than a restaurant — the nightcap pool. */
export function isNightcap(d: DiningItem): boolean {
  const f = (d.format || "").toLowerCase();
  const c = (d.cuisine || "").toLowerCase();
  if (/bar|lounge|den|speakeasy|taverna|supper club/.test(f)) return true;
  return c === "wine bar" || c === "cocktail bar";
}

function coordsOf(x: { lat?: number; lng?: number }): { lat: number; lng: number } | null {
  return typeof x.lat === "number" && typeof x.lng === "number" ? { lat: x.lat, lng: x.lng } : null;
}

/** Whole walking minutes between two acts, or null when either lacks coords. */
function walkBetween(
  a: { lat?: number; lng?: number } | null,
  b: { lat?: number; lng?: number } | null,
): number | null {
  const ca = a && coordsOf(a);
  const cb = b && coordsOf(b);
  if (!ca || !cb) return null;
  return Math.max(1, Math.round(walkMinutes(haversineMeters(ca, cb))));
}

/**
 * Proximity points, so the arc holds together on foot. Full marks inside a
 * ten-minute walk, fading to nothing at forty.
 */
function proximityBonus(
  anchor: { lat?: number; lng?: number } | null,
  cand: { lat?: number; lng?: number },
  weight: number,
): number {
  const w = walkBetween(anchor, cand);
  if (w == null) return 0;
  if (w <= 10) return weight;
  if (w >= 40) return 0;
  return weight * ((40 - w) / 30);
}

function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

/** Round up to the next half hour, so a plan never says "6:47". */
function roundUpHalf(d: Date): Date {
  const out = new Date(d);
  out.setSeconds(0, 0);
  const m = out.getMinutes();
  out.setMinutes(m === 0 || m === 30 ? m : m < 30 ? 30 : 60);
  return out;
}

/**
 * When the arc starts. An evening planned at nine tonight is an evening for
 * tomorrow — saying so is more useful than pretending.
 */
export function arcStart(now: Date, startHour: number): { start: Date; tomorrow: boolean } {
  const today = new Date(now);
  today.setHours(startHour, 0, 0, 0);
  if (now.getTime() <= today.getTime()) return { start: today, tomorrow: false };

  // Still time to salvage tonight? Only if the whole arc fits before midnight.
  const salvage = roundUpHalf(addMinutes(now, 30));
  if (salvage.getHours() < 20 && salvage.getDate() === now.getDate()) {
    return { start: salvage, tomorrow: false };
  }
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  t.setHours(startHour, 0, 0, 0);
  return { start: t, tomorrow: true };
}

// ── Act I — the opener ───────────────────────────────────────────────────────

function pickOpener(
  input: EveningInput,
  profile: Profile,
  city: string,
  anchor: { lat?: number; lng?: number } | null,
): { place: PlaceItem; reason: string; fromSaves: boolean } | null {
  const rule = profile.opener;
  const exclude = input.exclude ?? new Set<string>();
  const saved = new Set(input.savedPlaceIds ?? []);
  const visited = new Set(input.visitedPlaceIds ?? []);
  const wet = isWet(input.weather);

  let pool = input.places.filter(
    (p) => placeCity(p) === city && !exclude.has(`place:${p.id}`),
  );
  // Intent is a tier, not a bonus: if they've saved somewhere in this city,
  // the evening opens from their own list and the occasion picks which one.
  // "Another, please" excludes it and drops back to the full catalog.
  const fromList = pool.filter((p) => saved.has(p.id));
  if (fromList.length) pool = fromList;
  // Prefer somewhere new, but never return nothing on that account.
  const unvisited = pool.filter((p) => !visited.has(p.id));
  if (unvisited.length >= 3) pool = unvisited;
  if (!pool.length) return null;

  let best: PlaceItem | null = null;
  let bestScore = -Infinity;
  let bestWhy: string[] = [];

  for (const p of pool) {
    const why: string[] = [];
    let s = 0;

    const moods = p.moods ?? [];
    for (let i = 0; i < rule.moods.length; i++) {
      if (moods.includes(rule.moods[i])) {
        s += (rule.moods.length - i) * 5;
        if (i === 0) why.push(rule.moodPhrase);
      }
    }

    const badges = p.badges ?? [];
    for (const b of rule.badges) {
      if (badges.includes(b)) {
        s += 9;
        why.push(badgePhrase(b));
        break;
      }
    }

    s += scoreFit(p.scores as Record<string, number | undefined>, rule.scores) * rule.qualityWeight;

    s -= crowdRank(p.crowd) * rule.crowdPenalty;

    if (wet) {
      s += p.rain ? 20 : -22;
      if (p.rain) why.push("holds up in the rain");
    }

    if (typeof p.dur === "number" && p.dur > rule.maxDur) {
      s -= ((p.dur - rule.maxDur) / 30) * 4;
    }

    if (saved.has(p.id)) why.unshift("already on your list");
    if (visited.has(p.id)) s -= 12;

    s += proximityBonus(anchor, p, 22);

    if (s > bestScore || (s === bestScore && best !== null && p.id < best.id)) {
      best = p;
      bestScore = s;
      bestWhy = why;
    }
  }
  if (!best) return null;

  const reason = joinWhy(bestWhy, best.vibe || "a clean, uncomplicated place to begin");
  return { place: best, reason, fromSaves: saved.has(best.id) };
}

// ── Act II — the table ───────────────────────────────────────────────────────

function pickTable(
  input: EveningInput,
  profile: Profile,
  city: string,
  anchor: { lat?: number; lng?: number } | null,
): { item: DiningItem; reason: string; fromSaves: boolean } | null {
  const rule = profile.table;
  const exclude = input.exclude ?? new Set<string>();
  const history = input.diningHistory ?? [];
  const byId = new Map(input.dining.map((d) => [d.id, d]));
  const taste = buildTasteProfile(history, byId, input.now);
  const wanted = new Set(
    history.filter((h) => h.status === "want" || h.status === "booked").map((h) => h.diningId),
  );

  let pool = input.dining.filter(
    (d) =>
      diningCity(d) === city &&
      !exclude.has(`dining:${d.id}`) &&
      (d.rope ?? 5) <= rule.maxRope &&
      !isNightcap(d),
  );
  // Same tiering as the opener: a table they've already said they want beats
  // anything the catalog thinks is better, as long as it suits the occasion —
  // the rope and nightcap filters above still apply.
  const fromList = pool.filter((d) => wanted.has(d.id));
  if (fromList.length) pool = fromList;
  const fresh = pool.filter((d) => !taste.visitedIds.has(d.id));
  if (fresh.length >= 3) pool = fresh;
  if (!pool.length) return null;

  let best: DiningItem | null = null;
  let bestScore = -Infinity;
  let bestWhy: string[] = [];

  for (const d of pool) {
    const why: string[] = [];
    let s = 0;

    const occ = d.occasion ?? [];
    for (let i = 0; i < rule.occasions.length; i++) {
      if (occ.includes(rule.occasions[i])) {
        s += (rule.occasions.length - i) * 9;
        if (i === 0) why.push(occasionPhrase(rule.occasions[0]));
        break;
      }
    }

    const rec = recognitionScore(d.recognition);
    s += rec * rule.recognitionWeight;
    if (rec >= 0.68 && d.recognition) why.push(d.recognition);

    s += scoreFit(d.scores as Record<string, number | undefined>, rule.scores) * rule.qualityWeight;

    const rope = d.rope ?? 5;
    s += (3 - rope) * rule.ropeBias;
    if (rule.ropeBias > 0 && rope <= 1) why.push("walk-in friendly");
    if (rule.ropeBias < 0 && rope >= 4) why.push("worth the call you'll have to make");

    s -= noiseRank(d.noise) * rule.noisePenalty;
    // Only claim quiet where quiet is the point — a celebration doesn't care.
    if (rule.noisePenalty >= 4 && d.noise && noiseRank(d.noise) === 0) {
      why.push("you'll be able to hear each other");
    }

    if (typeof d.price === "number") s += d.price * rule.priceBias;

    // Their own taste, when there's enough of it to mean something.
    const aff = taste.cuisine.get(d.cuisine) ?? 0;
    if (taste.sampleSize >= 3 && taste.topCuisines.has(d.cuisine)) {
      s += 20 * aff + 6;
      why.push(`${d.cuisine.toLowerCase()} has been your lane lately`);
    } else {
      s += 12 * aff;
    }

    if (wanted.has(d.id)) why.unshift("you've been meaning to go");
    if (taste.visitedIds.has(d.id)) s -= 15;

    s += proximityBonus(anchor, d, 26);

    if (s > bestScore || (s === bestScore && best !== null && d.id < best.id)) {
      best = d;
      bestScore = s;
      bestWhy = why;
    }
  }
  if (!best) return null;

  const walk = walkBetween(anchor, best);
  if (walk != null && walk <= 15) bestWhy.push(`a ${walk}-minute walk from the first stop`);

  const reason = joinWhy(bestWhy, best.blurb || "a table that does not need explaining");
  return { item: best, reason, fromSaves: wanted.has(best.id) };
}

// ── Act III — the finale ─────────────────────────────────────────────────────

function pickNightcap(
  input: EveningInput,
  city: string,
  anchor: { lat?: number; lng?: number } | null,
): { item: DiningItem; reason: string } | null {
  const exclude = input.exclude ?? new Set<string>();
  const pool = input.dining.filter(
    (d) => diningCity(d) === city && isNightcap(d) && !exclude.has(`dining:${d.id}`),
  );
  if (!pool.length) return null;

  let best: DiningItem | null = null;
  let bestScore = -Infinity;
  let bestWhy: string[] = [];

  for (const d of pool) {
    const why: string[] = [];
    let s = 0;
    const occ = d.occasion ?? [];
    if (occ.includes("Late night")) { s += 14; why.push(occasionPhrase("Late night")); }
    if (occ.includes("Drinks & bites")) s += 8;
    const sc = d.scores ?? {};
    s += (sc.beverage ?? 0) * 4 + (sc.ambiance ?? 0) * 2.5;
    const rec = recognitionScore(d.recognition);
    s += rec * 8;
    s += Math.max(0, 3 - (d.rope ?? 5)) * 3;
    s += proximityBonus(anchor, d, 30);

    if (s > bestScore || (s === bestScore && best !== null && d.id < best.id)) {
      best = d; bestScore = s; bestWhy = why;
    }
  }
  if (!best) return null;

  const walk = walkBetween(anchor, best);
  if (walk != null && walk <= 15) bestWhy.push(`${walk} minutes from the table`);
  const reason = joinWhy(bestWhy, best.blurb || "one more, and then home");
  return { item: best, reason };
}

function pickNightView(
  input: EveningInput,
  city: string,
  anchor: { lat?: number; lng?: number } | null,
  usedPlaceId: number | null,
): { place: PlaceItem; reason: string } | null {
  const exclude = input.exclude ?? new Set<string>();
  const pool = input.places.filter(
    (p) =>
      placeCity(p) === city &&
      p.id !== usedPlaceId &&
      !exclude.has(`place:${p.id}`) &&
      ((p.scores?.night ?? 0) > 0 || (p.badges ?? []).includes("Best at Night")),
  );
  if (!pool.length) return null;

  let best: PlaceItem | null = null;
  let bestScore = -Infinity;
  for (const p of pool) {
    let s = (p.scores?.night ?? 0) * 3 + (p.scores?.view ?? 0) * 2 + (p.scores?.memory ?? 0);
    if ((p.badges ?? []).includes("Best at Night")) s += 10;
    if (isWet(input.weather)) s += p.rain ? 12 : -18;
    s += proximityBonus(anchor, p, 20);
    if (s > bestScore || (s === bestScore && best !== null && p.id < best.id)) { best = p; bestScore = s; }
  }
  if (!best) return null;

  const walk = walkBetween(anchor, best);
  const bits: string[] = [];
  if ((best.scores?.night ?? 0) >= 7) bits.push("at its best after dark");
  else bits.push("the city, lit");
  if (walk != null && walk <= 20) bits.push(`${walk} minutes from dinner`);
  return { place: best, reason: sentence(bits.join(", and ")) };
}

function pickFilmHome(
  input: EveningInput,
): { act: Omit<EveningAct, "label" | "at" | "atISO" | "walkMin"> } | null {
  const exclude = input.exclude ?? new Set<string>();
  const key = (t: string, id: string | number) => `film:${t}:${id}`;

  const wl = (input.watchlist ?? []).filter((f) => !exclude.has(key(f.media_type, f.tmdb_id)));
  if (wl.length) {
    const f = wl.find((x) => x.status === "want") ?? wl[0];
    return {
      act: {
        kind: "finale",
        id: key(f.media_type, f.tmdb_id),
        title: f.title,
        sub: [f.media_type === "tv" ? "Series" : "Film", f.year ?? undefined].filter(Boolean).join(" · "),
        reason:
          f.status === "watching"
            ? "You're mid-story — finish it somewhere comfortable."
            : "It's been waiting on your list, and the night has room for it.",
        href: `/films/${f.media_type}/${f.tmdb_id}`,
        fromSaves: true,
      },
    };
  }

  const films = (input.films ?? []).filter((f) => !exclude.has(key(f.media_type, f.tmdb_id)));
  if (!films.length) return null;
  const taste = new Set(input.tasteGenres ?? []);
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
    act: {
      kind: "finale",
      id: key(best.media_type, best.tmdb_id),
      title: best.title,
      sub: [best.media_type === "tv" ? "Series" : "Film", best.year ?? undefined].filter(Boolean).join(" · "),
      reason: matched
        ? `Everyone's watching it, and it's ${matched} — your lane.`
        : "What everyone's watching, for the last hour of the night.",
      href: `/films/${best.media_type}/${best.tmdb_id}`,
      fromSaves: false,
    },
  };
}

// ── Copy helpers ─────────────────────────────────────────────────────────────

function sentence(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const head = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(head) ? head : `${head}.`;
}

/**
 * Catalog tags are labels, not language. These read them out loud the way a
 * person would, so a reason line never sounds like a database field.
 */
const BADGE_PHRASE: Record<string, string> = {
  "Best for Couples": "a couples' place, and it knows it",
  "Best at Sunset": "best an hour before sunset",
  "First-Timer": "the one to see first",
  "Only in New York": "only here, nowhere else",
  "Must-See": "unmissable",
  Iconic: "an icon",
  "Quiet Luxury": "expensive-feeling without the noise",
  "Editor's Pick": "an editor's pick",
  "Best at Night": "at its best after dark",
};

const OCCASION_PHRASE: Record<string, string> = {
  "Date night": "built for a date night",
  "Big night out": "built for a big night out",
  Celebration: "built for celebrating",
  "Drinks & bites": "right for drinks and a few plates",
  Casual: "easy and unfussy",
  "See & be seen": "a room people come to be seen in",
  "Group dinner": "made for a table of friends",
  "Late night": "still going late",
};

function badgePhrase(b: string): string {
  return BADGE_PHRASE[b] ?? b.toLowerCase();
}

function occasionPhrase(o: string): string {
  return OCCASION_PHRASE[o] ?? `right for ${o.toLowerCase()}`;
}

/**
 * Two clauses, joined so the result reads as one sentence. Clauses that
 * already carry their own punctuation get a dash rather than a second "and".
 */
function joinWhy(why: string[], fallback: string): string {
  const parts = why.slice(0, 2);
  if (!parts.length) return sentence(fallback);
  if (parts.length === 1) return sentence(parts[0]);
  const joiner = /[,—;]/.test(parts[0]) ? " — " : ", and ";
  return sentence(parts.join(joiner));
}

// ── Pins ─────────────────────────────────────────────────────────────────────

function pinnedPlace(input: EveningInput, city: string): PlaceItem | null {
  const pin = input.pin;
  if (!pin) return null;
  for (const p of input.places) {
    if (placeCity(p) === city && pin.has(`place:${p.id}`)) return p;
  }
  return null;
}

function pinnedDining(input: EveningInput, city: string, nightcap: boolean): DiningItem | null {
  const pin = input.pin;
  if (!pin) return null;
  for (const d of input.dining) {
    if (diningCity(d) === city && pin.has(`dining:${d.id}`) && isNightcap(d) === nightcap) return d;
  }
  return null;
}

// ── Compose ──────────────────────────────────────────────────────────────────

/** Roughly how long each act runs, for the suggested times. */
const TABLE_AFTER_OPENER_MIN = 30;
const FINALE_AFTER_TABLE_MIN = 105;

export function composeEvening(input: EveningInput): EveningPlan | null {
  const occasion = occasionById(input.occasion);
  const profile = PROFILES[occasion.id];
  const city = pickCity(input);
  if (!city) return null;

  // ── Act II may be pinned, in which case Act I is chosen to suit it.
  const pinTable = pinnedDining(input, city, false);
  const pinOpen = pinnedPlace(input, city);

  let opener = pinOpen
    ? { place: pinOpen, reason: sentence(pinOpen.vibe || "your pick"), fromSaves: (input.savedPlaceIds ?? []).includes(pinOpen.id) }
    : pickOpener(input, profile, city, pinTable);

  const table = pinTable
    ? {
        item: pinTable,
        reason: sentence(pinTable.blurb || "your pick"),
        fromSaves: (input.diningHistory ?? []).some((h) => h.diningId === pinTable.id && h.status !== "visited"),
      }
    : pickTable(input, profile, city, opener?.place ?? null);

  // With no table there is no evening — but an opener alone can still stand.
  if (!opener && !table) return null;

  // If the opener was picked blind and the table landed far away, re-anchor it.
  if (opener && table && !pinOpen) {
    const w = walkBetween(opener.place, table.item);
    if (w != null && w > 25) {
      const better = pickOpener(input, profile, city, table.item);
      if (better) {
        const w2 = walkBetween(better.place, table.item);
        if (w2 != null && w2 < w) opener = better;
      }
    }
  }

  const anchorForFinale = table?.item ?? opener?.place ?? null;
  const acts: EveningAct[] = [];
  const { start, tomorrow } = arcStart(input.now, occasion.startHour);

  let cursor = start;
  if (opener) {
    acts.push({
      kind: "opener",
      id: `place:${opener.place.id}`,
      label: profile.opener.label,
      at: fmtTime(cursor),
      atISO: cursor.toISOString(),
      title: opener.place.name,
      sub: [opener.place.area, city].filter(Boolean).join(" · "),
      reason: opener.reason,
      href: `/places/${opener.place.id}`,
      fromSaves: opener.fromSaves,
      walkMin: null,
    });
    const dur = Math.min(opener.place.dur ?? 60, profile.opener.maxDur);
    cursor = roundUpHalf(addMinutes(cursor, dur + TABLE_AFTER_OPENER_MIN));
  }

  if (table) {
    acts.push({
      kind: "table",
      id: `dining:${table.item.id}`,
      label: profile.table.label,
      at: fmtTime(cursor),
      atISO: cursor.toISOString(),
      title: table.item.name,
      sub: [table.item.cuisine, table.item.neighborhood].filter(Boolean).join(" · "),
      reason: table.reason,
      href: `/dining/${table.item.id}`,
      fromSaves: table.fromSaves,
      walkMin: opener ? walkBetween(opener.place, table.item) : null,
    });
    cursor = roundUpHalf(addMinutes(cursor, FINALE_AFTER_TABLE_MIN));
  }

  // ── Act III — first source that yields something.
  const pinCap = pinnedDining(input, city, true);
  let finale: EveningAct | null = null;

  if (pinCap) {
    finale = {
      kind: "finale",
      id: `dining:${pinCap.id}`,
      label: profile.finale.label,
      at: fmtTime(cursor),
      atISO: cursor.toISOString(),
      title: pinCap.name,
      sub: [pinCap.cuisine, pinCap.neighborhood].filter(Boolean).join(" · "),
      reason: sentence(pinCap.blurb || "your pick"),
      href: `/dining/${pinCap.id}`,
      fromSaves: false,
      walkMin: walkBetween(anchorForFinale, pinCap),
    };
  } else {
    for (const src of profile.finale.sources) {
      if (src === "nightcap") {
        const n = pickNightcap(input, city, anchorForFinale);
        if (n) {
          finale = {
            kind: "finale",
            id: `dining:${n.item.id}`,
            label: profile.finale.label,
            at: fmtTime(cursor),
      atISO: cursor.toISOString(),
            title: n.item.name,
            sub: [n.item.cuisine, n.item.neighborhood].filter(Boolean).join(" · "),
            reason: n.reason,
            href: `/dining/${n.item.id}`,
            fromSaves: false,
            walkMin: walkBetween(anchorForFinale, n.item),
          };
          break;
        }
      } else if (src === "nightview") {
        const v = pickNightView(input, city, anchorForFinale, opener?.place.id ?? null);
        if (v) {
          finale = {
            kind: "finale",
            id: `place:${v.place.id}`,
            label: profile.finale.label,
            at: fmtTime(cursor),
      atISO: cursor.toISOString(),
            title: v.place.name,
            sub: [v.place.area, city].filter(Boolean).join(" · "),
            reason: v.reason,
            href: `/places/${v.place.id}`,
            fromSaves: false,
            walkMin: walkBetween(anchorForFinale, v.place),
          };
          break;
        }
      } else {
        const f = pickFilmHome(input);
        if (f) {
          finale = { ...f.act, label: "End at home", at: fmtTime(cursor),
      atISO: cursor.toISOString(), walkMin: null };
          break;
        }
      }
    }
  }
  if (finale) acts.push(finale);

  const weekday = start.toLocaleDateString("en-US", { weekday: "long" });
  const context = tomorrow
    ? `Tomorrow · ${weekday} evening in ${city}`
    : `${weekday} evening in ${city}`;

  return {
    occasion,
    city,
    context,
    note: isWet(input.weather) ? profile.wetNote : profile.note,
    acts,
  };
}
