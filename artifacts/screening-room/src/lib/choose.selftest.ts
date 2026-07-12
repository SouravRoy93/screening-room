// Self-contained tests for the "Choose for me" engine. Run with
// `node --import tsx artifacts/screening-room/src/lib/choose.selftest.ts`
import { chooseDining, choosePlace, chooseFilm } from "./choose";
import type { HistoryEntry } from "./pairing";
import type { DiningItem, MediaItem, PlaceItem } from "@/types";

const EVENING = new Date("2026-07-10T19:30:00"); // dinner daypart

function dn(partial: Partial<DiningItem>): DiningItem {
  return {
    id: 1, name: "Resto", cuisine: "Italian", format: "Trattoria", neighborhood: "SoHo",
    borough: "Manhattan", price: 2, rope: 1, occasion: ["Casual"], recognition: "",
    signature: "", blurb: "",
  } as DiningItem;
}
function pl(partial: Partial<PlaceItem>): PlaceItem {
  return {
    id: 1, name: "Place", area: "Midtown", vibe: "Iconic", styles: [], moods: [],
    best: "", dur: 60, crowd: "Medium", price: "$", dress: "", hours: "", resv: "",
    photo: "", cafe: "", dinner: "", insider: "", worth: "", skip: "", badges: [],
    scores: { b: 7, u: 5, e: 5, c: 5, v: 5, l: 5 }, rain: false, img: null,
    ...partial,
  } as PlaceItem;
}
function fm(partial: Partial<MediaItem>): MediaItem {
  return {
    tmdb_id: 1, media_type: "movie", title: "Film", year: 2024, genres: ["Drama"],
    poster_path: null, vote_average: 7, popularity: 100, ...partial,
  } as MediaItem;
}

export function runChooseSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  // Dining: taste steers the pick, reason says so truthfully.
  {
    const all = [
      { ...dn({}), id: 1, name: "Nonna", cuisine: "Italian", occasion: ["Date night"] },
      { ...dn({}), id: 2, name: "Taqueria", cuisine: "Mexican", occasion: ["Casual"] },
      { ...dn({}), id: 3, name: "Old Fave", cuisine: "Italian", occasion: ["Date night"] },
      { ...dn({}), id: 4, name: "Pasta Due", cuisine: "Italian", occasion: ["Date night"] },
    ] as DiningItem[];
    const history: HistoryEntry[] = [
      { diningId: 3, status: "visited" }, { diningId: 4, status: "visited" },
      { diningId: 1, status: "want" },
    ];
    const c = chooseDining({ candidates: all, all, history, now: EVENING });
    ok(!!c && c.title === "Nonna", "dining: italian taste + date-night hour wins");
    ok(!!c && /italian|date night|reservation/i.test(c.reason), "dining: truthful reason");
    ok(!!c && c.href === "/dining/1", "dining: routable href");
  }
  // Dining: exclusion produces the runner-up; exhaustion → null.
  {
    const all = [ { ...dn({}), id: 1, name: "A" }, { ...dn({}), id: 2, name: "B" } ] as DiningItem[];
    const first = chooseDining({ candidates: all, now: EVENING })!;
    const second = chooseDining({ candidates: all, now: EVENING, exclude: new Set([first.id]) })!;
    ok(first.id !== second.id, "dining: another → different pick");
    const none = chooseDining({ candidates: all, now: EVENING, exclude: new Set([first.id, second.id]) });
    ok(none === null, "dining: exhausted → null");
  }
  // Dining: deterministic.
  {
    const all = [ { ...dn({}), id: 1 }, { ...dn({}), id: 2, name: "B" } ] as DiningItem[];
    const a = chooseDining({ candidates: all, now: EVENING });
    const b = chooseDining({ candidates: all, now: EVENING });
    ok(JSON.stringify(a) === JSON.stringify(b), "dining: deterministic");
  }

  // Places: saved wins; exclusion falls through to the next.
  {
    const places = [pl({ id: 1, name: "Park" }), pl({ id: 2, name: "Museum" })];
    const c = choosePlace({ candidates: places, savedIds: [2], now: EVENING })!;
    ok(c.title === "Museum", "places: saved wins");
    const next = choosePlace({ candidates: places, savedIds: [2], now: EVENING, exclude: new Set(["2"]) })!;
    ok(next.title === "Park", "places: another → runner-up");
    ok(choosePlace({ candidates: [], now: EVENING }) === null, "places: empty → null");
  }

  // Films: watchlist first; exclusion reaches the catalog; taste steers.
  {
    const films = [
      fm({ tmdb_id: 100, title: "Big Hit", popularity: 900, genres: ["Action"] }),
      fm({ tmdb_id: 101, title: "Quiet Drama", popularity: 500, genres: ["Drama"] }),
    ];
    const wl = [{ tmdb_id: "7", media_type: "tv", title: "The Wire", status: "want" }];
    const c = chooseFilm({ candidates: films, watchlist: wl, now: EVENING })!;
    ok(c.title === "The Wire" && c.id === "tv:7", "films: watchlist first, stable id");
    const c2 = chooseFilm({ candidates: films, watchlist: wl, tasteGenres: ["Drama"], now: EVENING, exclude: new Set(["tv:7"]) })!;
    ok(c2.title === "Quiet Drama", "films: exclusion falls to taste-matched catalog");
    const c3 = chooseFilm({ candidates: films, watchlist: wl, now: EVENING, exclude: new Set(["tv:7", "movie:100", "movie:101"]) });
    ok(c3 === null, "films: exhausted → null");
  }

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runChooseSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("choose selftest: all passed");
}
