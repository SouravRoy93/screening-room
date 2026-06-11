import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, UtensilsCrossed, ChevronDown, Star } from "lucide-react";
import { useDining } from "@/hooks/use-catalog";
import type { DiningItem } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "";

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

const ROPE_LABEL: Record<number, string> = { 3: "PLAN AHEAD", 4: "HARD TO GET", 5: "NEAR IMPOSSIBLE" };
const priceStr = (p: number) => "$".repeat(Math.max(1, Math.min(4, p)));

function DiningCard({ r, onClick }: { r: DiningItem; onClick: () => void }) {
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
    if (type === "saved") { const v = !saved; setSaved(v); localStorage.setItem(key, v ? "1" : "0"); }
    if (type === "booked") { const v = !booked; setBooked(v); localStorage.setItem(key, v ? "1" : "0"); }
    if (type === "visited") { const v = !visited; setVisited(v); localStorage.setItem(key, v ? "1" : "0"); }
  };

  const ropeLabel = r.rope !== undefined ? ROPE_LABEL[r.rope] : null;

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
        {ropeLabel && <div className="dc-rope-badge">{ropeLabel}</div>}
        {r.recognition && <div className="dc-recog">{r.recognition}</div>}
      </div>

      {/* Body */}
      <div className="dc-body">
        <h3 className="dc-name">{r.name}</h3>
        <p className="dc-meta">{r.cuisine}{r.neighborhood ? ` · ${r.neighborhood}` : ""}{` · ${priceStr(r.price)}`}</p>

        {r.format && <div className="dc-format-chip">{r.format.toUpperCase()}</div>}

        {r.occasion && r.occasion.length > 0 && (
          <div className="dc-occasions">
            {r.occasion.slice(0, 2).map(occ => <span key={occ} className="dc-occ-chip">{occ}</span>)}
          </div>
        )}

        {r.signature && (
          <p className="dc-order"><span className="dc-order-label">ORDER</span> {r.signature}</p>
        )}

        <div className="dc-btns" onClick={e => e.stopPropagation()}>
          <button className={`dc-btn${saved ? " on" : ""}`} onClick={e => toggle("saved", e)}>Want to go</button>
          <button className={`dc-btn${booked ? " on" : ""}`} onClick={e => toggle("booked", e)}>Booked</button>
          <button className={`dc-btn${visited ? " on" : ""}`} onClick={e => toggle("visited", e)}>Been</button>
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
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"trending" | "all" | "nearby">("trending");
  const [cuisineFilter, setCuisineFilter] = useState("All cuisines");
  const [occasionFilter, setOccasionFilter] = useState("Any occasion");
  const [diffFilter, setDiffFilter] = useState("Any difficulty");

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const cuisines = useMemo(() => {
    const s = new Set(dining.map(d => d.cuisine));
    return ["All cuisines", ...Array.from(s).sort()];
  }, [dining]);

  const DIFF_ROPE: Record<string, number[]> = {
    "Walk in": [0, 1], "Easy": [2], "Plan ahead": [3], "Hard to get": [4], "Near impossible": [5],
  };

  const filtered = useMemo(() => {
    let items = dining;
    if (cuisineFilter !== "All cuisines") items = items.filter(d => d.cuisine === cuisineFilter);
    if (occasionFilter !== "Any occasion") items = items.filter(d => d.occasion?.some(o => o.toLowerCase().includes(occasionFilter.toLowerCase())));
    if (diffFilter !== "Any difficulty") {
      const allowed = DIFF_ROPE[diffFilter] || [];
      items = items.filter(d => allowed.includes(d.rope ?? 0));
    }
    return items;
  }, [dining, cuisineFilter, occasionFilter, diffFilter]);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => nav("/")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <UtensilsCrossed className="w-4 h-4" style={{ color: "rgba(255,255,255,0.5)" }} />
        <h1 className="text-lg font-bold tracking-wide" style={{ fontFamily: "'Oswald', sans-serif" }}>DINING</h1>
        <span className="dc-city-badge">NEW YORK</span>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 py-5">
        {/* Filter row — single line */}
        <div className="dc-filter-row">
          <div className="dc-search-wrap" ref={searchWrapRef} style={{ position: "relative" }}>
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

          <div className="dc-tabs">
            <button className={`dc-tab${tab === "trending" ? " on" : ""}`} onClick={() => setTab("trending")}>🔥 Trending</button>
            <button className={`dc-tab${tab === "all" ? " on" : ""}`} onClick={() => setTab("all")}>All</button>
            <button className={`dc-tab${tab === "nearby" ? " on" : ""}`} onClick={() => setTab("nearby")}>📍 Near Me</button>
          </div>

          <div className="dc-dropdowns">
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

        {/* Grid — 4 columns matching Entertainment */}
        <div className="dc-grid">
          {filtered.map(r => <DiningCard key={r.id} r={r} onClick={() => nav(`/dining/${r.id}`)} />)}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-16">No restaurants found.</p>
        )}
      </div>
    </div>
  );
}
