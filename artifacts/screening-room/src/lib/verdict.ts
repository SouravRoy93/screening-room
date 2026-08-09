// ─────────────────────────────────────────────────────────────────────────────
// Verdicts — implicit ratings, with an explicit door (Entertainment plan, A).
//
// A rating is a favour the member does the app, and favours must be priced in
// taps rather than decisions. "Rate this 1–10" is one tap but eleven decisions.
// "Would you watch it again?" is one tap and zero decisions — they already know
// the answer. So the default path is two questions, asked one at a time at
// natural moments, and anyone who would rather just pick a number still can.
//
//   Q1  verdict   — would you watch it again?   (the spine; always first)
//   Q2  advocacy  — who would you tell?         (separates good from good-for-me)
//
// Both land in tracked_items.answers (jsonb — a column that has existed,
// unwritten, since the original schema) and derive a single 1–10 `rating`, so
// nothing downstream has to know which door was used. Every taste engine in
// the app — Tonight, Choose for me, Perfect Evening, the Sunday Edit — reads
// that one field.
//
// Pure and deterministic: same answers, same score (see verdict.selftest.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type Verdict = "again" | "maybe" | "once" | "abandoned";
export type Advocacy = "everyone" | "some" | "noone";
export type RatingMethod = "implicit" | "explicit";

/** The shape stored in `tracked_items.answers`. Every field optional: a row
 *  may be mid-conversation, dismissed, or rated explicitly and never asked. */
export interface VerdictAnswers {
  method?: RatingMethod;
  verdict?: Verdict;
  advocacy?: Advocacy;
  /** ISO — when we last put a question in front of them. */
  askedAt?: string;
  /** ISO — when they last said "later". */
  dismissedAt?: string;
  /** How many times they've waved it away. Two is the ceiling, ever. */
  dismissCount?: number;
}

// ── The questions ────────────────────────────────────────────────────────────
// Phrased in the member's own head-voice. No craft questions, no comparisons,
// nothing requiring composition — films are verdicts, not events. (The dining
// journal keeps free text precisely because restaurants *are* events.)

export const VERDICT_QUESTION = "Would you watch it again?";
export const ADVOCACY_QUESTION = "Who would you tell about it?";

export const VERDICT_OPTIONS: { value: Verdict; label: string }[] = [
  { value: "again", label: "In a heartbeat" },
  { value: "maybe", label: "Maybe someday" },
  { value: "once", label: "Once was enough" },
  { value: "abandoned", label: "Couldn't finish" },
];

export const ADVOCACY_OPTIONS: { value: Advocacy; label: string }[] = [
  { value: "everyone", label: "Everyone I know" },
  { value: "some", label: "The right friend" },
  { value: "noone", label: "No one, really" },
];

// ── Scoring ──────────────────────────────────────────────────────────────────
// Rewatch intent carries the score; advocacy adjusts it. The two are genuinely
// orthogonal — a comfort film you'd rewatch forever but recommend to nobody
// lands around 9, a brilliant thing you admired once and press on everyone
// lands around 5.5. A single star widget cannot express either.

const VERDICT_BASE: Record<Verdict, number> = {
  again: 9.5,
  maybe: 7,
  once: 4.5,
  abandoned: 2,
};

const ADVOCACY_ADJUST: Record<Advocacy, number> = {
  everyone: 1,
  some: 0.5,
  noone: -0.5,
};

export function clampRating(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n * 2) / 2));
}

/**
 * The 1–10 score these answers imply, or null when there's nothing to score.
 * Answering only Q1 already yields a usable rating — Q2 refines it later.
 */
export function deriveRating(a: VerdictAnswers | null | undefined): number | null {
  if (!a?.verdict) return null;
  const base = VERDICT_BASE[a.verdict];
  const adj = a.advocacy ? ADVOCACY_ADJUST[a.advocacy] : 0;
  return clampRating(base + adj);
}

/** A short, honest label for a stored verdict — for shelves and stats. */
export function verdictLabel(v: Verdict): string {
  return VERDICT_OPTIONS.find((o) => o.value === v)?.label ?? "";
}

// ── Reading what's already there ─────────────────────────────────────────────

/** `answers` arrives from Postgres as unknown jsonb. Never trust its shape. */
export function parseAnswers(raw: unknown): VerdictAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: VerdictAnswers = {};
  if (o.method === "implicit" || o.method === "explicit") out.method = o.method;
  if (typeof o.verdict === "string" && o.verdict in VERDICT_BASE) out.verdict = o.verdict as Verdict;
  if (typeof o.advocacy === "string" && o.advocacy in ADVOCACY_ADJUST) out.advocacy = o.advocacy as Advocacy;
  if (typeof o.askedAt === "string") out.askedAt = o.askedAt;
  if (typeof o.dismissedAt === "string") out.dismissedAt = o.dismissedAt;
  if (typeof o.dismissCount === "number" && Number.isFinite(o.dismissCount)) {
    out.dismissCount = Math.max(0, Math.floor(o.dismissCount));
  }
  return out;
}

