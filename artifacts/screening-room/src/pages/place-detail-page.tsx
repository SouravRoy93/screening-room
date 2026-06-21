import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, CheckCircle, ExternalLink } from "lucide-react";
import { usePlaces } from "@/hooks/use-catalog";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface PlaceLive {
  place_id?: string;
  maps_url: string | null;
  rating: number | null;
  user_rating_count: number | null;
  photos: string[];
  reviews: { author: string; rating: number; text: string; relativeTime: string }[];
}

function getLS<T>(k: string, def: T): T {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
}
function setLS(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

export default function PlaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const { places } = usePlaces();

  const place = places.find(p => String(p.id) === id);

  const [saved, setSaved] = useState<Record<number, boolean>>(() => getLS("pl_saved", {}));
  const [visited, setVisited] = useState<Record<number, boolean>>(() => getLS("pl_visited", {}));
  const [detail, setDetail] = useState<PlaceLive | null>(null);

  useEffect(() => {
    if (!place) return;
    let alive = true;
    setDetail(null);
    const qs = place.placeId
      ? `placeId=${encodeURIComponent(place.placeId)}`
      : `name=${encodeURIComponent(place.name)}&area=${encodeURIComponent(place.area || "")}`;
    fetch(`${API_BASE}/places/detail?${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setDetail(d); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.id]);

  const heroImg = detail?.photos?.[0] || place?.img || null;

  const isSaved = place ? !!saved[place.id] : false;
  const isVisited = place ? !!visited[place.id] : false;

  function toggleSave() {
    if (!place) return;
    const next = { ...saved, [place.id]: !saved[place.id] };
    if (!next[place.id]) delete next[place.id];
    setSaved(next); setLS("pl_saved", next);
  }

  function toggleVisit() {
    if (!place) return;
    const next = { ...visited, [place.id]: !visited[place.id] };
    if (!next[place.id]) delete next[place.id];
    setVisited(next); setLS("pl_visited", next);
  }

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  if (!place) {
    return (
      <div className="mdp-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Place not found.</p>
      </div>
    );
  }

  return (
    <div className="mdp-root">

      {/* ── HERO ── */}
      <div className="mdp-hero">
        {heroImg ? (
          <>
            <img src={heroImg} alt="" className="mdp-backdrop mdp-backdrop-blur" aria-hidden="true" />
            <img src={heroImg} alt={place.name} className="mdp-backdrop-full" />
          </>
        ) : (
          <div className="mdp-backdrop-placeholder" />
        )}
        <div className="mdp-hero-gradient" />

        <button className="mdp-back" onClick={() => nav("/places")}>
          <ChevronLeft size={20} />
          Places
        </button>

        <div className="mdp-hero-content">
          <div className="mdp-hero-meta" style={{ width: "100%" }}>
            {place.area && (
              <div className="pl-hero-area" style={{ marginBottom: 8 }}>{place.area}</div>
            )}
            <h1 className="mdp-title">{place.name}</h1>
            {place.vibe && (
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
                {place.vibe}
              </p>
            )}
            {place.badges?.length > 0 && (
              <div className="mdp-genres" style={{ marginTop: 12 }}>
                {place.badges.map((b: string) => (
                  <span key={b} className="mdp-genre-chip">{b}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="mdp-body" style={{ paddingBottom: 48 }}>

        {/* Actions */}
        <div className="pl-actions" style={{ marginTop: 4 }}>
          <button className={`pl-action-btn${isSaved ? " on" : ""}`} onClick={toggleSave}>
            {isSaved
              ? <><CheckCircle size={14} fill="currentColor" style={{ flexShrink: 0 }} /> Want to go</>
              : "♡ Want to go"}
          </button>
          <button className={`pl-action-btn pl-action-been${isVisited ? " on" : ""}`} onClick={toggleVisit}>
            {isVisited
              ? <><CheckCircle size={14} fill="currentColor" style={{ flexShrink: 0 }} /> Been there</>
              : "✓ Been there"}
          </button>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + (place.area || ""))}`}
            target="_blank" rel="noopener noreferrer"
            className="pl-action-btn pl-maps-btn"
          >
            <ExternalLink size={13} /> Maps
          </a>
        </div>

        {/* Facts */}
        <div className="pl-facts">
          {([
            ["Best time",        place.best],
            ["Duration",         place.dur ? `${place.dur} minutes` : ""],
            ["Crowd",            place.crowd],
            ["Price",            place.price],
            ["Dress code",       place.dress],
            ["Hours",            place.hours],
            ["Reservation",      place.resv],
            ["Best photo spot",  place.photo],
            ["Effort",           place.effort || ""],
            ["Accessibility",    place.accessibility || ""],
            ["Best season",      place.seasonal || ""],
            ["Weather",          place.weather || ""],
            ["Nearby",           place.nearby || ""],
            ["Coffee nearby",    place.cafe],
            ["Dinner after",     place.dinner],
          ] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="pl-fact">
              <div className="pl-fact-key">{k}</div>
              <div className="pl-fact-val">{v}</div>
            </div>
          ))}
        </div>

        {/* Worth / Skip */}
        {(place.worth || place.skip) && (
          <div className="pl-verdict">
            {place.worth && <div className="pl-worth"><span>Worth it if</span> {place.worth}</div>}
            {place.skip  && <div className="pl-skip-if"><span>Skip if</span> {place.skip}</div>}
          </div>
        )}

        {/* Insider tip */}
        {place.insider && (
          <div className="pl-insider"><span>Insider tip</span> {place.insider}</div>
        )}

        {/* Google reviews */}
        {detail && detail.reviews && detail.reviews.length > 0 && (
          <div className="ddp-reviews-section" style={{ marginTop: 24 }}>
            <div className="ddp-reviews-head">GOOGLE REVIEWS</div>
            {detail.reviews.slice(0, 5).map((rev, i) => {
              const full = Math.round(rev.rating || 0);
              return (
                <div key={i} className="ddp-review-card">
                  <div className="ddp-review-top">
                    <span className="ddp-review-author">{rev.author}</span>
                    <span style={{ fontSize: 12, letterSpacing: 1 }}>
                      <span style={{ color: "#ffd36b" }}>{"\u2605".repeat(full)}</span>
                      <span style={{ color: "rgba(255,255,255,0.18)" }}>{"\u2605".repeat(5 - full)}</span>
                    </span>
                  </div>
                  <p className="ddp-review-text">{rev.text}</p>
                  {rev.relativeTime && <p className="ddp-review-time">{rev.relativeTime}</p>}
                </div>
              );
            })}
            {detail.maps_url && (
              <a href={detail.maps_url} target="_blank" rel="noopener noreferrer" className="ddp-more-google">
                More google reviews <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        {/* Score bars */}
        {place.scores && (
          <div className="pl-scores">
            {([
              ["Must-visit",    place.scores.mustVisit],
              ["Beauty",        place.scores.b],
              ["Unique",        place.scores.u],
              ["Authenticity",  place.scores.authenticity],
              ["Significance",  place.scores.significance],
              ["View",          place.scores.view],
              ["Photo-worthy",  place.scores.photoWorth],
              ["Hidden gem",    place.scores.hidden],
              ["Calm",          place.scores.c],
              ["Safety",        place.scores.safety],
              ["Transit ease",  place.scores.access],
              ["Family",        place.scores.family],
              ["Night",         place.scores.night],
              ["Value",         place.scores.v],
              ["Memory",        place.scores.memory],
              ["Luxury",        place.scores.l],
            ] as [string, number | undefined][]).filter((x): x is [string, number] => typeof x[1] === "number").map(([k, v]) => (
              <div key={k} className="pl-score-row">
                <div className="pl-score-key">{k}</div>
                <div className="pl-score-bar"><div className="pl-score-fill" style={{ width: `${v * 20}%` }} /></div>
                <div className="pl-score-num">{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
