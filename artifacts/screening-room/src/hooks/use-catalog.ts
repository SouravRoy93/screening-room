import { useState, useEffect } from "react";
import type { MediaItem, DiningItem, PlaceItem } from "@/types";

const BASE = import.meta.env.BASE_URL;

export function useCatalog() {
  const [catalog, setCatalog] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}catalog.json?_=${Date.now()}`)
      .then(r => r.json())
      .then(d => setCatalog(Array.isArray(d) ? d : []))
      .catch(() => setCatalog([]))
      .finally(() => setLoading(false));
  }, []);

  return { catalog, loading };
}

export function useDining() {
  const [dining, setDining] = useState<DiningItem[]>([]);

  useEffect(() => {
    fetch(`${BASE}dining.json`)
      .then(r => r.json())
      .then(d => setDining(Array.isArray(d) ? d : []))
      .catch(() => setDining([]));
  }, []);

  return { dining };
}

export function usePlaces() {
  const [places, setPlaces] = useState<PlaceItem[]>([]);

  useEffect(() => {
    fetch(`${BASE}places.json`)
      .then(r => r.json())
      .then(d => setPlaces(Array.isArray(d) ? d : []))
      .catch(() => setPlaces([]));
  }, []);

  return { places };
}
