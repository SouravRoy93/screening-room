import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, MapPin, CheckCircle, ExternalLink, X, ChevronRight, Search } from "lucide-react";
import { usePlaces } from "@/hooks/use-catalog";
import { useAuth } from "@/hooks/use-auth";
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

function PlaceCard({ p, saved, visited, onSelect, onSave, onVisit }: {
  p: PlaceItem; saved: boolean; visited: boolean;
  onSelect: () => void;
  onSave: (e: React.MouseEvent) => void;
  onVisit: (e: React.MouseEvent) => void;
}) {
  const sc = p.scores ? Math.round((p.scores.b + p.scores.u + p.scores.v + p.scores.l) / 4 * 10) / 5 : null;
  return (
    <div className="pl-card" onClick={onSelect}>
      <div className="pl-photo">
        {p.img
          ? <img src={p.img} alt={p.name} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <div className="pl-photo-fallback" />
        }
        {p.badges?.[0] && <div className="pl-badge">{p.badges[0]}</div>}
        {sc !== null && <div className="pl-score">{sc.toFixed(1)} ★</div>}
        {visited && <div className="pl-visited-stamp">✓ Been</div>}
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
        <div className="pl-card-actions" onClick={e => e.stopPropagation()}>
          <button className={`pl-card-btn${saved ? " on" : ""}`} onClick={onSave}>
            {saved ? "♥ Saved" : "♡ Want to go"}
          </button>
          <button className={`pl-card-btn pl-card-btn-been${visited ? " on" : ""}`} onClick={onVisit}>
            {visited ? <><CheckCircle size={11} /> Been</> : "Been there"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaceDetail({ p, saved, visited, onClose, onSave, onVisit }: {
  p: PlaceItem; saved: boolean; visited: boolean;
  onClose: () => void; onSave: () => void; onVisit: () => void;
}) {
  return (
    <div className="pl-overlay">
      <div className="pl-sheet">
        <div className="pl-hero">
          {p.img
            ? <img src={p.img} alt={p.name} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            : <div className="pl-hero-fallback" />
          }
          <div className="pl-hero-scrim" />
          <button className="pl-close" onClick={onClose}><X size={14} /></button>
          <div className="pl-hero-text">
            {p.area && <div className="pl-hero-area">{p.area}</div>}
            <h2 className="pl-hero-name">{p.name}</h2>
            {p.vibe && <div className="pl-hero-vibe">{p.vibe}</div>}
          </div>
        </div>

        <div className="pl-detail-body">
          {/* Primary actions */}
          <div className="pl-actions">
            <button className={`pl-action-btn${saved ? " on" : ""}`} onClick={onSave}>
              {saved ? <><CheckCircle size={14} fill="currentColor" /> Want to go</> : "♡ Want to go"}
            </button>
            <button className={`pl-action-btn pl-action-been${visited ? " on" : ""}`} onClick={onVisit}>
              {visited ? <><CheckCircle size={14} fill="currentColor" /> Been there</> : "✓ Been there"}
            </button>
            {p.name && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+" "+(p.area||""))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pl-action-btn pl-maps-btn"
              >
                <ExternalLink size={13} /> Maps
              </a>
            )}
          </div>

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
        </div>
      </div>
    </div>
  );
}

// ─── Perfect Day ────────────────────────────────────────────────────────────

const DAY_TYPES = [
  { id: "romantic",  label: "Romantic evening",    moods: ["romantic"],         styles: [] as string[], crowd: "",    startHour: 17, outfit: "Something elevated — the evening may end at dinner.", tip: "book a restaurant for the end of the day now; tables fill after 7pm." },
  { id: "calm",      label: "Quiet & restorative",  moods: ["calm"],             styles: [] as string[], crowd: "Low", startHour: 10, outfit: "Comfortable layers — this day is about slowing down.", tip: "weekdays are twice as good at these spots; avoid the weekend rush." },
  { id: "iconic",    label: "Iconic first-timer",   moods: ["iconic","beautiful"],styles: [] as string[], crowd: "",    startHour: 10, outfit: "Comfortable shoes — you'll cover real ground.", tip: "arrive 20 minutes before each venue opens to beat the first rush." },
  { id: "art",       label: "Art & culture",         moods: ["beautiful"],        styles: ["Culture"],    crowd: "",    startHour: 10, outfit: "Casual smart — galleries appreciate the effort.", tip: "many museums are free on Friday evenings after 4pm." },
  { id: "photo",     label: "Golden-hour photo",     moods: ["photo"],            styles: ["Photography"],crowd: "",    startHour: 15, outfit: "Light layers — golden light means you need to move fast.", tip: "check tonight's sunset time and be at your last stop 30 minutes before." },
] as const;

const DURATIONS = [
  { id: "few",  label: "A few hours",  stops: 2, dinner: false },
  { id: "half", label: "Half a day",   stops: 3, dinner: false },
  { id: "full", label: "Full day",     stops: 4, dinner: true  },
];

function fmtTime(h: number, m: number) {
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

function buildItinerary(places: PlaceItem[], typeId: string, stops: number, addDinner: boolean) {
  const dt = DAY_TYPES.find(d => d.id === typeId)!;
  const scored = places
    .map(p => ({
      p,
      score: dt.moods.filter(m => p.moods?.includes(m)).length * 3
           + dt.styles.filter(s => p.styles?.includes(s)).length * 2
           + (dt.crowd === "Low" && p.crowd === "Low" ? 2 : 0),
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, stops).map(s => s.p);
  let hour = dt.startHour, min = 0;

  const stops_out = selected.map(p => {
    const time = fmtTime(hour, min);
    const total = min + (p.dur || 75) + 30;
    hour += Math.floor(total / 60);
    min = total % 60;
    return { time, name: p.name, desc: p.vibe || "", area: p.area || "" };
  });

  if (addDinner) {
    const lastPlace = selected[selected.length - 1];
    const dinnerName = lastPlace?.dinner || "a restaurant near your last stop";
    stops_out.push({ time: fmtTime(hour, 0), name: "Dinner", desc: dinnerName, area: "" });
  }

  return { stops: stops_out, outfit: dt.outfit, tip: dt.tip };
}

function weatherDayNote(dayTypeId: string, code: number | null, temp: number | null): string | null {
  if (code === null || temp === null) return null;
  const isRain = [51,53,55,61,63,65,80,81,82,95,96,99].includes(code);
  const isSnow = [71,73,75,77].includes(code);
  const isClear = code <= 2;
  const warm = temp >= 68;
  const hot = temp >= 85;
  const cold = temp < 45;

  if (dayTypeId === "photo") {
    if (isRain) return "Rainy skies — diffused light can be stunning; bring an umbrella and lean into moody shots.";
    if (isSnow) return "Snow on the ground — golden hour will be soft and magical.";
    if (isClear && warm) return "Clear skies — your golden-hour stops will shine.";
    return "Check tonight's sunset time for the best light windows.";
  }
  if (dayTypeId === "romantic") {
    if (isRain) return "Rainy evening — perfect for slowing down inside; lean into candlelit venues.";
    if (isClear && warm) return "Clear and warm — beautiful evening to linger outside.";
    return "Mild evening — a light layer and you're set.";
  }
  if (dayTypeId === "calm") {
    if (isRain || isSnow) return "Quiet, grey day — perfect for this kind of slow exploration.";
    if (cold) return "Cold but crisp — the uncrowded spots will feel especially peaceful.";
    return "Comfortable conditions — ideal for moving at a gentle pace.";
  }
  if (dayTypeId === "iconic") {
    if (isRain) return "Bring an umbrella — the iconic spots are worth it in any weather.";
    if (hot) return "Very warm — start early and take breaks in the shade.";
    if (isClear) return "Perfect visibility — great day for skyline views.";
    return "Good conditions for covering ground across the city.";
  }
  if (dayTypeId === "art") {
    if (isRain) return "Rainy day — couldn't be more perfect for galleries and museums.";
    if (isClear && warm) return "Nice out, but the interiors are the point today.";
    return "Comfortable day to move between indoor spaces.";
  }
  return null;
}

function PerfectDayModal({ places, wxText, wxRaw, onClose }: { places: PlaceItem[]; wxText: string | null; wxRaw: { code: number; temp: number } | null; onClose: () => void }) {
  const [step, setStep] = useState<"type" | "duration" | "result">("type");
  const [dayType, setDayType] = useState<string>("");
  const [durId, setDurId] = useState<string>("");

  const dur = DURATIONS.find(d => d.id === durId);
  const itinerary = useMemo(() => {
    if (!dayType || !dur || !places.length) return null;
    return buildItinerary(places, dayType, dur.stops, dur.dinner);
  }, [places, dayType, dur]);

  return (
    <div className="pl-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pl-sheet pl-day-modal">
        <button className="pl-close" onClick={onClose}><X size={16} /></button>

        {step === "type" && (
          <div className="pl-day-step">
            <div className="pl-day-step-label">DESIGN MY PERFECT DAY</div>
            <h2 className="pl-day-step-title">What kind of day are you planning?</h2>
            <p className="pl-day-step-sub">We'll build a timed itinerary just for you.</p>
            <div className="pl-day-opts">
              {DAY_TYPES.map(dt => (
                <button
                  key={dt.id}
                  className={`pl-day-opt${dayType === dt.id ? " on" : ""}`}
                  onClick={() => setDayType(dt.id)}
                >
                  {dt.label}
                </button>
              ))}
            </div>
            <button className="pl-day-next" disabled={!dayType} onClick={() => setStep("duration")}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}

        {step === "duration" && (
          <div className="pl-day-step">
            <button className="pl-day-back" onClick={() => setStep("type")}>← Back</button>
            <div className="pl-day-step-label">DESIGN MY PERFECT DAY</div>
            <h2 className="pl-day-step-title">How long do you have?</h2>
            <p className="pl-day-step-sub">We'll pace the day to fit your time.</p>
            <div className="pl-day-opts">
              {DURATIONS.map(d => (
                <button
                  key={d.id}
                  className={`pl-day-opt${durId === d.id ? " on" : ""}`}
                  onClick={() => setDurId(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button className="pl-day-next" disabled={!durId} onClick={() => setStep("result")}>
              Build my day ✦
            </button>
          </div>
        )}

        {step === "result" && itinerary && (
          <div className="pl-day-result">
            <div className="pl-day-result-head">
              <div>
                <h2 className="pl-day-result-title">Your perfect day</h2>
                <div className="pl-day-result-sub">{DURATIONS.find(d=>d.id===durId)?.label} · New York</div>
              </div>
            </div>

            {/* Type switcher */}
            <div className="pl-day-types">
              {DAY_TYPES.map(dt => (
                <button
                  key={dt.id}
                  className={`pl-day-type-pill${dayType === dt.id ? " on" : ""}`}
                  onClick={() => setDayType(dt.id)}
                >
                  {dt.label}
                </button>
              ))}
            </div>

            <div className="pl-day-divider" />

            {/* Timeline */}
            <div className="pl-day-timeline">
              {itinerary.stops.map((stop, i) => (
                <div key={i} className="pl-day-stop">
                  <div className="pl-day-time">{stop.time}</div>
                  <div className="pl-day-stop-right">
                    <div className="pl-day-dot" />
                    <div className="pl-day-stop-info">
                      {stop.area && <div className="pl-day-stop-area">{stop.area}</div>}
                      <div className="pl-day-stop-name">{stop.name}</div>
                      {stop.desc && <div className="pl-day-stop-desc">{stop.desc}</div>}
                    </div>
                    {i < itinerary.stops.length - 1 && <div className="pl-day-line" />}
                  </div>
                </div>
              ))}
            </div>

            <div className="pl-day-divider" />

            {/* Footer notes */}
            <div className="pl-day-notes">
              <div className="pl-day-note"><span>Outfit</span> {itinerary.outfit}</div>
              {(() => {
                const wNote = weatherDayNote(dayType, wxRaw?.code ?? null, wxRaw?.temp ?? null);
                const display = wNote ?? wxText;
                return display ? <div className="pl-day-note"><span>Weather</span> {display}</div> : null;
              })()}
              <div className="pl-day-note"><span>Tip</span> {itinerary.tip}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Places() {
  const [, nav] = useLocation();
  const { places } = usePlaces();
  const { user } = useAuth();

  const [profStyles, setProfStyles] = useState<string[] | null>(() => getLS<string[] | null>("pl_styles", null));
  const [mood, setMood] = useState("all");
  const [view, setView] = useState<"home" | "map" | "saved">("home");
  const [lux, setLux] = useState(false);
  const [trap, setTrap] = useState(false);
  const [selected, setSelected] = useState<PlaceItem | null>(null);
  const [saved, setSaved] = useState<Record<number, boolean>>(() => getLS("pl_saved", {}));
  const [visited, setVisited] = useState<Record<number, boolean>>(() => getLS("pl_visited", {}));
  const [searchQ, setSearchQ] = useState("");
  const [wxText, setWxText] = useState<string | null>(null);
  const [wxRaw, setWxRaw] = useState<{ code: number; temp: number } | null>(null);
  const [showPerfectDay, setShowPerfectDay] = useState(false);

  const hour = new Date().getHours();
  const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || null;

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

  function toggleVisit(id: number) {
    const next = { ...visited, [id]: !visited[id] };
    if (!next[id]) delete next[id];
    setVisited(next);
    setLS("pl_visited", next);
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
    return ([
      { title: "Handpicked for you", note: "based on your taste", items: (byStyle.length ? byStyle : base).slice(0, 6) },
      { title: "Best at golden hour", note: "plan around the light", items: base.filter(p => p.badges?.includes("Best at Sunset")).slice(0, 6) },
      { title: "Quiet — less touristy", note: "where locals go", items: base.filter(p => p.crowd === "Low").slice(0, 6) },
      { title: "Perfect for two hours", note: "a beautiful in-between", items: base.filter(p => (p.dur || 999) <= 90).slice(0, 6) },
    ] as { title: string; note?: string; items: PlaceItem[] }[]).filter(s => s.items.length > 0);
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
        const c = d.current.weather_code as number, t = Math.round(d.current.temperature_2m);
        const wx = WX[c] || ["Clear", "🌡"];
        setWxRaw({ code: c, temp: t });
        // Code-aware, temperature-tuned recommendation
        let note: string;
        if ([95, 96, 99].includes(c))       note = "thunderstorms — stay indoors, this is a museum day.";
        else if ([71, 73, 75, 77].includes(c)) note = "snow on the ground — the park looks magical; dress warm.";
        else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(c)) note = "rainy today — perfect for galleries and cozy dining.";
        else if (c === 45 || c === 48)       note = "foggy this morning — the skyline looks beautifully mysterious.";
        else if (t >= 88)                    note = "very hot — seek shade or head underground to a museum.";
        else if (t >= 75 && c <= 2)         note = "beautiful day for a rooftop or a park.";
        else if (t >= 65 && c <= 3)         note = "great walking weather — the city is yours today.";
        else if (t >= 55)                    note = "comfortable and mild — perfect for exploring on foot.";
        else if (t >= 40)                    note = "crisp — bundle up for that skyline view.";
        else                                 note = "very cold — lean into indoor gems today.";
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
                  <PlaceCard key={p.id} p={p} saved={!!saved[p.id]} visited={!!visited[p.id]}
                    onSelect={() => setSelected(p)}
                    onSave={e => { e.stopPropagation(); toggleSave(p.id); }}
                    onVisit={e => { e.stopPropagation(); toggleVisit(p.id); }} />
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
            {/* Greeting */}
            <div className="pl-greeting">
              <h2 className="pl-greeting-text">
                {salutation}{displayName ? `, ${displayName}` : ""}.
              </h2>
              <p className="pl-greeting-sub">
                {hour < 12
                  ? "Beautiful ways to start your morning in the city."
                  : hour < 17
                  ? "The best of New York — right now."
                  : "Beautiful ways to spend your evening in New York."}
              </p>
              {wxText && <div className="pl-wx">{wxText}</div>}
              <button className="pl-perfect-day-btn" onClick={() => setShowPerfectDay(true)}>
                ✦ Design my perfect day
              </button>
            </div>

            {/* Search */}
            <div className="pl-search-row">
              <div className="dc-search-wrap">
                <Search className="dc-search-icon" size={14} />
                <input
                  type="text"
                  placeholder="Search places in New York..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  className="dc-search-input"
                  autoComplete="off"
                />
                {searchQ && (
                  <button className="pl-search-clear" onClick={() => setSearchQ("")}>×</button>
                )}
              </div>
            </div>

            {searchQ.trim() ? (
              /* Search results */
              <div className="pl-section">
                <div className="pl-sec-head">
                  <span className="pl-sec-title">Results for "{searchQ.trim()}"</span>
                  <span className="pl-sec-note">{places.filter(p => {
                    const q = searchQ.toLowerCase();
                    return p.name?.toLowerCase().includes(q) || p.area?.toLowerCase().includes(q) || p.vibe?.toLowerCase().includes(q);
                  }).length} found</span>
                </div>
                <div className="pl-grid">
                  {places.filter(p => {
                    const q = searchQ.toLowerCase();
                    return p.name?.toLowerCase().includes(q) || p.area?.toLowerCase().includes(q) || p.vibe?.toLowerCase().includes(q);
                  }).map(p => (
                    <PlaceCard key={p.id} p={p} saved={!!saved[p.id]} visited={!!visited[p.id]}
                      onSelect={() => setSelected(p)}
                      onSave={e => { e.stopPropagation(); toggleSave(p.id); }}
                      onVisit={e => { e.stopPropagation(); toggleVisit(p.id); }} />
                  ))}
                </div>
              </div>
            ) : (
              <>
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
                        <PlaceCard key={p.id} p={p} saved={!!saved[p.id]} visited={!!visited[p.id]}
                          onSelect={() => setSelected(p)}
                          onSave={e => { e.stopPropagation(); toggleSave(p.id); }}
                          onVisit={e => { e.stopPropagation(); toggleVisit(p.id); }} />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {selected && (
        <PlaceDetail
          p={selected}
          saved={!!saved[selected.id]}
          visited={!!visited[selected.id]}
          onClose={() => setSelected(null)}
          onSave={() => toggleSave(selected.id)}
          onVisit={() => toggleVisit(selected.id)}
        />
      )}

      {showPerfectDay && (
        <PerfectDayModal places={places} wxText={wxText} wxRaw={wxRaw} onClose={() => setShowPerfectDay(false)} />
      )}
    </div>
  );
}
