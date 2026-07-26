// ─────────────────────────────────────────────────────────────────────────────
//  pairing.ts — the cross-vertical "where to eat nearby" engine.
//
//  Given a Place the user just showed interest in (pressed "Want to go" /
//  "Been there"), rank nearby curated dining so the result feels *paired*, not
//  merely *near*. Pure and deterministic: no I/O, no randomness, no Date.now()
//  except the caller-supplied `now`. Everything is unit-testable.
//
//  Signals per candidate (each normalized to [0,1]):
//    • proximity  — walking-time from a detour-corrected haversine distance
//    • taste      — cuisine affinity + price fit + occasion overlap from history
//    • context    — does it match THIS place's mood + the time of day
//    • quality    — recognition tier + reservation attainability for the context
//
//  Cold start (no history) drops the taste term and shifts its weight to
//  context — exactly what a good concierge uses before they know you. Warm and
//  cold weights are blended by history size (a sigmoid), so two saves don't
//  over-fit to one cuisine. A final MMR pass diversifies cuisines and reserves
//  one "novelty" slot so recommendations never collapse into a filter bubble.
// ─────────────────────────────────────────────────────────────────────────────

import type { DiningItem, PlaceItem } from "@/types";

// ── Public types ─────────────────────────────────────────────────────────────

export type SaveStatus = "want" | "booked" | "visited";

export interface HistoryEntry {
  diningId: number;
  status: SaveStatus;
  updatedAt?: string | null;
}

export interface ScoreBreakdown {
  proximity: number;
  taste: number;
  context: number;
  quality: number;
  novelty: number;
}

export interface Recommendation {
  item: DiningItem;
  score: number;
  /** Straight-line-corrected walking minutes, or null when coords are unknown. */
  walkMin: number | null;
  /** True when the user has already been to this restaurant. */
  isFavorite: boolean;
  /** Human, truthful, single-reason line for the card. */
  reason: string;
  breakdown: ScoreBreakdown;
}

export interface RecommendOptions {
  now?: Date;
  /** How many cards to return. */
  limit?: number;
  /** Preferred walking radius in metres; expands only if too few candidates. */
  preferredRadiusM?: number;
  /** Absolute maximum radius in metres. */
  maxRadiusM?: number;
  /** MMR trade-off: 1 = pure relevance, 0 = pure diversity. */
  diversityLambda?: number;
}

// ── Geometry ─────────────────────────────────────────────────────────────────

const EARTH_M = 6_371_000;
const DETOUR = 1.3; // straight-line → real street-walking correction
const WALK_M_PER_MIN = 80;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function walkMinutes(distanceM: number): number {
  return (distanceM * DETOUR) / WALK_M_PER_MIN;
}

// ── Recognition → quality tier ───────────────────────────────────────────────
// Dining has no numeric popularity; recognition is a curated string. Parse it
// into a 0..1 quality signal. Order matters (check strongest tokens first).

export function recognitionScore(recognition?: string | null): number {
  if (!recognition) return 0.35; // unrecognized ≠ bad; neutral-low floor
  const r = recognition.toLowerCase();
  const stars = (recognition.match(/★/g) || []).length;
  let s = 0;
  if (stars >= 3) s = 1.0;
  else if (stars === 2) s = 0.9;
  else if (stars === 1) s = 0.78;
  if (r.includes("world's 50 best") || r.includes("worlds 50 best")) s = Math.max(s, 0.95);
  if (r.includes("james beard")) s = Math.max(s, 0.82);
  if (r.includes("bib gourmand")) s = Math.max(s, 0.7);
  if (r.includes("michelin") && s === 0) s = Math.max(s, 0.72); // "Michelin" w/o stars = selected
  if (r.includes("institution") || r.includes("classic") || r.includes("iconic")) s = Math.max(s, 0.68);
  return s || 0.55; // recognized but unparsed → solid-mid
}

// ── Place price → coarse tier (used weakly, and never as the dining budget) ──

