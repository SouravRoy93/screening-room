// Self-contained tests for the follow-ups engine. No test-runner dependency:
// run with `node --import tsx artifacts/screening-room/src/lib/followups.selftest.ts`
import {
  computeFollowUps,
  pickFollowUp,
  DUE_AFTER_MS,
  EXPIRE_AFTER_MS,
  type DiningActivity,
  type FilmActivity,
  type FollowUpState,
} from "./followups";

const NOW = new Date("2026-07-11T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const H = 3_600_000;

const noFilms: FilmActivity[] = [];
const noDining: DiningActivity[] = [];

export function runFollowUpsSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  // Booked yesterday → due; booked an hour ago → not yet.
  {
    const fus = computeFollowUps({
      dining: [{ id: 1, name: "Carbone", booked: true, bookedAt: ago(24 * H) }],
      films: noFilms, now: NOW,
    });
    ok(fus.length === 1 && fus[0].kind === "dining-booked", "booked 24h → due");
    ok(fus[0].title === "How was Carbone?", "booked: warm title");
    ok(fus[0].altAction === "didnt-go", "booked: honest escape hatch");
    const early = computeFollowUps({
      dining: [{ id: 1, name: "Carbone", booked: true, bookedAt: ago(1 * H) }],
      films: noFilms, now: NOW,
    });
    ok(early.length === 0, "booked 1h → too soon to ask");
  }

  // Ancient flags never resurface.
  {
    const fus = computeFollowUps({
      dining: [{ id: 1, name: "X", booked: true, bookedAt: ago(EXPIRE_AFTER_MS + H) }],
      films: noFilms, now: NOW,
    });
    ok(fus.length === 0, "expired booked → silent");
  }

  // Visited without a journal → ask; with a journal → resolved naturally.
  {
    const base: DiningActivity = { id: 2, name: "Lilia", visited: true, visitedAt: ago(24 * H) };
    ok(computeFollowUps({ dining: [base], films: noFilms, now: NOW })[0]?.kind === "dining-visited",
      "visited, no journal → ask");
    ok(computeFollowUps({ dining: [{ ...base, hasJournal: true }], films: noFilms, now: NOW }).length === 0,
      "journal written → nothing to ask");
  }

  // Visited outranks booked on the same table; no stamp → no question.
  {
    const fus = computeFollowUps({
      dining: [{ id: 3, name: "Via Carota", booked: true, bookedAt: ago(48 * H), visited: true, visitedAt: ago(24 * H) }],
      films: noFilms, now: NOW,
    });
    ok(fus.length === 1 && fus[0].kind === "dining-visited", "visited beats booked");
    ok(computeFollowUps({ dining: [{ id: 4, name: "Y", booked: true }], films: noFilms, now: NOW }).length === 0,
      "no timestamp → never nag (pre-feature flags)");
  }

  // Live Google entries are skipped (no cold-start route).
  {
    const fus = computeFollowUps({
      dining: [{ id: "live-some-spot", name: "Some Spot", visited: true, visitedAt: ago(24 * H) }],
      films: noFilms, now: NOW,
    });
    ok(fus.length === 0, "live entries skipped");
  }

  // Films: watched + unrated → ask; rated or merely watching → silent.
  {
    const f = (over: Partial<FilmActivity>): FilmActivity => ({
      tmdb_id: "7", media_type: "tv", title: "The Wire", status: "watched",
      rating: null, updated_at: ago(24 * H), ...over,
    });
    const due = computeFollowUps({ dining: noDining, films: [f({})], now: NOW });
    ok(due.length === 1 && due[0].kind === "film-rate", "watched unrated → ask");
    ok(due[0].href === "/films/tv/7", "film href routes to detail");
    ok(computeFollowUps({ dining: noDining, films: [f({ rating: 8 })], now: NOW }).length === 0, "rated → silent");
    ok(computeFollowUps({ dining: noDining, films: [f({ status: "watching" })], now: NOW }).length === 0, "watching → silent");
  }

  // Ordering (oldest debt first) + one-at-a-time picking with snooze/done.
  {
    const fus = computeFollowUps({
      dining: [
        { id: 1, name: "Older", visited: true, visitedAt: ago(72 * H) },
        { id: 2, name: "Newer", visited: true, visitedAt: ago(24 * H) },
      ],
      films: noFilms, now: NOW,
    });
    ok(fus[0].title.includes("Older"), "oldest due first");

    const state: FollowUpState = {};
    ok(pickFollowUp(fus, state, NOW)?.id === fus[0].id, "pick: first when clean");
    state[fus[0].id] = { snoozedUntil: new Date(NOW.getTime() + H).toISOString() };
    ok(pickFollowUp(fus, state, NOW)?.id === fus[1].id, "pick: snoozed skipped");
    ok(pickFollowUp(fus, state, new Date(NOW.getTime() + 2 * H))?.id === fus[0].id, "pick: snooze expires");
    state[fus[0].id] = { doneAt: NOW.toISOString() };
    state[fus[1].id] = { doneAt: NOW.toISOString() };
    ok(pickFollowUp(fus, state, NOW) === null, "pick: all done → null");
  }

  // Determinism + due timing sanity.
  {
    const input = {
      dining: [{ id: 1, name: "A", booked: true, bookedAt: ago(30 * H) }] as DiningActivity[],
      films: [{ tmdb_id: "9", media_type: "movie", title: "B", status: "watched", rating: null, updated_at: ago(20 * H) }] as FilmActivity[],
      now: NOW,
    };
    const a = computeFollowUps(input); const b = computeFollowUps(input);
    ok(JSON.stringify(a) === JSON.stringify(b), "deterministic");
    ok(Date.parse(a[0].dueAt) === Date.parse(input.dining[0].bookedAt!) + DUE_AFTER_MS, "dueAt = stamp + grace");
  }

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runFollowUpsSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("followups selftest: all passed");
}
