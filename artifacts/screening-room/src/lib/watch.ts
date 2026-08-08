// ─────────────────────────────────────────────────────────────────────────────
// "Table Watch + smart moments" (Obsession roadmap #8).
//
// The rest of the app answers questions the member asks. This one speaks
// first — but only when it has earned the right to. A watch is a standing
// request ("tell me when I can book Tatiana", "tell me when it's a good day
// for the High Line", "tell me when Severance is back"), and a *moment* is
// the one sentence worth interrupting someone for.
//
// Three sources, one shape:
//   release  — a reservation window opening, from the catalog booking policy
//   weather  — a genuinely good day for a saved place, from a 7-day forecast
//   episode  — the next episode of something they're watching
//
// Two rules run through all of it:
//
//   1. Silence beats noise. A moment fires once, is deduped by `fireKey`
//      against what the member last saw, and never restates itself.
//   2. Never claim more than the data supports. Booking policies are
//      editorial and carry a confidence; at "high" we name the hour, at "low"
//      we say "usually, around" and tell them to confirm. With no policy at
//      all we fall back to what `rope` honestly implies.
//
// Pure and deterministic: same inputs, same moments (see watch.selftest.ts).
// Data gathering lives in hooks/use-watch.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { resyUrl, openTableUrl } from "./handoffs";
import type { BookingPolicy, DiningItem, PlaceItem } from "@/types";

// ── Watches ──────────────────────────────────────────────────────────────────

export type WatchKind = "table" | "place" | "show";

/** A row of `public.watches` (see scripts/sql/watches.sql). */
export interface Watch {
  id: string;
  kind: WatchKind;
  /** Curated dining/place id, or TMDB id for a show — as text. */
  ref: string;
  title: string;
  subtitle?: string | null;
  note?: string | null;
  /** "2026-09-14" — the night they're aiming for, if they named one. */
  target_date?: string | null;
  party_size?: number | null;
  active?: boolean;
  /** The key of the last moment shown for this watch; stops repeats. */
  last_fired_key?: string | null;
}

// ── Moments ──────────────────────────────────────────────────────────────────

export type MomentKind = "release" | "weather" | "episode";

/** How much this wants the member's attention today. */
export type Urgency = "now" | "soon" | "later";

export interface Moment {
  /** Stable across renders: `${watchId}:${fireKey}`. */
  id: string;
  watchId: string;
  kind: MomentKind;
  urgency: Urgency;
  /**
   * What the engine would write to `watches.last_fired_key` if the member
   * dismisses this. Encodes the occasion, not the moment's wording.
   */
  fireKey: string;
  /** "Thursday" / "Tomorrow" / "Tonight". */
  when: string;
  title: string;
  sub: string;
  /** The one sentence. Truthful, and hedged when the data is soft. */
  line: string;
  /** Where the member goes to read more, inside the app. */
  href: string;
  /** The thing to actually do, when there is one. */
  action?: { label: string; href: string; external: boolean };
  /** Sort key; higher first. Exposed for testing. */
  rank: number;
}

// ── Inputs ───────────────────────────────────────────────────────────────────

/** One day of an Open-Meteo daily forecast, narrowed to what we use. */
export interface ForecastDay {
  /** "2026-08-14", local. */
  date: string;
  code: number;
  tempMax: number;
  tempMin: number;
  /** 0–100. */
  precipProb: number;
}

/** An upcoming or just-aired episode, from /notifications/episodes. */
export interface EpisodeInfo {
  tmdb_id: number;
  title: string;
  season_number: number;
  episode_number: number;
  episode_name: string;
  /** "2026-08-14". */
  air_date: string;
}

export interface WatchInput {
  now: Date;
  watches: Watch[];
  dining: DiningItem[];
  places: PlaceItem[];
  forecast?: ForecastDay[];
  episodes?: EpisodeInfo[];
}

