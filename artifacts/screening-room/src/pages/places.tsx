import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, MapPin, CheckCircle, ExternalLink } from "lucide-react";
import { usePlaces } from "@/hooks/use-catalog";
import type { PlaceItem } from "@/types";

const STYLES = ["Iconic","Hidden gems","Luxury","Romantic","Food & cafés","Culture","Nature & views","Nightlife","Shopping","Wellness","Photography","Family"];
const MOODS: [string, string][] = [
  ["all","All"],["beautiful","Beautiful"],["romantic","Romantic"],
  ["calm","Calm"],["premium","Premium"],["hidden","Hidden gems"],
  ["iconic","Iconic"],["photo","Photo worthy"],["quick","≤ 90 min"],
  ["avoid-crowds","Uncrowded"],["classy","Classy"],
];
const WX: Record<number, [string, string]> = {
  0:["Clear","☀"],1:["Mainly clear","🌤"],2:["Partly cloudy","⛅"],3:["Overcast","☁"],
  45:["Foggy","🌫"],51:["Light drizzle","🌦"],61:["Light rain","🌧"],63:["Rain","🌧"],
  71:["Snow","🌨"],80:["Showers","🌦"],95:["Thunderstorm","⛈"],
};

function getLS<T>(k: string, def: T): T {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
}
function setLS(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function PlacesOnboarding({ onDone }: { onDone: (styles: string[], pace: string) => void }) {
  const [step, setStep] = useState<"styles" | "pace">("styles");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pace, setPace] = useState("");

  function toggleStyle(s: string) {
    const n = new Set(picked);
    if (n.has(s)) n.delete(s); else n.add(s);
    setPicked(n);
  }

  if (step === "styles") return (
    <div className="pl-onb">
      <div className="pl-onbox">
        <div className="pl-onlabel">PLACES · NEW YORK</div>
        <h2 className="pl-onh2">How do you like to explore?</h2>
        <p className="pl-onp">Choose a few. We'll quietly shape everything around them.</p>
        <div className="pl-onopts">
          {STYLES.map(s => (
            <button key={s} className={`pl-onopt${picked.has(s) ? " on" : ""}`} onClick={() => toggleStyle(s)}>{s}</button>
          ))}
        </div>
        <button className="pl-onbtn" disabled={picked.size === 0} onClick={() => setStep("pace")}>Continue</button>
        <button className="pl-skip" onClick={() => onDone(["Iconic","Hidden gems","Romantic"], "Balanced")}>Skip for now</button>
      </div>
    </div>
  );

  return (
    <div className="pl-onb">
      <div className="pl-onbox">
        <div className="pl-onlabel">ALMOST THERE</div>
        <h2 className="pl-onh2">What pace do you prefer?</h2>
        <p className="pl-onp">Luxury is rarely rushed.</p>
        <div className="pl-onopts">
          {["Relaxed","Balanced","Packed itinerary"].map(p => (
            <button key={p} className={`pl-onopt${pace === p ? " on" : ""}`} onClick={() => setPace(p)}>{p}</button>
          ))}
        </div>
        <button className="pl-onbtn" disabled={!pace} onClick={() => onDone([...picked], pace.replace(" itinerary",""))}>Enter</button>
        <button className="pl-skip" onClick={() => onDone([...picked], "Balanced")}>Skip</button>
      </div>
    </div>
  );
}

function LeafletMap({ places }: { places: PlaceItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    const L = (window as unknown as { L: Record<string, unknown> }).L;
    if (!L || !ref.current || mapRef.current) return;
    const map = (L.map as Function)(ref.current, { center: [40.7128,-74.006], zoom: 12, scrollWheelZoom: false });
    (L.tileLayer as Function)("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { attribution:"© CARTO", maxZoom:19 }).addTo(map);
    places.filter(p => p.lat && p.lng).forEach(p => {
      const marker = (L.marker as Function)([p.lat!, p.lng!]).addTo(map);
      marker.bindPopup(`<b>${p.name}</b><br/><small>${p.area||""}</small>`);
    });
    mapRef.current = map;
    setTimeout(() => (map as { invalidateSize: () => void }).invalidateSize(), 80);
  }, [places]);

  return <div ref={ref} className="pl-map" />;
}

