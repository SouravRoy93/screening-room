import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { usePlaces } from "@/hooks/use-catalog";
import type { PlaceItem } from "@/types";

const STYLES = ["Iconic","Hidden gems","Luxury","Romantic","Food & cafés","Culture","Nature & views","Nightlife","Shopping","Wellness","Photography","Family"];
const MOODS: [string, string][] = [
  ["all","Everything"],["beautiful","Something beautiful"],["romantic","A romantic evening"],
  ["calm","Something calm"],["premium","A premium experience"],["hidden","A hidden gem"],
  ["iconic","Something iconic"],["photo","A great photo"],["quick","Only 90 minutes"],
  ["avoid-crowds","Avoid crowds"],["classy","A classy night out"],
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
    <div className="ponb">
      <div className="ponbox">
        <div className="peye">Welcome</div>
        <h2>How do you like to explore?</h2>
        <p>Choose a few. We'll quietly shape everything around them.</p>
        <div className="popts">
          {STYLES.map(s => (
            <button key={s} className={`popt${picked.has(s) ? " on" : ""}`} onClick={() => toggleStyle(s)}>{s}</button>
          ))}
        </div>
        <button className="ponbtn" disabled={picked.size === 0} onClick={() => setStep("pace")}>Continue</button>
        <button className="pskip" onClick={() => onDone(["Iconic","Hidden gems","Romantic"], "Balanced")}>Skip for now</button>
      </div>
    </div>
  );

  return (
    <div className="ponb">
      <div className="ponbox">
        <div className="peye">Almost there</div>
        <h2>What pace do you prefer?</h2>
        <p>Luxury is rarely rushed.</p>
        <div className="popts">
          {["Relaxed","Balanced","Packed itinerary"].map(p => (
            <button key={p} className={`popt${pace === p ? " on" : ""}`} onClick={() => setPace(p)}>{p}</button>
          ))}
        </div>
        <button className="ponbtn" disabled={!pace} onClick={() => onDone([...picked], pace.replace(" itinerary",""))}>Enter</button>
        <button className="pskip" onClick={() => onDone([...picked], "Balanced")}>Skip</button>
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
      marker.bindPopup(`<b style="color:#211d18">${p.name}</b><br/><span style="color:#5d564c">${p.area||""}</span>`);
    });
    mapRef.current = map;
    setTimeout(() => (map as { invalidateSize: () => void }).invalidateSize(), 80);
  }, [places]);

  return <div ref={ref} className="pmap" />;
}

function PlaceCard({ p, saved, onSelect, onSave }: { p: PlaceItem; saved: boolean; onSelect: () => void; onSave: (e: React.MouseEvent) => void }) {
  const sc = p.scores ? Math.round((p.scores.b + p.scores.u + p.scores.v + p.scores.l) / 4 * 10) / 5 : null;
  return (
    <div className="pcard" onClick={onSelect}>
      <div className="pph">
        {p.img
          ? <img src={p.img} alt={p.name} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <div style={{ width:"100%", height:"100%", background:"linear-gradient(135deg,#e2d9c9,#c9bfaf)" }} />
        }
        {p.badges?.[0] && <div className="pbadge">{p.badges[0]}</div>}
        {saved && <div className="psaveDot">✓</div>}
        {sc !== null && <div className="pscore">Worth it {sc.toFixed(1)}</div>}
      </div>
      <div className="pcb">
        <div className="parea">{p.area}</div>
        <h3>{p.name}</h3>
        <div className="pvibe">{p.vibe}</div>
        <div className="pmeta">
          {p.dur && <span><b>{p.dur} min</b></span>}
          {p.crowd && <span>{p.crowd} crowd</span>}
          {p.price && <span>{p.price}</span>}
        </div>
      </div>
    </div>
  );
}

