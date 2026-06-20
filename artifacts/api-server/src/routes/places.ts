import { Router, type IRouter } from "express";

const router: IRouter = Router();
const PLACES_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
const PLACES_BASE = "https://places.googleapis.com/v1";

async function findPlace(name: string, neighborhood: string, borough: string): Promise<string | null> {
  const query = `${name} restaurant ${neighborhood} ${borough} New York`;
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
  const url = `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxWidth}&key=${PLACES_KEY}&skipHttpRedirect=true`;
  const r = await fetch(url, { headers: { "X-Goog-Api-Key": PLACES_KEY } });
  if (!r.ok) return null;
  const data = await r.json() as { photoUri?: string };
  return data.photoUri || null;
}

// ── Live restaurant search ───────────────────────────────────────────────────
const searchCache = new Map<string, { ts: number; results: unknown[] }>();

router.get("/places/search", async (req, res): Promise<void> => {
  const q = (req.query.q as string || "").trim();
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
const exploreCache = new Map<string, { ts: number; results: unknown[] }>();

router.get("/places/explore", async (req, res): Promise<void> => {
  const q = (req.query.q as string || "").trim();
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
const thumbCache = new Map<string, string | null>();

router.get("/places/thumbnail/:id", async (req, res): Promise<void> => {
  const { name, neighborhood, borough } = req.query as Record<string, string>;
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
  const { name, neighborhood, borough } = req.query as Record<string, string>;
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
const curatedPhotoCache = new Map<string, string | null>();

router.get("/places/photo", async (req, res): Promise<void> => {
  const photoName = (req.query.name as string) || "";
  const placeId   = (req.query.placeId as string) || "";
  const w = Math.min(parseInt((req.query.w as string) || "640", 10) || 640, 1600);
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

export default router;
