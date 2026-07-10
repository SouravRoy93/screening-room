import { Router, type IRouter } from "express";
import { BoundedMap } from "../lib/bounded-map";

const router: IRouter = Router();
const PLACES_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
const PLACES_BASE = "https://places.googleapis.com/v1";

// ── Input safety for outgoing Google requests (prevents SSRF / path injection) ──
// Google place IDs and photo resource names have a constrained character set;
// validating them before they reach a request URL breaks any user-controlled
// path/host manipulation (CWE-918). Free text only ever goes in an encoded
// query string, but we still strip control/structural characters and cap length.
const SAFE_PLACE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_PHOTO_NAME = /^[A-Za-z0-9_./-]+$/;
function qstr(v: unknown): string { return typeof v === "string" ? v : ""; } // Express query params may be arrays (CWE-843)
function cleanQueryText(s: string): string {
  return s.replace(/[^\p{L}\p{N}\s,&'.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

async function findPlace(name: string, neighborhood: string, borough: string): Promise<string | null> {
  const query = cleanQueryText(`${name} restaurant ${neighborhood} ${borough} New York`);
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${PLACES_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json() as { candidates?: { place_id: string }[] };
  return data.candidates?.[0]?.place_id || null;
}

async function getPlaceDetails(placeId: string) {
  const fields = [
    "id", "displayName", "formattedAddress", "internationalPhoneNumber",
    "websiteUri", "regularOpeningHours", "rating", "userRatingCount",
    "photos", "reviews", "googleMapsUri", "priceLevel", "types",
    "currentOpeningHours",
  ].join(",");
  if (!SAFE_PLACE_ID.test(placeId)) {
    throw Object.assign(new Error("Invalid place id"), { status: 400 });
  }
  const url = `${PLACES_BASE}/places/${placeId}?fields=${fields}&key=${PLACES_KEY}&languageCode=en`;
  const r = await fetch(url, {
    headers: { "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": fields },
  });
  if (!r.ok) {
    const text = await r.text();
    throw Object.assign(new Error("Places API error"), { status: r.status, body: text });
  }
  return r.json();
}

// Resolve to actual CDN URL server-side so the API key is never exposed to the browser
async function resolveCdnUrl(photoName: string, maxWidth = 800): Promise<string | null> {
  if (!SAFE_PHOTO_NAME.test(photoName) || photoName.includes("..")) return null;
  const url = `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxWidth}&key=${PLACES_KEY}&skipHttpRedirect=true`;
  const r = await fetch(url, { headers: { "X-Goog-Api-Key": PLACES_KEY } });
  if (!r.ok) return null;
  const data = await r.json() as { photoUri?: string };
  return data.photoUri || null;
}

// ── Live restaurant search ───────────────────────────────────────────────────
const searchCache = new BoundedMap<string, { ts: number; results: unknown[] }>(300);

router.get("/places/search", async (req, res): Promise<void> => {
  const q = qstr(req.query.q).trim();
  if (!q || q.length < 2) { res.json([]); return; }
  if (!PLACES_KEY) { res.json([]); return; }

  const cacheKey = q.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60_000) { res.json(cached.results); return; }

  try {
    const body = {
      textQuery: `${q} restaurant New York City`,
      includedType: "restaurant",
      locationBias: {
        circle: { center: { latitude: 40.758, longitude: -73.9855 }, radius: 30000 },
      },
      maxResultCount: 6,
    };
    const r = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.photos",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { res.json([]); return; }
    const data = await r.json() as { places?: Record<string, unknown>[] };
    const places = data.places || [];

    const results = await Promise.all(places.map(async (p) => {
      const photos = p.photos as { name: string }[] | undefined;
      const photoUrl = photos?.[0] ? await resolveCdnUrl(photos[0].name, 400) : null;
      const address = (p.formattedAddress as string) || "";
      const addrParts = address.split(",");
      const neighborhood = addrParts.length >= 3 ? addrParts[addrParts.length - 3]?.trim() || "" : "";
      return {
        place_id: p.id,
        name: (p.displayName as { text: string })?.text || "",
        rating: p.rating || null,
        user_rating_count: p.userRatingCount || null,
        address,
        neighborhood,
        photo_url: photoUrl,
      };
    }));

    searchCache.set(cacheKey, { ts: Date.now(), results });
    res.json(results);
  } catch {
    res.json([]);
  }
});

// ── General landmark / attraction search ─────────────────────────────────────
const exploreCache = new BoundedMap<string, { ts: number; results: unknown[] }>(300);

router.get("/places/explore", async (req, res): Promise<void> => {
  const q = qstr(req.query.q).trim();
  if (!q || q.length < 2) { res.json([]); return; }
  if (!PLACES_KEY) { res.json([]); return; }

  const cacheKey = q.toLowerCase();
  const cached = exploreCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 120_000) { res.json(cached.results); return; }

  try {
    const body = {
      textQuery: `${q} New York City`,
      locationBias: {
        circle: { center: { latitude: 40.7128, longitude: -74.006 }, radius: 50000 },
      },
      maxResultCount: 8,
    };
    const r = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.photos,places.types,places.shortFormattedAddress",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { res.json([]); return; }
    const data = await r.json() as { places?: Record<string, unknown>[] };
    const places = data.places || [];

    const results = await Promise.all(places.map(async (p) => {
      const photos = p.photos as { name: string }[] | undefined;
      const photoUrl = photos?.[0] ? await resolveCdnUrl(photos[0].name, 600) : null;
      const address = (p.formattedAddress as string) || "";
      const shortAddress = (p.shortFormattedAddress as string) || address.split(",").slice(0, 2).join(", ");
      const types = (p.types as string[] | undefined) || [];
      return {
        place_id: p.id,
        name: (p.displayName as { text: string })?.text || "",
        rating: (p.rating as number) || null,
        user_rating_count: (p.userRatingCount as number) || null,
        address,
        short_address: shortAddress,
        photo_url: photoUrl,
        types,
      };
    }));

    exploreCache.set(cacheKey, { ts: Date.now(), results });
    res.json(results);
  } catch {
    res.json([]);
  }
});

// ── Thumbnail cache ─────────────────────────────────────────────────────────
const thumbCache = new BoundedMap<string, string | null>(1000);

router.get("/places/thumbnail/:id", async (req, res): Promise<void> => {
  const name = qstr(req.query.name);
  const neighborhood = qstr(req.query.neighborhood);
  const borough = qstr(req.query.borough);
  if (!name) { res.json({ photo_url: null }); return; }
  if (!PLACES_KEY) { res.json({ photo_url: null }); return; }

  const cacheKey = name.toLowerCase().trim();
  if (thumbCache.has(cacheKey)) {
    res.json({ photo_url: thumbCache.get(cacheKey) ?? null });
    return;
  }

  try {
    const placeId = await findPlace(name, neighborhood || "", borough || "");
    if (!placeId) { thumbCache.set(cacheKey, null); res.json({ photo_url: null }); return; }

    const url = `${PLACES_BASE}/places/${placeId}?fields=photos&key=${PLACES_KEY}`;
    const r = await fetch(url, { headers: { "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": "photos" } });
    if (!r.ok) { thumbCache.set(cacheKey, null); res.json({ photo_url: null }); return; }

    const data = await r.json() as { photos?: { name: string }[] };
    const first = data.photos?.[0];
    const cdnUrl = first ? await resolveCdnUrl(first.name, 600) : null;
    thumbCache.set(cacheKey, cdnUrl);
    res.json({ photo_url: cdnUrl });
  } catch {
    res.json({ photo_url: null });
  }
});

// ── Full restaurant detail ───────────────────────────────────────────────────
router.get("/places/restaurant/:id", async (req, res): Promise<void> => {
  const name = qstr(req.query.name);
  const neighborhood = qstr(req.query.neighborhood);
  const borough = qstr(req.query.borough);
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  if (!PLACES_KEY) { res.status(503).json({ error: "Google Places not configured" }); return; }

  try {
    const placeId = await findPlace(name, neighborhood || "", borough || "");
    if (!placeId) { res.status(404).json({ error: "Place not found" }); return; }

    const detail = await getPlaceDetails(placeId) as Record<string, unknown>;

    // Resolve all photo CDN URLs concurrently
    const rawPhotos = (detail.photos as { name: string }[] | undefined) || [];
    const photos = (await Promise.all(
      rawPhotos.slice(0, 6).map(p => resolveCdnUrl(p.name, 800))
    )).filter((u): u is string => Boolean(u));

    const reviews = ((detail.reviews as Record<string, unknown>[] | undefined) || [])
      .slice(0, 5)
      .map(r => ({
        author: (r.authorAttribution as Record<string, string>)?.displayName || "Anonymous",
        rating: r.rating,
        text: (r.text as Record<string, string>)?.text || "",
        relativeTime: r.relativePublishTimeDescription,
      }));

    const hours = (detail.currentOpeningHours as Record<string, unknown> | undefined)
      || (detail.regularOpeningHours as Record<string, unknown> | undefined);
    const weekdayText = (hours?.weekdayDescriptions as string[] | undefined) || [];
    const todayIndex = new Date().getDay();
    const todayText = weekdayText[(todayIndex + 6) % 7] || null;
    const todayHours = todayText ? todayText.replace(/^[A-Za-z]+:\s*/, "") : null;

    res.json({
      place_id: placeId,
      name: (detail.displayName as Record<string, string>)?.text || name,
      address: detail.formattedAddress || null,
      phone: detail.internationalPhoneNumber || null,
      website: detail.websiteUri || null,
      maps_url: detail.googleMapsUri || null,
      rating: detail.rating || null,
      user_rating_count: detail.userRatingCount || null,
      today_hours: todayHours,
      all_hours: weekdayText,
      photos,
      reviews,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; body?: string };
    req.log.error({ err: e, body: err.body }, "Google Places error");
    if (err.status === 404) { res.status(404).json({ error: "Not found" }); return; }
    res.status(502).json({ error: "Places API unavailable" });
  }
});

// ── Curated place photo (resolve a stored photoName / placeId live) ──────────
const curatedPhotoCache = new BoundedMap<string, string | null>(1000);

router.get("/places/photo", async (req, res): Promise<void> => {
  const photoName = qstr(req.query.name);
  const placeId   = qstr(req.query.placeId);
  const w = Math.min(parseInt(qstr(req.query.w) || "640", 10) || 640, 1600);
  if (!PLACES_KEY) { res.json({ photo_url: null }); return; }

  const cacheKey = (photoName || placeId) + ":" + w;
  if (curatedPhotoCache.has(cacheKey)) {
    res.json({ photo_url: curatedPhotoCache.get(cacheKey) ?? null });
    return;
  }
  try {
    // 1) try the stored photo name (cheap — works only if still valid)
    let url = photoName ? await resolveCdnUrl(photoName, w) : null;
    // 2) stored Google photo tokens EXPIRE — fall back to a FRESH lookup by the
    //    stable placeId, which always returns a currently-valid photo.
    if (!url && placeId) {
      const r = await fetch(`${PLACES_BASE}/places/${placeId}?fields=photos&key=${PLACES_KEY}`, {
        headers: { "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": "photos" },
      });
      if (r.ok) {
        const d = await r.json() as { photos?: { name: string }[] };
        const fresh = d.photos?.[0]?.name;
        if (fresh) url = await resolveCdnUrl(fresh, w);
      }
    }
    // only cache successful resolves, so a transient null can recover on reload
    if (url) curatedPhotoCache.set(cacheKey, url);
    res.json({ photo_url: url });
  } catch {
    res.json({ photo_url: null });
  }
});

// ── Generic place search (id + location) — for places detail & dining geocoding ──
async function searchPlace(query: string): Promise<{ id: string; lat: number | null; lng: number | null } | null> {
  if (!PLACES_KEY) return null;
  const r = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": "places.id,places.location" },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!r.ok) return null;
  const d = await r.json() as { places?: { id: string; location?: { latitude: number; longitude: number } }[] };
  const p = d.places?.[0];
  if (!p) return null;
  return { id: p.id, lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null };
}

// ── Geocode by name (cached) — used by the dining map for items without coords ──
const geoCache = new BoundedMap<string, { lat: number | null; lng: number | null }>(1000);
router.get("/places/geocode", async (req, res): Promise<void> => {
  const q = qstr(req.query.q).trim();
  if (!q) { res.json({ lat: null, lng: null }); return; }
  const key = q.toLowerCase();
  if (geoCache.has(key)) { res.json(geoCache.get(key)); return; }
  try {
    const hit = await searchPlace(q);
    const out = { lat: hit?.lat ?? null, lng: hit?.lng ?? null };
    geoCache.set(key, out);
    res.json(out);
  } catch { res.json({ lat: null, lng: null }); }
});

// ── Place detail (reviews + full-res photos + maps link) for the Places detail page ──
const placeDetailCache = new BoundedMap<string, unknown>(500);
router.get("/places/detail", async (req, res): Promise<void> => {
  const placeIdQ = qstr(req.query.placeId);
  const name = qstr(req.query.name);
  const area = qstr(req.query.area);
  if (!PLACES_KEY) { res.json({ reviews: [], photos: [], maps_url: null }); return; }
  const cacheKey = placeIdQ || `${name}|${area}`;
  if (placeDetailCache.has(cacheKey)) { res.json(placeDetailCache.get(cacheKey)); return; }
  try {
    let placeId = placeIdQ;
    if (!placeId && name) {
      const hit = await searchPlace(`${name} ${area} New York`);
      placeId = hit?.id || "";
    }
    if (!placeId) { res.json({ reviews: [], photos: [], maps_url: null }); return; }

    const detail = await getPlaceDetails(placeId) as Record<string, unknown>;
    const rawPhotos = (detail.photos as { name: string }[] | undefined) || [];
    const photos = (await Promise.all(rawPhotos.slice(0, 6).map(p => resolveCdnUrl(p.name, 1280))))
      .filter((u): u is string => Boolean(u));
    const reviews = ((detail.reviews as Record<string, unknown>[] | undefined) || [])
      .slice(0, 5)
      .map(r => ({
        author: (r.authorAttribution as Record<string, string>)?.displayName || "Anonymous",
        rating: r.rating,
        text: (r.text as Record<string, string>)?.text || "",
        relativeTime: r.relativePublishTimeDescription,
      }));
    const out = {
      place_id: placeId,
      maps_url: detail.googleMapsUri || null,
      rating: detail.rating || null,
      user_rating_count: detail.userRatingCount || null,
      photos,
      reviews,
    };
    placeDetailCache.set(cacheKey, out);
    res.json(out);
  } catch {
    res.json({ reviews: [], photos: [], maps_url: null });
  }
});

// ── Live nearby-dining fallback (for places outside curated dining cities) ──
// Mirrors the pairing engine's spirit: bias the Google query by the place's
// mood-derived context, return a small ranked set with a walk time + reason.
const nearbyDiningCache = new BoundedMap<string, unknown>(400);

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

router.get("/places/dining-nearby", async (req, res): Promise<void> => {
  const lat = parseFloat(qstr(req.query.lat));
  const lng = parseFloat(qstr(req.query.lng));
  const context = (qstr(req.query.context) || "popular restaurant").slice(0, 60);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) { res.json([]); return; }
  if (!PLACES_KEY) { res.json([]); return; }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}|${context.toLowerCase()}`;
  const cached = nearbyDiningCache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const body = {
      textQuery: context,
      includedType: "restaurant",
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 1500 } },
      maxResultCount: 8,
    };
    const r = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.rating,places.userRatingCount,places.location,places.primaryTypeDisplayName,places.googleMapsUri,places.photos",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { res.json([]); return; }
    const data = (await r.json()) as { places?: Record<string, unknown>[] };
    const places = data.places || [];

    const scored = places.map((p) => {
      const loc = p.location as { latitude: number; longitude: number } | undefined;
      const distM = loc ? haversineM({ lat, lng }, { lat: loc.latitude, lng: loc.longitude }) : null;
      const walkMin = distM != null ? Math.max(1, Math.round((distM * 1.3) / 80)) : null;
      const rating = (p.rating as number) || null;
      const ratingCount = (p.userRatingCount as number) || null;
      // Simple blended rank: rating quality + proximity.
      const q = rating ? (rating - 3) / 2 : 0; // 3★→0, 5★→1
      const prox = walkMin != null ? Math.max(0, 1 - walkMin / 25) : 0.2;
      const rank = 0.55 * Math.max(0, q) + 0.45 * prox;
      return { p, loc, walkMin, rating, ratingCount, rank };
    });
    scored.sort((a, b) => b.rank - a.rank);

    const out = await Promise.all(
      scored.slice(0, 4).map(async (s) => {
        const p = s.p;
        const photos = p.photos as { name: string }[] | undefined;
        const photo_url = photos?.[0] ? await resolveCdnUrl(photos[0].name, 400) : null;
        const cuisine = (p.primaryTypeDisplayName as { text: string } | undefined)?.text || null;
        const walk = s.walkMin != null ? `${s.walkMin}-min walk` : "nearby";
        const reason = s.rating
          ? `${walk} · ${s.rating}★ (${s.ratingCount ?? 0}) — highly rated close by`
          : `${walk} · a nearby option`;
        return {
          name: (p.displayName as { text: string })?.text || "",
          cuisine,
          reason,
          rating: s.rating,
          user_rating_count: s.ratingCount,
          photo_url,
          maps_url: (p.googleMapsUri as string) || null,
          walkMin: s.walkMin,
        };
      }),
    );

    nearbyDiningCache.set(cacheKey, out);
    res.json(out);
  } catch {
    res.json([]);
  }
});

export default router;
