// Self-contained tests for the verdict (implicit rating) engine. Run with
// `node --import tsx artifacts/screening-room/src/lib/verdict.selftest.ts`
import {
  ADVOCACY_OPTIONS,
  BULK_THRESHOLD,
  MAX_DISMISSALS,
  VERDICT_OPTIONS,
  applyAnswer,
  applyDismiss,
  applyExplicit,
  canAskNow,
  clampRating,
  deriveRating,
  isBulkMarking,
  nextQuestion,
  parseAnswers,
  shouldPromptOnWatched,
  verdictLabel,
  type VerdictAnswers,
} from "./verdict";

const NOW = new Date("2026-08-09T20:00:00");
const later = (h: number) => new Date(NOW.getTime() + h * 3600_000);

export function runVerdictSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  // ── The options are a closed, human set
  {
    ok(VERDICT_OPTIONS.length === 4, "options: four verdicts");
    ok(ADVOCACY_OPTIONS.length === 3, "options: three advocacy answers");
    ok(new Set(VERDICT_OPTIONS.map(o => o.value)).size === 4, "options: verdict values unique");
    ok(VERDICT_OPTIONS.every(o => o.label.length > 0 && !/rate|star|score/i.test(o.label)),
      "options: labels speak like a person, not a form");
    ok(verdictLabel("again") === "In a heartbeat", "options: label lookup");
  }

  // ── Scoring: rewatch carries, advocacy adjusts
  {
    ok(deriveRating({ verdict: "again" }) === 9.5, "score: a heartbeat rewatch alone is 9.5");
    ok(deriveRating({ verdict: "maybe" }) === 7, "score: maybe someday is 7");
    ok(deriveRating({ verdict: "once" }) === 4.5, "score: once was enough is 4.5");
    ok(deriveRating({ verdict: "abandoned" }) === 2, "score: couldn't finish is 2");

    ok(deriveRating({ verdict: "again", advocacy: "everyone" }) === 10, "score: heartbeat + everyone tops out at 10");
    ok(deriveRating({ verdict: "again", advocacy: "noone" }) === 9, "score: the private comfort film still scores 9");
    ok(deriveRating({ verdict: "once", advocacy: "everyone" }) === 5.5, "score: admired once, pressed on everyone, is mid");
    ok(deriveRating({ verdict: "abandoned", advocacy: "noone" }) === 1.5, "score: the floor is above zero");

    // Orthogonality — the pair says something a single number can't.
    const comfort = deriveRating({ verdict: "again", advocacy: "noone" })!;
    const admired = deriveRating({ verdict: "once", advocacy: "everyone" })!;
    ok(comfort > admired, "score: rewatch intent outweighs advocacy, deliberately");

    ok(deriveRating({}) === null, "score: nothing answered means no rating");
    ok(deriveRating(null) === null, "score: null answers are safe");
    ok(deriveRating({ advocacy: "everyone" }) === null, "score: advocacy without a verdict scores nothing");
  }

  // ── Every combination stays inside 1–10, on a half-point grid
  {
    for (const v of VERDICT_OPTIONS) {
      for (const a of ADVOCACY_OPTIONS) {
        const r = deriveRating({ verdict: v.value, advocacy: a.value })!;
        ok(r >= 1 && r <= 10, `range: ${v.value}+${a.value} inside 1-10`);
        ok(Math.round(r * 2) === r * 2, `range: ${v.value}+${a.value} lands on a half point`);
      }
    }
    ok(clampRating(99) === 10 && clampRating(-4) === 1, "range: clamp holds both ends");
  }

  // ── Question sequencing
  {
    ok(nextQuestion({}) === "verdict", "ask: the verdict comes first");
    ok(nextQuestion({ verdict: "again" }) === "advocacy", "ask: then advocacy");
    ok(nextQuestion({ verdict: "again", advocacy: "some" }) === null, "ask: then silence");
    ok(nextQuestion(null) === "verdict", "ask: an untouched title starts at the beginning");
    ok(nextQuestion({ method: "explicit" }) === null, "ask: a number was given, so stop asking");
    ok(nextQuestion({ method: "explicit", verdict: undefined }) === null, "ask: explicit wins even with nothing else");
  }

  // ── Two asks per title, ever
  {
    let a: VerdictAnswers = {};
    a = applyDismiss(a, NOW);
    ok(a.dismissCount === 1 && nextQuestion(a) === "verdict", "dismiss: one 'later' doesn't end it");
    a = applyDismiss(a, NOW);
    ok(a.dismissCount === MAX_DISMISSALS && nextQuestion(a) === null, "dismiss: two ends it for good");
    ok(!!a.dismissedAt, "dismiss: records when");

    // Dismissing must never touch the verdict or the status.
    const withVerdict = applyDismiss({ verdict: "maybe" }, NOW);
    ok(withVerdict.verdict === "maybe", "dismiss: leaves an existing answer alone");
  }

  // ── Answering resets impatience
  {
    const dismissed = applyDismiss(applyDismiss({}, NOW), NOW);
    const { answers, rating } = applyAnswer(dismissed, "verdict", "again", NOW);
    ok(answers.dismissCount === 0 && !answers.dismissedAt, "answer: clears the dismissal history");
    ok(rating === 9.5, "answer: returns the rating it implies");
    ok(answers.method === "implicit", "answer: records the door used");
    ok(nextQuestion(answers) === "advocacy", "answer: reopens the conversation");
  }

  // ── Q2 waits for a natural second touch
  {
    const { answers } = applyAnswer({}, "verdict", "again", NOW);
    ok(!canAskNow(answers, NOW), "cooldown: advocacy is not asked in the same breath");
    ok(!canAskNow(answers, later(2)), "cooldown: still quiet two hours later");
    ok(canAskNow(answers, later(7)), "cooldown: asked on the next visit");
    ok(canAskNow({}, NOW), "cooldown: the first question is never delayed");
    ok(canAskNow({ verdict: "again", askedAt: "nonsense" }, NOW),
      "cooldown: an unparseable timestamp fails open rather than going mute");
  }

  // ── The explicit door
  {
    const e = applyExplicit({}, NOW);
    ok(e.method === "explicit", "explicit: recorded");
    ok(nextQuestion(e) === null && !canAskNow(e, later(48)),
      "explicit: closes the questions permanently, not just for now");

    // Someone who answered Q1 then reached for stars keeps their verdict.
    const mixed = applyExplicit({ verdict: "maybe" }, NOW);
    ok(mixed.verdict === "maybe", "explicit: an earlier verdict survives");
    ok(deriveRating(mixed) === 7, "explicit: and still derives, though the UI will prefer the typed number");
  }

  // ── Bulk backfill suppression
  {
    const t = NOW.getTime();
    ok(!isBulkMarking([t], t), "bulk: one mark is not a run");
    ok(!isBulkMarking([t - 1000, t], t), "bulk: two marks is not a run");
    ok(isBulkMarking([t - 2000, t - 1000, t], t), `bulk: ${BULK_THRESHOLD} inside a minute is a run`);
    ok(!isBulkMarking([t - 90_000, t - 80_000, t], t), "bulk: marks spread over minutes are not a run");

    ok(shouldPromptOnWatched({ answers: {}, recentMarks: [t], now: NOW }),
      "bulk: a single considered mark still gets its question");
    ok(!shouldPromptOnWatched({ answers: {}, recentMarks: [t - 2000, t - 1000, t], now: NOW }),
      "bulk: a run goes quiet");
    ok(!shouldPromptOnWatched({ answers: {}, recentMarks: [t], sessionSuppressed: true, now: NOW }),
      "bulk: once suppressed, quiet for the whole session");
    ok(!shouldPromptOnWatched({ answers: { method: "explicit" }, recentMarks: [t], now: NOW }),
      "bulk: an explicitly rated title is never prompted");
    ok(!shouldPromptOnWatched({ answers: { verdict: "again", advocacy: "some" }, recentMarks: [t], now: NOW }),
      "bulk: a finished conversation is never reopened");
  }

  // ── jsonb comes back untrusted
  {
    ok(JSON.stringify(parseAnswers(null)) === "{}", "parse: null is empty");
    ok(JSON.stringify(parseAnswers("nope")) === "{}", "parse: a string is empty");
    ok(JSON.stringify(parseAnswers([1, 2])) === "{}", "parse: an array is empty");
    ok(parseAnswers({ verdict: "again", advocacy: "some" }).verdict === "again", "parse: good values survive");
    ok(parseAnswers({ verdict: "brilliant" }).verdict === undefined, "parse: an unknown verdict is dropped");
    ok(parseAnswers({ method: "vibes" }).method === undefined, "parse: an unknown method is dropped");
    ok(parseAnswers({ dismissCount: -3 }).dismissCount === 0, "parse: a negative count is floored");
    ok(parseAnswers({ dismissCount: 2.7 }).dismissCount === 2, "parse: a fractional count is floored");
    ok(parseAnswers({ dismissCount: "many" }).dismissCount === undefined, "parse: a non-numeric count is dropped");

    // A round trip through JSON must survive, since that's what Postgres does.
    const { answers } = applyAnswer({}, "verdict", "abandoned", NOW);
    const round = parseAnswers(JSON.parse(JSON.stringify(answers)));
    ok(round.verdict === "abandoned" && round.method === "implicit", "parse: survives a jsonb round trip");
    ok(deriveRating(round) === 2, "parse: and still scores the same");
  }

  // ── Determinism
  {
    const a = applyAnswer({}, "verdict", "maybe", NOW);
    const b = applyAnswer({}, "verdict", "maybe", NOW);
    ok(JSON.stringify(a) === JSON.stringify(b), "deterministic: same inputs, same output");
  }

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runVerdictSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("verdict selftest: all passed");
}
