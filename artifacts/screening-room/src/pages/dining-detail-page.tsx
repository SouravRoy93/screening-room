import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Star, ExternalLink, MapPin, Clock, Globe, Bookmark, CheckCircle } from "lucide-react";
import { useDining } from "@/hooks/use-catalog";
import type { DiningItem } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface PlacesData {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  maps_url: string | null;
  rating: number | null;
  user_rating_count: number | null;
  today_hours: string | null;
  all_hours: string[];
  photos: string[];
  reviews: {
    author: string;
    rating: number;
    text: string;
    relativeTime: string;
  }[];
}

const TAG_OPTIONS = [
  "Must try", "Romantic", "Great for groups", "Date night",
  "Business lunch", "Hidden gem", "Worth the splurge", "Take visitors here",
];

function priceStr(p: number) { return "$".repeat(Math.max(1, Math.min(4, p))); }

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="ddp-star-row">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={13} fill={i < Math.round(rating) ? "#ffd36b" : "none"} color={i < Math.round(rating) ? "#ffd36b" : "rgba(255,255,255,0.25)"} />
      ))}
    </span>
  );
}

function MoreLikeThis({ current, dining, onNav }: { current: DiningItem; dining: DiningItem[]; onNav: (path: string) => void }) {
  const similar = useMemo(() => {
    return dining
      .filter(d => d.id !== current.id)
      .map(d => ({
        d,
        score:
          (d.cuisine === current.cuisine ? 4 : 0) +
          (d.format === current.format ? 3 : 0) +
          (d.price === current.price ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(s => s.d);
  }, [current, dining]);

  const [thumbs, setThumbs] = useState<Record<number, string | null>>({});

  useEffect(() => {
    if (similar.length === 0) return;
    setThumbs({});
    similar.forEach(d => {
      fetch(
        `${API_BASE}/places/thumbnail/${d.id}?name=${encodeURIComponent(d.name)}&neighborhood=${encodeURIComponent(d.neighborhood || "")}&borough=${encodeURIComponent((d as any).borough || "")}`
      )
        .then(r => r.ok ? r.json() : null)
        .then((data: { photo_url: string | null } | null) => {
          if (data?.photo_url) {
            setThumbs(prev => ({ ...prev, [d.id]: data.photo_url }));
          }
        })
        .catch(() => {});
    });
  }, [similar]);

  if (similar.length === 0) return null;

  return (
    <div className="ddp-more-section">
      <div className="ddp-more-head">MORE LIKE THIS</div>
      <div className="ddp-more-grid">
        {similar.map(d => (
          <button key={d.id} className="ddp-more-card" onClick={() => onNav(`/dining/${d.id}`)}>
            <div className="ddp-more-thumb">
              {thumbs[d.id] ? (
                <img src={thumbs[d.id]!} alt={d.name} className="ddp-more-thumb-img" loading="lazy" />
              ) : (
                <div className="ddp-more-thumb-placeholder" />
              )}
              {d.format && <span className="ddp-more-badge">{d.format}</span>}
            </div>
            <div className="ddp-more-info">
              <span className="ddp-more-name">{d.name}</span>
              <span className="ddp-more-meta">{d.cuisine}{d.neighborhood ? ` · ${d.neighborhood}` : ""}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DiningDetailPage() {
  const params = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const { dining } = useDining();

  const isLive = params.id === "live" || params.id === undefined;
  const id = isLive ? 0 : Number(params.id);

  // For live results, pull name/neighborhood/place_id from query string
  const liveParams = useMemo(() => {
    if (!isLive) return null;
    const sp = new URLSearchParams(window.location.search);
    return {
      name: sp.get("name") || "",
      neighborhood: sp.get("neighborhood") || "",
      address: sp.get("address") || "",
      place_id: sp.get("place_id") || "",
    };
  }, [isLive]);

  const storageKey = isLive
    ? `live-${liveParams?.name?.toLowerCase().replace(/\s+/g, "-")}`
    : id;
  const savedKey = `sr_dining_saved_${storageKey}`;
  const visitedKey = `sr_dining_visited_${storageKey}`;
  const bookedKey = `sr_dining_booked_${storageKey}`;
  const notesKey = `sr_dining_notes_${storageKey}`;
  const dishKey = `sr_dining_dish_${storageKey}`;
  const withKey = `sr_dining_with_${storageKey}`;
  const tagsKey = `sr_dining_tags_${storageKey}`;

  const [restaurant, setRestaurant] = useState<DiningItem | null>(null);
  const [places, setPlaces] = useState<PlacesData | null>(null);
  const [placesLoading, setPlacesLoading] = useState(true);

  const [saved, setSaved] = useState(false);
  const [visited, setVisited] = useState(false);
  const [booked, setBooked] = useState(false);

  const [notes, setNotes] = useState("");
  const [dish, setDish] = useState("");
  const [withWho, setWithWho] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [notesSaved, setNotesSaved] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isLive && liveParams?.name) {
      setRestaurant({
        id: 0,
        name: liveParams.name,
        cuisine: "",
        format: "",
        neighborhood: liveParams.neighborhood,
        borough: "",
        price: 0,
        rope: 0,
        occasion: [],
        recognition: "",
        signature: "",
        blurb: "",
      });
    } else if (!isLive && dining.length > 0) {
      setRestaurant(dining.find(d => d.id === id) || null);
    }
  }, [dining, id, isLive, liveParams]);

  useEffect(() => {
    setSaved(localStorage.getItem(savedKey) === "1");
    setVisited(localStorage.getItem(visitedKey) === "1");
    setBooked(localStorage.getItem(bookedKey) === "1");
    setNotes(localStorage.getItem(notesKey) || "");
    setDish(localStorage.getItem(dishKey) || "");
    setWithWho(localStorage.getItem(withKey) || "");
    const t = localStorage.getItem(tagsKey);
    setTags(t ? new Set(JSON.parse(t)) : new Set());
  }, [savedKey, visitedKey, bookedKey, notesKey, dishKey, withKey, tagsKey]);

  const fetchPlaces = useCallback(async (r: DiningItem) => {
    setPlacesLoading(true);
    try {
      const url = `${API_BASE}/places/restaurant/${r.id}?name=${encodeURIComponent(r.name)}&neighborhood=${encodeURIComponent(r.neighborhood || "")}&borough=${encodeURIComponent(r.borough || "")}`;
      const res = await fetch(url);
      if (res.ok) setPlaces(await res.json());
    } catch { /* silent */ }
    setPlacesLoading(false);
  }, []);

  useEffect(() => {
    if (restaurant) fetchPlaces(restaurant);
  }, [restaurant, fetchPlaces]);

  const persistNotes = useCallback(() => {
    localStorage.setItem(notesKey, notes);
    localStorage.setItem(dishKey, dish);
    localStorage.setItem(withKey, withWho);
    localStorage.setItem(tagsKey, JSON.stringify([...tags]));
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1500);
  }, [notes, dish, withWho, tags, notesKey, dishKey, withKey, tagsKey]);

  const autoSave = (fn: () => void) => {
    if (notesTimer.current) clearTimeout(notesTimer.current);
    fn();
    notesTimer.current = setTimeout(persistNotes, 1200);
  };

  const toggleTag = (tag: string) => {
    setTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      localStorage.setItem(tagsKey, JSON.stringify([...next]));
      return next;
    });
  };

  const photos = places?.photos || [];
  const r = restaurant;

  return (
    <div className="ddp-root">
      {/* ── TOP BAR ── */}
      <div className="ddp-topbar">
        <button className="ddp-back" onClick={() => nav("/dining")}>
          <ChevronLeft size={16} /> Back
        </button>
        {places?.maps_url && (
          <a
            href={places.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ddp-reserve-btn"
          >
            Reserve a table <ExternalLink size={13} />
          </a>
        )}
      </div>

      {/* ── PHOTO STRIP ── */}
      <div className="ddp-photo-strip">
        {placesLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="ddp-photo-cell ddp-shimmer" />
          ))
        ) : photos.length > 0 ? (
          photos.slice(0, 5).map((src, i) => (
            <button key={i} className="ddp-photo-cell" onClick={() => setLightboxIdx(i)}>
              <img src={src} alt="" loading="lazy" />
            </button>
          ))
        ) : (
          <div className="ddp-photo-strip-empty">No photos available</div>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="ddp-content">

        {/* Rating + Name */}
        <div className="ddp-name-block">
          {places?.rating && (
            <div className="ddp-google-rating">
              <Star size={14} fill="#ffd36b" color="#ffd36b" />
              <span>{places.rating.toFixed(1)}</span>
              {places.user_rating_count && (
                <span className="ddp-rating-count">({places.user_rating_count.toLocaleString()})</span>
              )}
            </div>
          )}
          <h1 className="ddp-title">{r?.name || "…"}</h1>
          <p className="ddp-subtitle">
            {r?.cuisine}
            {r?.format ? ` · ${r.format}` : ""}
          </p>
        </div>

        {/* Action buttons — Want to go / Booked / Been here */}
        <div className="ddp-actions-row">
          <button
            className={`ddp-act-btn${saved ? " active" : ""}`}
            onClick={() => { setSaved(v => { localStorage.setItem(savedKey, !v ? "1" : "0"); return !v; }); }}
          >
            <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
            Want to go
          </button>
          <button
            className={`ddp-act-btn${booked ? " active" : ""}`}
            onClick={() => { setBooked(v => { localStorage.setItem(bookedKey, !v ? "1" : "0"); return !v; }); }}
          >
            <CheckCircle size={14} fill={booked ? "currentColor" : "none"} />
            Booked
          </button>
          <button
            className={`ddp-act-btn${visited ? " active" : ""}`}
            onClick={() => { setVisited(v => { localStorage.setItem(visitedKey, !v ? "1" : "0"); return !v; }); }}
          >
            <CheckCircle size={14} fill={visited ? "currentColor" : "none"} />
            Been here
          </button>
        </div>

        {/* Info table */}
        <div className="ddp-info-table">
          {places?.address && (
            <div className="ddp-info-row">
              <span className="ddp-info-key"><MapPin size={13} /> ADDRESS</span>
              <span className="ddp-info-val">{places.address}</span>
            </div>
          )}
          {places?.today_hours && (
            <div className="ddp-info-row">
              <span className="ddp-info-key"><Clock size={13} /> TODAY</span>
              <span className="ddp-info-val">{places.today_hours}</span>
            </div>
          )}
          {places?.website && (
            <div className="ddp-info-row">
              <span className="ddp-info-key"><Globe size={13} /> WEBSITE</span>
              <a href={places.website} target="_blank" rel="noopener noreferrer" className="ddp-info-link">
                {places.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </div>
          )}
          {places?.maps_url && (
            <div className="ddp-info-row">
              <span className="ddp-info-key"><MapPin size={13} /> MAPS</span>
              <a href={places.maps_url} target="_blank" rel="noopener noreferrer" className="ddp-info-link">
                Open in Google Maps ↗
              </a>
            </div>
          )}
          {!placesLoading && !places && r && (
            <>
              <div className="ddp-info-row">
                <span className="ddp-info-key"><MapPin size={13} /> LOCATION</span>
                <span className="ddp-info-val">{r.neighborhood}{r.borough ? `, ${r.borough}` : ""}</span>
              </div>
            </>
          )}
        </div>

        {/* Your Notes */}
        <div className="ddp-notes-card">
          <div className="ddp-notes-head">
            YOUR NOTES
            {notesSaved && <span className="ddp-notes-saved">Saved ✓</span>}
          </div>
          <textarea
            className="ddp-notes-input"
            placeholder="How was it? Any thoughts..."
            value={notes}
            onChange={e => autoSave(() => setNotes(e.target.value))}
            rows={4}
          />
          <input
            className="ddp-notes-line"
            placeholder="Standout dishes (e.g. the duck, black truffle pasta)"
            value={dish}
            onChange={e => autoSave(() => setDish(e.target.value))}
          />
          <input
            className="ddp-notes-line"
            placeholder="Who did you go with?"
            value={withWho}
            onChange={e => autoSave(() => setWithWho(e.target.value))}
          />
          <div className="ddp-tag-label">TAG IT</div>
          <div className="ddp-tags">
            {TAG_OPTIONS.map(tag => (
              <button
                key={tag}
                className={`ddp-tag${tags.has(tag) ? " on" : ""}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <button className="ddp-save-btn" onClick={persistNotes}>Save notes</button>
        </div>

        {/* Google Reviews — max 3, 4-line clamp, expand on click */}
        {places?.reviews && places.reviews.length > 0 && (
          <div className="ddp-reviews-section">
            <div className="ddp-reviews-head">GOOGLE REVIEWS</div>
            {(showAllReviews ? places.reviews : places.reviews.slice(0, 3)).map((rev, i) => {
              const expanded = expandedReviews.has(i);
              return (
                <div key={i} className="ddp-review-card"
                  onClick={() => setExpandedReviews(prev => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })}
                  style={{ cursor: "pointer" }}
                >
                  <div className="ddp-review-top">
                    <span className="ddp-review-author">{rev.author}</span>
                    <StarRow rating={rev.rating} />
                  </div>
                  <p className={`ddp-review-text${expanded ? " expanded" : ""}`}>{rev.text}</p>
                  {rev.relativeTime && (
                    <p className="ddp-review-time">{rev.relativeTime}</p>
                  )}
                </div>
              );
            })}
            {places.reviews.length > 3 && (
              <button className="ddp-see-more-reviews" onClick={() => setShowAllReviews(v => !v)}>
                {showAllReviews ? "Show fewer reviews" : `See all ${places.reviews.length} reviews`}
              </button>
            )}
          </div>
        )}

        {/* More like this */}
        {restaurant && dining.length > 0 && (
          <MoreLikeThis current={restaurant} dining={dining} onNav={nav} />
        )}

        {/* Our blurb + signature if no Places data */}
        {!placesLoading && !places && r && (
          <>
            {r.blurb && (
              <div className="ddp-section">
                <div className="ddp-section-label">About</div>
                <p className="ddp-blurb">{r.blurb}</p>
              </div>
            )}
            {r.signature && (
              <div className="ddp-signature">
                <p className="ddp-signature-text">✦ {r.signature}</p>
              </div>
            )}
          </>
        )}

        <div style={{ height: 48 }} />
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && photos.length > 0 && (
        <div className="ddp-lightbox" onClick={() => setLightboxIdx(null)}>
          <img src={photos[lightboxIdx]} alt="" className="ddp-lightbox-img" onClick={e => e.stopPropagation()} />
          <div className="ddp-lightbox-nav">
            <button onClick={e => { e.stopPropagation(); setLightboxIdx((lightboxIdx - 1 + photos.length) % photos.length); }}>‹</button>
            <span>{lightboxIdx + 1} / {photos.length}</span>
            <button onClick={e => { e.stopPropagation(); setLightboxIdx((lightboxIdx + 1) % photos.length); }}>›</button>
          </div>
        </div>
      )}
    </div>
  );
}
