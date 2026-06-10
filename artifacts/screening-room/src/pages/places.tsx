import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, MapPin, Bookmark, Clock } from "lucide-react";
import { usePlaces } from "@/hooks/use-catalog";
import type { PlaceItem } from "@/types";

const MOOD_COLORS: Record<string, string> = {
  romantic: "#ec4899",
  outdoor: "#22c55e",
  cultural: "#8b5cf6",
  social: "#3bc9db",
  quiet: "#ffd36b",
  adventurous: "#f97316",
  relaxed: "#a78bfa",
};

function LeafletMap({ places, selected, onSelect }: {
  places: PlaceItem[];
  selected: PlaceItem | null;
  onSelect: (p: PlaceItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    const L = (window as unknown as { L: Record<string, unknown> }).L;
    if (!L || !ref.current || mapRef.current) return;

    const map = (L.map as (el: HTMLElement, opts: unknown) => unknown)(ref.current, {
      center: [40.7128, -74.006],
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: false,
    });

    (L.tileLayer as (url: string, opts: unknown) => { addTo: (m: unknown) => void })(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© CartoDB", maxZoom: 19 }
    ).addTo(map);

    const markerIcon = (L.divIcon as (opts: unknown) => unknown)({
      className: "",
      html: '<div style="width:10px;height:10px;background:#8b5cf6;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(139,92,246,0.5)"></div>',
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });

    places.filter(p => p.lat && p.lng).forEach(p => {
      const marker = (L.marker as (latlng: [number, number], opts: unknown) => { addTo: (m: unknown) => void; on: (e: string, fn: () => void) => void })([p.lat!, p.lng!], { icon: markerIcon });
      marker.addTo(map);
      marker.on("click", () => onSelect(p));
    });

    mapRef.current = map;
  }, [places, onSelect]);

  return (
    <div
      ref={ref}
      className="w-full rounded-xl overflow-hidden"
      style={{ height: "300px", background: "#14141d", border: "1px solid rgba(255,255,255,0.08)" }}
    />
  );
}

