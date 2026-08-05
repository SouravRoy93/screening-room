// Self-contained tests for the "Perfect Evening" engine (roadmap #7). Run with
// `node --import tsx artifacts/screening-room/src/lib/evening.selftest.ts`
import {
  OCCASIONS,
  arcStart,
  composeEvening,
  eveningCities,
  isNightcap,
  occasionById,
  pickCity,
  type EveningInput,
  type OccasionId,
} from "./evening";
import type { HistoryEntry } from "./pairing";
import type { DiningItem, MediaItem, PlaceItem } from "@/types";

const FRIDAY_NOON = new Date("2026-07-10T12:00:00"); // whole evening still ahead
const FRIDAY_LATE = new Date("2026-07-10T23:10:00"); // too late to salvage

// ── Fixtures ─────────────────────────────────────────────────────────────────

function dn(partial: Partial<DiningItem>): DiningItem {
  return {
    id: 1, name: "Resto", cuisine: "Italian", format: "Trattoria", neighborhood: "SoHo",
    borough: "Manhattan", price: 2, rope: 2, occasion: ["Casual"], recognition: "",
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

function fm(partial: Partial<MediaItem>): MediaItem {
  return {
    tmdb_id: 1, media_type: "movie", title: "Film", year: 2024, genres: ["Drama"],
    poster_path: null, vote_average: 7, popularity: 100, ...partial,
  } as MediaItem;
}

/** A catalog big enough to clear the city-readiness gate. */
function bulkDining(n: number, from = 500): DiningItem[] {
  return Array.from({ length: n }, (_, i) =>
    dn({ id: from + i, name: `Filler ${i}`, cuisine: "American", neighborhood: "Filler" }),
  );
}
function bulkPlaces(n: number, from = 500): PlaceItem[] {
  return Array.from({ length: n }, (_, i) =>
    pl({ id: from + i, name: `Filler place ${i}`, area: "Filler" }),
  );
}

function baseInput(occasion: OccasionId, over: Partial<EveningInput> = {}): EveningInput {
  return {
    occasion,
    now: FRIDAY_NOON,
    places: bulkPlaces(12),
    dining: bulkDining(14),
    ...over,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

export function runEveningSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  // ── Occasion registry
  {
    ok(OCCASIONS.length === 3, "occasions: three of them");
    ok(new Set(OCCASIONS.map((o) => o.id)).size === 3, "occasions: ids are unique");
    ok(occasionById("celebration").label === "A celebration", "occasions: lookup by id");
    ok(
      occasionById("nonsense" as OccasionId).id === OCCASIONS[0].id,
      "occasions: unknown id falls back rather than throwing",
    );
  }

  // ── City readiness: both halves of the catalog must exist.
  {
    const places = [...bulkPlaces(12), ...bulkPlaces(12, 900).map((p) => ({ ...p, city: "Los Angeles" }))];
    const dining = [...bulkDining(14), ...bulkDining(3, 900).map((d) => ({ ...d, city: "Los Angeles" }))];
    const ready = eveningCities(places, dining);
    ok(ready.includes("New York"), "cities: New York is evening-ready");
    ok(!ready.includes("Los Angeles"), "cities: LA has places but too few tables — excluded");
    ok(eveningCities(bulkPlaces(12), []).length === 0, "cities: no tables → no evening anywhere");
  }

  // ── City choice follows their saves when it can.
  {
    const places = [
      ...bulkPlaces(12),
      ...bulkPlaces(12, 900).map((p) => ({ ...p, city: "Chicago" })),
    ];
    const dining = [
      ...bulkDining(40),
      ...bulkDining(14, 900).map((d) => ({ ...d, city: "Chicago" })),
    ];
    const chi = pickCity(baseInput("date-night", { places, dining, savedPlaceIds: [900, 901] }));
    ok(chi === "Chicago", "city: saves in Chicago → the evening is in Chicago");
    const dflt = pickCity(baseInput("date-night", { places, dining }));
    ok(dflt === "New York", "city: no signal → best-covered city");
    const forced = pickCity(baseInput("date-night", { places, dining, city: "Chicago" }));
    ok(forced === "Chicago", "city: explicit choice is honoured");
    const bogus = pickCity(baseInput("date-night", { places, dining, city: "Paris" }));
    ok(bogus === "New York", "city: an unsupported city falls back rather than emptying the plan");
  }

  // ── Determinism: the same inputs compose the same evening, twice.
  {
    const input = baseInput("date-night");
    const a = composeEvening(input);
    const b = composeEvening(input);
    ok(!!a && !!b, "compose: produces a plan");
    ok(JSON.stringify(a) === JSON.stringify(b), "compose: deterministic");
  }

  // ── Not enough catalog → an honest null, not a thin plan.
  {
    const none = composeEvening(baseInput("date-night", { places: [], dining: [] }));
    ok(none === null, "compose: no catalog → null");
    const thin = composeEvening(baseInput("date-night", { places: bulkPlaces(12), dining: bulkDining(3) }));
    ok(thin === null, "compose: too few tables → null rather than a broken arc");
  }

  // ── Date night: quiet, romantic, close together.
  {
    const places = [
      ...bulkPlaces(12),
      pl({ id: 10, name: "Bethesda Terrace", moods: ["romantic", "beautiful", "calm"],
           badges: ["Best for Couples"], scores: { b: 5, u: 4, e: 5, c: 3, v: 5, l: 4, memory: 9 },
           lat: 40.774, lng: -73.9709, dur: 90 }),
      pl({ id: 11, name: "Times Square", moods: ["iconic", "photo"], crowd: "High",
           scores: { b: 3, u: 3, e: 3, c: 5, v: 3, l: 3, mustVisit: 9 }, lat: 40.758, lng: -73.9855 }),
    ];
    const dining = [
      ...bulkDining(14),
      dn({ id: 20, name: "Quiet Room", occasion: ["Date night"], noise: "Quiet", rope: 2,
           lat: 40.7745, lng: -73.9715,
           scores: { romantic: 5, ambiance: 5, privacy: 4, food: 4 } }),
      dn({ id: 21, name: "Loud Barn", occasion: ["Group dinner"], noise: "Loud", rope: 1,
           lat: 40.7748, lng: -73.9718, scores: { romantic: 1, ambiance: 2, privacy: 1, food: 4 } }),
      dn({ id: 22, name: "Nightcap Bar", cuisine: "Wine Bar", format: "Intimate wine bar",
           occasion: ["Drinks & bites", "Late night"], lat: 40.7742, lng: -73.9712,
           scores: { beverage: 5, ambiance: 4 } }),
    ];
    const plan = composeEvening(baseInput("date-night", { places, dining }))!;
    ok(!!plan, "date night: composes");
    ok(plan.acts.length === 3, "date night: three acts");
    ok(plan.acts[0].title === "Bethesda Terrace", "date night: romantic opener beats the tourist icon");
    ok(plan.acts[1].title === "Quiet Room", "date night: the quiet table wins over the loud one");
    ok(plan.acts[2].title === "Nightcap Bar", "date night: ends on a nightcap");
    ok(plan.acts[1].walkMin !== null && plan.acts[1].walkMin! <= 5, "date night: the table is walkable from the opener");
    ok(/hear each other|date night/i.test(plan.acts[1].reason), "date night: the reason is truthful about why");
    ok(plan.acts.every((a) => /^\d{1,2}:\d{2} (am|pm)$/.test(a.at)), "date night: every act has a readable time");
  }

  // ── Out-of-towners: icons, recognition, a view to finish. Crowds are fine.
  {
    const places = [
      ...bulkPlaces(12),
      pl({ id: 10, name: "Hidden Garden", moods: ["calm", "hidden"], crowd: "Low",
           scores: { b: 5, u: 5, e: 5, c: 1, v: 4, l: 5, mustVisit: 3 } }),
      pl({ id: 11, name: "The Big Icon", moods: ["iconic", "photo", "beautiful"], crowd: "High",
           badges: ["First-Timer"],
           scores: { b: 5, u: 5, e: 5, c: 5, v: 5, l: 5, mustVisit: 10, significance: 9, photoWorth: 9 } }),
      pl({ id: 12, name: "Skyline Deck", moods: ["iconic", "photo"], badges: ["Best at Night"],
           scores: { b: 5, u: 5, e: 5, c: 5, v: 5, l: 5, night: 10, view: 10, memory: 8 } }),
    ];
    const dining = [
      ...bulkDining(14),
      dn({ id: 20, name: "Corner Diner", occasion: ["Casual"], recognition: "", rope: 1 }),
      dn({ id: 21, name: "The Institution", occasion: ["Big night out", "Group dinner"],
           recognition: "★★ Michelin", rope: 3, price: 4,
           scores: { food: 5, clientele: 5, ambiance: 5, consistency: 5 } }),
    ];
    const plan = composeEvening(baseInput("out-of-towners", { places, dining }))!;
    ok(plan.acts[0].title === "The Big Icon", "out-of-towners: the icon wins even with crowds");
    ok(plan.acts[1].title === "The Institution", "out-of-towners: recognition carries the table");
    ok(plan.acts[2].title === "Skyline Deck", "out-of-towners: ends on the city, lit");
    ok(/michelin/i.test(plan.acts[1].reason), "out-of-towners: the reason names the recognition");
  }

  // ── Celebration: the trophy table, and price is not a problem tonight.
  {
    const places = [...bulkPlaces(12), pl({ id: 10, name: "Rooftop", moods: ["classy", "premium"], badges: ["Quiet Luxury"], dur: 45 })];
    const dining = [
      ...bulkDining(14),
      dn({ id: 20, name: "Sensible Bistro", occasion: ["Casual", "Date night"], rope: 1, price: 2,
           recognition: "Local favorite", scores: { food: 4, service: 3, ambiance: 3 } }),
      dn({ id: 21, name: "Three Stars", occasion: ["Celebration", "Big night out"], rope: 5, price: 4,
           recognition: "★★★ Michelin", scores: { food: 5, service: 5, ambiance: 5, beverage: 5 } }),
      dn({ id: 22, name: "Cocktail Den", cuisine: "Cocktail Bar", format: "Craft cocktail bar",
           occasion: ["Drinks & bites"], scores: { beverage: 5, ambiance: 4 } }),
    ];
    const plan = composeEvening(baseInput("celebration", { places, dining }))!;
    ok(plan.acts[1].title === "Three Stars", "celebration: the hard table beats the easy one");
    ok(plan.acts[2].title === "Cocktail Den", "celebration: a proper nightcap to finish");
    ok(/worth the call|michelin/i.test(plan.acts[1].reason), "celebration: honest about the effort involved");

    // The same catalog on a date night should not reach for the trophy.
    const date = composeEvening(baseInput("date-night", { places, dining }))!;
    ok(date.acts[1].title !== "Three Stars", "occasion changes the answer: rope-5 is out for a date night");
  }

  // ── Missing editorial scores must not act as zeros. Roughly a third of the
  //    dining catalog has no `scores` block; without normalisation the
  //    three-star temples (which mostly lack one) lose to documented mid-tier
  //    rooms, which is exactly backwards for a celebration.
  {
    const dining = [
      ...bulkDining(14),
      dn({ id: 20, name: "Well Documented", occasion: ["Celebration"], rope: 2, price: 3,
           recognition: "Local favorite",
           scores: { food: 4, service: 4, ambiance: 4, beverage: 4 } }),
      dn({ id: 21, name: "Unscored Temple", occasion: ["Celebration"], rope: 4, price: 4,
           recognition: "★★★ Michelin" }), // no scores block at all, as in the real catalog
    ];
    const plan = composeEvening(baseInput("celebration", { dining }))!;
    ok(plan.acts[1].title === "Unscored Temple", "scores: an unscored three-star still wins a celebration");
    ok(/★★★ Michelin/.test(plan.acts[1].reason), "scores: recognition keeps its capitals and stars");
  }

  // ── Reason lines have to read like sentences, not tag dumps.
  {
    const places = [...bulkPlaces(12), pl({ id: 10, name: "Pretty", moods: ["romantic", "beautiful", "calm"], badges: ["Best for Couples"] })];
    const dining = [...bulkDining(14), dn({ id: 20, name: "Table", occasion: ["Date night"], noise: "Quiet", scores: { romantic: 5, ambiance: 5 } })];
    const plan = composeEvening(baseInput("date-night", { places, dining }))!;
    for (const a of plan.acts) {
      ok(!/\band\b.*\band\b/.test(a.reason.replace(/, and /, ", ")), `copy: ${a.kind} reason doesn't stack "and"s`);
      ok(!/^[a-z]/.test(a.reason), `copy: ${a.kind} reason starts capitalised`);
      ok(!/\bBest for Couples\b|\bDate night\b/.test(a.reason), `copy: ${a.kind} reason reads out the tag rather than printing it`);
    }
  }

  // ── Their own saves outrank the catalog's opinion.
  {
    const places = [...bulkPlaces(12), pl({ id: 10, name: "Saved Spot", moods: [], scores: { b: 1, u: 1, e: 1, c: 1, v: 1, l: 1 } })];
    const dining = [
      ...bulkDining(14),
      dn({ id: 20, name: "Wanted Table", occasion: ["Casual"], recognition: "" }),
      dn({ id: 21, name: "Better On Paper", occasion: ["Date night"], recognition: "★ Michelin",
           scores: { romantic: 5, ambiance: 5, privacy: 5, food: 5 } }),
    ];
    const history: HistoryEntry[] = [{ diningId: 20, status: "want" }];
    const plan = composeEvening(
      baseInput("date-night", { places, dining, savedPlaceIds: [10], diningHistory: history }),
    )!;
    ok(plan.acts[0].title === "Saved Spot", "saves: a saved place opens the evening");
    ok(plan.acts[0].fromSaves === true, "saves: the opener is flagged as theirs");
    ok(plan.acts[1].title === "Wanted Table", "saves: a table they meant to try wins");
    ok(/on your list|meaning to go/i.test(plan.acts[0].reason + plan.acts[1].reason), "saves: reason says so");
  }

  // ── Rain rewrites the arc.
  {
    const places = [
      ...bulkPlaces(12),
      pl({ id: 10, name: "Open Lawn", moods: ["romantic", "beautiful"], rain: false, scores: { b: 5, u: 5, e: 5, c: 5, v: 5, l: 5, memory: 9 } }),
      pl({ id: 11, name: "Grand Museum", moods: ["romantic", "beautiful"], rain: true, scores: { b: 5, u: 5, e: 5, c: 5, v: 5, l: 5, memory: 8 } }),
    ];
    const dry = composeEvening(baseInput("date-night", { places }))!;
    const wet = composeEvening(baseInput("date-night", { places, weather: { code: 63, temp: 55 } }))!;
    ok(dry.acts[0].title === "Open Lawn", "weather: the lawn is right on a clear night");
    ok(wet.acts[0].title === "Grand Museum", "weather: rain moves the evening indoors");
    ok(/rain/i.test(wet.note) && !/rain/i.test(dry.note), "weather: the note changes with the sky");
    ok(/rain/i.test(wet.acts[0].reason), "weather: the reason admits why it changed");
  }

  // ── "Another, please" — one slot at a time, without disturbing the rest.
  {
    const places = [
      ...bulkPlaces(12),
      pl({ id: 10, name: "First Choice", moods: ["romantic", "beautiful", "calm"], lat: 40.77, lng: -73.97 }),
      pl({ id: 11, name: "Second Choice", moods: ["romantic", "beautiful"], lat: 40.771, lng: -73.971 }),
    ];
    const dining = [
      ...bulkDining(14),
      dn({ id: 20, name: "Table A", occasion: ["Date night"], noise: "Quiet", lat: 40.7702, lng: -73.9702, scores: { romantic: 5, ambiance: 5 } }),
      dn({ id: 21, name: "Table B", occasion: ["Date night"], noise: "Quiet", lat: 40.7703, lng: -73.9703, scores: { romantic: 4, ambiance: 4 } }),
    ];
    const first = composeEvening(baseInput("date-night", { places, dining }))!;
    ok(first.acts[0].title === "First Choice" && first.acts[1].title === "Table A", "swap: baseline is as expected");

    // Swap only the table, pinning the opener.
    const swapTable = composeEvening(
      baseInput("date-night", {
        places, dining,
        exclude: new Set([first.acts[1].id]),
        pin: new Set([first.acts[0].id]),
      }),
    )!;
    ok(swapTable.acts[0].title === "First Choice", "swap: the pinned opener held");
    ok(swapTable.acts[1].title === "Table B", "swap: the table moved to the runner-up");

    // Swap only the opener, pinning the table.
    const swapOpener = composeEvening(
      baseInput("date-night", {
        places, dining,
        exclude: new Set([first.acts[0].id]),
        pin: new Set([first.acts[1].id]),
      }),
    )!;
    ok(swapOpener.acts[0].title === "Second Choice", "swap: the opener moved");
    ok(swapOpener.acts[1].title === "Table A", "swap: the pinned table held");
  }

  // ── The finale falls back to a film when there's no bar in town.
  {
    const dining = bulkDining(14); // no nightcap formats at all
    const wl = [{ tmdb_id: "7", media_type: "tv", title: "The Wire", status: "want" }];
    const plan = composeEvening(baseInput("date-night", { dining, watchlist: wl }))!;
    const last = plan.acts[plan.acts.length - 1];
    ok(last.title === "The Wire", "finale: no bar → end at home with their watchlist");
    ok(last.label === "End at home", "finale: the label tells the truth about the change");
    ok(last.id === "film:tv:7", "finale: stable film id for swapping");

    const films = [fm({ tmdb_id: 100, title: "Big Hit", popularity: 900 })];
    const cold = composeEvening(baseInput("date-night", { dining, films }))!;
    ok(cold.acts[cold.acts.length - 1].title === "Big Hit", "finale: empty watchlist → the catalog");
  }

  // ── The nightcap is never also the dinner table.
  {
    const dining = [
      ...bulkDining(14),
      dn({ id: 20, name: "Wine Bar One", cuisine: "Wine Bar", format: "Intimate wine bar",
           occasion: ["Date night", "Drinks & bites"], scores: { beverage: 5, ambiance: 5, romantic: 5 } }),
      dn({ id: 21, name: "Actual Restaurant", occasion: ["Date night"], noise: "Quiet",
           scores: { romantic: 4, ambiance: 4, food: 5 } }),
    ];
    const plan = composeEvening(baseInput("date-night", { dining }))!;
    ok(plan.acts[1].title === "Actual Restaurant", "nightcap: a bar is not offered as the dinner table");
    ok(plan.acts[2].title === "Wine Bar One", "nightcap: the bar takes the finale slot");
    ok(isNightcap(dn({ cuisine: "Wine Bar" })), "nightcap: wine bars detected");
    ok(isNightcap(dn({ format: "Craft cocktail lounge" })), "nightcap: lounges detected");
    ok(!isNightcap(dn({ format: "Trattoria" })), "nightcap: a trattoria is not a bar");
  }

  // ── Times: the arc runs forward, on the half hour, and rolls to tomorrow.
  {
    const early = arcStart(FRIDAY_NOON, 18);
    ok(early.start.getHours() === 18 && !early.tomorrow, "time: a noon plan starts at six tonight");

    const late = arcStart(FRIDAY_LATE, 18);
    ok(late.tomorrow && late.start.getDate() === 11, "time: an 11pm plan is for tomorrow");

    const squeeze = arcStart(new Date("2026-07-10T18:47:00"), 18);
    ok(
      !squeeze.tomorrow && squeeze.start.getHours() === 19 && squeeze.start.getMinutes() === 30,
      "time: a late start is rounded to the next half hour, not abandoned",
    );

    const plan = composeEvening(baseInput("date-night", { now: FRIDAY_LATE }))!;
    ok(/^Tomorrow · /.test(plan.context), "time: the context says so when the evening is tomorrow");
    ok(/Saturday/.test(plan.context), "time: and names the right day");
  }

  // ── Every act is routable and labelled.
  {
    for (const o of OCCASIONS) {
      const plan = composeEvening(
        baseInput(o.id, {
          places: [...bulkPlaces(12), pl({ id: 10, name: "Anchor", moods: ["romantic", "iconic", "classy"], scores: { b: 8, u: 5, e: 5, c: 5, v: 5, l: 5, night: 8, view: 8, mustVisit: 8, memory: 8 } })],
          dining: [
            ...bulkDining(14),
            dn({ id: 20, name: "Dinner", occasion: ["Date night", "Celebration", "Big night out"], recognition: "★ Michelin", scores: { food: 5, service: 5, ambiance: 5, romantic: 5 } }),
            dn({ id: 21, name: "Bar", cuisine: "Cocktail Bar", format: "Craft cocktail bar", occasion: ["Drinks & bites"], scores: { beverage: 5, ambiance: 4 } }),
          ],
        }),
      )!;
      ok(!!plan, `${o.id}: composes`);
      ok(plan.acts.length >= 2, `${o.id}: at least an opener and a table`);
      ok(new Set(plan.acts.map((a) => a.id)).size === plan.acts.length, `${o.id}: no act repeats`);
      for (const a of plan.acts) {
        ok(/^\/(places|dining|films)\//.test(a.href), `${o.id}: ${a.kind} href is routable`);
        ok(a.label.length > 0 && a.title.length > 0, `${o.id}: ${a.kind} is labelled`);
        ok(/[.!?]$/.test(a.reason), `${o.id}: ${a.kind} reason reads as a sentence`);
      }
      ok(plan.note.length > 0, `${o.id}: the arc has a framing note`);
      ok(plan.context.includes("New York"), `${o.id}: the context names the city`);
    }
  }

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runEveningSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("evening selftest: all passed");
}
