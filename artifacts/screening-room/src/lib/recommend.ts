// ─────────────────────────────────────────────────────────────────────────────
// "More like this" — the recommender behind the post-mark popup.
//
// Pure and deterministic: same catalog + same history + same seed always
// produce the same picks, so it's testable and re-opening never shuffles
// (see recommend.selftest.ts). No network — it runs off the static catalog
// the app already ships.
//
// Five signals, blended:
//   1. Genre affinity with the seed, IDF-weighted — sharing "Western" means far
//      more than sharing "Drama", because almost everything is a Drama.
//   2. Taste profile — genres this person actually tracks and rates well.
//   3. Quality — TMDB vote average.
//   4. Era proximity — a 1974 crime film pairs better with the 70s than 2020s.
//   5. Popularity — log-scaled and deliberately weak, so the shelf isn't just
//      the five biggest titles in the catalog.
//
// Then MMR diversification, so you get genuinely different suggestions rather
// than five instalments of the same franchise.
// ─────────────────────────────────────────────────────────────────────────────
import type { MediaItem, TrackedItem } from "@/types";

export type TrackStatus = "want" | "watching" | "watched";

export interface Recommendation {
  item: MediaItem;
  /** Blended score. Only meaningful for ordering. */
  score: number;
  /** Truthful one-liner naming the real reason — never invented. */
  reason: string;
  /** Genres actually shared with the seed, for the UI chips. */
  shared: string[];
}

export interface RecommendOptions {
  /** How many to return. The popup shows four comfortably. */
  limit?: number;
  /** MMR trade-off: 1 = pure relevance, 0 = pure variety. */
  diversityLambda?: number;
  /** Candidate pool size before diversification. */
  poolSize?: number;
}

// ── Genre weighting (IDF) ────────────────────────────────────────────────────

const idfCache = new WeakMap<object, Map<string, number>>();

/**
 * Inverse document frequency per genre. A genre on 40% of the catalog carries
 * little information; one on 2% carries a lot. Cached per catalog identity.
 */
export function genreIdf(catalog: MediaItem[]): Map<string, number> {
  const cached = idfCache.get(catalog as unknown as object);
  if (cached) return cached;

  const df = new Map<string, number>();
  for (const m of catalog) {
    for (const g of m.genres || []) df.set(g, (df.get(g) || 0) + 1);
  }
  const n = Math.max(1, catalog.length);
  const idf = new Map<string, number>();
  // Floor it: a genre on *every* title would otherwise score 0, which would
  // drop titles that share only that genre instead of merely ranking them low.
  for (const [g, count] of df) idf.set(g, Math.max(0.05, Math.log((n + 1) / (count + 1))));
  idfCache.set(catalog as unknown as object, idf);
  return idf;
}

/** Overlap of two genre sets, weighted by how rare each shared genre is. */
function genreAffinity(
  a: string[],
  b: string[],
  idf: Map<string, number>,
): { score: number; shared: string[] } {
  if (!a?.length || !b?.length) return { score: 0, shared: [] };
  const bs = new Set(b);
  const shared: string[] = [];
  let num = 0;
  for (const g of a) {
    if (bs.has(g)) {
      shared.push(g);
      num += idf.get(g) ?? 1;
    }
  }
  if (!num) return { score: 0, shared: [] };
  // Weighted Jaccard: intersection over union. Normalising by the *smaller*
  // set would give a Drama-only title a perfect score against a
  // Drama+Western seed — a subset must not look identical to a real match.
  const weight = (list: string[]) => list.reduce((s, g) => s + (idf.get(g) ?? 1), 0);
  const union = weight(a) + weight(b) - num;
  return { score: union > 0 ? Math.min(1, num / union) : 0, shared };
}

// ── Taste profile ────────────────────────────────────────────────────────────

export interface TasteProfile {
  /** genre → 0..1 affinity from what they track and how they rate it. */
  genre: Map<string, number>;
  /** How much history backs this. Small history → trust the seed more. */
  sampleSize: number;
}

const STATUS_WEIGHT: Record<string, number> = { watched: 1, watching: 0.8, want: 0.5 };