export default function Places() {
  const [, nav] = useLocation();
  const { places } = usePlaces();
  const [q, setQ] = useState("");
  const [moodFilter, setMoodFilter] = useState<string>("All");
  const [showMap, setShowMap] = useState(false);
  const [selected, setSelected] = useState<PlaceItem | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());

  const moods = useMemo(() => {
    const s = new Set<string>();
    places.forEach(p => p.moods?.forEach(m => s.add(m)));
    return ["All", ...Array.from(s).sort()];
  }, [places]);

  const filtered = useMemo(() => {
    let items = places;
    if (moodFilter !== "All") items = items.filter(p => p.moods?.includes(moodFilter));
    if (q.trim()) {
      const lq = q.toLowerCase();
      items = items.filter(p => p.name.toLowerCase().includes(lq) || p.area?.toLowerCase().includes(lq));
    }
    return items;
  }, [places, q, moodFilter]);

  function toggleSaved(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(saved);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSaved(next);
  }

  const durLabel = (d: number) => d < 60 ? `${d}m` : `${Math.floor(d / 60)}h${d % 60 ? `${d % 60}m` : ""}`;

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => nav("/")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Places</h1>
        <div className="flex-1" />
        <button
          onClick={() => setShowMap(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: showMap ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.06)",
            color: showMap ? "#a78bfa" : "#9ca3af",
          }}
        >
          <MapPin className="w-3.5 h-3.5" />
          {showMap ? "List" : "Map"}
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search places…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          />
        </div>

        {/* Mood filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
          {moods.map(m => (
            <button
              key={m}
              onClick={() => setMoodFilter(m)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: moodFilter === m
                  ? `${MOOD_COLORS[m] || "#8b5cf6"}33`
                  : "rgba(255,255,255,0.06)",
                color: moodFilter === m ? MOOD_COLORS[m] || "#a78bfa" : "#9ca3af",
                border: `1px solid ${moodFilter === m ? MOOD_COLORS[m] + "55" || "#8b5cf655" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {showMap && <div className="mb-6"><LeafletMap places={filtered} selected={selected} onSelect={setSelected} /></div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(p => (
            <div
              key={p.id}
              className="group cursor-pointer rounded-2xl overflow-hidden transition-all hover:scale-[1.01]"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${selected?.id === p.id ? "#8b5cf6" : "rgba(255,255,255,0.07)"}` }}
              onClick={() => setSelected(p)}
            >
              {p.img && (
                <div className="h-36 overflow-hidden">
                  <img
                    src={p.img}
                    alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">{p.area}</p>
                  </div>
                  <button
                    onClick={e => toggleSaved(p.id, e)}
                    className="p-1.5 transition-colors shrink-0"
                    style={{ color: saved.has(p.id) ? "#ffd36b" : "#6b7280" }}
                  >
                    <Bookmark className={`w-4 h-4 ${saved.has(p.id) ? "fill-current" : ""}`} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {p.moods?.slice(0, 3).map(m => (
                    <span
                      key={m}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: `${MOOD_COLORS[m] || "#8b5cf6"}22`, color: MOOD_COLORS[m] || "#a78bfa" }}
                    >
                      {m}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {p.dur && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {durLabel(p.dur)}
                    </span>
                  )}
                  {p.price && <span>{p.price}</span>}
                  {p.best && <span className="truncate">Best: {p.best}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-16">No places found.</p>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setSelected(null)} />
          <div
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md overflow-y-auto"
            style={{ background: "#0d0d18", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
          >
            {selected.img && (
              <div className="h-52 overflow-hidden">
                <img src={selected.img} alt={selected.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
            <div className="p-6">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="text-2xl font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>{selected.name}</h2>
                  <p className="text-sm text-muted-foreground">{selected.area}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2 my-3">
                {selected.moods?.map(m => (
                  <span key={m} className="text-xs px-2.5 py-1 rounded-full" style={{ background: `${MOOD_COLORS[m] || "#8b5cf6"}22`, color: MOOD_COLORS[m] || "#a78bfa" }}>
                    {m}
                  </span>
                ))}
              </div>

              {[
                { label: "Best for", value: selected.best },
                { label: "Hours", value: selected.hours },
                { label: "Dress code", value: selected.dress },
                { label: "Reservations", value: selected.resv },
                { label: "Crowd", value: selected.crowd },
              ].filter(r => r.value).map(r => (
                <div key={r.label} className="flex gap-3 py-2 border-b border-border">
                  <span className="text-xs text-muted-foreground w-24 shrink-0 pt-0.5">{r.label}</span>
                  <span className="text-sm text-foreground">{r.value}</span>
                </div>
              ))}

              {selected.insider && (
                <div className="mt-4 p-3 rounded-xl" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
                  <p className="text-xs text-[#a78bfa] font-semibold mb-1">Insider tip</p>
                  <p className="text-sm text-foreground">{selected.insider}</p>
                </div>
              )}

              {(selected.worth || selected.skip) && (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {selected.worth && (
                    <div className="p-3 rounded-xl" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }}>
                      <p className="text-xs text-green-400 font-semibold mb-1">Worth it</p>
                      <p className="text-xs text-foreground">{selected.worth}</p>
                    </div>
                  )}
                  {selected.skip && (
                    <div className="p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                      <p className="text-xs text-red-400 font-semibold mb-1">Skip</p>
                      <p className="text-xs text-foreground">{selected.skip}</p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={e => { toggleSaved(selected.id, e); }}
                className="w-full mt-6 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: saved.has(selected.id) ? "#ffd36b22" : "rgba(255,255,255,0.06)", color: saved.has(selected.id) ? "#ffd36b" : "#9ca3af", border: `1px solid ${saved.has(selected.id) ? "#ffd36b44" : "transparent"}` }}
              >
                <Bookmark className="w-4 h-4" />
                {saved.has(selected.id) ? "Saved" : "Save this place"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
