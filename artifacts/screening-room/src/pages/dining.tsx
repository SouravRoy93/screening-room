import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, UtensilsCrossed, ChevronDown, Star, Heart, CalendarCheck, Check } from "lucide-react";
import { useDining } from "@/hooks/use-catalog";
import { useAuth } from "@/hooks/use-auth";
import { pushSave, hydrateDining, migrateDiningLocal } from "@/lib/cloud-saves";
import { recognitionScore, haversineMeters } from "@/lib/pairing";
import { stampDiningFlag } from "@/lib/followups";
import { chooseDining } from "@/lib/choose";
import { ChooseForMe } from "@/components/choose-for-me";
import type { DiningItem } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Approximate neighbourhood centroids for NYC restaurants that lack exact coordinates.
// These are used by the "Near Me" tab so every curated NYC table participates in
// distance sorting — not just the 315 that have exact lat/lng in dining.json.
const NYC_NBHD_COORDS: Record<string, { lat: number; lng: number }> = {
  "Midtown":                  { lat: 40.7549, lng: -73.9840 },
  "Midtown (Theater District)":{ lat: 40.7590, lng: -73.9845 },
  "Midtown West":             { lat: 40.7549, lng: -73.9900 },
  "West Village":             { lat: 40.7340, lng: -74.0060 },
  "Flatiron":                 { lat: 40.7401, lng: -73.9900 },
  "Lower East Side":          { lat: 40.7154, lng: -73.9855 },
  "Tribeca":                  { lat: 40.7195, lng: -74.0100 },
  "Upper East Side":          { lat: 40.7736, lng: -73.9566 },
  "Chinatown":                { lat: 40.7157, lng: -73.9970 },
  "East Village":             { lat: 40.7265, lng: -73.9815 },
  "Koreatown":                { lat: 40.7484, lng: -73.9876 },
  "Williamsburg":             { lat: 40.7081, lng: -73.9571 },
  "Financial District":       { lat: 40.7074, lng: -74.0113 },
  "Soho":                     { lat: 40.7233, lng: -74.0030 },
  "SoHo":                     { lat: 40.7233, lng: -74.0030 },
  "Greenwich Village":        { lat: 40.7337, lng: -74.0003 },
  "Nolita":                   { lat: 40.7231, lng: -73.9946 },
  "Columbus Circle":          { lat: 40.7681, lng: -73.9820 },
  "Upper West Side":          { lat: 40.7870, lng: -73.9754 },
  "NoMad":                    { lat: 40.7448, lng: -73.9881 },
  "East Harlem":              { lat: 40.7957, lng: -73.9389 },
  "Downtown Brooklyn":        { lat: 40.6922, lng: -73.9903 },
  "DUMBO":                    { lat: 40.7033, lng: -73.9881 },
  "Carroll Gardens":          { lat: 40.6801, lng: -73.9997 },
  "Lincoln Center":           { lat: 40.7725, lng: -73.9836 },
  "Central Park South":       { lat: 40.7672, lng: -73.9800 },
  "Gramercy":                 { lat: 40.7373, lng: -73.9840 },
  "Chelsea":                  { lat: 40.7465, lng: -74.0014 },
  "Fort Greene":              { lat: 40.6912, lng: -73.9740 },
  "Hell's Kitchen":           { lat: 40.7640, lng: -73.9933 },
  "Murray Hill":              { lat: 40.7484, lng: -73.9790 },
  "Harlem":                   { lat: 40.8116, lng: -73.9465 },
  "Brooklyn Heights":         { lat: 40.6960, lng: -73.9939 },
  "Park Slope":               { lat: 40.6710, lng: -73.9779 },
};

interface SearchSuggestion {
  place_id: string;
  name: string;
  rating: number | null;
  user_rating_count: number | null;
  address: string;
  neighborhood: string;
  photo_url: string | null;
  static_id?: number;
}

// Module-level photo cache
const photoCache = new Map<string, string | null>();
const photoPending = new Map<string, Promise<string | null>>();