function PlaceDetail({ p, saved, onClose, onSave }: { p: PlaceItem; saved: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <div className="pov show" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="psheet">
        <div className="phero">
          {p.img
            ? <img src={p.img} alt={p.name} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            : <div style={{ width:"100%", height:"100%", background:"linear-gradient(135deg,#b8924f,#8a6a30)" }} />
          }
          <button className="px" onClick={onClose}>×</button>
          <div className="phtext">
            <div className="pharea">{p.area}</div>
            <h2>{p.name}</h2>
            <div className="phvibe">{p.vibe}</div>
          </div>
        </div>

        <div className="psbody">
          {p.badges?.length > 0 && (
            <div className="pbadges">
              {p.badges.map((b: string) => <span key={b} className="pbpill">{b}</span>)}
            </div>
          )}

          <div className="pfacts">
            {[["Best time", p.best],["Duration", p.dur ? `${p.dur} minutes` : ""],["Crowd", p.crowd],["Price", p.price],["Dress code", p.dress],["Hours", p.hours],["Reservation", p.resv],["Best photo", p.photo]]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k as string} className="pfact">
                  <div className="pk">{k}</div>
                  <div className="pv">{v}</div>
                </div>
              ))}
          </div>

          {(p.worth || p.skip) && (
            <div className="pverdict">
              {p.worth && <div className="pv1"><b>Worth it if</b>{p.worth}</div>}
              {p.skip && <div className="pv2"><b>Skip if</b>{p.skip}</div>}
            </div>
          )}

          {p.insider && (
            <div className="pinsider"><b>Insider tip</b>{p.insider}</div>
          )}

          {p.scores && (
            <div className="pscores">
              {[["Beauty",p.scores.b],["Unique",p.scores.u],["Calm",p.scores.c],["Ease",p.scores.e],["Value",p.scores.v],["Luxury",p.scores.l]].map(([k,v]) => (
                <div key={k as string} className="psc">
                  <div className="pk">{k}</div>
                  <div className="pbar"><div className="pfill" style={{ width:`${(v as number)*20}%` }} /></div>
                </div>
              ))}
            </div>
          )}

          <div className="psact">
            <button className={saved ? "on" : ""} onClick={onSave}>
              {saved ? "✓ Saved" : "♡ Save"}
            </button>
            {p.name && (
              <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+" "+(p.area||""))}`, "_blank")}>
                Open in Maps
              </button>
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
      { title: "Quiet luxury — less touristy", note: "where locals go", items: base.filter(p => p.crowd === "Low").slice(0, 6) },
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
        setWxText(`${wx[1]} \u00a0${t}°·${wx[0]} — ${note}`);
      }).catch(() => {});
  }, [places]);

  if (profStyles === null) {
    return (
      <div id="places">
        <PlacesOnboarding onDone={onboardDone} />
      </div>
    );
  }

  return (
    <div id="places">
      <div className="pwrap">
        {/* Top nav */}
        <div className="ptop">
          <div className="pbrand">Screening Room <span>· Places</span></div>
          <div className="pnav">
            <button onClick={() => nav("/")}>← Hub</button>
            <button className={view === "home" ? "on" : ""} onClick={() => setView("home")}>Discover</button>
            <button className={view === "map" ? "on" : ""} onClick={() => setView("map")}>Map</button>
            <button className={view === "saved" ? "on" : ""} onClick={() => setView("saved")}>Saved</button>
            <button className={`ptoggle${trap ? " on" : ""}`} onClick={() => setTrap(v => !v)}>Avoid tourist traps</button>
          </div>
        </div>

        {/* Saved view */}
        {view === "saved" && (
          <>
            <div className="pgreet">
              <h1>Saved</h1>
              <div className="psub">Your collection — places kept for the right moment.</div>
            </div>
            <div className="psection">
              <div className="pgrid">
                {Object.keys(saved).length === 0
                  ? <div className="pempty">Nothing saved yet — tap ♡ on a place you love.</div>
                  : places.filter(p => saved[p.id]).map(p => (
                    <PlaceCard key={p.id} p={p} saved={!!saved[p.id]} onSelect={() => setSelected(p)} onSave={e => { e.stopPropagation(); toggleSave(p.id); }} />
                  ))
                }
              </div>
            </div>
          </>
        )}

        {/* Map view */}
        {view === "map" && (
          <>
            <div className="pgreet">
              <h1>The map</h1>
              <div className="psub">Every place, located.</div>
            </div>
            <div className="pmoods">
              {MOODS.map(([id, lbl]) => (
                <button key={id} className={`pmood${mood === id ? " on" : ""}`} onClick={() => setMood(id)}>{lbl}</button>
              ))}
            </div>
            <LeafletMap places={filtered} />
          </>
        )}

        {/* Home / Discover view */}
        {view === "home" && (
          <>
            <div className="pgreet">
              <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}.</h1>
              <div className="psub">Handpicked ways to spend your time in the city.</div>
              {wxText && (
                <div className="pwx" style={{ display:"inline-flex", alignItems:"center", gap:8, marginTop:14, fontSize:13, color:"#5d564c", background:"#fffdf9", border:"1px solid #e2d9c9", padding:"8px 14px", borderRadius:30 }}>
                  <span dangerouslySetInnerHTML={{ __html: wxText }} />
                </div>
              )}
            </div>

            <div className="pmoods">
              {MOODS.map(([id, lbl]) => (
                <button key={id} className={`pmood${mood === id ? " on" : ""}`} onClick={() => setMood(id)}>{lbl}</button>
              ))}
            </div>

            <div className="pdrow">
              <button className="ptoggle" style={{ background: lux ? "#211d18" : undefined, color: lux ? "#fff" : undefined, borderColor: lux ? "#211d18" : undefined }} onClick={() => setLux(v => !v)}>
                Luxury nearby
              </button>
            </div>

            {places.length === 0 && (
              <div className="pempty">The catalog is updating — check back shortly.</div>
            )}

            {sections.map(sec => (
              <div key={sec.title} className="psection">
                <div className="psh">
                  <h2>{sec.title}</h2>
                  {sec.note && <span className="pmore">{sec.note}</span>}
                </div>
                <div className="pgrid">
                  {sec.items.map(p => (
                    <PlaceCard key={p.id} p={p} saved={!!saved[p.id]} onSelect={() => setSelected(p)} onSave={e => { e.stopPropagation(); toggleSave(p.id); }} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Detail overlay */}
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
