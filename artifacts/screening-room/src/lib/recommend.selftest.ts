// Self-contained tests for the recommender. No test-runner dependency:
// run with `node --import tsx artifacts/screening-room/src/lib/recommend.selftest.ts`
import {
  recommendLike,
  sameFranchise,
  titleTokens,
  buildTaste,
  genreIdf,
  shouldSuggest,
  suggestHeading,
  MIN_SUGGESTIONS,
  SUGGEST_COOLDOWN_MS,
} from "./recommend";
import type { MediaItem, TrackedItem } from "@/types";

let nextId = 1;
function m(partial: Partial<MediaItem>): MediaItem {
  return {
    tmdb_id: nextId++,
    media_type: "movie",
    title: "Untitled",
    year: 2010,
    genres: ["Drama"],
    poster_path: null,
    vote_average: 7,
    popularity: 100,
    ...partial,
  } as MediaItem;
}
function tr(partial: Partial<TrackedItem>): TrackedItem {
  return {
    vertical: "films",
    tmdb_id: "1",
    media_type: "movie",
    title: "X",
    year: 2010,
    genres: ["Drama"],
    poster_path: null,
    status: "watched",
    ...partial,
  } as TrackedItem;
}

/** A catalog where Drama is everywhere and Western is rare — tests IDF. */
function corpus(): MediaItem[] {
  nextId = 100;
  const out: MediaItem[] = [];
  for (let i = 0; i < 40; i++) out.push(m({ title: `Drama ${i}`, genres: ["Drama"] }));
  for (let i = 0; i < 3; i++) out.push(m({ title: `Western ${i}`, genres: ["Drama", "Western"] }));
  return out;
}

