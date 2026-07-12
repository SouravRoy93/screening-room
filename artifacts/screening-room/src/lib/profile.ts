// ─────────────────────────────────────────────────────────────────────────────
// Preferred name (Obsession roadmap #3 — the warmth layer). One optional
// first name, stored in Supabase auth user_metadata (no schema change),
// used everywhere the app speaks to you. "Hi, sourav.oyr" ends here.
// ─────────────────────────────────────────────────────────────────────────────
import { nameFromEmail } from "./tonight";

/** The slice of a Supabase User this module reads. */
export interface NameSource {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * Normalize a typed name: collapse whitespace, cap at 30 chars, capitalize
 * the first letter. Returns null when there's nothing usable.
 */
export function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.replace(/\s+/g, " ").trim().slice(0, 30).trim();
  if (t.length < 2) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The name the app greets you by: chosen name first, email-derived fallback. */
export function preferredName(u: NameSource | null | undefined): string | null {
  const meta = (u?.user_metadata || {}) as { first_name?: unknown };
  const chosen = typeof meta.first_name === "string" ? cleanName(meta.first_name) : null;
  return chosen || nameFromEmail(u?.email);
}
