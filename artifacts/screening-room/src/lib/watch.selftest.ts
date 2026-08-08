// Self-contained tests for the Table Watch moment engine (roadmap #8). Run with
// `node --import tsx artifacts/screening-room/src/lib/watch.selftest.ts`
import {
  composeMoments,
  dayLabel,
  daysBetween,
  impliedTarget,
  liveMoments,
  outdoorScore,
  prettyTime,
  releaseDateFor,
  ropeDaysAhead,
  ymd,
  type EpisodeInfo,
  type ForecastDay,
  type Watch,
  type WatchInput,
} from "./watch";
import type { BookingPolicy, DiningItem, PlaceItem } from "@/types";

// Monday 10 August 2026, mid-morning.
const NOW = new Date("2026-08-10T10:00:00");

function d(offsetDays: number): string {
  const x = new Date(NOW);
  x.setDate(x.getDate() + offsetDays);
  x.setHours(0, 0, 0, 0);
  return ymd(x);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function dn(partial: Partial<DiningItem>): DiningItem {
  return {
    id: 1, name: "Resto", cuisine: "Italian", format: "Trattoria", neighborhood: "SoHo",
    borough: "Manhattan", price: 3, rope: 3, occasion: ["Date night"], recognition: "",
    signature: "", blurb: "", city: "New York", ...partial,
  } as DiningItem;
}

function pl(partial: Partial<PlaceItem>): PlaceItem {
  return {
    id: 1, name: "Place", area: "Midtown", vibe: "", styles: [], moods: [],
    best: "", dur: 60, crowd: "Moderate", price: "Free", dress: "", hours: "", resv: "",
    photo: "", cafe: "", dinner: "", insider: "", worth: "", skip: "", badges: [],
    scores: { b: 5, u: 5, e: 5, c: 5, v: 5, l: 5 }, rain: false, img: null,
    city: "New York", ...partial,
  } as PlaceItem;
}

function wt(partial: Partial<Watch>): Watch {
  return { id: "w1", kind: "table", ref: "1", title: "Resto", ...partial } as Watch;
}

function fc(offset: number, over: Partial<ForecastDay> = {}): ForecastDay {
  return { date: d(offset), code: 0, tempMax: 72, tempMin: 60, precipProb: 5, ...over };
}

function input(over: Partial<WatchInput> = {}): WatchInput {
  return { now: NOW, watches: [], dining: [], places: [], ...over };
}

// ── Tests ────────────────────────────────────────────────────────────────────

export function runWatchSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  // ── Date helpers
  {
    ok(ymd(new Date(2026, 7, 3)) === "2026-08-03", "ymd: zero-padded local date");
    ok(daysBetween(NOW, new Date("2026-08-13T23:00:00")) === 3, "daysBetween: whole calendar days");
    ok(daysBetween(NOW, new Date("2026-08-09T01:00:00")) === -1, "daysBetween: negative for the past");
    ok(dayLabel(NOW, new Date("2026-08-10T22:00:00")) === "Today", "dayLabel: today");
    ok(dayLabel(NOW, new Date("2026-08-11T00:00:00")) === "Tomorrow", "dayLabel: tomorrow");
    ok(dayLabel(NOW, new Date("2026-08-13T00:00:00")) === "Thursday", "dayLabel: weekday inside the week");
    ok(dayLabel(NOW, new Date("2026-09-14T00:00:00")) === "September 14", "dayLabel: a date once it's far off");
    ok(prettyTime("10:00") === "10am" && prettyTime("19:30") === "7:30pm", "prettyTime: reads like a person");
    // 10 Aug 2026 is a Monday, so the implied target is Friday the 14th.
    ok(ymd(impliedTarget(NOW)) === "2026-08-14", "impliedTarget: the coming Friday");
  }

  // ── Release date arithmetic
  {
    const target = new Date(2026, 8, 14); // 14 Sep
    const rolling: BookingPolicy = { mode: "rolling", daysAhead: 30, confidence: "high", time: "10:00" };
    ok(ymd(releaseDateFor(rolling, 4, target)!) === "2026-08-15", "release: rolling counts back daysAhead");

    const monthly: BookingPolicy = { mode: "monthly", dayOfMonth: 1, confidence: "high" };
    ok(ymd(releaseDateFor(monthly, 4, target)!) === "2026-08-01", "release: monthly drops the month before");

    const walkin: BookingPolicy = { mode: "walk-in", confidence: "low" };
    ok(releaseDateFor(walkin, 1, target) === null, "release: a walk-in has nothing to open");
    ok(releaseDateFor({ mode: "waitlist", confidence: "low" }, 3, target) === null, "release: a waitlist has nothing to open");

    // No policy at all — the pre-backfill case.
    ok(ymd(releaseDateFor(undefined, 3, target)!) === "2026-08-17", "release: falls back to what rope implies");
    ok(ropeDaysAhead(1) === null, "rope: a walk-in implies no window");
    ok(ropeDaysAhead(4)! > ropeDaysAhead(2)!, "rope: harder tables open further out");
  }

  // ── A named night, and the window opening on it
  {
    const item = dn({ id: 10, name: "Tatiana", rope: 4,
      booking: { mode: "rolling", daysAhead: 30, time: "10:00", platform: "Resy", confidence: "high" } });
    // Target 40 days out → release in 10 days → too far to be a moment.
    const far = composeMoments(input({
      dining: [item], watches: [wt({ ref: "10", target_date: d(40) })],
    }));
    ok(far.length === 0, "release: a window ten days out is not yet a moment");

    // Target 33 days out → release in 3 days.
    const soon = composeMoments(input({
      dining: [item], watches: [wt({ ref: "10", target_date: d(33) })],
    }))[0];
    ok(!!soon && soon.urgency === "later", "release: three days out is on the list, not urgent");
    ok(!!soon && soon.fireKey === `release:${d(3)}`, "release: fireKey names the release date");

    // Target 31 days out → release tomorrow.
    const tomorrow = composeMoments(input({
      dining: [item], watches: [wt({ ref: "10", target_date: d(31) })],
    }))[0];
    ok(tomorrow.urgency === "soon", "release: two days or less is soon");
    ok(/10am/.test(tomorrow.line), "release: high confidence names the hour");

    // Target exactly 30 days out → release today.
    const today = composeMoments(input({
      dining: [item], watches: [wt({ ref: "10", target_date: d(30) })],
    }))[0];
    ok(today.urgency === "now", "release: today is urgent");
    ok(today.when === "Today" && /Be ready/.test(today.line), "release: today reads like a countdown");
    ok(!!today.action?.href.includes("resy.com"), "release: Resy policy routes to Resy");
  }

  // ── Confidence governs how specifically we speak
  {
    const low = dn({ id: 11, name: "Softly", rope: 4,
      booking: { mode: "rolling", daysAhead: 30, confidence: "low" } });
    const m = composeMoments(input({
      dining: [low], watches: [wt({ ref: "11", target_date: d(30) })],
    }))[0];
    ok(!!m, "confidence: a low-confidence policy still produces a moment");
    ok(/should open/.test(m.line), "confidence: low hedges rather than asserting");
    ok(!/\d+(am|pm)/.test(m.line), "confidence: low never names an hour");

    const high = dn({ id: 12, name: "Firmly", rope: 4,
      booking: { mode: "rolling", daysAhead: 30, time: "09:00", confidence: "high" } });
    const m2 = composeMoments(input({
      dining: [high], watches: [wt({ id: "w2", ref: "12", target_date: d(30) })],
    }))[0];
    ok(/9am/.test(m2.line) && !/should/.test(m2.line), "confidence: high speaks plainly");

    // High confidence with no time can't name an hour either.
    const noTime = dn({ id: 13, name: "Timeless", rope: 4,
      booking: { mode: "rolling", daysAhead: 30, confidence: "high" } });
    const m3 = composeMoments(input({
      dining: [noTime], watches: [wt({ id: "w3", ref: "13", target_date: d(30) })],
    }))[0];
    ok(!/\d+(am|pm)/.test(m3.line), "confidence: no time means no hour, whatever the confidence says");
  }

  // ── No policy at all: the pre-backfill catalog still says something useful
  {
    const bare = dn({ id: 14, name: "Unknown Policy", rope: 4 });
    const m = composeMoments(input({
      dining: [bare], watches: [wt({ ref: "14", target_date: d(30) })],
    }))[0];
    ok(!!m, "no policy: rope alone still produces a moment");
    ok(/should open/.test(m.line) && /confirming/.test(m.line),
      "no policy: hedged and tells them to check");
  }

  // ── Already open, and the nudge that follows
  {
    const item = dn({ id: 15, name: "Open Now", rope: 4,
      booking: { mode: "rolling", daysAhead: 30, time: "10:00", confidence: "high" } });
    const m = composeMoments(input({
      dining: [item], watches: [wt({ ref: "15", target_date: d(7) })],
    }))[0];
    ok(m.urgency === "now" && m.fireKey === `open:${d(7)}`, "open: a bookable night is urgent");
    ok(/won't sit there/.test(m.line), "open: a rope-4 table gets an honest push");

    const easy = dn({ id: 16, name: "Easy Table", rope: 2,
      booking: { mode: "rolling", daysAhead: 14, confidence: "medium" } });
    const m2 = composeMoments(input({
      dining: [easy], watches: [wt({ id: "w2", ref: "16", target_date: d(7) })],
    }))[0];
    ok(!/won't sit there/.test(m2.line), "open: an easy table doesn't get the hard sell");

    // A night that has already passed is not a moment.
    const past = composeMoments(input({
      dining: [item], watches: [wt({ ref: "15", target_date: d(-2) })],
    }));
    ok(past.length === 0, "open: a night in the past is dropped");
  }

  // ── Walk-ins and waitlists say the true thing instead
  {
    const walkin = dn({ id: 17, name: "No Bookings", rope: 1, booking: { mode: "walk-in", confidence: "low" } });
    const m = composeMoments(input({ dining: [walkin], watches: [wt({ ref: "17" })] }))[0];
    ok(m.fireKey === "walk-in" && /walk-in/i.test(m.line), "walk-in: says there's nothing to book");
    ok(m.urgency === "later", "walk-in: never urgent");

    const wl = dn({ id: 18, name: "List Only", rope: 5, booking: { mode: "waitlist", confidence: "low" } });
    const m2 = composeMoments(input({ dining: [wl], watches: [wt({ ref: "18" })] }))[0];
    ok(/request-only/i.test(m2.line), "waitlist: says how it actually works");

    // The pre-backfill catalog has no policies at all, so rope has to carry it:
    // an easy table should still say something rather than going silent.
    const bareEasy = dn({ id: 23, name: "Just Turn Up", rope: 1 });
    const m3 = composeMoments(input({ dining: [bareEasy], watches: [wt({ ref: "23" })] }))[0];
    ok(!!m3 && m3.fireKey === "walk-in", "walk-in: rope 1 with no policy is still a walk-in");
    ok(/as a rule/.test(m3.line), "walk-in: and it hedges, because nobody wrote that down");
  }

  // ── Monthly drops
  {
    // Drop on the 12th — two days from Monday the 10th.
    const item = dn({ id: 19, name: "Monthly Temple", rope: 5,
      booking: { mode: "monthly", dayOfMonth: 12, time: "10:00", confidence: "high" } });
    const m = composeMoments(input({ dining: [item], watches: [wt({ ref: "19" })] }))[0];
    ok(!!m && m.urgency === "soon", "monthly: an imminent drop is soon");
    ok(/whole of September/.test(m.line), "monthly: names the month that's dropping");
    ok(/10am/.test(m.line), "monthly: names the hour when it's known");

    // A drop three weeks out isn't news yet.
    const far = dn({ id: 20, name: "Later Temple", rope: 5,
      booking: { mode: "monthly", dayOfMonth: 28, confidence: "medium" } });
    ok(composeMoments(input({ dining: [far], watches: [wt({ ref: "20" })] })).length === 0,
      "monthly: a distant drop stays quiet");
  }

  // ── No target date: tell them the horizon, once
  {
    const item = dn({ id: 21, name: "Horizon", rope: 4,
      booking: { mode: "rolling", daysAhead: 30, confidence: "medium" } });
    const m = composeMoments(input({ dining: [item], watches: [wt({ ref: "21" })] }))[0];
    ok(m.fireKey === "horizon:30", "horizon: fireKey has no date, so it fires once ever");
    ok(/Books 30 days out/.test(m.line), "horizon: states the window");
    ok(/Tell me the night/.test(m.line), "horizon: asks for the one thing that would sharpen it");

    const vague = dn({ id: 22, name: "Guessing", rope: 3 });
    const m2 = composeMoments(input({ dining: [vague], watches: [wt({ ref: "22" })] }))[0];
    ok(/usually open about/.test(m2.line), "horizon: no policy means hedged language");
  }

  // ── Weather windows
  {
    const park = pl({ id: 30, name: "The High Line", rain: false });
    const forecast = [
      fc(0, { code: 61, precipProb: 80 }),
      fc(1, { code: 3, precipProb: 40, tempMax: 66 }),
      fc(2, { code: 0, precipProb: 5, tempMax: 74 }),
      fc(3, { code: 0, precipProb: 5, tempMax: 71 }),
    ];
    const m = composeMoments(input({
      places: [park], forecast,
      watches: [wt({ kind: "place", ref: "30", title: "The High Line" })],
    }))[0];
    ok(!!m && m.kind === "weather", "weather: a clear day produces a moment");
    ok(m.when === "Wednesday", "weather: picks the best day, not the nearest");
    ok(/74°/.test(m.line), "weather: names the temperature");
    ok(m.fireKey === `clear:${d(2)}`, "weather: fireKey is the day itself");

    // Nothing good in the window → nothing to say.
    const grim = [fc(0, { code: 61, precipProb: 90 }), fc(1, { code: 63, precipProb: 85 })];
    ok(composeMoments(input({
      places: [park], forecast: grim,
      watches: [wt({ kind: "place", ref: "30" })],
    })).length === 0, "weather: a bad week stays silent");

    // A rain-friendly place wants the opposite day.
    const museum = pl({ id: 31, name: "The Frick", rain: true });
    const m2 = composeMoments(input({
      places: [museum], forecast: grim,
      watches: [wt({ kind: "place", ref: "31", title: "The Frick" })],
    }))[0];
    ok(!!m2 && /wet/.test(m2.line), "weather: an indoor place is recommended *because* of the rain");
    ok(m2.fireKey.startsWith("wet:"), "weather: indoor moments key off the wet day");

    // Sunset places get sunset advice.
    const sunset = pl({ id: 32, name: "Brooklyn Bridge Park", badges: ["Best at Sunset"] });
    const m3 = composeMoments(input({
      places: [sunset], forecast,
      watches: [wt({ kind: "place", ref: "32" })],
    }))[0];
    ok(/before sunset/.test(m3.line), "weather: a sunset place says when to arrive");
  }

  // ── outdoorScore behaves sensibly
  {
    ok(outdoorScore(fc(0)) > 0.9, "outdoor: clear and 72° is as good as it gets");
    ok(outdoorScore(fc(0, { code: 61 })) === 0, "outdoor: rain is disqualifying");
    ok(outdoorScore(fc(0, { code: 71 })) === 0, "outdoor: so is snow");
    ok(outdoorScore(fc(0, { tempMax: 99 })) < 0.5, "outdoor: 99° is not a nice day out");
    ok(outdoorScore(fc(0, { precipProb: 60 })) < outdoorScore(fc(0)), "outdoor: a wet forecast dulls a clear code");
  }

  // ── Episodes
  {
    const eps: EpisodeInfo[] = [
      { tmdb_id: 900, title: "Severance", season_number: 3, episode_number: 4, episode_name: "Cold Harbor", air_date: d(0) },
    ];
    const m = composeMoments(input({
      episodes: eps, watches: [wt({ kind: "show", ref: "900", title: "Severance" })],
    }))[0];
    ok(m.urgency === "now" && m.when === "Tonight", "episode: airing today is tonight");
    ok(/S3E4/.test(m.sub) && /S3E4 lands today/.test(m.line), "episode: names the episode");
    ok(m.href === "/films/tv/900", "episode: routes into the app");

    const future: EpisodeInfo[] = [{ ...eps[0], air_date: d(5) }];
    const m2 = composeMoments(input({
      episodes: future, watches: [wt({ kind: "show", ref: "900" })],
    }))[0];
    ok(m2.urgency === "later" && /arrives saturday/i.test(m2.line), "episode: names the day it lands");

    const aired: EpisodeInfo[] = [{ ...eps[0], air_date: d(-3) }];
    const m3 = composeMoments(input({
      episodes: aired, watches: [wt({ kind: "show", ref: "900" })],
    }))[0];
    ok(/waiting for you/.test(m3.line), "episode: a missed one is a gentle nudge, not an alarm");

    const ancient: EpisodeInfo[] = [{ ...eps[0], air_date: d(-30) }];
    ok(composeMoments(input({
      episodes: ancient, watches: [wt({ kind: "show", ref: "900" })],
    })).length === 0, "episode: a month-old episode is not news");
  }

  // ── Silence beats noise
  {
    const item = dn({ id: 40, name: "Repeat", rope: 4,
      booking: { mode: "rolling", daysAhead: 30, time: "10:00", confidence: "high" } });
    const first = composeMoments(input({
      dining: [item], watches: [wt({ ref: "40", target_date: d(30) })],
    }))[0];
    ok(!!first, "dedupe: the moment fires the first time");

    const again = composeMoments(input({
      dining: [item],
      watches: [wt({ ref: "40", target_date: d(30), last_fired_key: first.fireKey })],
    }));
    ok(again.length === 0, "dedupe: the same moment does not fire twice");

    // A different occasion for the same watch still gets through.
    const moved = composeMoments(input({
      dining: [item],
      watches: [wt({ ref: "40", target_date: d(31), last_fired_key: first.fireKey })],
    }));
    ok(moved.length === 1, "dedupe: a new release date is a new moment");

    // An inactive watch is silent regardless.
    ok(composeMoments(input({
      dining: [item], watches: [wt({ ref: "40", target_date: d(30), active: false })],
    })).length === 0, "dedupe: a paused watch says nothing");
  }

  // ── Ranking and the hub's short list
  {
    const item = dn({ id: 50, name: "Urgent Table", rope: 4,
      booking: { mode: "rolling", daysAhead: 30, time: "10:00", confidence: "high" } });
    const park = pl({ id: 51, name: "Park" });
    const eps: EpisodeInfo[] = [
      { tmdb_id: 52, title: "Show", season_number: 1, episode_number: 2, episode_name: "Two", air_date: d(0) },
    ];
    const all = composeMoments(input({
      dining: [item], places: [park], episodes: eps,
      forecast: [fc(1, { tempMax: 73 })],
      watches: [
        wt({ id: "a", kind: "place", ref: "51" }),
        wt({ id: "b", kind: "show", ref: "52" }),
        wt({ id: "c", kind: "table", ref: "50", target_date: d(30) }),
      ],
    }));
    ok(all.length === 3, "rank: all three kinds compose together");
    ok(all[0].kind === "release", "rank: a reservation window outranks the rest at equal urgency");
    ok(all.every((m, i) => i === 0 || all[i - 1].rank >= m.rank), "rank: sorted descending");

    // Determinism.
    const twice = composeMoments(input({
      dining: [item], places: [park], episodes: eps,
      forecast: [fc(1, { tempMax: 73 })],
      watches: [
        wt({ id: "a", kind: "place", ref: "51" }),
        wt({ id: "b", kind: "show", ref: "52" }),
        wt({ id: "c", kind: "table", ref: "50", target_date: d(30) }),
      ],
    }));
    ok(JSON.stringify(all) === JSON.stringify(twice), "rank: deterministic");

    // The hub only takes what's actually live.
    const live = liveMoments(input({
      dining: [item], places: [park], episodes: eps,
      forecast: [fc(1, { tempMax: 73 })],
      watches: [
        wt({ id: "a", kind: "place", ref: "51" }),
        wt({ id: "b", kind: "show", ref: "52" }),
        wt({ id: "c", kind: "table", ref: "50", target_date: d(30) }),
        wt({ id: "e", kind: "table", ref: "50", target_date: d(300) }),
      ],
    }), 2);
    ok(live.length === 2, "live: respects the limit");
    ok(live.every((m) => m.urgency !== "later"), "live: nothing merely eventual reaches the hub");
  }

  // ── Missing references degrade quietly
  {
    ok(composeMoments(input({ watches: [wt({ ref: "999" })] })).length === 0,
      "missing: a watch on something not in the catalog is skipped, not thrown");
    ok(composeMoments(input({ watches: [wt({ kind: "show", ref: "999" })] })).length === 0,
      "missing: a show with no episode data is skipped");
    ok(composeMoments(input({
      places: [pl({ id: 1 })], watches: [wt({ kind: "place", ref: "1" })],
    })).length === 0, "missing: no forecast means no weather moment");
  }

  // ── Every moment is well-formed
  {
    const item = dn({ id: 60, name: "Shape Check", rope: 4,
      booking: { mode: "rolling", daysAhead: 30, time: "10:00", platform: "OpenTable", confidence: "high" } });
    const all = composeMoments(input({
      dining: [item],
      places: [pl({ id: 61, name: "Park" })],
      forecast: [fc(1, { tempMax: 73 })],
      episodes: [{ tmdb_id: 62, title: "Show", season_number: 1, episode_number: 1, episode_name: "One", air_date: d(1) }],
      watches: [
        wt({ id: "a", ref: "60", target_date: d(30) }),
        wt({ id: "b", kind: "place", ref: "61" }),
        wt({ id: "c", kind: "show", ref: "62" }),
      ],
    }));
    for (const m of all) {
      ok(m.id === `${m.watchId}:${m.fireKey}`, `shape: ${m.kind} id is watch plus fireKey`);
      ok(m.line.length > 0 && /[.!?]$/.test(m.line), `shape: ${m.kind} line is a sentence`);
      ok(/^\/(dining|places|films)\//.test(m.href), `shape: ${m.kind} href is routable`);
      ok(m.when.length > 0, `shape: ${m.kind} has a when`);
      ok(m.rank > 0, `shape: ${m.kind} is ranked`);
    }
    const table = all.find((m) => m.kind === "release")!;
    ok(!!table.action?.href.includes("opentable.com"), "shape: an OpenTable policy routes to OpenTable");
  }

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runWatchSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("watch selftest: all passed");
}
