// ─────────────────────────────────────────────────────────────────────────────
// From intent to action (Obsession roadmap #10). "Want to go" used to lead
// nowhere — these are the handoffs that make plans real: booking deep links,
// maps, streaming/showtimes, and a calendar invite that carries the app's
// concierge notes (dress, arrival, best tables) into your evening.
// Pure string builders — testable, no browser APIs except downloadIcs.
// ─────────────────────────────────────────────────────────────────────────────

// ── Deep links ───────────────────────────────────────────────────────────────

export function resyUrl(name: string): string {
  return `https://resy.com/search?query=${encodeURIComponent(name)}`;
}

export function openTableUrl(name: string, city?: string | null): string {
  const term = city ? `${name} ${city}` : name;
  return `https://www.opentable.com/s?term=${encodeURIComponent(term)}`;
}

export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function justWatchUrl(title: string): string {
  return `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;
}

export function showtimesUrl(title: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${title} showtimes near me`)}`;
}

// ── Calendar (.ics) ──────────────────────────────────────────────────────────

export interface CalendarEvent {
  title: string;
  start: Date;
  durationMin: number;
  description?: string;
  location?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

/** RFC 5545 text escaping: backslash, semicolon, comma, newlines. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Deterministic given (event, uid, stamp) — see handoffs.selftest.ts. */
export function buildIcs(ev: CalendarEvent, uid: string, stamp: Date): string {
  const end = new Date(ev.start.getTime() + ev.durationMin * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Screening Room//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(stamp)}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ...(ev.location ? [`LOCATION:${esc(ev.location)}`] : []),
    ...(ev.description ? [`DESCRIPTION:${esc(ev.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** Browser-only: build the invite and hand it to the user as a download. */
export function downloadIcs(ev: CalendarEvent): void {
  const uid = `${ev.start.getTime()}-${ev.title.replace(/\W+/g, "").slice(0, 24)}@screening-room`;
  const blob = new Blob([buildIcs(ev, uid, new Date())], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ev.title.replace(/\W+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() + ".ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

// ── Time helpers ─────────────────────────────────────────────────────────────

/**
 * The coming Saturday at hh:mm local — a civilised default for making plans.
 * If it's already Saturday and the hour hasn't passed, that means tonight.
 */
export function nextSaturday(hour: number, minute = 0, from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

/** Format for an <input type="datetime-local"> value. */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