// ── Dates ────────────────────────────────────────────────────────────────────
// Everything is local-calendar arithmetic on "YYYY-MM-DD" strings. Reservation
// releases and air dates are calendar facts, not instants, and treating them
// as instants is how you end up a day out for anyone west of Greenwich.

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Whole calendar days from a to b; negative when b is in the past. */
export function daysBetween(a: Date, b: Date): number {
  const x = new Date(a); x.setHours(0, 0, 0, 0);
  const y = new Date(b); y.setHours(0, 0, 0, 0);
  return Math.round((y.getTime() - x.getTime()) / 86_400_000);
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Today" / "Tomorrow" / "Thursday" / "Thursday the 14th" once it's far off. */
export function dayLabel(now: Date, target: Date): string {
  const delta = daysBetween(now, target);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  if (delta > 1 && delta <= 6) return WEEKDAY[target.getDay()];
  if (delta < -1 && delta >= -6) return `Last ${WEEKDAY[target.getDay()]}`;
  const month = target.toLocaleDateString("en-US", { month: "long" });
  return `${month} ${target.getDate()}`;
}

/** "10:00" → "10am", "19:30" → "7:30pm". */
export function prettyTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h24 = Number(m[1]);
  const mins = m[2];
  const ampm = h24 >= 12 ? "pm" : "am";
  const h = h24 % 12 || 12;
  return mins === "00" ? `${h}${ampm}` : `${h}:${mins}${ampm}`;
}

/** The next Friday or Saturday — what people mean by "sometime soon". */
export function impliedTarget(now: Date): Date {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(now, i);
    if (d.getDay() === 5 || d.getDay() === 6) return d;
  }
  return addDays(now, 7);
}

// ── Booking policy → a release date ──────────────────────────────────────────

/**
 * What `rope` implies when there's no editorial policy — the fallback for
 * everything that predates the booking backfill. Deliberately coarse: these
 * become "usually about a month ahead", never "opens at 10am".
 */
export function ropeDaysAhead(rope: number | undefined): number | null {
  switch (rope ?? 2) {
    case 1: return null; // walk-in; there is nothing to watch for
    case 2: return 14;
    case 3: return 28;
    case 4: return 30;
    default: return 60;
  }
}

/**
 * The date on which `target` becomes bookable.
 * Null when the policy has no release to compute (walk-in, waitlist).
 */
export function releaseDateFor(
  policy: BookingPolicy | undefined,
  rope: number | undefined,
  target: Date,
): Date | null {
  if (policy?.mode === "walk-in" || policy?.mode === "waitlist") return null;

  if (policy?.mode === "monthly" && policy.dayOfMonth) {
    // The whole month drops on one date in the preceding month.
    const drop = new Date(target.getFullYear(), target.getMonth() - 1, policy.dayOfMonth);
    drop.setHours(0, 0, 0, 0);
    return drop;
  }

  const ahead = policy?.mode === "rolling" && policy.daysAhead
    ? policy.daysAhead
    : ropeDaysAhead(rope);
  if (ahead == null) return null;
  return addDays(target, -ahead);
}

/** How specifically we're allowed to talk about a policy. */
function speaksPrecisely(policy: BookingPolicy | undefined): boolean {
  return policy?.confidence === "high" && !!policy.time;
}

// ── Release moments ──────────────────────────────────────────────────────────

function bookingAction(item: DiningItem): Moment["action"] {
  const platform = item.booking?.platform;
  if (platform === "OpenTable") {
    return { label: "Book on OpenTable", href: openTableUrl(item.name, item.city), external: true };
  }
  if (platform === "Phone" || platform === "Direct") {
    return { label: "Find the number", href: openTableUrl(item.name, item.city), external: true };
  }
  return { label: "Book on Resy", href: resyUrl(item.name), external: true };
}

