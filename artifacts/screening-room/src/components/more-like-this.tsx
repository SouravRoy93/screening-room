// "More like this" — the moment after you mark something.
//
// Shows once, shows four, and gets out of the way. Each pick carries a
// truthful reason (from lib/recommend.ts), a poster, and a one-tap way to add
// it to the watchlist without leaving the sheet. Dismissal is always one tap,
// Escape, or the backdrop — this is a delight, not a toll gate.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { X, Plus, Check, Star } from "lucide-react";
import "./more-like-this.css";
import { IMG_BASE, IMG_POSTER, IMG_POSTER_LG, colorFor } from "@/types";
import type { MediaItem } from "@/types";
import { suggestHeading, type Recommendation, type TrackStatus } from "@/lib/recommend";

interface Props {
  seed: MediaItem;
  status: TrackStatus;
  recs: Recommendation[];
  /** Adds the pick to the watchlist. Resolves when saved. */
  onAdd: (item: MediaItem) => Promise<void> | void;
  onClose: () => void;
}

export function MoreLikeThis({ seed, status, recs, onAdd, onClose }: Props) {
  const [, nav] = useLocation();
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes; focus lands somewhere sensible for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The sheet owns the screen while it's up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function add(item: MediaItem) {
    if (added[item.tmdb_id] || busy != null) return;
    setBusy(item.tmdb_id);
    try {
      await onAdd(item);
      setAdded(p => ({ ...p, [item.tmdb_id]: true }));
    } finally {
      setBusy(null);
    }
  }

  function open(item: MediaItem) {
    onClose();
    nav(`/films/${item.media_type}/${item.tmdb_id}`);
  }

  if (!recs.length) return null;

  return (
    <div className="mlt-overlay" role="dialog" aria-modal="true" aria-label="More like this" onClick={onClose}>
      <section className="mlt-sheet" onClick={e => e.stopPropagation()}>
        <header className="mlt-head">
          {seed.poster_path ? (
            <img className="mlt-seed-poster" src={`${IMG_POSTER}${seed.poster_path}`} alt="" loading="lazy" />
          ) : (
            <span
              className="mlt-seed-poster mlt-seed-fallback"
              style={{ background: `linear-gradient(145deg, ${colorFor(seed.genres?.[0] || "")[0]}, ${colorFor(seed.genres?.[0] || "")[1]})` }}
              aria-hidden
            />
          )}
          <div className="mlt-head-text">
            <div className="mlt-eyebrow">You might also like</div>
            <h2 className="mlt-title">{suggestHeading(seed, status)}</h2>
          </div>
          <button ref={closeRef} className="mlt-close" onClick={onClose} aria-label="Close suggestions">
            <X size={16} />
          </button>
        </header>

        <ul className="mlt-grid">
          {recs.map((r, i) => {
            const item = r.item;
            const isAdded = !!added[item.tmdb_id];
            const [c1, c2] = colorFor(item.genres?.[0] || "");
            return (
              <li
                key={`${item.media_type}:${item.tmdb_id}`}
                className="mlt-card"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <button className="mlt-poster-btn" onClick={() => open(item)} aria-label={`Open ${item.title}`}>
                  {item.poster_path ? (
                    <img
                      className="mlt-poster"
                      src={`${IMG_BASE}${item.poster_path}`}
                      srcSet={`${IMG_POSTER}${item.poster_path} 185w, ${IMG_BASE}${item.poster_path} 342w, ${IMG_POSTER_LG}${item.poster_path} 500w`}
                      sizes="(max-width: 640px) 40vw, 150px"
                      alt={item.title}
                      loading="lazy"
                    />
                  ) : (
                    <span className="mlt-poster mlt-poster-fallback" style={{ background: `linear-gradient(145deg, ${c1}, ${c2})` }}>
                      {item.title.slice(0, 1)}
                    </span>
                  )}
                  {item.vote_average ? (
                    <span className="mlt-score"><Star size={9} fill="currentColor" /> {item.vote_average.toFixed(1)}</span>
                  ) : null}
                </button>

                <div className="mlt-meta">
                  <button className="mlt-name" onClick={() => open(item)}>{item.title}</button>
                  <div className="mlt-sub">
                    {[item.media_type === "tv" ? "Series" : "Film", item.year ?? undefined].filter(Boolean).join(" · ")}
                  </div>
                  <p className="mlt-reason">{r.reason}</p>
                </div>

                <button
                  className={`mlt-add${isAdded ? " on" : ""}`}
                  onClick={() => add(item)}
                  disabled={isAdded || busy === item.tmdb_id}
                  aria-label={isAdded ? `${item.title} added to watchlist` : `Add ${item.title} to watchlist`}
                >
                  {isAdded ? <><Check size={12} /> On your list</> : <><Plus size={12} /> Watchlist</>}
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="mlt-foot">
          <button className="mlt-dismiss" onClick={onClose}>Not now</button>
        </footer>
      </section>
    </div>
  );
}
