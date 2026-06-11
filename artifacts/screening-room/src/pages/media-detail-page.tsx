import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { Star, Play, ChevronLeft, Bell, BellOff, Bookmark, Eye, CheckCircle, Film, Tv, Volume2 } from "lucide-react";
import { IMG_BACKDROP, IMG_BASE, IMG_PROFILE } from "@/types";
import type { MediaItem, TrackedItem } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { useTracked } from "@/hooks/use-tracked";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

interface Trailer {
  key: string;
  name: string;
  site: string;
  type: string;
}

interface DetailData {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  overview: string | null;
  year: number | null;
  genres: string[];
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  runtime: number | null;
  status: string | null;
  tagline: string | null;
  cast: CastMember[];
  trailer: Trailer | null;
  number_of_seasons: number | null;
  next_episode_to_air: {
    season_number: number;
    episode_number: number;
    name: string;
    air_date: string;
  } | null;
}

interface RecItem extends MediaItem {}

const STATUS_CONFIG = {
  want: { icon: Bookmark, label: "Watchlist", color: "#1098ad" },
  watching: { icon: Eye, label: "Watching", color: "#f08c00" },
  watched: { icon: CheckCircle, label: "Watched", color: "#2f9e44" },
};

function RatingStars({
  current,
  onRate,
}: {
  current: number | null | undefined;
  onRate: (n: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? current ?? 0;
  return (
    <div className="mdp-rating-row">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onRate(n)}
          className="mdp-star"
          style={{ color: n <= display ? "#ffd36b" : "rgba(255,255,255,0.18)" }}
        >
          ★
        </button>
      ))}
      {current ? <span className="mdp-rating-val">{current}/10</span> : null}
    </div>
  );
}

function RecCard({ item, onClick }: { item: RecItem; onClick: () => void }) {
  return (
    <button className="mdp-rec-card" onClick={onClick}>
      {item.poster_path ? (
        <img src={`${IMG_BASE}${item.poster_path}`} alt={item.title} className="mdp-rec-img" />
      ) : (
        <div className="mdp-rec-img mdp-rec-placeholder">
          {item.media_type === "tv" ? <Tv size={20} /> : <Film size={20} />}
        </div>
      )}
      <p className="mdp-rec-title">{item.title}</p>
      {item.vote_average ? (
        <p className="mdp-rec-score">★ {item.vote_average.toFixed(1)}</p>
      ) : null}
    </button>
  );
}