function releaseMoment(w: Watch, item: DiningItem, now: Date): Moment | null {
  const policy = item.booking;
  const target = w.target_date ? parseYmd(w.target_date) : null;
  const sub = [item.cuisine, item.neighborhood].filter(Boolean).join(" · ");
  const href = `/dining/${item.id}`;
  // `soft`   — we can't name the hour.
  // `guessed`— there's no editorial policy at all, only what rope implies, so
  //            the member should be told to check rather than trust us.
  const soft = !speaksPrecisely(policy);
  const guessed = !policy;
  const caveat = guessed ? " Worth confirming with them." : "";

  // ── Walk-in: there's no window to watch. Say so once, usefully.
  // A rope of 1 means the same thing even where no policy was ever written,
  // so the pre-backfill catalog says something useful rather than nothing.
  const isWalkIn = policy?.mode === "walk-in" || (!policy && (item.rope ?? 2) <= 1);
  if (isWalkIn) {
    return {
      id: "", watchId: w.id, kind: "release", urgency: "later",
      fireKey: "walk-in",
      when: "Any night",
      title: item.name, sub, href,
      line: guessed
        ? "This one takes walk-ins as a rule — go early or go late."
        : "No reservations here — it's a walk-in. Go early or go late.",
      action: { label: "Directions", href: `/dining/${item.id}`, external: false },
      rank: 0,
    };
  }
  if (policy?.mode === "waitlist") {
    return {
      id: "", watchId: w.id, kind: "release", urgency: "later",
      fireKey: "waitlist",
      when: "Request only",
      title: item.name, sub, href,
      line: "Request-only — get your name down and they'll come back to you.",
      action: bookingAction(item),
      rank: 0,
    };
  }

  // ── With a date in mind, the release day is a real, dateable event.
  if (target) {
    if (daysBetween(now, target) < 0) return null; // the night has passed
    const release = releaseDateFor(policy, item.rope, target);
    if (!release) return null;

    const untilRelease = daysBetween(now, release);
    const targetLabel = dayLabel(now, target);

    if (untilRelease > 7) return null; // too far out to be a moment yet

    if (untilRelease > 0) {
      const at = soft ? "" : ` at ${prettyTime(policy!.time!)}`;
      const hedge = soft ? "should open" : "opens";
      return {
        id: "", watchId: w.id, kind: "release",
        urgency: untilRelease <= 2 ? "soon" : "later",
        fireKey: `release:${ymd(release)}`,
        when: dayLabel(now, release),
        title: item.name, sub, href,
        line: `${targetLabel === "Today" ? "Your night" : targetLabel} ${hedge} for booking ${dayLabel(now, release).toLowerCase()}${at}.${caveat}`,
        action: bookingAction(item),
        rank: 0,
      };
    }

    if (untilRelease === 0) {
      const at = soft ? "today" : `today at ${prettyTime(policy!.time!)}`;
      return {
        id: "", watchId: w.id, kind: "release", urgency: "now",
        fireKey: `release:${ymd(release)}`,
        when: "Today",
        title: item.name, sub, href,
        line: soft
          ? `${targetLabel} should open ${at} — this is the day to try.${caveat}`
          : `${targetLabel} opens ${at}. Be ready.`,
        action: bookingAction(item),
        rank: 0,
      };
    }

    // Already open. Worth one nudge, and only while the night is still close.
    const untilTarget = daysBetween(now, target);
    if (untilTarget <= 21) {
      return {
        id: "", watchId: w.id, kind: "release", urgency: "now",
        fireKey: `open:${ymd(target)}`,
        when: targetLabel,
        title: item.name, sub, href,
        line: (item.rope ?? 2) >= 4
          ? `${targetLabel} is already bookable — and a table like this won't sit there.`
          : `${targetLabel} is bookable now.`,
        action: bookingAction(item),
        rank: 0,
      };
    }
    return null;
  }

  // ── No date in mind. Tell them the shape of the thing, once.
  if (policy?.mode === "monthly" && policy.dayOfMonth) {
    // The next drop, this month or next.
    let drop = new Date(now.getFullYear(), now.getMonth(), policy.dayOfMonth);
    drop.setHours(0, 0, 0, 0);
    if (daysBetween(now, drop) < 0) drop = new Date(now.getFullYear(), now.getMonth() + 1, policy.dayOfMonth);
    const until = daysBetween(now, drop);
    if (until > 5) return null;
    const month = addDays(drop, 40).toLocaleDateString("en-US", { month: "long" });
    const at = speaksPrecisely(policy) ? ` at ${prettyTime(policy.time!)}` : "";
    return {
      id: "", watchId: w.id, kind: "release",
      urgency: until === 0 ? "now" : "soon",
      fireKey: `drop:${ymd(drop)}`,
      when: dayLabel(now, drop),
      title: item.name, sub, href,
      line: `The whole of ${month} drops ${dayLabel(now, drop).toLowerCase()}${at}. That's the one chance.`,
      action: bookingAction(item),
      rank: 0,
    };
  }

  // Rolling, no target: the useful fact is the horizon, and it's worth saying
  // exactly once — hence a fireKey with no date in it.
  const ahead = policy?.mode === "rolling" && policy.daysAhead
    ? policy.daysAhead
    : ropeDaysAhead(item.rope);
  if (ahead == null) return null;
  const first = addDays(now, ahead);
  const known = policy?.confidence === "high" || policy?.confidence === "medium";
  return {
    id: "", watchId: w.id, kind: "release", urgency: "later",
    fireKey: `horizon:${ahead}`,
    when: dayLabel(now, first),
    title: item.name, sub, href,
    line: known
      ? `Books ${ahead} days out — the earliest you could sit down is ${dayLabel(now, first).toLowerCase()}. Tell me the night and I'll warn you when it opens.`
      : `Tables like this usually open about ${ahead} days ahead, so think ${dayLabel(now, first).toLowerCase()}. Tell me the night and I'll remind you to try.`,
    action: bookingAction(item),
    rank: 0,
  };
}

