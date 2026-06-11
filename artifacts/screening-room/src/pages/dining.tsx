import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, UtensilsCrossed, Bookmark, CheckCircle } from "lucide-react";
import { useDining } from "@/hooks/use-catalog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { DiningItem } from "@/types";

const OCCASION_COLORS: Record<string, string> = {
  "date night": "#ec4899",
  "celebration": "#ffd36b",
  "business": "#8b5cf6",
  "casual": "#3bc9db",
  "family": "#69db7c",
  "power lunch": "#f06595",
};

export default function Dining() {
  const [, nav] = useLocation();
  const { user } = useAuth();
  const { dining } = useDining();
  const [q, setQ] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState("All");
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [visited, setVisited] = useState<Set<number>>(new Set());

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
        d.neighborhood?.toLowerCase().includes(lq)
      );
    }
    return items;
  }, [dining, q, cuisineFilter]);

  async function toggleSaved(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    const next = new Set(saved);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSaved(next);
  }

  async function toggleVisited(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    const next = new Set(visited);
    if (next.has(id)) next.delete(id); else next.add(id);
    setVisited(next);
  }

  const priceStr = (p: number) => "$".repeat(Math.max(1, Math.min(4, p)));

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => nav("/")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Dining</h1>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search restaurants…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          />
        </div>

        {/* Cuisine filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
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

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(r => (
            <div
              key={r.id}
              className="group cursor-pointer rounded-2xl overflow-hidden transition-transform hover:scale-[1.01]"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              onClick={() => nav(`/dining/${r.id}`)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{r.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.cuisine} · {r.neighborhood}
                      {r.borough ? `, ${r.borough}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={e => toggleSaved(r.id, e)}
                      className="p-1.5 rounded-full transition-colors"
                      style={{ color: saved.has(r.id) ? "#ffd36b" : "#6b7280" }}
                    >
                      <Bookmark className={`w-4 h-4 ${saved.has(r.id) ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={e => toggleVisited(r.id, e)}
                      className="p-1.5 rounded-full transition-colors"
                      style={{ color: visited.has(r.id) ? "#22c55e" : "#6b7280" }}
                    >
                      <CheckCircle className={`w-4 h-4 ${visited.has(r.id) ? "fill-current" : ""}`} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {priceStr(r.price) && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: "rgba(255,255,255,0.08)", color: "#ffd36b" }}>
                      {priceStr(r.price)}
                    </span>
                  )}
                  {r.occasion?.slice(0, 2).map(occ => (
                    <span
                      key={occ}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: `${OCCASION_COLORS[occ] || "#8b5cf6"}22`,
                        color: OCCASION_COLORS[occ] || "#a78bfa",
                        border: `1px solid ${OCCASION_COLORS[occ] || "#8b5cf6"}44`,
                      }}
                    >
                      {occ}
                    </span>
                  ))}
                  {r.recognition && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(253,224,71,0.1)", color: "#fde047" }}>
                      ⭐ {r.recognition}
                    </span>
                  )}
                </div>

                {r.blurb && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">{r.blurb}</p>
                )}

                {r.signature && (
                  <p className="text-xs mt-2 italic" style={{ color: "#ec4899", fontFamily: "'Cormorant Garamond', serif" }}>
                    ✦ {r.signature}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-16">No restaurants found.</p>
        )}
      </div>

    </div>
  );
}
