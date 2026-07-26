// Self-contained tests for the preferred-name helpers. Run with
// `node --import tsx artifacts/screening-room/src/lib/profile.selftest.ts`
import { cleanName, preferredName } from "./profile";

export function runProfileSelfTest(): string[] {
  const fails: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  ok(cleanName("  sourav  ") === "Sourav", "clean: trims + capitalizes");
  ok(cleanName("mary jane") === "Mary jane", "clean: keeps inner words");
  ok(cleanName("a") === null, "clean: single char rejected");
  ok(cleanName("   ") === null, "clean: whitespace rejected");
  ok(cleanName(null) === null, "clean: null safe");
  ok(cleanName("x".repeat(60))!.length <= 30, "clean: capped at 30");

  ok(preferredName({ email: "sourav.oyr@gmail.com", user_metadata: { first_name: "Rou" } }) === "Rou",
    "prefer: chosen name wins");
  ok(preferredName({ email: "sourav.oyr@gmail.com", user_metadata: {} }) === "Sourav",
    "prefer: falls back to email");
  ok(preferredName({ email: "sourav.oyr@gmail.com", user_metadata: { first_name: " " } }) === "Sourav",
    "prefer: junk metadata falls through");
  ok(preferredName({ email: "a@b.com" }) === null, "prefer: nothing usable → null");
  ok(preferredName(null) === null, "prefer: null user safe");

  return fails;
}

// Allow direct execution.
declare const process: { argv: string[]; exitCode?: number } | undefined;
if (typeof process !== "undefined" && Array.isArray(process.argv) && /selftest/.test(process.argv[1] || "")) {
  const f = runProfileSelfTest();
  if (f.length) { console.error("FAILURES:\n" + f.join("\n")); process.exitCode = 1; }
  else console.log("profile selftest: all passed");
}