// ── What to ask next ─────────────────────────────────────────────────────────

export type Question = "verdict" | "advocacy";

/** Two asks per title, ever. After that the app has said its piece. */
export const MAX_DISMISSALS = 2;

/**
 * The next question worth asking, or null to stay quiet.
 *
 * Silent when: they rated explicitly (they've told us what they think),
 * both questions are answered, or they've waved us away twice.
 */
export function nextQuestion(a: VerdictAnswers | null | undefined): Question | null {
  const ans = a ?? {};
  if (ans.method === "explicit") return null;
  if ((ans.dismissCount ?? 0) >= MAX_DISMISSALS) return null;
  if (!ans.verdict) return "verdict";
  if (!ans.advocacy) return "advocacy";
  return null;
}

/**
 * Q2 is deliberately not asked in the same breath as Q1 — three questions over
 * three natural touches reads as attentiveness; three in a row reads as a
 * survey. Once the verdict is in, advocacy waits for the next visit.
 */
const ADVOCACY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function canAskNow(
  a: VerdictAnswers | null | undefined,
  now: Date = new Date(),
): boolean {
  const q = nextQuestion(a);
  if (!q) return false;
  if (q === "verdict") return true;
  const asked = a?.askedAt ? Date.parse(a.askedAt) : NaN;
  if (Number.isNaN(asked)) return true;
  return now.getTime() - asked >= ADVOCACY_COOLDOWN_MS;
}

// ── Writing ──────────────────────────────────────────────────────────────────

/** Record an answer. Returns the new answers plus the rating they imply. */
export function applyAnswer(
  prev: VerdictAnswers | null | undefined,
  question: Question,
  value: Verdict | Advocacy,
  now: Date = new Date(),
): { answers: VerdictAnswers; rating: number | null } {
  const answers: VerdictAnswers = {
    ...(prev ?? {}),
    method: "implicit",
    askedAt: now.toISOString(),
  };
  if (question === "verdict") answers.verdict = value as Verdict;
  else answers.advocacy = value as Advocacy;
  // Answering resets any impatience we'd recorded.
  delete answers.dismissedAt;
  answers.dismissCount = 0;
  return { answers, rating: deriveRating(answers) };
}

/** They picked a number instead. Questions stop for this title, permanently. */
export function applyExplicit(
  prev: VerdictAnswers | null | undefined,
  now: Date = new Date(),
): VerdictAnswers {
  return { ...(prev ?? {}), method: "explicit", askedAt: now.toISOString() };
}

/** "Later." Never un-sets the status — the rating was always the bonus. */
export function applyDismiss(
  prev: VerdictAnswers | null | undefined,
  now: Date = new Date(),
): VerdictAnswers {
  const p = prev ?? {};
  return {
    ...p,
    dismissedAt: now.toISOString(),
    dismissCount: (p.dismissCount ?? 0) + 1,
  };
}

// ── Bulk backfill ────────────────────────────────────────────────────────────

/**
 * A new member marking thirty old films as watched must not be asked thirty
 * questions. Backfill is the single best taste harvest the app will ever get,
 * and an interrogation is the fastest way to lose it.
 *
 * Detect a run of marks and go quiet for the rest of the session; the
 * follow-up card picks the questions up later, one at a time.
 */
export const BULK_WINDOW_MS = 60_000;
export const BULK_THRESHOLD = 3;

export function isBulkMarking(
  markTimes: number[],
  now: number = Date.now(),
): boolean {
  const recent = markTimes.filter((t) => now - t <= BULK_WINDOW_MS);
  return recent.length >= BULK_THRESHOLD;
}

/**
 * The single decision the card makes on a watched-tap: ask, or stay quiet.
 */
export function shouldPromptOnWatched(opts: {
  answers?: VerdictAnswers | null;
  /** Timestamps of recent watched-marks this session, including this one. */
  recentMarks: number[];
  /** Set once a run has been detected — quiet for the rest of the session. */
  sessionSuppressed?: boolean;
  now?: Date;
}): boolean {
  if (opts.sessionSuppressed) return false;
  if (isBulkMarking(opts.recentMarks, (opts.now ?? new Date()).getTime())) return false;
  return canAskNow(opts.answers, opts.now ?? new Date());
}
