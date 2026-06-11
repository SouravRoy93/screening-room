import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Bookmark, CheckCircle, UtensilsCrossed } from "lucide-react";
import { useDining } from "@/hooks/use-catalog";
import type { DiningItem } from "@/types";

const OCCASION_COLORS: Record<string, string> = {
  "date night": "#ec4899",
  "celebration": "#ffd36b",
  "business": "#8b5cf6",
  "casual": "#3bc9db",
  "family": "#69db7c",
  "power lunch": "#f06595",
  "big night out": "#f97316",
  "see & be seen": "#a78bfa",
  "solo-friendly": "#22d3ee",
  "group feast": "#4ade80",
  "old guard": "#94a3b8",
  "walk-in": "#34d399",
  "hidden gem": "#fbbf24",
};

const CUISINE_GRADIENT: Record<string, [string, string]> = {
  "French":            ["#7c3aed", "#4c1d95"],
  "Italian":           ["#16a34a", "#14532d"],
  "Italian-American":  ["#dc2626", "#7f1d1d"],
  "Sushi":             ["#0284c7", "#0c4a6e"],
  "Japanese":          ["#0891b2", "#164e63"],
  "Korean":            ["#ea580c", "#7c2d12"],
  "Korean Steakhouse": ["#dc2626", "#7c2d12"],
  "New American":      ["#7c3aed", "#3b0764"],
  "Steakhouse":        ["#b91c1c", "#450a0a"],
  "Indian":            ["#d97706", "#78350f"],
  "South Indian":      ["#d97706", "#78350f"],
  "Mexican":           ["#16a34a", "#052e16"],
  "Chinese":           ["#dc2626", "#450a0a"],
  "Sichuan":           ["#ea580c", "#431407"],
  "Cantonese":         ["#dc2626", "#450a0a"],
  "Cantonese-American":["#f97316", "#431407"],
  "Seafood":           ["#0891b2", "#0c4a6e"],
  "Italian Seafood":   ["#0e7490", "#0c4a6e"],
  "Spanish":           ["#ca8a04", "#713f12"],
  "Nordic":            ["#2563eb", "#1e3a8a"],
  "Jewish Deli":       ["#d97706", "#422006"],
  "Pizza":             ["#ef4444", "#7f1d1d"],
  "Afro-Caribbean American": ["#059669", "#022c22"],
  "American":          ["#2563eb", "#1e3a8a"],
  "American Chophouse":["#b45309", "#431407"],
  "French-American":   ["#7c3aed", "#312e81"],
  "default":           ["#7c3aed", "#1e1b4b"],
};

function cuisineGradient(cuisine: string): [string, string] {
  return CUISINE_GRADIENT[cuisine] || CUISINE_GRADIENT["default"];
}

function priceStr(p: number) { return "$".repeat(Math.max(1, Math.min(4, p))); }

function RopeBar({ level }: { level: number }) {
  return (
    <div className="ddp-rope-wrap">
      <span className="ddp-rope-label">Reservation difficulty</span>
      <div className="ddp-rope-dots">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="ddp-rope-dot" style={{ background: i < level ? "#ffd36b" : "rgba(255,255,255,0.12)" }} />
        ))}
        <span className="ddp-rope-text">
          {level <= 1 ? "Walk in" : level <= 2 ? "Easy" : level <= 3 ? "Plan ahead" : level <= 4 ? "Hard to get" : "Near impossible"}
        </span>
      </div>
    </div>
  );
}

