import { Router, type IRouter } from "express";
import { BoundedMap } from "../lib/bounded-map";

const router: IRouter = Router();
const RESY_KEY = process.env.RESY_API_KEY || "";

// Cache results for 4 hours — reservation URLs don't change often
const reservationCache = new BoundedMap<string, { ts: number; url: string | null; source: string }>(500);
const CACHE_TTL = 4 * 60 * 60 * 1000;

// Platforms we scan for in page HTML
const RESERVATION_PLATFORMS = [
  "resy.com",
  "opentable.com",
  "exploretock.com",
  "sevenrooms.com",
  "yelp.com/reservations",
];

// Skip asset URLs — they'll never be reservation links
const ASSET_EXT = /\.(js|css|png|jpg|jpeg|svg|woff|woff2|ttf|eot|ico|gif|webp|map|json)(\?|$)/i;

/** "Sushi Nakazawa" → "sushi-nakazawa" */
function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Pull shortest reservation-platform href out of raw HTML. */
function extractReservationLink(html: string): string | null {
  const hrefRe = /href=["']([^"'#\s]+)["']/gi;
  let m: RegExpExecArray | null;
  const hits: string[] = [];
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1];
    if (ASSET_EXT.test(href)) continue;
    if (RESERVATION_PLATFORMS.some(p => href.includes(p))) hits.push(href);
  }
  if (!hits.length) return null;
  return hits.sort((a, b) => a.length - b.length)[0];
}

// Private/internal IP ranges that must never be fetched (SSRF guard).
// Covers loopback, link-local (AWS metadata 169.254.x.x), RFC-1918, IPv6 equivalents.
const PRIVATE_IP_RE = /^(127\.|0\.|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc|fd|fe80)/i;

/**
 * Return true only if the URL is safe to fetch:
 *  - protocol must be http: or https:
 *  - hostname must not be a private/internal address or resolve to one
 *    (we check the literal hostname; DNS rebinding is out of scope for this use-case)
 */
function isSafeUrl(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_IP_RE.test(host)) return false;
  // Block bare IP addresses that aren't already caught above (numeric octets)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  // Block localhost variants
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  return true;
}

async function fetchHtml(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null;          // SSRF guard — reject private/non-http targets
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6500);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScreeningRoomBot/1.0)" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("html")) return null;
    return r.text();
  } catch {
    return null;
  }
}

async function checkResy(slug: string): Promise<string | null> {
  if (!RESY_KEY) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6500);
    const r = await fetch(
      `https://api.resy.com/3/venue?url_slug=${encodeURIComponent(slug)}&location=new-york-ny`,
      {
        signal: ctrl.signal,
        headers: { Authorization: `ResyAPI api_key="${RESY_KEY}"` },
      },
    );
    clearTimeout(t);
    if (!r.ok) return null;
    const data = await r.json() as { links?: { web?: string } };
    return data?.links?.web ?? null;
  } catch {
    return null;
  }
}

async function checkTock(slug: string): Promise<string | null> {
  const url = `https://www.exploretock.com/${slug}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6500);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScreeningRoomBot/1.0)" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const html = await r.text();
    if (
      html.includes("Page not found") ||
      html.includes('"statusCode":404') ||
      !html.toLowerCase().includes("exploretock")
    ) return null;
    return url;
  } catch {
    return null;
  }
}

// GET /dining/reservation-url?website=...&name=...
router.get("/dining/reservation-url", async (req, res): Promise<void> => {
  const website = typeof req.query.website === "string" ? req.query.website.trim() : "";
  const name    = typeof req.query.name    === "string" ? req.query.name.trim()    : "";

  if (!name) { res.status(400).json({ url: null, source: "error" }); return; }

  const cacheKey = `${name}|||${website}`;
  const hit = reservationCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    res.json({ url: hit.url, source: hit.source });
    return;
  }

  const send = (url: string | null, source: string) => {
    reservationCache.set(cacheKey, { ts: Date.now(), url, source });
    res.json({ url, source });
  };

  const slug = nameToSlug(name);

  // Step 1 — Scrape restaurant homepage
  if (website) {
    const html = await fetchHtml(website);
    if (html) {
      const link = extractReservationLink(html);
      if (link) { send(link.startsWith("http") ? link : new URL(link, website).href, "homepage"); return; }
    }
  }

  // Step 2 — Scrape /reservations sub-page
  if (website) {
    const base = website.replace(/\/$/, "");
    const html = await fetchHtml(`${base}/reservations`);
    if (html) {
      const link = extractReservationLink(html);
      if (link) { send(link.startsWith("http") ? link : new URL(link, `${base}/reservations`).href, "reservations-page"); return; }
    }
  }

  // Step 3 — Resy + Tock in parallel
  const [resyUrl, tockUrl] = await Promise.all([checkResy(slug), checkTock(slug)]);
  if (resyUrl) { send(resyUrl, "resy"); return; }
  if (tockUrl) { send(tockUrl, "tock"); return; }

  // Step 4 — Restaurant's own website
  if (website) { send(website, "website"); return; }

  // Step 5 — OpenTable search (last resort)
  send(
    `https://www.opentable.com/s/?term=${encodeURIComponent(name)}&covers=2&metroId=13`,
    "opentable-search",
  );
});

export default router;