export function buildTaste(tracked: TrackedItem[]): TasteProfile {
  const raw = new Map<string, number>();
  let total = 0;
  for (const t of tracked) {
    if (t.vertical && t.vertical !== "films") continue;
    const base = STATUS_WEIGHT[t.status as string] ?? 0.5;
    // A 9/10 counts roughly double a 5/10; unrated sits just below neutral-good.
    const quality = t.rating ? 0.5 + t.rating / 10 : 0.85;
    const w = base * quality;
    total += w;
    for (const g of t.genres || []) raw.set(g, (raw.get(g) || 0) + w);
  }
  const genre = new Map<string, number>();
  if (total > 0) {
    const max = Math.max(...raw.values(), 1);
    for (const [g, v] of raw) genre.set(g, v / max);
  }
  return { genre, sampleSize: tracked.length };
}

function tasteScore(item: MediaItem, taste: TasteProfile): number {
  if (!taste.genre.size) return 0;
  let best = 0, sum = 0;
  for (const g of item.genres || []) {
    const v = taste.genre.get(g) ?? 0;
    sum += v;
    if (v > best) best = v;
  }
  const n = Math.max(1, (item.genres || []).length);
  // Mostly "is their favourite genre here", softened by overall coverage.
  return 0.7 * best + 0.3 * (sum / n);
}

// ── Other signals ────────────────────────────────────────────────────────────

function qualityScore(item: MediaItem): number {
  const v = item.vote_average;
  if (v == null || v <= 0) return 0.5;                  // unknown ≠ bad
  return Math.max(0, Math.min(1, (v - 4) / 5));         // 4.0 → 0, 9.0 → 1
}

function popularityScore(item: MediaItem): number {
  const p = item.popularity ?? 0;
  if (p <= 0) return 0;
  return Math.min(1, Math.log10(1 + p) / 3.5);
}

function eraScore(seedYear: number | null, year: number | null): number {
  if (seedYear == null || year == null) return 0.5;
  const gap = Math.abs(seedYear - year);
  if (gap <= 3) return 1;
  if (gap >= 40) return 0;
  return 1 - (gap - 3) / 37;
}

// ── Weights ──────────────────────────────────────────────────────────────────
// Cold start leans on the seed; once there's history, taste earns its place.

function weightsFor(sampleSize: number) {
  const warm = Math.min(1, sampleSize / 12);
  return {
    affinity: 0.46 - 0.10 * warm,
    taste: 0.04 + 0.22 * warm,
    quality: 0.20,
    era: 0.16,
    popularity: 0.10,
  };
}

// ── Franchise detection ──────────────────────────────────────────────────────
// A sequel is a fine suggestion; three re-cuts of the same film are not. We
// allow one same-franchise pick, then prefer something genuinely different.

const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "part", "chapter", "vol", "volume",
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    (title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t && !TITLE_STOPWORDS.has(t) && !/^\d+$/.test(t)),
  );
}

/** True when one title's significant words are fully contained in the other. */
export function sameFranchise(a: string, b: string): boolean {
  const ta = titleTokens(a), tb = titleTokens(b);
  if (!ta.size || !tb.size) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!big.has(t)) return false;
  return true;
}

// ── Reasons ──────────────────────────────────────────────────────────────────

function joinGenres(gs: string[]): string {
  const g = gs.slice(0, 2).map(x => x.toLowerCase());
  return g.length === 2 ? `${g[0]} and ${g[1]}` : g[0];
}

