// ============================================================================
//  backfill-booking.mjs — fill the `booking` block on dining items that
//  predate Table Watch (roadmap #8). Idempotent: only touches items with no
//  `booking` key, so it is safe to re-run and safe to stop halfway.
//
//  Reservation policies are editorial, not scraped, so the model is told to
//  answer "low confidence" unless it genuinely knows the restaurant. The app
//  reads `confidence` and softens its language accordingly — see lib/watch.ts.
//
//  Env:  ANTHROPIC_API_KEY (required)
//        DINING_FILE   default artifacts/screening-room/public/dining.json
//        LIMIT         how many to do this run (default 100) — batch the spend
//        SAVE_EVERY    checkpoint interval (default 20)
//        DRY_RUN=1     print what it would do, write nothing
//
//  Run:  ANTHROPIC_API_KEY=… LIMIT=25 node scripts/grow/backfill-booking.mjs
// ============================================================================
import { anthropicJSON, loadJson, saveJson, intEnv, bookingOf } from "./_shared.mjs";

const FILE = process.env.DINING_FILE || "artifacts/screening-room/public/dining.json";
const LIMIT = intEnv("LIMIT", 100);
const SAVE_EVERY = intEnv("SAVE_EVERY", 20);
const DRY_RUN = process.env.DRY_RUN === "1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM =
  "You describe how restaurants release reservations, for a premium dining guide. " +
  "Reservation policies change constantly and are easy to get wrong. Only answer " +
  "confidence 'high' if you genuinely know this specific restaurant's policy; " +
  "'medium' if it plainly follows the convention for its type and standing; " +
  "'low' otherwise. 'low' is the correct answer for most restaurants and there is " +
  "no penalty for it. Never invent a release time. Output ONLY valid minified JSON.";

async function policyFor(item) {
  const facts = {
    name: item.name,
    city: item.city || "New York",
    neighborhood: item.neighborhood || "",
    cuisine: item.cuisine || "",
    format: item.format || "",
    recognition: item.recognition || "",
    price_tier: item.price ?? null,
    reservation_difficulty_1_to_5: item.rope ?? null,
  };
  const user = `Restaurant facts:
${JSON.stringify(facts)}

Return JSON with EXACTLY these keys:
{"mode":"rolling|monthly|walk-in|waitlist","daysAhead":<rolling only: days ahead the booking window opens, e.g. 30; omit otherwise>,"dayOfMonth":<monthly only: 1-28; omit otherwise>,"time":"local release time as HH:MM 24h — omit entirely unless you actually know it","platform":"Resy|OpenTable|Tock|SevenRooms|Direct|Phone","confidence":"high|medium|low"}`;

  return anthropicJSON({ system: SYSTEM, user, maxTokens: 300 });
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const items = loadJson(FILE);
  if (!Array.isArray(items) || !items.length) {
    console.error("No dining catalog at " + FILE);
    process.exit(1);
  }

  const missing = items.filter((x) => !x.booking);
  console.log(`${items.length} items, ${missing.length} without a booking policy.`);
  if (!missing.length) { console.log("Nothing to do."); return; }

  const batch = missing.slice(0, LIMIT);
  console.log(`Doing ${batch.length} this run${DRY_RUN ? " (DRY RUN — nothing will be written)" : ""}.\n`);

  const tally = { high: 0, medium: 0, low: 0 };
  let done = 0;
  let failed = 0;

  for (const item of batch) {
    try {
      const raw = await policyFor(item);
      const booking = bookingOf(raw, item.rope ?? 2);
      if (!DRY_RUN) item.booking = booking;
      tally[booking.confidence]++;
      done++;
      const detail =
        booking.mode === "rolling" ? `${booking.daysAhead ?? "?"}d ahead` :
        booking.mode === "monthly" ? `day ${booking.dayOfMonth ?? "?"}` : booking.mode;
      console.log(`  + ${item.name} — ${booking.mode} (${detail}${booking.time ? " @ " + booking.time : ""}, ${booking.confidence})`);
    } catch (e) {
      failed++;
      console.warn(`  ! skipped ${item.name} — ${String(e.message).slice(0, 70)}`);
    }

    // Checkpoint, so an interrupted run keeps everything it earned.
    if (!DRY_RUN && done > 0 && done % SAVE_EVERY === 0) {
      saveJson(FILE, items);
      console.log(`    …checkpointed at ${done}`);
    }
    await sleep(120); // stay polite
  }

  if (!DRY_RUN) saveJson(FILE, items);

  const left = items.filter((x) => !x.booking).length;
  console.log(
    `\nFilled ${done}, failed ${failed}. Confidence: ` +
    `${tally.high} high / ${tally.medium} medium / ${tally.low} low. ` +
    `${left} still without a policy.`,
  );
  if (left) console.log(`Re-run to continue (LIMIT=${LIMIT} at a time).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