export function placePriceTier(price?: string | null): number | null {
  if (!price) return null;
  const p = price.toLowerCase();
  if (p.startsWith("free")) return 0;
  const dollars = (price.match(/\$/g) || []).length;
  if (dollars > 0) return Math.min(4, dollars);
  return null;
}

// ── Daypart from the caller's clock (primary) + place best-time (secondary) ──

export type Daypart = "morning" | "lunch" | "afternoon" | "dinner" | "late";

export function daypartFromHour(hour: number): Daypart {
  if (hour < 11) return "morning";
  if (hour < 15) return "lunch";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "dinner";
  return "late";
}

const DAYPART_OCCASIONS: Record<Daypart, Record<string, number>> = {
  morning: { Brunch: 1.0, "Quick bite": 0.6, Casual: 0.5, Solo: 0.3 },
  lunch: { "Power lunch": 0.9, "Quick bite": 0.7, Casual: 0.7, Business: 0.5 },
  afternoon: { "Drinks & bites": 0.8, Casual: 0.6, "Quick bite": 0.6 },
  dinner: { "Date night": 0.8, "Big night out": 0.7, "Group dinner": 0.7, Celebration: 0.5 },
  late: { "Late night": 1.0, "Drinks & bites": 0.8, "See & be seen": 0.5 },
};

// ── Place mood / style → dining occasion lexicon (grounded in real vocab) ────
// Keys are lowercased place moods AND styles; values are occasion→weight maps.

const MOOD_OCCASIONS: Record<string, Record<string, number>> = {
  romantic: { "Date night": 1.0, Celebration: 0.4 },
  classy: { "Big night out": 0.9, "Date night": 0.6, "See & be seen": 0.5, Business: 0.3 },
  premium: { "Big night out": 1.0, Celebration: 0.5, "See & be seen": 0.5 },
  luxury: { "Big night out": 1.0, Celebration: 0.6, "See & be seen": 0.6 },
  calm: { "Date night": 0.6, Solo: 0.4, Casual: 0.4 },
  iconic: { "See & be seen": 0.8, "Big night out": 0.6, "Group dinner": 0.4 },
  photo: { "See & be seen": 0.7, "Group dinner": 0.4, Casual: 0.3 },
  photography: { "See & be seen": 0.7, "Group dinner": 0.4 },
  culture: { "Date night": 0.6, "Big night out": 0.5, "Group dinner": 0.4 },
  family: { Casual: 1.0, "Group dinner": 0.8, "Quick bite": 0.5 },
  quick: { "Quick bite": 1.0, Casual: 0.7, "Walk-in": 0.5 },
  hidden: { "Hidden gem": 1.0, "Date night": 0.4, Casual: 0.4 },
  "hidden gems": { "Hidden gem": 1.0, Casual: 0.4 },
  "nature & views": { Casual: 0.7, "Quick bite": 0.5, Brunch: 0.4 },
  nightlife: { "Late night": 1.0, "Drinks & bites": 0.8, "See & be seen": 0.6 },
  wellness: { Casual: 0.6, Brunch: 0.5, Solo: 0.4 },
  "food & cafés": { Brunch: 0.7, Casual: 0.6, "Quick bite": 0.6 },
  shopping: { "Quick bite": 0.6, Casual: 0.6, "Drinks & bites": 0.4 },
};

// Family context should never route to nightlife/romance-only spots.
const FAMILY_TOKENS = new Set(["family"]);
const NIGHTLIFE_ONLY = new Set(["Late night", "See & be seen"]);

interface ContextTarget {
  occasions: Map<string, number>;
  priceBias: number; // additive nudge to the target dining price tier
  daypart: Daypart;
  isFamily: boolean;
}