function PlaceCard({ p, saved, onSelect, onSave }: { p: PlaceItem; saved: boolean; onSelect: () => void; onSave: (e: React.MouseEvent) => void }) {
  const sc = p.scores ? Math.round((p.scores.b + p.scores.u + p.scores.v + p.scores.l) / 4 * 10) / 5 : null;
  return (
    <div className="pl-card" onClick={onSelect}>
      <div className="pl-photo">
        {p.img
          ? <img src={p.img} alt={p.name} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <div className="pl-photo-fallback" />
        }
        {p.badges?.[0] && <div className="pl-badge">{p.badges[0]}</div>}
        {saved && (
          <button className="pl-saved-dot" onClick={onSave}>
            <CheckCircle size={12} />
          </button>
        )}
        {sc !== null && <div className="pl-score">{sc.toFixed(1)} ★</div>}
      </div>
      <div className="pl-body">
        {p.area && <div className="pl-area">{p.area}</div>}
        <h3 className="pl-name">{p.name}</h3>
        {p.vibe && <div className="pl-vibe">{p.vibe}</div>}
        <div className="pl-meta">
          {p.dur && <span>{p.dur} min</span>}
          {p.crowd && <span>{p.crowd} crowd</span>}
          {p.price && <span>{p.price}</span>}
        </div>
      </div>
    </div>
  );
}

