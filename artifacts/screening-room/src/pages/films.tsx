import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { MediaCard } from "@/components/media-card";
import { MediaDetailPanel } from "@/components/media-detail-panel";
import { EpisodeBanner } from "@/components/episode-banner";
import { useCatalog } from "@/hooks/use-catalog";
import { useTracked } from "@/hooks/use-tracked";
import { useAuth } from "@/hooks/use-auth";
import type { MediaItem, TrackedItem } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "";
type Tab = "discover" | "library" | "stats";

interface EpisodeAlert {
  tmdb_id: number;
  title: string;
  season_number: number;
  episode_number: number;
  episode_name: string;
  air_date: string;
  poster_path: string | null;
}

const GENRES_MOVIE: Record<number, string> = {28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Sci-Fi",53:"Thriller",10752:"War",37:"Western"};
const GENRES_TV: Record<number, string> = {10759:"Action & Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",10762:"Kids",9648:"Mystery",10765:"Sci-Fi & Fantasy",37:"Western"};
const ALL_GENRES = [...new Set([...Object.values(GENRES_MOVIE), ...Object.values(GENRES_TV)])].sort();

function GenreBars({ items }: { items: TrackedItem[] }) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach(t => (t.genres || []).forEach(g => { m[g] = (m[g] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [items]);

  if (!counts.length) return null;
  const max = counts[0][1];

  return (
    <>
      <div className="bars-head">Genres</div>
      <div className="bars">
        {counts.map(([genre, count]) => (
          <div key={genre} className="bar">
            <span className="bl">{genre}</span>
            <div className="bf-wrap">
              <div className="bf" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="bc">{count}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Films() {
  const [, nav] = useLocation();
  const { user } = useAuth();
  const { catalog, loading } = useCatalog();
  const { tracked, setStatus, saveRating } = useTracked("films", user?.id);

  const [tab, setTab] = useState<Tab>("discover");
  const [libStatus, setLibStatus] = useState<"want" | "watching" | "watched">("watched");
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [alerts, setAlerts] = useState<EpisodeAlert[]>([]);

  useEffect(() => {
    const watchingIds = Object.values(tracked)
      .filter(t => t.status === "watching" && t.media_type === "tv")
      .map(t => Number(t.tmdb_id));
    if (!watchingIds.length) return;
    fetch(`${API_BASE}/notifications/episodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdb_ids: watchingIds }),
    }).then(r => r.ok ? r.json() : []).then(setAlerts).catch(() => {});
  }, [tracked]);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const type = typeFilter !== "all" ? `&type=${typeFilter}` : "";
      const r = await fetch(`${API_BASE}/tmdb/search?query=${encodeURIComponent(query)}${type}`);
      if (r.ok) setSearchResults(await r.json());
    } catch { setSearchResults([]); }
    setSearching(false);
  }, [typeFilter]);

  useEffect(() => {
    const t = setTimeout(() => performSearch(q), 400);
    return () => clearTimeout(t);
  }, [q, performSearch]);

  const displayItems = useMemo(() => {
    if (q.trim()) return searchResults;
    let items = catalog;
    if (typeFilter !== "all") items = items.filter(i => i.media_type === typeFilter);
    if (genreFilter !== "all") items = items.filter(i => (i.genres || []).includes(genreFilter));
    return items;
  }, [q, searchResults, catalog, typeFilter, genreFilter]);

  const libraryItems = useMemo(() => Object.values(tracked).filter(t => t.status === libStatus), [tracked, libStatus]);
  const allWatched = useMemo(() => Object.values(tracked).filter(t => t.status === "watched"), [tracked]);

  const stats = useMemo(() => ({
    total: Object.keys(tracked).length,
    watched: Object.values(tracked).filter(t => t.status === "watched").length,
    watching: Object.values(tracked).filter(t => t.status === "watching").length,
    want: Object.values(tracked).filter(t => t.status === "want").length,
    avgRating: (() => {
      const rated = Object.values(tracked).filter(t => t.rating);
      return rated.length ? (rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length).toFixed(1) : "—";
    })(),
  }), [tracked]);

  const trackedFor = (item: MediaItem) => tracked[`${item.media_type}:${item.tmdb_id}`];
  const trackedForLib = (item: TrackedItem) => tracked[`${item.media_type}:${item.tmdb_id}`];
  const toMedia = (t: TrackedItem): MediaItem => ({
    tmdb_id: Number(t.tmdb_id), media_type: t.media_type as "movie" | "tv",
    title: t.title, year: t.year, genres: t.genres || [],
    poster_path: t.poster_path, vote_average: null, popularity: null,
  });

  return (
    <div className="min-h-screen bg-background">
      <EpisodeBanner alerts={alerts} />

      {/* Header */}
      <div className="cat-header-wrap">
        <div className="cat-header">
          <button className="homebtn" onClick={() => nav("/")}>← Hub</button>
          <div className="cat-title-bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8.5" width="18" height="12" rx="2"/>
              <path d="M3.4 8.5 6 4.2l3.2 2.1L11.4 4l3.2 2.1L17.8 4l2.8 4.5"/>
            </svg>
            Entertainment
          </div>
          <div className="headright">
            <div className="tabs">
              <button className={tab === "discover" ? "active" : ""} onClick={() => setTab("discover")}>Discover</button>
              <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>My Library</button>
              <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>Stats</button>
            </div>
            {alerts.length > 0 && (
              <div style={{ position: "relative" }}>
                <Bell style={{ width: 18, height: 18, color: "#ffd36b" }} />
                <span style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%", background: "#ec4899", color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {alerts.length}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DISCOVER */}
      {tab === "discover" && (
        <>
          <div className="controls">
            <input
              type="search"
              placeholder="Search any movie or show (live from TMDB)…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <div className="seg">
              {(["all", "movie", "tv"] as const).map(t => (
                <button key={t} className={typeFilter === t ? "active" : ""} onClick={() => setTypeFilter(t)}>
                  {t === "all" ? "All" : t === "movie" ? "Movies" : "TV"}
                </button>
              ))}
            </div>
            <select value={genreFilter} onChange={e => setGenreFilter(e.target.value)}>
              <option value="all">All genres</option>
              {ALL_GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <span className="count">{displayItems.length > 0 ? `${displayItems.length} titles` : ""}</span>
          </div>

          {loading && !q && (
            <div className="grid">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: "2/3", borderRadius: 16, background: "rgba(255,255,255,.06)", animation: "pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          )}

          {searching && <div className="empty">Searching TMDB…</div>}

          {!searching && displayItems.length > 0 && (
            <div className="grid">
              {displayItems.map(item => (
                <MediaCard
                  key={`${item.media_type}:${item.tmdb_id}`}
                  item={item}
                  tracked={trackedFor(item)}
                  onOpen={setSelectedItem}
                  onStatus={setStatus}
                />
              ))}
            </div>
          )}

          {!searching && q && displayItems.length === 0 && (
            <div className="empty">No results for "{q}"</div>
          )}
        </>
      )}

      {/* LIBRARY */}
      {tab === "library" && (
        <>
          <div className="lib-seg">
            {(["watched", "watching", "want"] as const).map(s => {
              const count = Object.values(tracked).filter(t => t.status === s).length;
              const labels = { watched: "Watched", watching: "Watching", want: "Watchlist" };
              return (
                <button
                  key={s}
                  className={`${libStatus === s ? `on ${s}` : ""}`}
                  onClick={() => setLibStatus(s)}
                >
                  {labels[s]} {count > 0 && <span style={{ opacity: .7, fontSize: 11 }}>{count}</span>}
                </button>
              );
            })}
          </div>

          {libraryItems.length === 0 ? (
            <div className="empty">Nothing here yet.</div>
          ) : (
            <div className="grid">
              {libraryItems.map(t => (
                <MediaCard
                  key={`${t.media_type}:${t.tmdb_id}`}
                  item={toMedia(t)}
                  tracked={trackedForLib(t)}
                  onOpen={setSelectedItem}
                  onStatus={setStatus}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* STATS */}
      {tab === "stats" && (
        <>
          <div className="stats-grid">
            {[
              { label: "Total tracked", value: stats.total, color: "#8b5cf6" },
              { label: "Watched", value: stats.watched, color: "#2f9e44" },
              { label: "Watching", value: stats.watching, color: "#f08c00" },
              { label: "Watchlist", value: stats.want, color: "#1098ad" },
              { label: "Avg rating", value: stats.avgRating, color: "#ffd36b" },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div className="sl">{s.label}</div>
                <div className="sv" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {allWatched.length > 0 ? (
            <GenreBars items={allWatched} />
          ) : (
            <div className="empty">Watch and rate some movies to see your stats.</div>
          )}
        </>
      )}

      <MediaDetailPanel
        item={selectedItem}
        tracked={selectedItem ? trackedFor(selectedItem) : undefined}
        onClose={() => setSelectedItem(null)}
        onStatus={setStatus}
        onRating={saveRating}
        onOpen={setSelectedItem}
      />
    </div>
  );
}