function buildReason(
  seed: MediaItem,
  item: MediaItem,
  shared: string[],
  taste: TasteProfile,
  seedRating: number | null,
): string {
  const sameDecade =
    seed.year != null && item.year != null && Math.floor(seed.year / 10) === Math.floor(item.year / 10);

  if (seedRating != null && seedRating >= 8 && shared.length) {
    return `You rated ${seed.title} ${seedRating}/10 — this shares its ${joinGenres(shared)}.`;
  }
  if (shared.length >= 2 && sameDecade && item.year != null) {
    return `Same ${joinGenres(shared)} territory, same ${Math.floor(item.year / 10) * 10}s feel.`;
  }
  if (shared.length >= 2) {
    return `Shares ${joinGenres(shared)} with ${seed.title}.`;
  }
  if (shared.length === 1) {
    const g = shared[0];
    const loved = (taste.genre.get(g) ?? 0) >= 0.6;
    return loved
      ? `More ${g.toLowerCase()} — the genre you keep coming back to.`
      : `${g} like ${seed.title}, but a different animal.`;
  }
  if ((item.vote_average ?? 0) >= 8) {
    return `Nothing like ${seed.title} — but one of the best-rated things here.`;
  }
  return `A change of pace from ${seed.title}.`;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function recommendLike(
  seed: MediaItem,
  catalog: MediaItem[],
  tracked: TrackedItem[] = [],
  opts: RecommendOptions = {},
): Recommendation[] {
  const limit = opts.limit ?? 4;
  const lambda = opts.diversityLambda ?? 0.72;
  const poolSize = opts.poolSize ?? 40;
  if (!catalog.length) return [];

  const idf = genreIdf(catalog);
  const taste = buildTaste(tracked);
  const w = weightsFor(taste.sampleSize);

  // Never re-suggest the seed or anything they already track.
  const seen = new Set<string>([`${seed.media_type}:${seed.tmdb_id}`]);
  for (const t of tracked) seen.add(`${t.media_type}:${t.tmdb_id}`);
  const seedRating =
    tracked.find(
      t => String(t.tmdb_id) === String(seed.tmdb_id) && t.media_type === seed.media_type,
    )?.rating ?? null;

  type Scored = Recommendation & { _aff: number };
  const scored: Scored[] = [];

  for (const item of catalog) {
    if (seen.has(`${item.media_type}:${item.tmdb_id}`)) continue;
    const { score: aff, shared } = genreAffinity(seed.genres || [], item.genres || [], idf);
    if (!shared.length) continue;                       // must share something

    let s =
      w.affinity * aff +
      w.taste * tasteScore(item, taste) +
      w.quality * qualityScore(item) +
      w.era * eraScore(seed.year, item.year) +
      w.popularity * popularityScore(item);

    // Mild nudge toward the same form — a film after a film.
    if (item.media_type === seed.media_type) s += 0.03;

    scored.push({
      item,
      score: s,
      shared,
      reason: buildReason(seed, item, shared, taste, seedRating),
      _aff: aff,
    });
  }

  if (!scored.length) return [];

  // Stable ordering: score desc, then id asc so ties never shuffle.
  scored.sort((a, b) => b.score - a.score || a.item.tmdb_id - b.item.tmdb_id);
  const pool = scored.slice(0, poolSize);

  // MMR: reward relevance, penalise resembling something already picked.
  const picked: Scored[] = [];
  let franchisePicks = 0;
  while (picked.length < limit && pool.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      // One sequel/re-cut is welcome; a second is repetition.
      if (franchisePicks >= 1 && sameFranchise(seed.title, cand.item.title)) continue;
      let maxSim = 0;
      for (const p of picked) {
        const { score: sim } = genreAffinity(cand.item.genres || [], p.item.genres || [], idf);
        if (sim > maxSim) maxSim = sim;
      }
      const val = lambda * cand.score - (1 - lambda) * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    if (bestVal === -Infinity) break;          // everything left was filtered out
    const chosen = pool.splice(bestIdx, 1)[0];
    if (sameFranchise(seed.title, chosen.item.title)) franchisePicks++;
    picked.push(chosen);
  }

  return picked.map(({ item, score, reason, shared }) => ({ item, score, reason, shared }));
}

// ── Restraint ────────────────────────────────────────────────────────────────
// The app's rule is one interruption at a time. These guards keep the popup a
// delight rather than a nag.

/** Don't resurface for this long after showing it once. */
export const SUGGEST_COOLDOWN_MS = 90_000;
/** Below this many good picks, stay silent rather than show a thin shelf. */
export const MIN_SUGGESTIONS = 3;

export function shouldSuggest(opts: {
  status: TrackStatus;
  count: number;
  /** When the popup was last shown this session, if ever. */
  lastShownAt?: number | null;
  /** True when the verdict question is already on screen. */
  questionOpen?: boolean;
  /** True once a bulk-marking run has been detected. */
  bulkSuppressed?: boolean;
  /** True when the mark was a toggle-off. */
  turnedOff?: boolean;
  now?: number;
}): boolean {
  if (opts.turnedOff) return false;                 // un-marking isn't a moment
  if (opts.status === "watching") return false;     // mid-series, not a moment
  if (opts.questionOpen) return false;              // never two popups at once
  if (opts.bulkSuppressed) return false;            // they're triaging a backlog
  if (opts.count < MIN_SUGGESTIONS) return false;
  const now = opts.now ?? Date.now();
  if (opts.lastShownAt != null && now - opts.lastShownAt < SUGGEST_COOLDOWN_MS) return false;
  return true;
}

/** Header line for the popup — honest about why these are being shown. */
export function suggestHeading(seed: MediaItem, status: TrackStatus): string {
  return status === "watched"
    ? `Because you watched ${seed.title}`
    : `Since ${seed.title} caught your eye`;
}