async function fetchThumbnail(id: number, name: string, neighborhood: string, borough: string): Promise<string | null> {
  const key = name.toLowerCase().trim();
  if (photoCache.has(key)) return photoCache.get(key) ?? null;
  if (photoPending.has(key)) return photoPending.get(key)!;
  const p = fetch(`${API_BASE}/places/thumbnail/${id}?name=${encodeURIComponent(name)}&neighborhood=${encodeURIComponent(neighborhood)}&borough=${encodeURIComponent(borough)}`)
    .then(r => r.ok ? r.json() : { photo_url: null })
    .then((d: { photo_url: string | null }) => { photoCache.set(key, d.photo_url); photoPending.delete(key); return d.photo_url; })
    .catch(() => { photoCache.set(key, null); photoPending.delete(key); return null; });
  photoPending.set(key, p);
  return p;
}

const ROPE: Record<number, { label: string; cls: string }> = {
  0: { label: "WALK-IN", cls: "r0" },
  1: { label: "WALK-IN", cls: "r0" },
  2: { label: "EASY", cls: "r2" },
  3: { label: "PLAN AHEAD", cls: "r3" },
  4: { label: "HARD TO GET", cls: "r4" },
  5: { label: "NEAR IMPOSSIBLE", cls: "r5" },
};
const priceStr = (p: number) => "$".repeat(Math.max(1, Math.min(4, p)));