export default function MediaDetailPage() {
  const params = useParams<{ type: string; id: string }>();
  const [, nav] = useLocation();
  const { user } = useAuth();
  const { tracked, setStatus, saveRating } = useTracked("films", user?.id);

  const mediaType = params.type as "movie" | "tv";
  const tmdbId = Number(params.id);

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [recs, setRecs] = useState<RecItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [notifyEpisodes, setNotifyEpisodes] = useState(false);
  const notesKey = `sr_notes_${mediaType}_${tmdbId}`;
  const notifyKey = `sr_notify_${tmdbId}`;
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tracked_item: TrackedItem | undefined = tracked[`${mediaType}:${tmdbId}`];
  const fakeItem: MediaItem = {
    tmdb_id: tmdbId,
    media_type: mediaType,
    title: detail?.title || "",
    year: detail?.year || null,
    genres: detail?.genres || [],
    poster_path: detail?.poster_path || null,
    vote_average: detail?.vote_average || null,
    popularity: null,
  };

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setRecs([]);
    Promise.all([
      fetch(`${API_BASE}/tmdb/${mediaType}/${tmdbId}`).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/tmdb/${mediaType}/${tmdbId}/recommendations`).then(r => r.ok ? r.json() : []),
    ]).then(([d, r]) => {
      setDetail(d);
      setRecs(r || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [mediaType, tmdbId]);

  useEffect(() => {
    const saved = localStorage.getItem(notesKey);
    if (saved) setNotes(saved);
    setNotifyEpisodes(localStorage.getItem(notifyKey) === "1");
  }, [notesKey, notifyKey]);

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

  const toggleNotify = () => {
    const next = !notifyEpisodes;
    setNotifyEpisodes(next);
    localStorage.setItem(notifyKey, next ? "1" : "0");
  };

  const handleStatus = useCallback((status: "want" | "watching" | "watched") => {
    if (!detail) return;
    setStatus(fakeItem, status);
  }, [detail, fakeItem, setStatus]);

  const handleRating = useCallback((rating: number) => {
    if (!detail) return;
    saveRating(fakeItem, rating);
  }, [detail, fakeItem, saveRating]);

  const backdropUrl = detail?.backdrop_path ? `${IMG_BACKDROP}${detail.backdrop_path}` : null;
  const posterUrl = detail?.poster_path ? `${IMG_BASE}${detail.poster_path}` : null;

  const runtime = detail?.runtime
    ? mediaType === "tv"
      ? `${detail.number_of_seasons ?? 1} season${(detail.number_of_seasons ?? 1) !== 1 ? "s" : ""}`
      : `${Math.floor(detail.runtime / 60)}h ${detail.runtime % 60}m`
    : null;

  return (
    <div className="mdp-root">
      {/* ── HERO ── */}
      <div className="mdp-hero">
        {backdropUrl ? (
          <img src={backdropUrl} alt="" className="mdp-backdrop" />
        ) : posterUrl ? (
          <img src={posterUrl} alt="" className="mdp-backdrop mdp-backdrop-poster" />
        ) : (
          <div className="mdp-backdrop-placeholder" />
        )}
        <div className="mdp-hero-gradient" />

        {/* Back button */}
        <button className="mdp-back" onClick={() => nav("/films")}>
          <ChevronLeft size={20} />
          Entertainment
        </button>

        {/* Hero content pinned to bottom */}
        <div className="mdp-hero-content">
          {posterUrl && (
            <img src={posterUrl} alt={detail?.title} className="mdp-hero-poster" />
          )}
          <div className="mdp-hero-meta">
            {loading ? (
              <div className="mdp-shimmer" style={{ width: 220, height: 36, borderRadius: 8 }} />
            ) : (
              <h1 className="mdp-title">{detail?.title}</h1>
            )}
            <div className="mdp-meta-row">
              {detail?.year && <span>{detail.year}</span>}
              {runtime && <span>{runtime}</span>}
              {detail?.status && detail.status !== "Released" && (
                <span className="mdp-status-badge">{detail.status}</span>
              )}
              {detail?.vote_average && detail.vote_average > 0 && (
                <span className="mdp-vote">
                  <Star size={13} fill="#ffd36b" color="#ffd36b" />
                  {detail.vote_average.toFixed(1)}
                </span>
              )}
            </div>
            {detail?.genres?.length > 0 && (
              <div className="mdp-genres">
                {detail.genres.slice(0, 4).map(g => (
                  <span key={g} className="mdp-genre-chip">{g}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="mdp-body">

        {/* Tagline */}
        {detail?.tagline && (
          <p className="mdp-tagline">"{detail.tagline}"</p>
        )}

        {/* Track + Trailer row */}
        <div className="mdp-actions">
          <div className="mdp-status-row">
            {(["want", "watching", "watched"] as const).map(s => {
              const cfg = STATUS_CONFIG[s];
              const Icon = cfg.icon;
              const active = tracked_item?.status === s;
              return (
                <button
                  key={s}
                  className="mdp-status-btn"
                  style={{
                    background: active ? cfg.color : "rgba(255,255,255,0.07)",
                    color: active ? "#fff" : "rgba(255,255,255,0.55)",
                    borderColor: active ? cfg.color : "rgba(255,255,255,0.1)",
                  }}
                  onClick={() => handleStatus(s)}
                >
                  <Icon size={14} />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {detail?.trailer && (
            <button
              className="mdp-trailer-btn"
              onClick={() => setShowTrailer(true)}
            >
              <Play size={14} fill="white" />
              Trailer
            </button>
          )}
        </div>

        {/* Rating (if watched) */}
        {(tracked_item?.status === "watched" || tracked_item?.rating) && (
          <div className="mdp-section">
            <div className="mdp-section-label">Your rating</div>
            <RatingStars current={tracked_item?.rating} onRate={handleRating} />
          </div>
        )}

        {/* Overview */}
        {loading && !detail && (
          <div className="mdp-section">
            <div className="mdp-shimmer" style={{ width: "100%", height: 80, borderRadius: 10 }} />
          </div>
        )}
        {detail?.overview && (
          <div className="mdp-section">
            <div className="mdp-section-label">Synopsis</div>
            <p className="mdp-overview">{detail.overview}</p>
          </div>
        )}

        {/* Next episode (TV) */}
        {mediaType === "tv" && detail?.next_episode_to_air && (
          <div className="mdp-next-ep">
            <div className="mdp-next-ep-left">
              <span className="mdp-next-ep-tag">Up next</span>
              <span className="mdp-next-ep-title">
                S{detail.next_episode_to_air.season_number}E{detail.next_episode_to_air.episode_number} · {detail.next_episode_to_air.name}
              </span>
              <span className="mdp-next-ep-date">{detail.next_episode_to_air.air_date}</span>
            </div>
            <button
              className="mdp-notify-btn"
              onClick={toggleNotify}
              style={{ color: notifyEpisodes ? "#ffd36b" : "rgba(255,255,255,0.4)" }}
            >
              {notifyEpisodes ? <Bell size={18} fill="#ffd36b" /> : <BellOff size={18} />}
              <span>{notifyEpisodes ? "Notifying" : "Notify me"}</span>
            </button>
          </div>
        )}

        {/* Cast */}
        {detail?.cast && detail.cast.length > 0 && (
          <div className="mdp-section">
            <div className="mdp-section-label">Cast</div>
            <div className="mdp-cast-scroll">
              {detail.cast.slice(0, 15).map(c => (
                <div key={c.id} className="mdp-cast-card">
                  <div className="mdp-cast-avatar">
                    {c.profile_path ? (
                      <img src={`${IMG_PROFILE}${c.profile_path}`} alt={c.name} />
                    ) : (
                      <span>{c.name[0]}</span>
                    )}
                  </div>
                  <p className="mdp-cast-name">{c.name}</p>
                  <p className="mdp-cast-char">{c.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mdp-section">
          <div className="mdp-section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Your notes
            {notesSaved && <span style={{ fontSize: 11, color: "#2f9e44", fontWeight: 500 }}>Saved ✓</span>}
          </div>
          <textarea
            className="mdp-notes"
            placeholder="Thoughts, quotes, who you watched with…"
            value={notes}
            onChange={e => handleNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Episode notify (TV, no next ep scheduled but currently watching) */}
        {mediaType === "tv" && !detail?.next_episode_to_air && tracked_item?.status === "watching" && (
          <div className="mdp-section">
            <button
              className="mdp-notify-standalone"
              onClick={toggleNotify}
              style={{ borderColor: notifyEpisodes ? "#ffd36b" : "rgba(255,255,255,0.1)", color: notifyEpisodes ? "#ffd36b" : "rgba(255,255,255,0.5)" }}
            >
              {notifyEpisodes ? <Bell size={16} fill="#ffd36b" /> : <BellOff size={16} />}
              {notifyEpisodes ? "Episode notifications on" : "Get notified when new episodes air"}
            </button>
          </div>
        )}

        {/* Recommendations */}
        {recs.length > 0 && (
          <div className="mdp-section">
            <div className="mdp-section-label">More like this</div>
            <div className="mdp-recs-scroll">
              {recs.slice(0, 12).map(rec => (
                <RecCard
                  key={`${rec.media_type}:${rec.tmdb_id}`}
                  item={rec}
                  onClick={() => nav(`/films/${rec.media_type}/${rec.tmdb_id}`)}
                />
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>

      {/* Trailer modal */}
      {showTrailer && detail?.trailer && (
        <div className="mdp-trailer-overlay" onClick={() => setShowTrailer(false)}>
          <div className="mdp-trailer-modal" onClick={e => e.stopPropagation()}>
            <button className="mdp-trailer-close" onClick={() => setShowTrailer(false)}>✕</button>
            <iframe
              src={`https://www.youtube.com/embed/${detail.trailer.key}?autoplay=1`}
              title="Trailer"
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="mdp-trailer-iframe"
            />
          </div>
        </div>
      )}
    </div>
  );
}