// ── Weather moments ──────────────────────────────────────────────────────────

const CLEAR = new Set([0, 1, 2]);
const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);

/** 0–1: how good this day is for being outside. */
export function outdoorScore(d: ForecastDay): number {
  if (SNOW.has(d.code) || WET.has(d.code)) return 0;
  let s = CLEAR.has(d.code) ? 1 : 0.55;
  if (d.precipProb >= 50) s *= 0.3;
  else if (d.precipProb >= 25) s *= 0.7;
  // Comfort band. Pleasant is roughly 58–82°F.
  if (d.tempMax >= 58 && d.tempMax <= 82) s *= 1;
  else if (d.tempMax > 82 && d.tempMax <= 92) s *= 0.7;
  else if (d.tempMax >= 45 && d.tempMax < 58) s *= 0.7;
  else s *= 0.3;
  return s;
}

function weatherMoment(w: Watch, place: PlaceItem, now: Date, forecast: ForecastDay[]): Moment | null {
  if (!forecast.length) return null;
  const sub = [place.area, place.city || "New York"].filter(Boolean).join(" · ");
  const href = `/places/${place.id}`;

  // A place flagged rain-friendly isn't waiting on the weather. Its moment is
  // the opposite one: the wet day when everywhere else is a bad idea.
  if (place.rain) {
    const wet = forecast.find((d) => WET.has(d.code) || d.precipProb >= 60);
    if (!wet) return null;
    const day = parseYmd(wet.date);
    if (!day) return null;
    const until = daysBetween(now, day);
    if (until < 0 || until > 6) return null;
    return {
      id: "", watchId: w.id, kind: "weather",
      urgency: until === 0 ? "now" : until <= 2 ? "soon" : "later",
      fireKey: `wet:${wet.date}`,
      when: dayLabel(now, day),
      title: place.name, sub, href,
      line: `${dayLabel(now, day)} looks wet — which is exactly when this one is worth doing.`,
      rank: 0,
    };
  }

  // Otherwise: the best day in the window, and only if it's genuinely good.
  let best: { day: ForecastDay; score: number } | null = null;
  for (const d of forecast) {
    const day = parseYmd(d.date);
    if (!day) continue;
    const until = daysBetween(now, day);
    if (until < 0 || until > 6) continue;
    const score = outdoorScore(d);
    // Sooner wins ties, so the member acts on the nearer of two equal days.
    if (!best || score > best.score) best = { day: d, score };
  }
  if (!best || best.score < 0.7) return null;

  const day = parseYmd(best.day.date)!;
  const until = daysBetween(now, day);
  const temp = Math.round(best.day.tempMax);
  const sunset = (place.badges ?? []).includes("Best at Sunset");
  const seasonNote = place.seasonal && /spring|summer|autumn|fall|winter|bloom/i.test(place.seasonal);

  return {
    id: "", watchId: w.id, kind: "weather",
    urgency: until === 0 ? "now" : until <= 2 ? "soon" : "later",
    fireKey: `clear:${best.day.date}`,
    when: dayLabel(now, day),
    title: place.name, sub, href,
    line: sunset
      ? `${dayLabel(now, day)} looks clear and ${temp}° — get there an hour before sunset.`
      : seasonNote
        ? `${dayLabel(now, day)}: clear, ${temp}°. The right kind of day for this one.`
        : `${dayLabel(now, day)} looks clear and ${temp}° — a good window for it.`,
    rank: 0,
  };
}