export function buildContextTarget(place: PlaceItem, now: Date): ContextTarget {
  const occ = new Map<string, number>();
  const add = (m: Record<string, number>, scale = 1) => {
    for (const [k, v] of Object.entries(m)) occ.set(k, (occ.get(k) || 0) + v * scale);
  };

  const tokens = [
    ...(place.moods || []),
    ...(place.styles || []),
    place.vibe || "",
  ].map((t) => String(t).toLowerCase());

  let isFamily = false;
  for (const t of tokens) {
    if (FAMILY_TOKENS.has(t)) isFamily = true;
    const map = MOOD_OCCASIONS[t];
    if (map) add(map);
  }

  // Daypart signal (current clock is the primary "when would I eat" signal).
  const daypart = daypartFromHour(now.getHours());
  add(DAYPART_OCCASIONS[daypart], 0.9);

  // If nothing matched (sparse place), fall back to a sensible neutral target.
  if (occ.size === 0) add({ Casual: 0.6, "Date night": 0.5, "Group dinner": 0.5 });

  if (isFamily) for (const k of NIGHTLIFE_ONLY) occ.delete(k);

  // Price bias: upscale moods nudge the target tier up; casual/quick nudge down.
  let priceBias = 0;
  const has = (t: string) => tokens.includes(t);
  if (has("premium") || has("classy") || has("luxury") || has("romantic")) priceBias += 1;
  if (has("quick") || has("family") || has("nature & views")) priceBias -= 0.7;

  return { occasions: occ, priceBias, daypart, isFamily };
}

// ── Taste profile from history (recency- & intent-weighted, smoothed) ────────

export interface TasteProfile {
  sampleSize: number;
  cuisine: Map<string, number>; // affinity 0..1 (Laplace-smoothed share)
  topCuisines: Set<string>;
  priceMean: number; // 1..4
  occasion: Map<string, number>; // affinity 0..1
  visitedIds: Set<number>;
}

const INTENT_WEIGHT: Record<SaveStatus, number> = { visited: 1.0, booked: 0.7, want: 0.5 };

function recencyWeight(updatedAt: string | null | undefined, now: Date): number {
  if (!updatedAt) return 0.6;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return 0.6;
  const days = (now.getTime() - t) / 86_400_000;
  // Half-life ~120 days, floored so old saves still count.
  return Math.max(0.35, Math.pow(0.5, days / 120));
}

export function buildTasteProfile(
  history: HistoryEntry[],
  diningById: Map<number, DiningItem>,
  now: Date,
): TasteProfile {
  const cuisineW = new Map<string, number>();
  const occW = new Map<string, number>();
  const visitedIds = new Set<number>();
  let priceNum = 0;
  let priceDen = 0;
  let total = 0;

  for (const h of history) {
    const item = diningById.get(h.diningId);
    if (!item) continue;
    if (h.status === "visited") visitedIds.add(h.diningId);
    const w = INTENT_WEIGHT[h.status] * recencyWeight(h.updatedAt, now);
    total += w;
    if (item.cuisine) cuisineW.set(item.cuisine, (cuisineW.get(item.cuisine) || 0) + w);
    for (const o of item.occasion || []) occW.set(o, (occW.get(o) || 0) + w);
    if (typeof item.price === "number" && item.price > 0) {
      priceNum += item.price * w;
      priceDen += w;
    }
  }

  // Laplace smoothing: every cuisine seen gets share = (w+α)/(total+α·K),
  // and unseen cuisines inherit a small floor via `cuisineAffinity()` below.
  const alpha = 0.5;
  const K = Math.max(1, cuisineW.size);
  const cuisine = new Map<string, number>();
  for (const [c, w] of cuisineW) cuisine.set(c, (w + alpha) / (total + alpha * K));

  const occasion = new Map<string, number>();
  const occTotal = [...occW.values()].reduce((a, b) => a + b, 0) || 1;
  for (const [o, w] of occW) occasion.set(o, w / occTotal);

  const topCuisines = new Set(
    [...cuisineW.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c),
  );

  return {
    sampleSize: history.length,
    cuisine,
    topCuisines,
    priceMean: priceDen > 0 ? priceNum / priceDen : 2,
    occasion,
    visitedIds,
  };
}

