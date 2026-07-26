// Self-contained tests for the handoff builders. Run with
// `node --import tsx artifacts/screening-room/src/lib/handoffs.selftest.ts`
import {
  resyUrl, openTableUrl, mapsUrl, justWatchUrl, showtimesUrl,
  buildIcs, nextSaturday, toLocalInput, type CalendarEvent,
} from "./handoffs";

export function runHandoffsSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  // URLs encode properly and point at the right hosts.
  ok(resyUrl("L'Artusi & Co") === "https://resy.com/search?query=L'Artusi%20%26%20Co", "resy: host + encoding");
  ok(openTableUrl("Carbone", "New York") === "https://www.opentable.com/s?term=Carbone%20New%20York", "opentable: name + city");
  ok(openTableUrl("Carbone") === "https://www.opentable.com/s?term=Carbone", "opentable: city optional");
  ok(mapsUrl("The Met, NYC").includes("google.com/maps/search/?api=1&query=The%20Met"), "maps: encoded query");
  ok(justWatchUrl("Past Lives").includes("justwatch.com/us/search?q=Past%20Lives"), "justwatch: encoded");
  ok(showtimesUrl("Dune").includes("Dune%20showtimes%20near%20me"), "showtimes: phrasing");

  // ICS: structure, timing math, escaping, determinism.
  {
    const ev: CalendarEvent = {
      title: "Dinner at Nonna; NYC",
      start: new Date("2026-07-18T23:30:00Z"),
      durationMin: 120,
      location: "12 Main St, New York",
      description: "Dress: smart\nOrder: the duck, obviously",
    };
    const stamp = new Date("2026-07-12T10:00:00Z");
    const ics = buildIcs(ev, "uid-1@screening-room", stamp);
    ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0"), "ics: header");
    ok(ics.includes("DTSTART:20260718T233000Z"), "ics: start in UTC");
    ok(ics.includes("DTEND:20260719T013000Z"), "ics: end = start + duration (crosses midnight)");
    ok(ics.includes("DTSTAMP:20260712T100000Z"), "ics: stamp");
    ok(ics.includes("SUMMARY:Dinner at Nonna\\; NYC"), "ics: semicolon escaped");
    ok(ics.includes("LOCATION:12 Main St\\, New York"), "ics: comma escaped");
    ok(ics.includes("Dress: smart\\nOrder: the duck\\, obviously"), "ics: newline + comma in description");
    ok(ics.endsWith("END:VCALENDAR\r\n"), "ics: terminated");
    ok(!ics.includes("\n") || ics.split("\r\n").length > 5, "ics: CRLF line endings");
    ok(ics === buildIcs(ev, "uid-1@screening-room", stamp), "ics: deterministic");
  }

  // nextSaturday: always a Saturday, always in the future, within 7 days.
  {
    for (const day of ["2026-07-06", "2026-07-10", "2026-07-11"]) { // Mon, Fri, Sat
      const from = new Date(`${day}T12:00:00`);
      const d = nextSaturday(19, 30, from);
      ok(d.getDay() === 6, `nextSat(${day}): is Saturday`);
      ok(d.getTime() > from.getTime(), `nextSat(${day}): in the future`);
      ok(d.getTime() - from.getTime() <= 7 * 86_400_000, `nextSat(${day}): within a week`);
      ok(d.getHours() === 19 && d.getMinutes() === 30, `nextSat(${day}): time set`);
    }
    // Saturday noon → tonight, not next week; Saturday 9pm → next week.
    const satNoon = new Date("2026-07-11T12:00:00");
    ok(nextSaturday(19, 30, satNoon).getDate() === 11, "nextSat: Saturday noon means tonight");
    const satLate = new Date("2026-07-11T21:00:00");
    ok(nextSaturday(19, 30, satLate).getDate() === 18, "nextSat: Saturday 9pm rolls to next week");
  }

  // datetime-local formatting round-trips.
  {
    const d = new Date(2026, 6, 18, 19, 30);
    ok(toLocalInput(d) === "2026-07-18T19:30", "toLocalInput: format");
    ok(new Date(toLocalInput(d)).getTime() === d.getTime(), "toLocalInput: round-trips");
  }

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runHandoffsSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("handoffs selftest: all passed");
}
