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

function photoUrl(photoName: string, maxWidth = 800): string {
  return `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxWidth}&key=${PLACES_KEY}&skipHttpRedirect=false`;
}

router.get("/places/restaurant/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const { name, neighborhood, borough } = req.query as Record<string, string>;

  if (!name) { res.status(400).json({ error: "name required" }); return; }
  if (!PLACES_KEY) { res.status(503).json({ error: "Google Places not configured" }); return; }

  try {
    const placeId = await findPlace(name, neighborhood || "", borough || "");
    if (!placeId) { res.status(404).json({ error: "Place not found" }); return; }

    const detail = await getPlaceDetails(placeId) as Record<string, unknown>;

    const photos = ((detail.photos as Record<string, string>[] | undefined) || [])
      .slice(0, 6)
      .map(p => photoUrl(p.name));

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

    const todayIndex = new Date().getDay(); // 0=Sun
    const weekdayText = (hours?.weekdayDescriptions as string[] | undefined) || [];
    // weekdayDescriptions is Mon(0)..Sun(6) in Places API v1
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

export default router;
