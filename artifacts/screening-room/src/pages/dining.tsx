import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, UtensilsCrossed } from "lucide-react";
import { useDining } from "@/hooks/use-catalog";
import type { DiningItem } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Module-level photo cache — persists across re-renders, cleared on page reload
const photoCache = new Map<string, string | null>();
const photoPending = new Map<string, Promise<string | null>>();

async function fetchThumbnail(id: number, name: string, neighborhood: string, borough: string): Promise<string | null> {
  const key = name.toLowerCase().trim();
  if (photoCache.has(key)) return photoCache.get(key) ?? null;
  if (photoPending.has(key)) return photoPending.get(key)!;

  const p = fetch(`${API_BASE}/places/thumbnail/${id}?name=${encodeURIComponent(name)}&neighborhood=${encodeURIComponent(neighborhood)}&borough=${encodeURIComponent(borough)}`)
    .then(r => r.ok ? r.json() : { photo_url: null })
    .then((d: { photo_url: string | null }) => {
      photoCache.set(key, d.photo_url);
      photoPending.delete(key);
      return d.photo_url;
    })
    .catch(() => { photoCache.set(key, null); photoPending.delete(key); return null; });

  photoPending.set(key, p);
  return p;
}

const ROPE_LABEL: Record<number, string> = { 3: "PLAN AHEAD", 4: "HARD TO GET", 5: "NEAR IMPOSSIBLE" };

function priceStr(p: number) { return "$".repeat(Math.max(1, Math.min(4, p))); }

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

  // Lazy-load photo when card enters viewport
  useEffect(() => {
    if (fetched.current) return;
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !fetched.current) {
        fetched.current = true;
        obs.disconnect();
        fetchThumbnail(r.id, r.name, r.neighborhood || "", r.borough || "")
          .then(url => setPhoto(url));
      }
    }, { rootMargin: "200px" });

    obs.observe(el);
    return () => obs.disconnect();
  }, [r.id, r.name, r.neighborhood, r.borough]);

  const toggle = (type: "saved" | "booked" | "visited", e: React.MouseEvent) => {
    e.stopPropagation();
    const key = type === "saved" ? `sr_dining_saved_${r.id}` : type === "booked" ? `sr_dining_booked_${r.id}` : `sr_dining_visited_${r.id}`;
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
          <img
            src={photo}
            alt={r.name}
            className={`dc-photo-img${photoLoaded ? " loaded" : ""}`}
            onLoad={() => setPhotoLoaded(true)}
          />
        ) : (
          <div className="dc-photo-placeholder">
            <UtensilsCrossed size={28} color="rgba(255,255,255,0.15)" />
          </div>
        )}
        <div className="dc-photo-gradient" />

        {/* Difficulty badge */}
        {ropeLabel && (
          <div className="dc-rope-badge">{ropeLabel}</div>
        )}

        {/* Recognition over photo */}
        {r.recognition && (
          <div className="dc-recog">{r.recognition}</div>
        )}
      </div>

      {/* Body */}
      <div className="dc-body">
        <h3 className="dc-name">{r.name}</h3>
        <p className="dc-meta">
          {r.cuisine}
          {r.neighborhood ? ` · ${r.neighborhood}` : ""}
          {` · ${priceStr(r.price)}`}
        </p>

        {/* Format chip */}
        {r.format && (
          <div className="dc-format-chip">{r.format.toUpperCase()}</div>
        )}

        {/* Occasions */}
        {r.occasion && r.occasion.length > 0 && (
          <div className="dc-occasions">
            {r.occasion.slice(0, 2).map(occ => (
              <span key={occ} className="dc-occ-chip">{occ}</span>
            ))}
          </div>
        )}

        {/* Signature order tip */}
        {r.signature && (
          <p className="dc-order">
            <span className="dc-order-label">ORDER</span> {r.signature}
          </p>
        )}

        {/* Status buttons */}
        <div className="dc-btns" onClick={e => e.stopPropagation()}>
          <button className={`dc-btn${saved ? " on" : ""}`} onClick={e => toggle("saved", e)}>
            Want to go
          </button>
          <button className={`dc-btn${booked ? " on" : ""}`} onClick={e => toggle("booked", e)}>
            Booked
          </button>
          <button className={`dc-btn${visited ? " on" : ""}`} onClick={e => toggle("visited", e)}>
            Been
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dining() {
  const [, nav] = useLocation();
  const { dining } = useDining();
  const [q, setQ] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState("All");

  const cuisines = useMemo(() => {
    const s = new Set(dining.map(d => d.cuisine));
    return ["All", ...Array.from(s).sort()];
  }, [dining]);

  const filtered = useMemo(() => {
    let items = dining;
    if (cuisineFilter !== "All") items = items.filter(d => d.cuisine === cuisineFilter);
    if (q.trim()) {
      const lq = q.toLowerCase();
      items = items.filter(d =>
        d.name.toLowerCase().includes(lq) ||
        d.cuisine.toLowerCase().includes(lq) ||
        (d.neighborhood || "").toLowerCase().includes(lq)
      );
    }
    return items;
  }, [dining, q, cuisineFilter]);

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => nav("/")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <UtensilsCrossed className="w-4 h-4" style={{ color: "rgba(255,255,255,0.5)" }} />
        <h1 className="text-lg font-bold tracking-wide" style={{ fontFamily: "'Oswald', sans-serif" }}>DINING</h1>
        <span className="dc-city-badge">NEW YORK</span>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-5">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search NYC restaurants..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          />
        </div>

        {/* Cuisine filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
          {cuisines.map(c => (
            <button
              key={c}
              onClick={() => setCuisineFilter(c)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: cuisineFilter === c ? "linear-gradient(135deg,#ec4899,#be185d)" : "rgba(255,255,255,0.06)",
                color: cuisineFilter === c ? "#fff" : "#9ca3af",
                border: `1px solid ${cuisineFilter === c ? "transparent" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        <div className="dc-grid">
          {filtered.map(r => (
            <DiningCard key={r.id} r={r} onClick={() => nav(`/dining/${r.id}`)} />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-16">No restaurants found.</p>
        )}
      </div>
    </div>
  );
}
