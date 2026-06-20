import { Router, type IRouter } from "express";

const router: IRouter = Router();

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "";
const BRANCH = "screening-room-growth";
const REPO = "SouravRoy93/screening-room";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  data: unknown[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

async function fetchJson(path: string): Promise<unknown[]> {
  const url = `${RAW_BASE}/${path}`;
  const headers: Record<string, string> = { "User-Agent": "ScreeningRoom/1.0" };
  if (GITHUB_TOKEN) headers["Authorization"] = `token ${GITHUB_TOKEN}`;

  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GitHub fetch failed: ${r.status} ${url}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function getCached(key: string, path: string): Promise<unknown[]> {
  const entry = cache.get(key);
  const now = Date.now();

  if (entry && now - entry.fetchedAt < CACHE_TTL) {
    return entry.data;
  }

  try {
    const data = await fetchJson(path);
    cache.set(key, { data, fetchedAt: now });
    return data;
  } catch (err) {
    if (entry) {
      return entry.data;
    }
    throw err;
  }
}

router.get("/catalog/places", async (_req, res): Promise<void> => {
  try {
    const data = await getCached(
      "places",
      "artifacts/screening-room/public/places.json"
    );
    res.json(data);
  } catch {
    res.status(502).json([]);
  }
});

router.get("/catalog/dining", async (_req, res): Promise<void> => {
  try {
    const data = await getCached(
      "dining",
      "artifacts/screening-room/public/dining.json"
    );
    res.json(data);
  } catch {
    res.status(502).json([]);
  }
});

router.get("/catalog/films", async (_req, res): Promise<void> => {
  try {
    const data = await getCached(
      "films",
      "artifacts/screening-room/public/catalog.json"
    );
    res.json(data);
  } catch {
    res.status(502).json([]);
  }
});

router.get("/catalog/cache-status", (_req, res): void => {
  const now = Date.now();
  const status: Record<string, unknown> = {};
  for (const [key, entry] of cache.entries()) {
    const ageMs = now - entry.fetchedAt;
    status[key] = {
      items: (entry.data as unknown[]).length,
      ageMinutes: Math.round(ageMs / 60000),
      expiresInMinutes: Math.round((CACHE_TTL - ageMs) / 60000),
    };
  }
  res.json({ branch: BRANCH, cache: status });
});

export default router;
