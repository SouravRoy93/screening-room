// The signed-out hero (Obsession roadmap #4 — the status play). A membership
// card in gold foil that tilts toward the cursor. Signed-out visitors see
// specimen cards cycling through real archetypes; signing up issues them
// their own. Signed-in users never see this — they get the Tonight card.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import "./taste-passport.css";

/** Specimen archetypes — clearly labelled as examples, never passed off as the visitor's. */
const SPECIMENS = [
  { name: "The Golden-Hour Romantic", films: 34, tables: 12, places: 9, avg: "4.4", c1: "#ffd36b", c2: "#f0a94b" },
  { name: "The Late-Night Noir", films: 61, tables: 7, places: 4, avg: "4.1", c1: "#a78bfa", c2: "#ec4899" },
  { name: "The Sunday Wanderer", films: 18, tables: 21, places: 27, avg: "4.6", c1: "#5eead4", c2: "#06b6d4" },
  { name: "The Corner-Table Regular", films: 25, tables: 33, places: 11, avg: "4.3", c1: "#fbbf24", c2: "#ef4444" },
];

const CYCLE_MS = 4200;

export function TastePassport() {
  const [, nav] = useLocation();
  const [i, setI] = useState(0);
  const [fading, setFading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Cycle specimens with a short cross-fade. Paused for reduced-motion users.
  useEffect(() => {
    if (reduced.current) return;
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setI(v => (v + 1) % SPECIMENS.length);
        setFading(false);
      }, 420);
    }, CYCLE_MS);
    return () => clearInterval(t);
  }, []);

  // Tilt toward the cursor (desktop, motion-friendly only).
  function onMove(e: React.MouseEvent) {
    const el = cardRef.current;
    if (!el || reduced.current || window.innerWidth < 720) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateX(${8 - y * 12}deg) rotateY(${-8 + x * 18}deg) translateZ(14px)`;
  }
  function onLeave() {
    const el = cardRef.current;
    if (el) el.style.transform = "";
  }

  const s = SPECIMENS[i];

  return (
    <section className="tp-wrap" aria-label="Your taste, issued as a card">
      <div className="tp-stage" onMouseMove={onMove} onMouseLeave={onLeave}>
        <div ref={cardRef} className="tp-card">
          <span className="tp-foil" aria-hidden />
          <span className="tp-specimen">Specimen</span>
          <div className="tp-eyebrow">Screening Room · Member</div>
          <h2 className={`tp-archetype${fading ? " fading" : ""}`}>{s.name}</h2>
          <dl className={`tp-stats${fading ? " fading" : ""}`}>
            <div><dt>Films</dt><dd style={{ color: s.c1 }}>{s.films}</dd></div>
            <div><dt>Tables</dt><dd style={{ color: s.c1 }}>{s.tables}</dd></div>
            <div><dt>Places</dt><dd style={{ color: s.c1 }}>{s.places}</dd></div>
            <div><dt>Avg</dt><dd style={{ color: s.c1 }}>{s.avg}</dd></div>
          </dl>
          <span
            className="tp-seal"
            aria-hidden
            style={{ background: `linear-gradient(135deg, ${s.c1}, ${s.c2})` }}
          />
        </div>
      </div>

      <div className="tp-copy">
        <h1 className="tp-title">Your taste, issued as a card</h1>
        <p className="tp-sub">
          Track a handful of films, tables and places — we'll read the pattern
          and issue yours. These are specimens; yours will be entirely your own.
        </p>
        <div className="tp-actions">
          <button className="tp-cta" onClick={() => nav("/auth")}>Claim your card</button>
          <button
            className="tp-ghost"
            onClick={() => document.querySelector(".cat-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Look around first
          </button>
        </div>
      </div>
    </section>
  );
}