// ── Episode moments ──────────────────────────────────────────────────────────

function episodeMoment(w: Watch, ep: EpisodeInfo, now: Date): Moment | null {
  const air = parseYmd(ep.air_date);
  if (!air) return null;
  const delta = daysBetween(now, air);
  if (delta > 7 || delta < -7) return null;

  const code = `S${ep.season_number}E${ep.episode_number}`;
  const sub = [code, ep.episode_name].filter(Boolean).join(" · ");
  const href = `/films/tv/${ep.tmdb_id}`;

  if (delta === 0) {
    return {
      id: "", watchId: w.id, kind: "episode", urgency: "now",
      fireKey: `ep:${ep.air_date}:${code}`,
      when: "Tonight",
      title: ep.title, sub, href,
      line: `${code} lands today. Clear an hour.`,
      rank: 0,
    };
  }
  if (delta > 0) {
    return {
      id: "", watchId: w.id, kind: "episode",
      urgency: delta <= 2 ? "soon" : "later",
      fireKey: `ep:${ep.air_date}:${code}`,
      when: dayLabel(now, air),
      title: ep.title, sub, href,
      line: `${code} arrives ${dayLabel(now, air).toLowerCase()}.`,
      rank: 0,
    };
  }
  return {
    id: "", watchId: w.id, kind: "episode", urgency: "soon",
    fireKey: `ep:${ep.air_date}:${code}`,
    when: dayLabel(now, air),
    title: ep.title, sub, href,
    line: `${code} aired ${dayLabel(now, air).toLowerCase()} — it's waiting for you.`,
    rank: 0,
  };
}

// ── Ranking ──────────────────────────────────────────────────────────────────

const URGENCY_RANK: Record<Urgency, number> = { now: 100, soon: 50, later: 10 };
// A reservation window is the most perishable thing here: miss it and the
// answer is "next month". An episode keeps. Good weather half-keeps.
const KIND_RANK: Record<MomentKind, number> = { release: 6, episode: 3, weather: 4 };

function rankOf(m: Moment): number {
  return URGENCY_RANK[m.urgency] + KIND_RANK[m.kind];
}

// ── Compose ──────────────────────────────────────────────────────────────────

/**
 * Everything currently worth saying, most urgent first. Moments the member
 * has already been shown (matched on `fireKey`) are left out.
 */
export function composeMoments(input: WatchInput): Moment[] {
  const { now, watches } = input;
  const diningById = new Map(input.dining.map((d) => [String(d.id), d]));
  const placeById = new Map(input.places.map((p) => [String(p.id), p]));
  const epById = new Map((input.episodes ?? []).map((e) => [String(e.tmdb_id), e]));
  const forecast = input.forecast ?? [];

  const out: Moment[] = [];

  for (const w of watches) {
    if (w.active === false) continue;
    let m: Moment | null = null;

    if (w.kind === "table") {
      const item = diningById.get(w.ref);
      if (item) m = releaseMoment(w, item, now);
    } else if (w.kind === "place") {
      const place = placeById.get(w.ref);
      if (place) m = weatherMoment(w, place, now, forecast);
    } else {
      const ep = epById.get(w.ref);
      if (ep) m = episodeMoment(w, ep, now);
    }

    if (!m) continue;
    // Already said. Saying it again is how a concierge becomes a notification.
    if (w.last_fired_key && w.last_fired_key === m.fireKey) continue;

    m.id = `${w.id}:${m.fireKey}`;
    m.rank = rankOf(m);
    out.push(m);
  }

  // Deterministic: rank, then watch id, so equal moments never shuffle.
  return out.sort((a, b) => b.rank - a.rank || a.watchId.localeCompare(b.watchId));
}

/** The handful the hub is allowed to show. Anything more is a notification feed. */
export function liveMoments(input: WatchInput, limit = 3): Moment[] {
  return composeMoments(input)
    .filter((m) => m.urgency !== "later")
    .slice(0, limit);
}