export default function DiningDetailPage() {
  const params = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const { dining } = useDining();
  const [restaurant, setRestaurant] = useState<DiningItem | null>(null);
  const [saved, setSaved] = useState(false);
  const [visited, setVisited] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const id = Number(params.id);
  const savedKey = `sr_dining_saved_${id}`;
  const visitedKey = `sr_dining_visited_${id}`;
  const notesKey = `sr_dining_notes_${id}`;

  useEffect(() => {
    if (dining.length > 0) {
      const found = dining.find(d => d.id === id);
      setRestaurant(found || null);
    }
  }, [dining, id]);

  useEffect(() => {
    setSaved(localStorage.getItem(savedKey) === "1");
    setVisited(localStorage.getItem(visitedKey) === "1");
    const n = localStorage.getItem(notesKey);
    if (n) setNotes(n);
  }, [savedKey, visitedKey, notesKey]);

  const toggleSaved = () => {
    const next = !saved;
    setSaved(next);
    localStorage.setItem(savedKey, next ? "1" : "0");
  };

  const toggleVisited = () => {
    const next = !visited;
    setVisited(next);
    localStorage.setItem(visitedKey, next ? "1" : "0");
  };

  const handleNotes = (val: string) => {
    setNotes(val);
    setNotesSaved(false);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      localStorage.setItem(notesKey, val);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 1500);
    }, 800);
  };

  if (!restaurant && dining.length > 0) {
    return (
      <div className="ddp-root" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 15 }}>Restaurant not found.</p>
      </div>
    );
  }

  const r = restaurant;
  const [c1, c2] = r ? cuisineGradient(r.cuisine) : cuisineGradient("default");

  return (
    <div className="ddp-root">
      {/* ── HERO ── */}
      <div className="ddp-hero" style={{ background: `linear-gradient(155deg, ${c1} 0%, ${c2} 60%, #080810 100%)` }}>
        <div className="ddp-hero-noise" />

        {/* Back */}
        <button className="ddp-back" onClick={() => nav("/dining")}>
          <ChevronLeft size={20} />
          Dining
        </button>

        {/* Icon */}
        <div className="ddp-hero-icon">
          <UtensilsCrossed size={36} color="rgba(255,255,255,0.25)" />
        </div>

        {/* Hero content */}
        <div className="ddp-hero-content">
          {r ? (
            <>
              {r.recognition && (
                <div className="ddp-recog">{r.recognition}</div>
              )}
              <h1 className="ddp-title">{r.name}</h1>
              <div className="ddp-meta-row">
                <span>{r.cuisine}</span>
                {r.format && <span>·</span>}
                {r.format && <span>{r.format}</span>}
              </div>
              <div className="ddp-meta-row" style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                <span>{r.neighborhood}{r.borough ? `, ${r.borough}` : ""}</span>
                <span>·</span>
                <span className="ddp-price">{priceStr(r.price)}</span>
              </div>
            </>
          ) : (
            <div className="ddp-shimmer" style={{ width: 200, height: 36, borderRadius: 8 }} />
          )}
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="ddp-body">

        {/* Save / Visited actions */}
        <div className="ddp-actions">
          <button
            className="ddp-action-btn"
            onClick={toggleSaved}
            style={{
              background: saved ? "rgba(255,211,107,0.15)" : "rgba(255,255,255,0.07)",
              color: saved ? "#ffd36b" : "rgba(255,255,255,0.5)",
              borderColor: saved ? "rgba(255,211,107,0.35)" : "rgba(255,255,255,0.1)",
            }}
          >
            <Bookmark size={16} fill={saved ? "#ffd36b" : "none"} />
            {saved ? "Saved" : "Save"}
          </button>
          <button
            className="ddp-action-btn"
            onClick={toggleVisited}
            style={{
              background: visited ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)",
              color: visited ? "#22c55e" : "rgba(255,255,255,0.5)",
              borderColor: visited ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.1)",
            }}
          >
            <CheckCircle size={16} fill={visited ? "#22c55e" : "none"} />
            {visited ? "Been here" : "Mark visited"}
          </button>
        </div>

        {/* Signature dish */}
        {r?.signature && (
          <div className="ddp-signature">
            <div className="ddp-section-label">Signature dish</div>
            <p className="ddp-signature-text">✦ {r.signature}</p>
          </div>
        )}

        {/* Blurb */}
        {r?.blurb && (
          <div className="ddp-section">
            <div className="ddp-section-label">About</div>
            <p className="ddp-blurb">{r.blurb}</p>
          </div>
        )}

        {/* Reservation difficulty */}
        {r?.rope !== undefined && (
          <div className="ddp-section">
            <RopeBar level={r.rope} />
          </div>
        )}

        {/* Best for */}
        {r?.occasion && r.occasion.length > 0 && (
          <div className="ddp-section">
            <div className="ddp-section-label">Best for</div>
            <div className="ddp-occasions">
              {r.occasion.map(occ => (
                <span
                  key={occ}
                  className="ddp-occasion-chip"
                  style={{
                    background: `${OCCASION_COLORS[occ.toLowerCase()] || "#8b5cf6"}22`,
                    color: OCCASION_COLORS[occ.toLowerCase()] || "#a78bfa",
                    borderColor: `${OCCASION_COLORS[occ.toLowerCase()] || "#8b5cf6"}44`,
                  }}
                >
                  {occ}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="ddp-section">
          <div className="ddp-section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Your notes
            {notesSaved && <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 500 }}>Saved ✓</span>}
          </div>
          <textarea
            className="ddp-notes"
            placeholder="Who you came with, what you ordered, how you felt…"
            value={notes}
            onChange={e => handleNotes(e.target.value)}
            rows={3}
          />
        </div>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