function DiningCard({ r, onClick, onFlags }: { r: DiningItem; onClick: () => void; onFlags?: () => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [booked, setBooked] = useState(false);
  const [visited, setVisited] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fetched = useRef(false);

  useEffect(() => {
    setSaved(localStorage.getItem(`sr_dining_saved_${r.id}`) === "1");
    setBooked(localStorage.getItem(`sr_dining_booked_${r.id}`) === "1");
    setVisited(localStorage.getItem(`sr_dining_visited_${r.id}`) === "1");
  }, [r.id]);

  useEffect(() => {
    if (fetched.current) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !fetched.current) {
        fetched.current = true;
        obs.disconnect();
        fetchThumbnail(r.id, r.name, r.neighborhood || "", r.borough || "").then(setPhoto);
      }
    }, { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [r.id, r.name, r.neighborhood, r.borough]);

  const toggle = (type: "saved" | "booked" | "visited", e: React.MouseEvent) => {
    e.stopPropagation();
    const key = `sr_dining_${type === "saved" ? "saved" : type === "booked" ? "booked" : "visited"}_${r.id}`;
    const next = { saved, booked, visited };
    if (type === "saved") { next.saved = !saved; setSaved(next.saved); localStorage.setItem(key, next.saved ? "1" : "0"); }
    if (type === "booked") { next.booked = !booked; setBooked(next.booked); localStorage.setItem(key, next.booked ? "1" : "0"); }
    if (type === "visited") { next.visited = !visited; setVisited(next.visited); localStorage.setItem(key, next.visited ? "1" : "0"); }
    stampDiningFlag(r.id, type, next[type]);
    void pushSave("dining", r.id, r.name, next);
    onFlags?.();   // mirror to cloud when signed in
  };

  const diff = r.rope !== undefined ? ROPE[r.rope] : null;

  return (
    <div ref={ref} className="dc-card" onClick={onClick}>
      {/* Photo */}
      <div className="dc-photo">
        {photo ? (
          <img src={photo} alt={r.name} className={`dc-photo-img${photoLoaded ? " loaded" : ""}`} onLoad={() => setPhotoLoaded(true)} />
        ) : (
          <div className="dc-photo-placeholder"><UtensilsCrossed size={24} color="rgba(255,255,255,0.1)" /></div>
        )}
        <div className="dc-photo-gradient" />
        {diff && <div className={`dc-rope-badge ${diff.cls}`}>{diff.label}</div>}
        {r.recognition && <div className="dc-recog">{r.recognition}</div>}
      </div>

      {/* Body */}
      <div className="dc-body">
        {(r.neighborhood || r.city) && (
          <div className="dc-area">{[r.neighborhood, r.city].filter(Boolean).join(" · ")}</div>
        )}
        <h3 className="dc-name">{r.name}</h3>
        <p className="dc-meta">{r.cuisine}{` · ${priceStr(r.price)}`}</p>

        {r.format && <div className="dc-format-chip">{r.format.toUpperCase()}</div>}

        {r.occasion && r.occasion.length > 0 && (
          <div className="dc-occasions">
            {r.occasion.slice(0, 2).map(occ => <span key={occ} className="dc-occ-chip">{occ}</span>)}
          </div>
        )}

        <div className="dc-btns" onClick={e => e.stopPropagation()}>
          <button className={`dc-btn${saved ? " on" : ""}`} onClick={e => toggle("saved", e)} aria-label="Want to go"><Heart size={14} /><span>Want</span></button>
          <button className={`dc-btn${booked ? " on" : ""}`} onClick={e => toggle("booked", e)} aria-label="Booked"><CalendarCheck size={14} /><span>Booked</span></button>
          <button className={`dc-btn${visited ? " on2" : ""}`} onClick={e => toggle("visited", e)} aria-label="Been"><Check size={14} /><span>Been</span></button>
        </div>
      </div>
    </div>
  );
}

const OCCASIONS = ["Any occasion", "Date night", "Celebration", "Business", "Casual", "Family", "Big night out", "See & be seen", "Walk-in", "Group feast"];
const DIFFICULTIES = ["Any difficulty", "Walk in", "Easy", "Plan ahead", "Hard to get", "Near impossible"];


export default function Dining() {
  const [, nav] = useLocation();
  const { dining } = useDining();
  const { user } = useAuth();
  const [savesVersion, setSavesVersion] = useState(0);

  // Cloud sync: backfill local saves to Supabase once, then pull cloud saves
  // into localStorage and remount cards so they pick the merged state up.
  useEffect(() => {
    if (!user || dining.length === 0) return;
    (async () => {
      await migrateDiningLocal(dining);
      await hydrateDining();
      setSavesVersion(v => v + 1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, dining.length]);
  const [q, setQ] = useState("");
  const [mainTab, setMainTab] = useState<"discover" | "mytables" | "stats">("discover");
  const [tab, setTab] = useState<"trending" | "nearby">("trending");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoErr, setGeoErr] = useState(false);
  useEffect(() => {
    if (tab !== "nearby" || geo || geoErr) return;
    if (!navigator.geolocation) { setGeoErr(true); return; }
    navigator.geolocation.getCurrentPosition(
      pos => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoErr(true),
      { timeout: 8000 },
    );
  }, [tab, geo, geoErr]);
  const [cityFilter, setCityFilter] = useState("All cities");
  const [cuisineFilter, setCuisineFilter] = useState("All cuisines");
  const [occasionFilter, setOccasionFilter] = useState("Any occasion");
  const [diffFilter, setDiffFilter] = useState("Any difficulty");
  const [visible, setVisible] = useState(30);

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const cuisines = useMemo(() => {
    const s = new Set(dining.map(d => d.cuisine));
    return ["All cuisines", ...Array.from(s).sort()];
  }, [dining]);

  const cities = useMemo(() => {
    const s = new Set(dining.map(d => d.city).filter(Boolean) as string[]);
    return ["All cities", ...Array.from(s).sort()];
  }, [dining]);

  const DIFF_ROPE: Record<string, number[]> = {
    "Walk in": [0, 1], "Easy": [2], "Plan ahead": [3], "Hard to get": [4], "Near impossible": [5],
  };

  const filtered = useMemo(() => {
    let items = dining;
    if (cityFilter !== "All cities") items = items.filter(d => d.city === cityFilter);
    if (cuisineFilter !== "All cuisines") items = items.filter(d => d.cuisine === cuisineFilter);
    if (occasionFilter !== "Any occasion") items = items.filter(d => d.occasion?.some(o => o.toLowerCase().includes(occasionFilter.toLowerCase())));
    if (diffFilter !== "Any difficulty") {
      const allowed = DIFF_ROPE[diffFilter] || [];
      items = items.filter(d => allowed.includes(d.rope ?? 0));
    }
    return items;
  }, [dining, cityFilter, cuisineFilter, occasionFilter, diffFilter]);

  // The user's own tables, read from the same flags the cards write.
  const myFlags = useMemo(() => {
    const f = { saved: new Set<number>(), booked: new Set<number>(), visited: new Set<number>() };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        const m = /^sr_dining_(saved|booked|visited)_(\d+)$/.exec(k);
        if (m && localStorage.getItem(k) === "1") f[m[1] as "saved" | "booked" | "visited"].add(Number(m[2]));
      }
    } catch { /* private mode */ }
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savesVersion, dining.length]);
  const mine = useMemo(() => ({
    saved: dining.filter(d => myFlags.saved.has(d.id) && !myFlags.visited.has(d.id)),
    booked: dining.filter(d => myFlags.booked.has(d.id)),
    visited: dining.filter(d => myFlags.visited.has(d.id)),
  }), [dining, myFlags]);
  const mineCount = new Set([...myFlags.saved, ...myFlags.booked, ...myFlags.visited]).size;

  // Tabs actually order the shelf:
  //   trending = demand-led (rope DESC → recognition DESC) so hard-to-get, buzzy spots surface first
  //   all     = curated prestige order (data file order, unchanged)
  //   nearby  = distance-led, with neighbourhood centroid fallback for the ~165 NYC items
  //             that carry no exact lat/lng in dining.json
  const shown = useMemo(() => {
    if (tab === "trending") {
      // Sort by reservation demand first (rope 5 = Near Impossible = hottest tables),
      // then break ties by critical recognition. This deliberately differs from "All"
      // which preserves the curated prestige order.
      return [...filtered].sort((a, b) => {
        const ra = a.rope ?? 0;
        const rb = b.rope ?? 0;
        if (rb !== ra) return rb - ra;
        return recognitionScore(b.recognition) - recognitionScore(a.recognition) || a.id - b.id;
      });
    }
    if (tab === "nearby" && geo) {
      // Resolve coordinates: exact lat/lng first, neighbourhood centroid as fallback.
      const getCoords = (d: DiningItem) => {
        if (typeof d.lat === "number" && typeof d.lng === "number") return { lat: d.lat, lng: d.lng };
        return NYC_NBHD_COORDS[d.neighborhood] ?? null;
      };
      const withD = filtered
        .map(d => { const c = getCoords(d); return c ? { d, m: haversineMeters(geo, c) } : null; })
        .filter((x): x is { d: DiningItem; m: number } => x !== null)
        .sort((a, b) => a.m - b.m)
        .map(x => x.d);
      // Anything with no coords at all (non-NYC cities without centroids) goes to the end
      const noCoord = filtered.filter(d => !getCoords(d));
      return [...withD, ...noCoord];
    }
    return filtered;
  }, [filtered, tab, geo]);

  useEffect(() => { setVisible(30); }, [cityFilter, cuisineFilter, occasionFilter, diffFilter, tab, mainTab]);

  const runSearch = useCallback(async (val: string) => {
    const trimmed = val.trim();
    if (trimmed.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }

    const lq = trimmed.toLowerCase();
    const localMatches: SearchSuggestion[] = dining
      .filter(d => d.name.toLowerCase().includes(lq) || d.cuisine.toLowerCase().includes(lq) || (d.neighborhood || "").toLowerCase().includes(lq))
      .slice(0, 3)
      .map(d => ({
        place_id: `static-${d.id}`,
        name: d.name,
        rating: null,
        user_rating_count: null,
        address: [d.neighborhood, d.borough].filter(Boolean).join(", "),
        neighborhood: d.neighborhood || "",
        photo_url: null,
        static_id: d.id,
      }));

    try {
      const res = await fetch(`${API_BASE}/places/search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) { setSuggestions(localMatches); setShowSuggestions(true); return; }
      const live: SearchSuggestion[] = await res.json();
      const liveFiltered = live.filter(l => !localMatches.some(lm => lm.name.toLowerCase() === l.name.toLowerCase()));
      const combined = [...localMatches, ...liveFiltered].slice(0, 6);
      setSuggestions(combined);
      setShowSuggestions(true);
    } catch {
      setSuggestions(localMatches);
      setShowSuggestions(localMatches.length > 0);
    }
  }, [dining]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(() => runSearch(q), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, runSearch]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSuggestionClick = (s: SearchSuggestion) => {
    setShowSuggestions(false);
    setQ("");
    if (s.static_id != null) {
      nav(`/dining/${s.static_id}`);
    } else {
      nav(`/dining/live?name=${encodeURIComponent(s.name)}&neighborhood=${encodeURIComponent(s.neighborhood)}&address=${encodeURIComponent(s.address)}&place_id=${encodeURIComponent(s.place_id)}`);
    }
  };

  // Stats derived from the user's own saved/booked/visited tables
  const visitedItems = mine.visited;
  const cuisineStats = useMemo(() => {
    const counts: Record<string, number> = {};
    visitedItems.forEach(d => { counts[d.cuisine] = (counts[d.cuisine] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [visitedItems]);
  const nbhdStats = useMemo(() => {
    const counts: Record<string, number> = {};
    visitedItems.forEach(d => { if (d.neighborhood) counts[d.neighborhood] = (counts[d.neighborhood] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [visitedItems]);

  return (
    <div className="min-h-screen bg-background">

      {/* Header — matches Entertainment layout */}
      <div className="cat-header-wrap">
        <div className="cat-header">
          <button className="homebtn" onClick={() => nav("/")}>← Hub</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UtensilsCrossed size={16} style={{ color: "rgba(255,255,255,0.5)" }} />
            <span style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Dining</span>
          </div>
          <div className="headright">
            <div className="tabs">
              <button className={mainTab === "discover" ? "active" : ""} onClick={() => setMainTab("discover")}>Discover</button>
              <button className={mainTab === "mytables" ? "active" : ""} onClick={() => setMainTab("mytables")}>
                My Tables{mineCount > 0 ? ` (${mineCount})` : ""}
              </button>
              <button className={mainTab === "stats" ? "active" : ""} onClick={() => setMainTab("stats")}>Stats</button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-5">

        {/* ── DISCOVER ── */}
        {mainTab === "discover" && (
          <>
            <div className="dc-filter-row">
              {/* Search with autocomplete */}
              <div className="dc-search-row" ref={searchWrapRef}>
                <div className="dc-search-wrap">
                  <Search className="dc-search-icon" size={14} />
                  <input
                    type="text"
                    placeholder="Search NYC restaurants..."
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                    className="dc-search-input"
                    autoComplete="off"
                  />
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="dc-suggestions">
                    {suggestions.map(s => (
                      <button key={s.place_id} className="dc-suggestion" onMouseDown={() => handleSuggestionClick(s)}>
                        <div className="dc-sug-photo">
                          {s.photo_url
                            ? <img src={s.photo_url} alt={s.name} />
                            : <div className="dc-sug-photo-placeholder">{s.name[0]}</div>
                          }
                        </div>
                        <div className="dc-sug-info">
                          <span className="dc-sug-name">{s.name}</span>
                          <span className="dc-sug-meta">
                            {s.rating && <><Star size={10} fill="#ffd36b" color="#ffd36b" style={{ display: "inline", marginRight: 2 }} />{s.rating.toFixed(1)} · </>}
                            {s.address || s.neighborhood || "NYC Restaurant"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sort tabs + filter dropdowns */}
              <div className="dc-controls-row">
                <div className="dc-tabs">
                  <button className={`dc-tab${tab === "trending" ? " on" : ""}`} onClick={() => setTab("trending")}>🔥 Trending</button>
                  <button className={`dc-tab${tab === "nearby" ? " on" : ""}`} onClick={() => setTab("nearby")}>📍 Near Me</button>
                </div>
                <div className="dc-dropdowns">
                  <div className="dc-select-wrap">
                    <select className="dc-select" value={cityFilter} onChange={e => setCityFilter(e.target.value)}>
                      {cities.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={12} className="dc-select-chevron" />
                  </div>
                  <div className="dc-select-wrap">
                    <select className="dc-select" value={cuisineFilter} onChange={e => setCuisineFilter(e.target.value)}>
                      {cuisines.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={12} className="dc-select-chevron" />
                  </div>
                  <div className="dc-select-wrap">
                    <select className="dc-select" value={occasionFilter} onChange={e => setOccasionFilter(e.target.value)}>
                      {OCCASIONS.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <ChevronDown size={12} className="dc-select-chevron" />
                  </div>
                  <div className="dc-select-wrap">
                    <select className="dc-select" value={diffFilter} onChange={e => setDiffFilter(e.target.value)}>
                      {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
                    </select>
                    <ChevronDown size={12} className="dc-select-chevron" />
                  </div>
                </div>
              </div>
            </div>

            {shown.length > 0 && (
              <ChooseForMe
                noun="table"
                verb="Take me there"
                pick={ex => chooseDining({
                  candidates: shown,
                  all: dining,
                  history: [
                    ...[...myFlags.saved].map(id => ({ diningId: id, status: "want" as const })),
                    ...[...myFlags.booked].map(id => ({ diningId: id, status: "booked" as const })),
                    ...[...myFlags.visited].map(id => ({ diningId: id, status: "visited" as const })),
                  ],
                  now: new Date(),
                  exclude: ex,
                })}
              />
            )}

            {tab === "nearby" && !geo && (
              <p className="text-center text-muted-foreground text-sm py-3">
                {geoErr ? "Location unavailable — showing every table." : "Finding tables near you…"}
              </p>
            )}

            <div className="dc-grid">
              {shown.slice(0, visible).map(r => (
                <DiningCard key={`${r.id}-${savesVersion}`} r={r} onClick={() => nav(`/dining/${r.id}`)} onFlags={() => setSavesVersion(v => v + 1)} />
              ))}
            </div>

            {shown.length > visible && (
              <div className="dc-viewmore-wrap">
                <button className="dc-viewmore" onClick={() => setVisible(v => v + 30)}>
                  VIEW MORE RESTAURANTS <ChevronDown size={14} />
                </button>
              </div>
            )}

            {shown.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-16">No restaurants found.</p>
            )}
          </>
        )}

        {/* ── MY TABLES ── */}
        {mainTab === "mytables" && (
          mineCount === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-16">
              Nothing saved yet — tap ♥ Want, Booked, or Been on any table and it appears here.
            </p>
          ) : (
            <>
              {([["Want to go", mine.saved], ["Booked", mine.booked], ["Been", mine.visited]] as [string, DiningItem[]][])
                .filter(([, items]) => items.length > 0)
                .map(([label, items]) => (
                  <section key={label}>
                    <h2 className="dc-mine-head">{label} <span>{items.length}</span></h2>
                    <div className="dc-grid">
                      {items.map(r => (
                        <DiningCard key={`${r.id}-${savesVersion}`} r={r} onClick={() => nav(`/dining/${r.id}`)} onFlags={() => setSavesVersion(v => v + 1)} />
                      ))}
                    </div>
                  </section>
                ))}
            </>
          )
        )}

        {/* ── STATS ── */}
        {mainTab === "stats" && (
          visitedItems.length === 0 && mine.saved.length === 0 && mine.booked.length === 0 ? (
            <div className="empty">Mark tables as Booked or Been to see your dining stats.</div>
          ) : (
            <>
              <div className="stats-grid">
                {[
                  { label: "Been", value: mine.visited.length, color: "#2f9e44" },
                  { label: "Booked", value: mine.booked.length, color: "#f08c00" },
                  { label: "Want to go", value: mine.saved.length, color: "#1098ad" },
                  { label: "Total tracked", value: mineCount, color: "#8b5cf6" },
                ].map(s => (
                  <div key={s.label} className="stat-card">
                    <div className="sl">{s.label}</div>
                    <div className="sv" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {cuisineStats.length > 0 && (
                <>
                  <div className="bars-head">Cuisines visited</div>
                  <div className="bars">
                    {cuisineStats.map(([cuisine, count]) => (
                      <div key={cuisine} className="bar">
                        <span className="bl">{cuisine}</span>
                        <div className="bf-wrap">
                          <div className="bf" style={{ width: `${(count / cuisineStats[0][1]) * 100}%` }} />
                        </div>
                        <span className="bc">{count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {nbhdStats.length > 0 && (
                <>
                  <div className="bars-head" style={{ marginTop: 24 }}>Neighbourhoods</div>
                  <div className="bars">
                    {nbhdStats.map(([nbhd, count]) => (
                      <div key={nbhd} className="bar">
                        <span className="bl">{nbhd}</span>
                        <div className="bf-wrap">
                          <div className="bf" style={{ width: `${(count / nbhdStats[0][1]) * 100}%`, background: "linear-gradient(90deg,#ec4899,#be185d)" }} />
                        </div>
                        <span className="bc">{count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )
        )}

      </div>
    </div>
  );
}