export function runRecommendSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  // ── IDF: rare genres must outweigh ubiquitous ones ───────────────────────
  {
    const idf = genreIdf(corpus());
    ok((idf.get("Western") ?? 0) > (idf.get("Drama") ?? 0), "idf: rare genre outweighs common");
    ok((idf.get("Drama") ?? -1) >= 0, "idf: common genre still non-negative");
  }

  // ── A rare shared genre beats a common one ───────────────────────────────
  {
    const cat = corpus();
    const seed = m({ title: "Seed Western", genres: ["Drama", "Western"], tmdb_id: 9001 });
    const recs = recommendLike(seed, cat, [], { limit: 3 });
    ok(recs.length === 3, "rare: returns requested count");
    ok(recs[0].item.title.startsWith("Western"), "rare: Western match ranks above generic Drama");
    ok(recs[0].shared.includes("Western"), "rare: shared genres reported");
  }

  // ── Exclusions: the seed and anything already tracked never appear ───────
  {
    const cat = corpus();
    const seed = cat[0];
    const tracked = [
      tr({ tmdb_id: String(cat[1].tmdb_id), media_type: cat[1].media_type }),
      tr({ tmdb_id: String(cat[2].tmdb_id), media_type: cat[2].media_type }),
    ];
    const recs = recommendLike(seed, cat, tracked, { limit: 5 });
    const ids = recs.map(r => r.item.tmdb_id);
    ok(!ids.includes(seed.tmdb_id), "exclude: never recommends the seed");
    ok(!ids.includes(cat[1].tmdb_id) && !ids.includes(cat[2].tmdb_id), "exclude: skips tracked titles");
  }

  // ── Must share something; unrelated catalogs yield nothing ──────────────
  {
    const seed = m({ genres: ["Western"], tmdb_id: 7001 });
    const cat = [m({ genres: ["Comedy"] }), m({ genres: ["Romance"] })];
    ok(recommendLike(seed, cat, [], { limit: 4 }).length === 0, "overlap: no shared genre → nothing");
    ok(recommendLike(seed, [], [], {}).length === 0, "empty catalog → nothing");
  }

  // ── Determinism ─────────────────────────────────────────────────────────
  {
    const cat = corpus();
    const seed = m({ genres: ["Drama", "Western"], tmdb_id: 9002 });
    const a = recommendLike(seed, cat, [], { limit: 4 });
    const b = recommendLike(seed, cat, [], { limit: 4 });
    ok(JSON.stringify(a.map(r => r.item.tmdb_id)) === JSON.stringify(b.map(r => r.item.tmdb_id)),
      "deterministic: identical ordering across calls");
  }

  // ── Diversity: MMR must not return N clones of one genre pairing ────────
  {
    nextId = 500;
    const cat: MediaItem[] = [];
    for (let i = 0; i < 8; i++) cat.push(m({ title: `Clone ${i}`, genres: ["Action", "Sci-Fi"], vote_average: 8.4 }));
    for (let i = 0; i < 8; i++) cat.push(m({ title: `Other ${i}`, genres: ["Action", "Western"], vote_average: 8.3 }));
    const seed = m({ genres: ["Action", "Sci-Fi", "Western"], tmdb_id: 9003 });
    const recs = recommendLike(seed, cat, [], { limit: 4, diversityLambda: 0.5 });
    const kinds = new Set(recs.map(r => (r.item.genres.includes("Sci-Fi") ? "scifi" : "western")));
    ok(kinds.size > 1, "diversity: mixes genre clusters rather than one cluster");
  }

  // ── Taste profile ───────────────────────────────────────────────────────
  {
    const empty = buildTaste([]);
    ok(empty.genre.size === 0 && empty.sampleSize === 0, "taste: empty history is empty");

    const t = buildTaste([
      tr({ genres: ["Horror"], status: "watched", rating: 9 }),
      tr({ genres: ["Horror"], status: "watched", rating: 8 }),
      tr({ genres: ["Romance"], status: "want" }),
    ]);
    ok((t.genre.get("Horror") ?? 0) > (t.genre.get("Romance") ?? 0), "taste: rated+watched beats merely wanted");
    ok(t.sampleSize === 3, "taste: sample size counted");

    // non-film rows must not pollute the film profile
    const mixed = buildTaste([tr({ vertical: "dining", genres: ["Italian"] })]);
    ok(!mixed.genre.has("Italian"), "taste: ignores other verticals");
  }

  // ── Taste actually shifts the ranking ───────────────────────────────────
  {
    nextId = 800;
    const cat = [
      m({ title: "Horror pick", genres: ["Thriller", "Horror"], vote_average: 7.0, popularity: 50 }),
      m({ title: "Comedy pick", genres: ["Thriller", "Comedy"], vote_average: 7.0, popularity: 50 }),
    ];
    const seed = m({ genres: ["Thriller"], tmdb_id: 9004, year: 2010 });
    const horrorFan: TrackedItem[] = Array.from({ length: 12 }, (_, i) =>
      tr({ tmdb_id: `h${i}`, genres: ["Horror"], status: "watched", rating: 9 }));
    const recs = recommendLike(seed, cat, horrorFan, { limit: 2 });
    ok(recs[0].item.title === "Horror pick", "taste: horror history promotes the horror title");
  }

  // ── Reasons are truthful and non-empty ──────────────────────────────────
  {
    const cat = corpus();
    const seed = m({ title: "Seed", genres: ["Drama", "Western"], tmdb_id: 9005, year: 1975 });
    const recs = recommendLike(seed, cat, [], { limit: 4 });
    ok(recs.every(r => r.reason.length > 8), "reason: every pick has one");
    // a shared genre named in the reason must genuinely be shared
    for (const r of recs) {
      for (const g of r.shared) {
        ok(seed.genres.includes(g) && r.item.genres.includes(g), `reason: '${g}' genuinely shared`);
      }
    }
    // high rating on the seed should be quoted back
    const rated = recommendLike(seed, cat,
      [tr({ tmdb_id: String(seed.tmdb_id), media_type: "movie", rating: 9, genres: seed.genres })],
      { limit: 2 });
    ok(rated.some(r => r.reason.includes("9/10")), "reason: cites the seed's own rating when high");
  }

  // ── Franchise cap: one sequel is fine, three re-cuts are not ───────────
  {
    ok(sameFranchise("The Godfather", "The Godfather Part II"), "franchise: sequel detected");
    ok(sameFranchise("The Godfather", "Mario Puzo's The Godfather: The Complete Novel"),
      "franchise: re-cut detected");
    ok(!sameFranchise("The Godfather", "Taxi Driver"), "franchise: unrelated titles differ");
    ok(titleTokens("The Godfather Part II").has("godfather"), "tokens: drops stopwords/numerals");

    nextId = 900;
    const cat = [
      m({ title: "Saga Part II", genres: ["Crime", "Drama"], vote_average: 8.6 }),
      m({ title: "Saga: The Complete Cut", genres: ["Crime", "Drama"], vote_average: 8.5 }),
      m({ title: "Saga Reborn", genres: ["Crime", "Drama"], vote_average: 8.4 }),
      m({ title: "Cold Streets", genres: ["Crime", "Drama"], vote_average: 8.3 }),
      m({ title: "Night Shift", genres: ["Crime", "Drama"], vote_average: 8.2 }),
    ];
    const seed = m({ title: "Saga", genres: ["Crime", "Drama"], tmdb_id: 9100 });
    const recs = recommendLike(seed, cat, [], { limit: 4 });
    const franchise = recs.filter(r => sameFranchise(seed.title, r.item.title));
    ok(franchise.length <= 1, "franchise: at most one same-franchise pick");
    // Only 2 non-franchise candidates exist, so 1 + 2 = 3 is the true maximum.
    // A shorter shelf beats padding it with re-cuts; MIN_SUGGESTIONS is the floor.
    ok(recs.length === 3, "franchise: fills with alternatives, not more re-cuts");
    ok(recs.some(r => r.item.title === "Cold Streets") &&
       recs.some(r => r.item.title === "Night Shift"), "franchise: both alternatives included");
    ok(recs.length >= MIN_SUGGESTIONS, "franchise: still clears the popup threshold");
  }

  // ── Restraint gating ────────────────────────────────────────────────────
  {
    const base = { status: "watched" as const, count: 4, now: 1_000_000 };
    ok(shouldSuggest(base), "gate: normal case shows");
    ok(!shouldSuggest({ ...base, status: "watching" }), "gate: silent mid-series");
    ok(!shouldSuggest({ ...base, questionOpen: true }), "gate: never alongside the verdict question");
    ok(!shouldSuggest({ ...base, bulkSuppressed: true }), "gate: silent while bulk-marking");
    ok(!shouldSuggest({ ...base, turnedOff: true }), "gate: un-marking is not a moment");
    ok(!shouldSuggest({ ...base, count: MIN_SUGGESTIONS - 1 }), "gate: too few picks → silent");
    ok(!shouldSuggest({ ...base, lastShownAt: 1_000_000 - 1000 }), "gate: respects cooldown");
    ok(shouldSuggest({ ...base, lastShownAt: 1_000_000 - SUGGEST_COOLDOWN_MS - 1 }), "gate: shows after cooldown");
    ok(shouldSuggest({ ...base, status: "want" }), "gate: 'want' is a moment too");
  }

  // ── Headings ────────────────────────────────────────────────────────────
  {
    const seed = m({ title: "Dune", tmdb_id: 9006 });
    ok(suggestHeading(seed, "watched") === "Because you watched Dune", "heading: watched");
    ok(suggestHeading(seed, "want").includes("caught your eye"), "heading: want");
  }

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runRecommendSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("recommend selftest: all passed");
}