// Smoothed cuisine affinity with a floor so unseen cuisines aren't zeroed out.
function cuisineAffinity(taste: TasteProfile, cuisine?: string): number {
  if (!cuisine) return 0.15;
  const direct = taste.cuisine.get(cuisine);
  if (direct != null) return direct;
  return 0.15; // never-tried cuisine: modest, non-zero (leaves room to explore)
}

// ── Component scorers ────────────────────────────────────────────────────────

function occasionOverlap(itemOcc: string[] | undefined, target: Map<string, number>): number {
  if (!target.size || !itemOcc?.length) return 0;
  let num = 0;
  let max = 0;
  for (const v of target.values()) max += v;
  for (const o of itemOcc) num += target.get(o) || 0;
  return max > 0 ? Math.min(1, num / max) : 0;
}

function priceFit(candPrice: number | undefined, targetTier: number): number {
  if (!candPrice) return 0.5;
  return Math.max(0, 1 - Math.abs(candPrice - targetTier) / 3);
}

function attainability(rope: number | undefined, wantsSpecial: boolean): number {
  // rope 1 (walk-in) .. 5 (near impossible). For a spontaneous "eat near now"
  // intent we reward attainable; for celebratory contexts, difficulty is fine.
  const r = rope ?? 2;
  if (wantsSpecial) return 1; // don't penalize hard-to-book on a big-night pairing
  return Math.max(0.25, 1 - (r - 1) / 5);
}

// ── Weight blending: cold → warm by history size ─────────────────────────────

interface Weights {
  proximity: number;
  taste: number;
  context: number;
  quality: number;
}
const COLD: Weights = { proximity: 0.34, taste: 0.0, context: 0.46, quality: 0.2 };
const WARM: Weights = { proximity: 0.28, taste: 0.36, context: 0.22, quality: 0.14 };

function warmness(sampleSize: number): number {
  // 0 at no history, 0.5 at 3 saves, → 1 as history grows.
  return sampleSize / (sampleSize + 3);
}

function blendWeights(sampleSize: number): Weights {
  const t = warmness(sampleSize);
  return {
    proximity: COLD.proximity + (WARM.proximity - COLD.proximity) * t,
    taste: COLD.taste + (WARM.taste - COLD.taste) * t,
    context: COLD.context + (WARM.context - COLD.context) * t,
    quality: COLD.quality + (WARM.quality - COLD.quality) * t,
  };
}

// ── Candidate scoring ────────────────────────────────────────────────────────

interface Scored extends Recommendation {
  _distanceM: number | null;
}

function scoreCandidate(
  cand: DiningItem,
  place: PlaceItem,
  taste: TasteProfile,
  ctx: ContextTarget,
  weights: Weights,
): Scored | null {
  // Proximity
  let distanceM: number | null = null;
  let proximity: number;
  let walkMin: number | null = null;
  if (typeof cand.lat === "number" && typeof cand.lng === "number") {
    distanceM = haversineMeters({ lat: place.lat as number, lng: place.lng as number }, { lat: cand.lat, lng: cand.lng });
    walkMin = walkMinutes(distanceM);
    proximity = Math.max(0, 1 - walkMin / 25);
  } else {
    // No coords: fall back to neighborhood/area string match (coarse).
    const area = (place.area || "").toLowerCase();
    const hood = `${cand.neighborhood || ""} ${cand.borough || ""}`.toLowerCase();
    proximity = area && hood.includes(area) ? 0.45 : 0.18;
  }

  const wantsSpecial =
    (ctx.occasions.get("Big night out") || 0) + (ctx.occasions.get("Celebration") || 0) > 0.8;

  // Context (place mood + daypart)
  const targetTier = Math.min(4, Math.max(1, 2 + ctx.priceBias));
  const context =
    0.75 * occasionOverlap(cand.occasion, ctx.occasions) +
    0.25 * priceFit(cand.price, targetTier);

  // Taste (history)
  const taApplies = taste.sampleSize > 0;
  const taste_ =
    0.5 * cuisineAffinity(taste, cand.cuisine) +
    0.25 * priceFit(cand.price, taste.priceMean) +
    0.25 * occasionOverlap(cand.occasion, taste.occasion);

  // Quality
  const quality = 0.7 * recognitionScore(cand.recognition) + 0.3 * attainability(cand.rope, wantsSpecial);

  // Novelty: reward a cuisine outside the user's top set (only meaningful warm).
  const novelty =
    taApplies && cand.cuisine && !taste.topCuisines.has(cand.cuisine) ? 1 : 0;

  let score =
    weights.proximity * proximity +
    weights.taste * (taApplies ? taste_ : 0) +
    weights.context * context +
    weights.quality * quality +
    0.05 * novelty * warmness(taste.sampleSize);

  // Already been there: demote (they want ideas), but keep as a labeled favorite.
  const isFavorite = taste.visitedIds.has(cand.id);
  if (isFavorite) score *= 0.4;

  return {
    item: cand,
    score,
    walkMin: walkMin != null ? Math.max(1, Math.round(walkMin)) : null,
    isFavorite,
    reason: "",
    breakdown: { proximity, taste: taApplies ? taste_ : 0, context, quality, novelty },
    _distanceM: distanceM,
  };
}

