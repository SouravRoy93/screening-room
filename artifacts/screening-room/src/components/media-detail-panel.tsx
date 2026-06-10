import { useEffect, useState, useCallback } from "react";
import { X, Star, Play, Bookmark, Eye, CheckCircle, ChevronRight, Tv, Film } from "lucide-react";
import { IMG_BACKDROP, IMG_BASE, IMG_PROFILE } from "@/types";
import type { MediaItem, TrackedItem } from "@/types";
import { MediaCard } from "./media-card";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
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
  next_episode_to_air: unknown;
}

interface Props {
  item: MediaItem | null;
  tracked?: TrackedItem;
  onClose: () => void;
  onStatus?: (item: MediaItem, status: "want" | "watching" | "watched") => void;
  onRating?: (item: MediaItem, rating: number) => void;
  onOpen?: (item: MediaItem) => void;
}

const STATUS_CONFIG = {
  want: { icon: Bookmark, label: "Watchlist", color: "#ffd36b" },
  watching: { icon: Eye, label: "Watching", color: "#8b5cf6" },
  watched: { icon: CheckCircle, label: "Watched", color: "#22c55e" },
};

export function MediaDetailPanel({ item, tracked, onClose, onStatus, onRating, onOpen }: Props) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [recs, setRecs] = useState<MediaItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const fetchDetail = useCallback(async (m: MediaItem) => {
    setLoadingDetail(true);
    setDetail(null);
    setRecs([]);
    try {
      const [detailRes, recsRes] = await Promise.all([
        fetch(`${API_BASE}/tmdb/${m.media_type}/${m.tmdb_id}`),
        fetch(`${API_BASE}/tmdb/${m.media_type}/${m.tmdb_id}/recommendations`),
      ]);
      if (detailRes.ok) setDetail(await detailRes.json());
      if (recsRes.ok) setRecs(await recsRes.json());
    } catch {
      // silently fail
    }
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    if (item) {
      setOpen(true);
      fetchDetail(item);
    } else {
      setOpen(false);
    }
  }, [item, fetchDetail]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!item) return null;

  const d = detail;
  const backdropUrl = d?.backdrop_path ? `${IMG_BACKDROP}${d.backdrop_path}` : null;
  const currentRating = tracked?.rating ?? null;
  const displayRating = hoverRating ?? currentRating;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full max-w-xl overflow-y-auto transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ background: "#0d0d18", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>

        {/* Backdrop */}
        <div className="relative h-64 bg-card">
          {backdropUrl ? (
            <img src={backdropUrl} alt="" className="w-full h-full object-cover" />
          ) : d?.poster_path ? (
            <img src={`${IMG_BASE}${d.poster_path}`} alt="" className="w-full h-full object-cover object-top" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
            >
              {item.media_type === "tv"
                ? <Tv className="w-16 h-16 text-white/30" />
                : <Film className="w-16 h-16 text-white/30" />}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d18] via-[#0d0d18]/40 to-transparent" />
        </div>

        <div className="px-6 pb-10 -mt-20 relative">
          {/* Title section */}
          <div className="flex gap-4 items-end mb-4">
            {d?.poster_path && (
              <img
                src={`${IMG_BASE}${d.poster_path}`}
                alt={d.title}
                className="w-20 rounded-lg shadow-xl shrink-0"
              />
            )}
            <div className="flex-1 min-w-0 pb-1">
              <h2
                className="text-2xl font-bold text-white leading-tight"
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                {d?.title || item.title}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {(d?.year || item.year) && (
                  <span className="text-sm text-muted-foreground">{d?.year || item.year}</span>
                )}
                {d?.runtime && (
                  <span className="text-sm text-muted-foreground">
                    {item.media_type === "tv"
                      ? `${d.number_of_seasons ?? 1} season${(d.number_of_seasons ?? 1) > 1 ? "s" : ""}`
                      : `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m`}
                  </span>
                )}
                {d?.vote_average && d.vote_average > 0 && (
                  <span className="flex items-center gap-1 text-sm">
                    <Star className="w-3.5 h-3.5 fill-[#ffd36b] text-[#ffd36b]" />
                    <span className="text-[#ffd36b] font-medium">{d.vote_average.toFixed(1)}</span>
                  </span>
                )}
              </div>
              {(d?.genres || item.genres)?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(d?.genres || item.genres).slice(0, 4).map(g => (
                    <span
                      key={g}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(139,92,246,0.25)", color: "#c4b5fd" }}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tagline */}
          {d?.tagline && (
            <p
              className="text-base text-muted-foreground mb-3 italic"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              "{d.tagline}"
            </p>
          )}

          {/* Track buttons */}
          {onStatus && (
            <div className="flex gap-2 mb-4">
              {(["want", "watching", "watched"] as const).map(s => {
                const cfg = STATUS_CONFIG[s];
                const Icon = cfg.icon;
                const active = tracked?.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => onStatus(item, s)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center"
                    style={{
                      background: active ? cfg.color : "rgba(255,255,255,0.06)",
                      color: active ? (s === "want" ? "#000" : "#fff") : "#9ca3af",
                      border: `1px solid ${active ? cfg.color : "transparent"}`,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Rating */}
          {tracked?.status === "watched" && onRating && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-xs text-muted-foreground mb-2">Your rating</p>
              <div className="flex gap-1.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(null)}
                    onClick={() => onRating(item, n)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className="w-5 h-5"
                      fill={displayRating && n <= displayRating ? "#ffd36b" : "transparent"}
                      color={displayRating && n <= displayRating ? "#ffd36b" : "#374151"}
                    />
                  </button>
                ))}
                {currentRating && (
                  <span className="ml-2 text-sm font-semibold text-[#ffd36b] self-center">
                    {currentRating}/10
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Trailer */}
          {d?.trailer && (
            <a
              href={`https://www.youtube.com/watch?v=${d.trailer.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg mb-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: "#dc2626" }}
            >
              <Play className="w-4 h-4 fill-white" />
              Watch Trailer
            </a>
          )}

          {/* Overview */}
          {loadingDetail && !d && (
            <div className="h-24 rounded-lg bg-card animate-pulse mb-4" />
          )}
          {d?.overview && (
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">{d.overview}</p>
          )}

          {/* Cast */}
          {d?.cast && d.cast.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Cast</h3>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {d.cast.slice(0, 12).map(c => (
                  <div key={c.id} className="shrink-0 text-center w-14">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-card mx-auto">
                      {c.profile_path ? (
                        <img src={`${IMG_PROFILE}${c.profile_path}`} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-card text-lg font-bold text-muted-foreground">
                          {c.name[0]}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-foreground mt-1.5 truncate leading-tight">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate leading-tight">{c.character}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {recs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">More like this</h3>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {recs.slice(0, 10).map(rec => (
                  <div key={rec.tmdb_id} className="shrink-0 w-24">
                    <MediaCard
                      item={rec}
                      onOpen={onOpen}
                      compact
                    />
                    <p className="text-xs text-muted-foreground mt-1 truncate">{rec.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
