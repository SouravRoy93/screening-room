// Self-contained tests for the pairing engine. No test-runner dependency:
// run with `node --import tsx artifacts/screening-room/src/lib/pairing.selftest.ts`
// (or import runPairingSelfTest() anywhere). Returns a list of failures.
import {
  recommendNearbyDining,
  recognitionScore,
  haversineMeters,
  daypartFromHour,
  buildContextTarget,
  type HistoryEntry,
} from "./pairing";
import type { DiningItem, PlaceItem } from "@/types";

function d(partial: Partial<DiningItem>): DiningItem {
  return {
    id: 0, name: "X", cuisine: "Italian", format: "Trattoria", neighborhood: "SoHo",
    borough: "Manhattan", price: 2, rope: 2, occasion: ["Date night"], recognition: "",
    signature: "", blurb: "", ...partial,
  } as DiningItem;
}
function place(partial: Partial<PlaceItem>): PlaceItem {
  return { id: 1, name: "P", lat: 40.758, lng: -73.9855, moods: [], styles: [], ...partial } as unknown as PlaceItem;
}

export function runPairingSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const now = new Date("2026-07-09T19:30:00");

  // Geometry
  ok(Math.round(haversineMeters({ lat: 40.758, lng: -73.9855 }, { lat: 40.758, lng: -73.9855 })) === 0, "haversine identity = 0");
  ok(haversineMeters({ lat: 40.75, lng: -73.99 }, { lat: 40.76, lng: -73.98 }) > 1000, "haversine positive");

  // Recognition tiers
  ok(recognitionScore("★★★ Michelin") === 1, "3★ = 1");
  ok(recognitionScore("★ Michelin") > recognitionScore(null), "1★ beats none");
  ok(recognitionScore("Bib Gourmand") >= 0.7, "bib >= 0.7");

  // Daypart
  ok(daypartFromHour(9) === "morning" && daypartFromHour(20) === "dinner" && daypartFromHour(23) === "late", "daypart buckets");

  // Family context excludes nightlife-only occasions
  const famCtx = buildContextTarget(place({ moods: ["family"] }), now);
  ok(!famCtx.occasions.has("Late night"), "family excludes Late night");

  // A near, on-taste, quality spot should beat a far, off-taste one.
  const near = d({ id: 1, name: "Near JP", cuisine: "Japanese", lat: 40.7585, lng: -73.9858, recognition: "★★ Michelin", occasion: ["Date night"] });
  const far = d({ id: 2, name: "Far Diner", cuisine: "American", lat: 40.72, lng: -73.95, recognition: "", occasion: ["Quick bite"], rope: 1 });
  const hist: HistoryEntry[] = [
    { diningId: 91, status: "visited", updatedAt: "2026-06-01" },
  ];
  const dining = [near, far, d({ id: 91, name: "Prior JP", cuisine: "Japanese", lat: 40.9, lng: -73.9 })];
  const recs = recommendNearbyDining(place({ moods: ["romantic"] }), dining, hist, { now, limit: 2 });
  ok(recs.length > 0, "returns recs");
  ok(recs[0].item.id === 1, "near on-taste quality spot ranks first");
  ok(recs.every((r) => typeof r.reason === "string" && r.reason.length > 0), "every rec has a reason");

  // Diversity: never more than 2 of one cuisine.
  const many = Array.from({ length: 8 }, (_, i) =>
    d({ id: 100 + i, name: `JP${i}`, cuisine: "Japanese", lat: 40.758 + i * 0.0005, lng: -73.9855 }));
  const mix = [...many, d({ id: 200, name: "Thai", cuisine: "Thai", lat: 40.7583, lng: -73.9857 }),
                        d({ id: 201, name: "Mex", cuisine: "Mexican", lat: 40.7584, lng: -73.9856 })];
  const divRecs = recommendNearbyDining(place({}), mix, [], { now, limit: 4 });
  const jpCount = divRecs.filter((r) => r.item.cuisine === "Japanese").length;
  ok(jpCount <= 2, "no more than 2 of one cuisine in a shelf");

  // Determinism
  const a = recommendNearbyDining(place({ moods: ["romantic"] }), dining, hist, { now }).map((r) => r.item.id).join();
  const b = recommendNearbyDining(place({ moods: ["romantic"] }), dining, hist, { now }).map((r) => r.item.id).join();
  ok(a === b, "deterministic");

  // Placeless (no coords) → empty, no throw
  ok(recommendNearbyDining(place({ lat: undefined, lng: undefined }), dining, [], { now }).length === 0, "no coords → empty");

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runPairingSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("pairing selftest: all passed");
}