// ── MMR diversification (cuisine-aware) ──────────────────────────────────────

function similarity(a: DiningItem, b: DiningItem): number {
  if (a.cuisine && a.cuisine === b.cuisine) return 1;
  const oa = new Set(a.occasion || []);
  const shared = (b.occasion || []).filter((o) => oa.has(o)).length;
  const denom = Math.max(1, Math.max(oa.size, (b.occasion || []).length));
  return 0.4 * (shared / denom);
}

function diversify(pool: Scored[], k: number, lambda: number, maxPerCuisine = 2): Scored[] {
  const selected: Scored[] = [];
  const rest = [...pool];
  const cuisineCount = new Map<string, number>();
  while (selected.length < k && rest.length) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i].item.cuisine || "";
      // Hard cap: never let one cuisine dominate the shelf while alternatives exist.
      if ((cuisineCount.get(c) || 0) >= maxPerCuisine) continue;
      const rel = rest[i].score;
      let maxSim = 0;
      for (const s of selected) maxSim = Math.max(maxSim, similarity(rest[i].item, s.item));
      const mmr = lambda * rel - (1 - lambda) * maxSim;
      if (mmr > bestVal) { bestVal = mmr; bestIdx = i; }
    }
    // If the cap filtered everything out, relax it for the remaining slots.
    if (bestIdx === -1) {
      let best = -Infinity;
      for (let i = 0; i < rest.length; i++) if (rest[i].score > best) { best = rest[i].score; bestIdx = i; }
    }
    const chosen = rest.splice(bestIdx, 1)[0];
    const c = chosen.item.cuisine || "";
    cuisineCount.set(c, (cuisineCount.get(c) || 0) + 1);
    selected.push(chosen);
  }
  return selected;
}

// ── Reason line (truthful: derived from the dominant weighted contribution) ──

