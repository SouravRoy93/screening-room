import { useState, useEffect } from "react";
import type { MediaItem, DiningItem, PlaceItem } from "@/types";

const BASE = import.meta.env.BASE_URL;

// Daily version tag: lets the browser/CDN cache catalogs for the day instead of
// re-downloading on every open, while still refreshing once a day after growth.
const _d = new Date();
const DAYV = `${_d.getUTCFullYear()}${String(_d.getUTCMonth() + 1).padStart(2, "0")}${String(_d.getUTCDate()).padStart(2, "0")}`;

export function useCatalog() {
  const [catalog, setCatalog] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const loadFull = () =>
      fetch(`${BASE}catalog.json?v=${DAYV}`)
        .then(r => r.json())
        .then(d => { if (alive && Array.isArray(d)) setCatalog(d); })
        .catch(() => {})
        .finally(() => { if (alive) setLoading(false); });

    // 1) Instant first paint from a small "top" file (top ~500 by popularity)…
    fetch(`${BASE}catalog-top.json?v=${DAYV}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && Array.isArray(d) && d.length) { setCatalog(d); setLoading(false); } })
      .catch(() => {})
      .finally(() => { loadFull(); });   // 2) …then hydrate the full catalog in the background

    return () => { alive = false; };
  }, []);

  return { catalog, loading };
}

export function useDining() {
  const [dining, setDining] = useState<DiningItem[]>([]);

  useEffect(() => {
    fetch(`${BASE}dining.json?v=${DAYV}`)
      .then(r => r.json())
      .then(d => setDining(Array.isArray(d) ? d : []))
      .catch(() => setDining([]));
  }, []);

  return { dining };
}

export function usePlaces() {
  const [places, setPlaces] = useState<PlaceItem[]>([]);

  useEffect(() => {
    fetch(`${BASE}places.json?v=${DAYV}`)
      .then(r => r.json())
      .then(d => setPlaces(Array.isArray(d) ? d : []))
      .catch(() => setPlaces([]));
  }, []);

  return { places };
}