function PlaceDetail({ p, saved, onClose, onSave }: { p: PlaceItem; saved: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <div className="pl-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pl-sheet">
        <div className="pl-hero">
          {p.img
            ? <img src={p.img} alt={p.name} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            : <div className="pl-hero-fallback" />
          }
          <div className="pl-hero-scrim" />
          <button className="pl-close" onClick={onClose}>×</button>
          <div className="pl-hero-text">
            {p.area && <div className="pl-hero-area">{p.area}</div>}
            <h2 className="pl-hero-name">{p.name}</h2>
            {p.vibe && <div className="pl-hero-vibe">{p.vibe}</div>}
          </div>
        </div>

        <div className="pl-detail-body">
          {p.badges?.length > 0 && (
            <div className="pl-badges">
              {p.badges.map((b: string) => <span key={b} className="pl-pill">{b}</span>)}
            </div>
          )}

          <div className="pl-facts">
            {[["Best time", p.best],["Duration", p.dur ? `${p.dur} minutes` : ""],["Crowd", p.crowd],["Price", p.price],["Dress code", p.dress],["Hours", p.hours],["Reservation", p.resv],["Best photo spot", p.photo]]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k as string} className="pl-fact">
                  <div className="pl-fact-key">{k}</div>
                  <div className="pl-fact-val">{v}</div>
                </div>
              ))}
          </div>

          {(p.worth || p.skip) && (
            <div className="pl-verdict">
              {p.worth && <div className="pl-worth"><span>Worth it if</span> {p.worth}</div>}
              {p.skip && <div className="pl-skip-if"><span>Skip if</span> {p.skip}</div>}
            </div>
          )}

          {p.insider && (
            <div className="pl-insider"><span>Insider tip</span> {p.insider}</div>
          )}

          {p.scores && (
            <div className="pl-scores">
              {[["Beauty",p.scores.b],["Unique",p.scores.u],["Calm",p.scores.c],["Ease",p.scores.e],["Value",p.scores.v],["Luxury",p.scores.l]].map(([k,v]) => (
                <div key={k as string} className="pl-score-row">
                  <div className="pl-score-key">{k}</div>
                  <div className="pl-score-bar"><div className="pl-score-fill" style={{ width:`${(v as number)*20}%` }} /></div>
                  <div className="pl-score-num">{v}</div>
                </div>
              ))}
            </div>
          )}

          <div className="pl-actions">
            <button className={`pl-action-btn${saved ? " on" : ""}`} onClick={onSave}>
              {saved ? <><CheckCircle size={14} /> Saved</> : "♡ Save"}
            </button>
            {p.name && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+" "+(p.area||""))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pl-action-btn pl-maps-btn"
              >
                Open in Maps <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Places() {
  const [, nav] = useLocation();
  const { places } = usePlaces();

  const [profStyles, setProfStyles] = useState<string[] | null>(() => getLS<string[] | null>("pl_styles", null));
  const [mood, setMood] = useState("all");
  const [view, setView] = useState<"home" | "map" | "saved">("home");
  const [lux, setLux] = useState(false);
  const [trap, setTrap] = useState(false);
  const [selected, setSelected] = useState<PlaceItem | null>(null);
  const [saved, setSaved] = useState<Record<number, boolean>>(() => getLS("pl_saved", {}));
  const [wxText, setWxText] = useState<string | null>(null);

  function onboardDone(styles: string[], pace: string) {
    setProfStyles(styles);
    setLS("pl_styles", styles);
    setLS("pl_pace", pace);
  }

  function toggleSave(id: number) {
    const next = { ...saved, [id]: !saved[id] };
    if (!next[id]) delete next[id];
    setSaved(next);
    setLS("pl_saved", next);
  }

  const matches = useCallback((p: PlaceItem) => {
    if (trap && p.badges?.includes("Tourist Heavy")) return false;
    if (lux && !(p.styles?.includes("Luxury") || p.badges?.includes("Quiet Luxury") || p.badges?.includes("Worth the Price"))) return false;
    if (mood === "all") return true;
    if (mood === "quick") return (p.dur || 999) <= 90;
    if (mood === "avoid-crowds") return p.crowd === "Low";
    if (mood === "classy") return p.styles?.includes("Nightlife") || p.styles?.includes("Luxury") || p.badges?.includes("Quiet Luxury");
    return p.moods?.includes(mood);
  }, [trap, lux, mood]);

  const filtered = useMemo(() => places.filter(matches), [places, matches]);

  const sections = useMemo(() => {
    if (!places.length) return [];
    if (mood !== "all") {
      const lbl = MOODS.find(m => m[0] === mood)?.[1] || mood;
      return [{ title: lbl, items: filtered }];
    }
    const byStyle = filtered.filter(p => p.styles?.some((s: string) => profStyles?.includes(s)));
    const base = filtered;
    return [
      { title: "Handpicked for you", note: "based on your taste", items: (byStyle.length ? byStyle : base).slice(0, 6) },
      { title: "Best at golden hour", note: "plan around the light", items: base.filter(p => p.badges?.includes("Best at Sunset")).slice(0, 6) },
      { title: "Quiet — less touristy", note: "where locals go", items: base.filter(p => p.crowd === "Low").slice(0, 6) },
      { title: "Perfect for two hours", note: "a beautiful in-between", items: base.filter(p => (p.dur || 999) <= 90).slice(0, 6) },
    ].filter(s => s.items.length > 0);
  }, [places, filtered, mood, profStyles]);

  useEffect(() => {
    if (!places.length) return;
    const pts = places.filter(p => p.lat && p.lng);
    if (!pts.length) return;
    const lat = pts.reduce((s, p) => s + p.lat!, 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p.lng!, 0) / pts.length;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`)
      .then(r => r.json())
      .then(d => {
        const c = d.current.weather_code, t = Math.round(d.current.temperature_2m);
        const wx = WX[c] || ["", "🌡"];
        const note = t >= 60 ? "a beautiful day for a rooftop or a park." : "crisp — bundle up for that skyline view.";
        setWxText(`${wx[1]}\u00a0${t}°\u00b7${wx[0]} — ${note}`);
      }).catch(() => {});
  }, [places]);

  if (profStyles === null) {
    return (
      <div className="min-h-screen bg-background">
        <PlacesOnboarding onDone={onboardDone} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => nav("/")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <MapPin className="w-4 h-4" style={{ color: "rgba(255,255,255,0.5)" }} />
        <h1 className="text-lg font-bold tracking-wide" style={{ fontFamily: "'Oswald', sans-serif" }}>PLACES</h1>
        <span className="dc-city-badge">NEW YORK</span>
        <div style={{ flex: 1 }} />
        <button
          className="pl-taste-btn"
          onClick={() => { setProfStyles(null); setLS("pl_styles", null); }}
          title="Edit your taste profile"
        >
          ✦ Taste
        </button>
        <div className="pl-viewnav">
          <button className={`pl-viewtab${view === "home" ? " on" : ""}`} onClick={() => setView("home")}>Discover</button>
          <button className={`pl-viewtab${view === "map" ? " on" : ""}`} onClick={() => setView("map")}>Map</button>
          <button className={`pl-viewtab${view === "saved" ? " on" : ""}`} onClick={() => setView("saved")}>Saved</button>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 py-5">

        {/* Saved view */}
        {view === "saved" && (
          <>
            <div className="pl-heading">
              <h1>Saved</h1>
              <p>Your collection — places kept for the right moment.</p>
            </div>
            <div className="pl-grid">
              {Object.keys(saved).length === 0
                ? <div className="pl-empty">Nothing saved yet — tap ♡ on a place you love.</div>
                : places.filter(p => saved[p.id]).map(p => (
                  <PlaceCard key={p.id} p={p} saved={!!saved[p.id]} onSelect={() => setSelected(p)} onSave={e => { e.stopPropagation(); toggleSave(p.id); }} />
                ))
              }
            </div>
          </>
        )}

        {/* Map view */}
        {view === "map" && (
          <>
            <div className="pl-heading">
              <h1>The map</h1>
              <p>Every place, located.</p>
            </div>
            <div className="pl-moodbar">
              {MOODS.map(([id, lbl]) => (
                <button key={id} className={`pl-mood${mood === id ? " on" : ""}`} onClick={() => setMood(id)}>{lbl}</button>
              ))}
            </div>
            <LeafletMap places={filtered} />
          </>
        )}

        {/* Discover view */}
        {view === "home" && (
          <>
            {wxText && (
              <div className="pl-wx">{wxText}</div>
            )}

            <div className="pl-filterbar">
              <div className="pl-moodbar">
                {MOODS.map(([id, lbl]) => (
                  <button key={id} className={`pl-mood${mood === id ? " on" : ""}`} onClick={() => setMood(id)}>{lbl}</button>
                ))}
              </div>
              <div className="pl-toggles">
                <button className={`pl-toggle${trap ? " on" : ""}`} onClick={() => setTrap(v => !v)}>No tourist traps</button>
                <button className={`pl-toggle${lux ? " on" : ""}`} onClick={() => setLux(v => !v)}>Luxury only</button>
              </div>
            </div>

            {places.length === 0 && (
              <div className="pl-empty">The catalog is updating — check back shortly.</div>
            )}

            {sections.map(sec => (
              <div key={sec.title} className="pl-section">
                <div className="pl-sec-head">
                  <span className="pl-sec-title">{sec.title}</span>
                  {sec.note && <span className="pl-sec-note">{sec.note}</span>}
                </div>
                <div className="pl-grid">
                  {sec.items.map(p => (
                    <PlaceCard key={p.id} p={p} saved={!!saved[p.id]} onSelect={() => setSelected(p)} onSave={e => { e.stopPropagation(); toggleSave(p.id); }} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {selected && (
        <PlaceDetail
          p={selected}
          saved={!!saved[selected.id]}
          onClose={() => setSelected(null)}
          onSave={() => toggleSave(selected.id)}
        />
      )}
    </div>
  );
}
