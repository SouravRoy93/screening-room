// ─────────────────────────────────────────────────────────────────────────────
// Post-visit follow-ups (Obsession roadmap #2 — "close every loop like a
// maître d'"). Pure and deterministic: given the user's recent activity and
// the current time, decide which single, gentle question to ask:
//
//   • You marked a table "Booked" and a day has passed  → "How was it?"
//   • You marked "Been" but never wrote a word about it → "Worth remembering?"
//   • You finished a film but never rated it            → "Worth it?"
//
// A follow-up resolves NATURALLY (journal written, rating saved, flag
// cleared) — state only records snoozes and explicit dismissals.
// Data gathering lives in hooks/use-followups.ts; UI in components/followup-card.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiningActivity {
  /** storageKey: curated numeric id, or "live-…" for Google results. */
  id: number | string;
  name: string;
  booked?: boolean;
  bookedAt?: string | null;
  visited?: boolean;
  visitedAt?: string | null;
  /** Notes or standout dish already written for this table. */
  hasJournal?: boolean;
}

export interface FilmActivity {
  tmdb_id: string;
  media_type: string;
  title: string;
  status: string;
  rating: number | null;
  updated_at: string | null;
}

export interface FollowUp {
  /** Stable identity, e.g. "dine-visit:123" — used for snooze/dismiss state. */
  id: string;
  kind: "dining-booked" | "dining-visited" | "film-rate";
  title: string;
  prompt: string;
  cta: string;
  href: string;
  /** Offer a truthful escape hatch on booked follow-ups. */
  altAction?: "didnt-go";
  dueAt: string;
}

export type FollowUpState = Record<string, { snoozedUntil?: string; doneAt?: string }>;

// ── Tuning ───────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
/** Ask the morning after, not the minute after. */
export const DUE_AFTER_MS = 18 * HOUR;
/** Don't dredge up ancient history. */
export const EXPIRE_AFTER_MS = 30 * 24 * HOUR;
/** "Not now" quiets a follow-up for three days. */
export const SNOOZE_MS = 3 * 24 * HOUR;

function window_(at: string | null | undefined, now: Date): string | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const age = now.getTime() - t;
  if (age < DUE_AFTER_MS || age > EXPIRE_AFTER_MS) return null;
  return new Date(t + DUE_AFTER_MS).toISOString();
}

// ── Compute ──────────────────────────────────────────────────────────────────

export function computeFollowUps(input: {
  dining: DiningActivity[];
  films: FilmActivity[];
  now: Date;
}): FollowUp[] {
  const { now } = input;
  const out: FollowUp[] = [];

  for (const d of input.dining) {
    // Live Google entries have no routable detail page from a cold start.
    if (typeof d.id !== "number") continue;

    if (d.visited && !d.hasJournal) {
      const due = window_(d.visitedAt, now);
      if (due) {
        out.push({
          id: `dine-visit:${d.id}`,
          kind: "dining-visited",
          title: `How was ${d.name}?`,
          prompt: "You were there — a line or two now is a memory later.",
          cta: "Tell me about it",
          href: `/dining/${d.id}`,
          dueAt: due,
        });
      }
      continue; // visited outranks a stale booked flag on the same table
    }

    if (d.booked && !d.visited) {
      const due = window_(d.bookedAt, now);
      if (due) {
        out.push({
          id: `dine-booked:${d.id}`,
          kind: "dining-booked",
          title: `How was ${d.name}?`,
          prompt: "You had it booked — did it live up?",
          cta: "Tell me about it",
          href: `/dining/${d.id}`,
          altAction: "didnt-go",
          dueAt: due,
        });
      }
    }
  }

  for (const f of input.films) {
    if (f.status !== "watched" || f.rating != null) continue;
    const due = window_(f.updated_at, now);
    if (!due) continue;
    out.push({
      id: `film-rate:${f.media_type}:${f.tmdb_id}`,
      kind: "film-rate",
      title: `Worth it — ${f.title}?`,
      prompt: "You finished it. One tap keeps your taste honest.",
      cta: "Rate it",
      href: `/films/${f.media_type}/${f.tmdb_id}`,
      dueAt: due,
    });
  }

  // Oldest debt first; stable for equal times.
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
}

/** One question at a time — the least-recently-due, unsnoozed one. */
export function pickFollowUp(
  followUps: FollowUp[],
  state: FollowUpState,
  now: Date,
): FollowUp | null {
  for (const fu of followUps) {
    const s = state[fu.id];
    if (s?.doneAt) continue;
    if (s?.snoozedUntil && Date.parse(s.snoozedUntil) > now.getTime()) continue;
    return fu;
  }
  return null;
}

// ── Flag timestamps (shared by dining pages) ─────────────────────────────────

/**
 * Record WHEN a dining flag flipped on (`sr_dining_<flag>_at_<key>`), so
 * follow-ups know "a day has passed". Clearing the flag clears the stamp.
 */
export function stampDiningFlag(
  storageKey: number | string,
  flag: "saved" | "booked" | "visited",
  on: boolean,
): void {
  try {
    const k = `sr_dining_${flag}_at_${storageKey}`;
    if (on) localStorage.setItem(k, new Date().toISOString());
    else localStorage.removeItem(k);
  } catch { /* private mode */ }
}
