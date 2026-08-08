// ============================================================================
//  _shared.mjs — common core for every growth engine (places, dining, …).
//  All engines follow the same shape:  discover → editorial(Claude) → record → save.
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const UA = "ScreeningRoom-Grow/1.0 (personal catalog)";

// ---- file IO ----
export const loadJson = (file, fallback = []) => existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
export const saveJson = (file, data, spaces = 1) => writeFileSync(file, spaces ? JSON.stringify(data, null, spaces) : JSON.stringify(data));

// ---- http ----
export async function jget(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!r.ok) throw new Error("HTTP " + r.status + " for " + String(url).slice(0, 80));
  return r.json();
}

// ---- Claude Haiku → strict JSON (the shared editorial brain) ----
export async function anthropicJSON({ system, user, maxTokens = 800, model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5" }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] })
  });
  if (!r.ok) throw new Error("Anthropic HTTP " + r.status);
  const d = await r.json();
  const txt = (d.content && d.content[0] && d.content[0].text || "").trim();
  const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("no JSON in model reply");
  return JSON.parse(txt.slice(a, b + 1));
}

// ---- normalization helpers shared by all engines ----
export const pick  = (arr, allowed, min, max) => { const v = (Array.isArray(arr) ? arr : []).filter(x => allowed.includes(x)); return v.length ? v.slice(0, max) : allowed.slice(0, min); };
export const clamp = (n, lo = 1, hi = 5, dflt = 3) => { n = parseInt(n, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
export const norm  = s => String(s == null ? "" : s).trim();
export const keyOf = s => norm(s).toLowerCase();
export const intEnv = (name, dflt) => parseInt(process.env[name] || String(dflt), 10);

// ---- booking policy (Table Watch, roadmap #8) ----
// Shared by dining.mjs (new items) and backfill-booking.mjs (the existing
// catalog), so both normalise identically.
export const BOOKING_MODE = ["rolling", "monthly", "walk-in", "waitlist"];
export const BOOKING_PLATFORM = ["Resy", "OpenTable", "Tock", "SevenRooms", "Direct", "Phone"];
export const CONFIDENCE = ["high", "medium", "low"];

/**
 * Normalise a model-supplied reservation convention.
 *
 * The model will sometimes invent a policy. This discards anything malformed
 * and downgrades confidence whenever the claim isn't supported by the fields
 * actually present, so the app never names an hour it can't stand behind.
 */
export function bookingOf(raw, rope) {
  const b = raw && typeof raw === "object" ? raw : {};
  const mode = BOOKING_MODE.includes(b.mode) ? b.mode : (rope <= 1 ? "walk-in" : "rolling");

  const out = { mode, confidence: CONFIDENCE.includes(b.confidence) ? b.confidence : "low" };

  if (mode === "rolling") {
    const d = parseInt(b.daysAhead, 10);
    if (Number.isFinite(d) && d >= 1 && d <= 365) out.daysAhead = d;
  }
  if (mode === "monthly") {
    const d = parseInt(b.dayOfMonth, 10);
    if (Number.isFinite(d) && d >= 1 && d <= 28) out.dayOfMonth = d;
  }
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time || ""))) out.time = b.time;
  if (BOOKING_PLATFORM.includes(b.platform)) out.platform = b.platform;

  // A walk-in has no release to watch; a claim without a shape isn't a claim.
  if (mode === "walk-in" || mode === "waitlist") out.confidence = "low";
  if (mode === "rolling" && out.daysAhead == null) out.confidence = "low";
  if (mode === "monthly" && out.dayOfMonth == null) out.confidence = "low";
  // You can only name the hour if you were given one.
  if (out.confidence === "high" && !out.time) out.confidence = "medium";

  return out;
}
