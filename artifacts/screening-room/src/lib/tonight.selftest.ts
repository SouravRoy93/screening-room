// Self-contained tests for the Tonight composer. No test-runner dependency:
// run with `node --import tsx artifacts/screening-room/src/lib/tonight.selftest.ts`
// (or import runTonightSelfTest() anywhere). Returns a list of failures.
import {
  composeTonight,
  greetingFor,
  eyebrowFor,
  nameFromEmail,
  pickPlace,
  pickDining,
  pickFilm,
  isWet,
  type TonightInput,
} from "./tonight";
import type { DiningItem, MediaItem, PlaceItem } from "@/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function pl(partial: Partial<PlaceItem>): PlaceItem {
  return {
    id: 1, name: "Place", area: "Midtown", vibe: "Iconic", styles: [], moods: [],
    best: "", dur: 60, crowd: "Medium", price: "$", dress: "", hours: "", resv: "",
    photo: "", cafe: "", dinner: "", insider: "", worth: "", skip: "", badges: [],
    scores: { b: 7, u: 5, e: 5, c: 5, v: 5, l: 5 }, rain: false, img: null,
    lat: 40.758, lng: -73.9855,
    ...partial,
  } as PlaceItem;
}

function dn(partial: Partial<DiningItem>): DiningItem {
  return {
    id: 1, name: "Resto", cuisine: "Italian", format: "Trattoria", neighborhood: "Midtown",
    borough: "Manhattan", price: 2, rope: 1, occasion: ["Casual"], recognition: "",
    signature: "", blurb: "", lat: 40.757, lng: -73.984,
    ...partial,
  } as DiningItem;
}

function film(partial: Partial<MediaItem>): MediaItem {
  return {
    tmdb_id: 1, media_type: "movie", title: "Film", year: 2024, genres: ["Drama"],
    poster_path: null, vote_average: 7, popularity: 100,
    ...partial,
  } as MediaItem;
}

const EVENING = new Date("2026-07-10T19:30:00"); // Friday evening
const MORNING = new Date("2026-07-11T09:00:00");
const LATE = new Date("2026-07-11T01:30:00");

function baseInput(overrides: Partial<TonightInput> = {}): TonightInput {
  return {
    now: EVENING,
    places: [pl({ id: 1, name: "The Park" }), pl({ id: 2, name: "The Museum", rain: true })],
    dining: [
      dn({ id: 10, name: "Corner Table", occasion: ["Date night"] }),
      dn({ id: 11, name: "Brunch Spot", occasion: ["Brunch"], lat: 40.759, lng: -73.986 }),
    ],
    films: [
      film({ tmdb_id: 100, title: "Big Hit", popularity: 900, genres: ["Action"] }),
      film({ tmdb_id: 101, title: "Quiet Drama", popularity: 500, genres: ["Drama"] }),
    ],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

export function runTonightSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  // Language: greeting & eyebrow track the hour.
  ok(greetingFor(EVENING, "Sourav") === "Good evening, Sourav", "greeting: evening + name");
  ok(greetingFor(MORNING) === "Good morning", "greeting: morning, no name");
  ok(greetingFor(LATE) === "Up late", "greeting: late night");
  ok(eyebrowFor(EVENING) === "Tonight", "eyebrow: evening → Tonight");
  ok(eyebrowFor(MORNING) === "This morning", "eyebrow: morning");

  // Name extraction is warm, not "sourav.oyr".
  ok(nameFromEmail("sourav.oyr@gmail.com") === "Sourav", "name: dots stripped, capitalized");
  ok(nameFromEmail("a@b.com") === null, "name: too short → null");
  ok(nameFromEmail(undefined) === null, "name: missing → null");

  // Weather classification.
  ok(isWet({ code: 63, temp: 60 }), "wet: rain code");
  ok(!isWet({ code: 0, temp: 72 }), "wet: clear is not wet");

  // A saved place always beats an unsaved one.
  {
    const { place } = pickPlace(baseInput({ savedPlaceIds: [2] }));
    ok(place?.id === 2, "place: saved wins");
  }
  // Visited places are never re-suggested.
  {
    const { place } = pickPlace(baseInput({ savedPlaceIds: [2], visitedPlaceIds: [2] }));
    ok(place?.id !== 2, "place: visited excluded");
  }
  // Rain steers to rain-friendly.
  {
    const { place } = pickPlace(baseInput({ weather: { code: 63, temp: 58 } }));
    ok(place?.id === 2, "place: rain → rain-friendly pick");
    const { place: clear } = pickPlace(baseInput({ weather: { code: 0, temp: 72 } }));
    ok(clear?.id === 1, "place: clear → best overall");
  }

  // Dining pairs with the anchor via the engine and says why.
  {
    const input = baseInput();
    const anchor = pickPlace(input).place!;
    const table = pickDining(input, anchor);
    ok(!!table, "dining: engine returns a table");
    ok(!!table && table.reason.length > 10, "dining: reason is a real sentence");
    ok(!!table && table.href.startsWith("/dining/"), "dining: navigable href");
  }
  // Saved table wins when there is no anchor.
  {
    const table = pickDining(
      baseInput({ diningHistory: [{ diningId: 11, status: "want" }] }),
      null,
    );
    ok(table?.title === "Brunch Spot", "dining: saved table wins without anchor");
    ok(!!table && /Saved for later/.test(table.reason), "dining: saved reason is truthful");
  }

  // Films: watchlist first, taste-genre fallback second.
  {
    const wl = pickFilm(baseInput({
      watchlist: [{ tmdb_id: "7", media_type: "tv", title: "The Wire", status: "want" }],
    }));
    ok(wl?.title === "The Wire", "film: watchlist wins");
    ok(!!wl && wl.href === "/films/tv/7", "film: watchlist href");

    const cold = pickFilm(baseInput({ tasteGenres: ["Drama"] }));
    ok(cold?.title === "Quiet Drama", "film: taste genres steer the fallback");
    const anon = pickFilm(baseInput());
    ok(anon?.title === "Big Hit", "film: no taste → most popular");
  }

  // The full plan: three picks, ordered place → dining → film, deterministic.
  {
    const input = baseInput({ savedPlaceIds: [1], name: "Sourav", weather: { code: 0, temp: 72 } });
    const a = composeTonight(input);
    const b = composeTonight(input);
    ok(a.picks.length === 3, "plan: three picks");
    ok(a.picks[0].kind === "place" && a.picks[1].kind === "dining" && a.picks[2].kind === "film", "plan: pick order");
    ok(a.greeting === "Good evening, Sourav", "plan: greeting");
    ok(/Friday/.test(a.context) && /72°/.test(a.context), "plan: context has day + weather");
    ok(JSON.stringify(a) === JSON.stringify(b), "plan: deterministic");
    ok(a.picks.every((p) => p.reason.length > 0 && p.title.length > 0), "plan: every pick has a reason");
  }

  // Degrades gracefully: empty catalogs → empty picks, no throw.
  {
    const p = composeTonight(baseInput({ places: [], dining: [], films: [], watchlist: [] }));
    ok(p.picks.length === 0, "plan: empty inputs → empty picks");
    ok(p.greeting.length > 0, "plan: still greets with no data");
  }

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runTonightSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("tonight selftest: all passed");
}
