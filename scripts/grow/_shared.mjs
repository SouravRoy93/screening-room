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
export async function anthropicJSON({ system, user, maxTokens = 800, model = "claude-3-5-haiku-latest" }) {
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