function buildReason(rec: Scored, ctx: ContextTarget, taste: TasteProfile): string {
  const walk = rec.walkMin != null ? `${rec.walkMin}-min walk` : "nearby";
  if (rec.isFavorite) return `A favorite of yours · ${walk}`;

  const b = rec.breakdown;
  const w = blendWeights(taste.sampleSize);
  const contrib: [string, number][] = [
    ["proximity", w.proximity * b.proximity],
    ["taste", w.taste * b.taste],
    ["context", w.context * b.context],
    ["quality", w.quality * b.quality],
  ];
  contrib.sort((a, c) => c[1] - a[1]);
  const lead = contrib[0][0];
  const cuisine = rec.item.cuisine || "";
  const known = taste.sampleSize > 0 && taste.topCuisines.has(cuisine);

  const cui = cuisine ? cuisine.toLowerCase() : "";
  const rec_ = rec.item.recognition ? rec.item.recognition.replace(/·.*/, "").trim() : "";
  switch (lead) {
    case "taste":
      return known
        ? `${walk} · ${cui}, a cuisine you keep coming back to`
        : `${walk} · ${cui}${rec_ ? ` (${rec_})` : ""}, in your range`;
    case "context": {
      const occ = [...ctx.occasions.entries()].sort((a, c) => c[1] - a[1])[0]?.[0] || "";
      const phrase = contextPhrase(occ, ctx.daypart);
      // Weave the cuisine in so every card in a shelf reads distinctly.
      return cui ? `${walk} · ${cui} — ${phrase}` : `${walk} · ${phrase}`;
    }
    case "quality":
      return `${walk} · ${cui ? cui + ", " : ""}${rec_ || "a local standout"}`;
    default:
      return cui ? `${walk} · ${cui}, by ${rec.item.neighborhood || "the spot"}`
                 : `${walk} · a short hop away`;
  }
}

function contextPhrase(occasion: string, daypart: Daypart): string {
  const map: Record<string, string> = {
    "Date night": "an intimate table that matches the mood",
    "Big night out": "a buzzy room for the occasion",
    Celebration: "a celebratory table nearby",
    "Group dinner": "an easy spot for a group",
    "Quick bite": "a quick, good bite close by",
    Casual: "a relaxed table nearby",
    "Late night": "still going late, just around the corner",
    Brunch: "a lovely spot for brunch",
    "Power lunch": "a sharp lunch table nearby",
    "Drinks & bites": "drinks and small plates close by",
    "See & be seen": "a scene worth being part of",
    "Hidden gem": "a hidden gem most people walk past",
  };
  if (map[occasion]) return map[occasion];
  if (daypart === "morning") return "a good morning stop nearby";
  if (daypart === "late") return "a late-night option close by";
  return "a fitting table a short walk away";
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function recommendNearbyDining(
  place: PlaceItem,
  dining: DiningItem[],
  history: HistoryEntry[],
  opts: RecommendOptions = {},
): Recommendation[] {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 4;
  const preferredR = opts.preferredRadiusM ?? 900;
  const maxR = opts.maxRadiusM ?? 1500;
  const lambda = opts.diversityLambda ?? 0.65;

  if (typeof place.lat !== "number" || typeof place.lng !== "number") return [];

  const diningById = new Map(dining.map((d) => [d.id, d]));
  const taste = buildTasteProfile(history, diningById, now);
  const ctx = buildContextTarget(place, now);
  const weights = blendWeights(taste.sampleSize);

  // Score everything, keep only in-range candidates.
  const scored: Scored[] = [];
  for (const cand of dining) {
    const s = scoreCandidate(cand, place, taste, ctx, weights);
    if (!s) continue;
    if (s._distanceM != null && s._distanceM > maxR) continue;
    scored.push(s);
  }

  // Coordinates make proximity meaningful, so prefer geolocated candidates and
  // only fall back to coordless (neighborhood-matched) ones to fill the shelf.
  const byScore = (a: Scored, b: Scored) => b.score - a.score || a.item.id - b.item.id;
  const coorded = scored.filter((s) => s._distanceM != null);
  const coordless = scored.filter((s) => s._distanceM == null);
  const tight = coorded.filter((s) => (s._distanceM as number) <= preferredR);

  let base: Scored[];
  if (tight.length >= limit) base = tight;
  else if (coorded.length >= limit) base = coorded;      // widen radius before dropping precision
  else base = [...coorded, ...coordless];                 // last resort: neighborhood matches
  base.sort(byScore);

  // Take a healthy candidate set, then diversify down to `limit`.
  const top = base.slice(0, Math.max(limit * 5, 20));
  const picked = diversify(top, limit, lambda);

  for (const p of picked) p.reason = buildReason(p, ctx, taste);

  // Strip internal field.
  return picked.map(({ _distanceM, ...rec }) => { void _distanceM; return rec; });
}
