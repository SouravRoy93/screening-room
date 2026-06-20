import { useState, useEffect } from "react";
import type { MediaItem, DiningItem, PlaceItem } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "";
const STATIC_BASE = import.meta.env.BASE_URL;

async function fetchWithFallback<T>(apiPath: string, staticPath: string): Promise<T[]> {
  try {
    const r = await fetch(`${API_BASE}${apiPath}`);
    if (!r.ok) throw new Error(`API ${r.status}`);
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch {
    const r = await fetch(`${STATIC_BASE}${staticPath}`);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  }
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithFallback<MediaItem>("/catalog/films", "catalog.json")
      .then(setCatalog)
      .finally(() => setLoading(false));
  }, []);

  return { catalog, loading };
}

export function useDining() {
  const [dining, setDining] = useState<DiningItem[]>([]);

  useEffect(() => {
    fetchWithFallback<DiningItem>("/catalog/dining", "dining.json")
      .then(setDining);
  }, []);

  return { dining };
}

export function usePlaces() {
  const [places, setPlaces] = useState<PlaceItem[]>([]);

  useEffect(() => {
    fetchWithFallback<PlaceItem>("/catalog/places", "places.json")
      .then(setPlaces);
  }, []);

  return { places };
}
