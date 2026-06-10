import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Search, ArrowLeft, Bookmark, Eye, CheckCircle, BarChart2, Library, Compass, Bell } from "lucide-react";
import { MediaCard } from "@/components/media-card";
import { MediaDetailPanel } from "@/components/media-detail-panel";
import { EpisodeBanner } from "@/components/episode-banner";
import { RatingsBarChart, WatchedOverTimeChart, GenrePieChart } from "@/components/ratings-chart";
import { useCatalog } from "@/hooks/use-catalog";
import { useTracked } from "@/hooks/use-tracked";
import { useAuth } from "@/hooks/use-auth";
import type { MediaItem, TrackedItem } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "";
type Tab = "discover" | "library" | "stats";

const STATUS_TABS = [
  { key: "want", label: "Watchlist", icon: Bookmark, color: "#ffd36b" },
  { key: "watching", label: "Watching", icon: Eye, color: "#8b5cf6" },
  { key: "watched", label: "Watched", icon: CheckCircle, color: "#22c55e" },
] as const;

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
  const [alerts, setAlerts] = useState<EpisodeAlert[]>([]);

  interface EpisodeAlert {
    tmdb_id: number;
    title: string;
    season_number: number;
    episode_number: number;
    episode_name: string;
    air_date: string;
    poster_path: string | null;
  }

  useEffect(() => {
    const watchingIds = Object.values(tracked)
      .filter(t => t.status === "watching" && t.media_type === "tv")
      .map(t => Number(t.tmdb_id));
    if (watchingIds.length === 0) return;

    fetch(`${API_BASE}/notifications/episodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdb_ids: watchingIds }),
    })
      .then(r => r.ok ? r.json() : [])
      .then(setAlerts)
      .catch(() => {});
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
    return items;
  }, [q, searchResults, catalog, typeFilter]);

  const libraryItems = useMemo(() => {
    return Object.values(tracked).filter(t => t.status === libStatus);
  }, [tracked, libStatus]);

  const allWatched = useMemo(() => {
    return Object.values(tracked).filter(t => t.status === "watched");
  }, [tracked]);

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

  const trackedFor = (item: MediaItem) =>
    tracked[`${item.media_type}:${item.tmdb_id}`];

  const trackedForLib = (item: TrackedItem) => {
    return tracked[`${item.media_type}:${item.tmdb_id}`];
  };

  const toMedia = (t: TrackedItem): MediaItem => ({
    tmdb_id: Number(t.tmdb_id),
    media_type: t.media_type as "movie" | "tv",
    title: t.title,
    year: t.year,
    genres: t.genres || [],
    poster_path: t.poster_path,
    vote_average: null,
    popularity: null,
  });

  return (
    <div className="min-h-screen bg-background">
      <EpisodeBanner alerts={alerts} />

      {/* Header */}
      <header className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3" style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => nav("/")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-foreground" style={{ fontFamily: "'Oswald', sans-serif" }}>
          Films & TV
        </h1>
        <div className="flex-1" />
        {alerts.length > 0 && (
          <div className="relative">
            <Bell className="w-5 h-5 text-[#ffd36b]" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#ec4899] text-white text-[9px] flex items-center justify-center">
              {alerts.length}
            </span>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border px-4" style={{ background: "rgba(8,8,13,0.9)" }}>
        {[
          { id: "discover" as Tab, label: "Discover", icon: Compass },
          { id: "library" as Tab, label: "Library", icon: Library },
          { id: "stats" as Tab, label: "Stats", icon: BarChart2 },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2"
              style={{
                borderColor: tab === t.id ? "#8b5cf6" : "transparent",
                color: tab === t.id ? "#a78bfa" : "#6b7280",
              }}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* DISCOVER TAB */}
        {tab === "discover" && (
          <>
            <div className="flex gap-2 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search movies & TV…"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                />
              </div>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as "all" | "movie" | "tv")}
                className="px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
              >
                <option value="all">All</option>
                <option value="movie">Movies</option>
                <option value="tv">TV</option>
              </select>
            </div>

            {loading && !q && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {Array.from({ length: 15 }).map((_, i) => (
                  <div key={i} className="aspect-[2/3] rounded-lg bg-card animate-pulse" />
                ))}
              </div>
            )}

            {searching && (
              <p className="text-sm text-muted-foreground text-center py-8">Searching…</p>
            )}

            {!searching && displayItems.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
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
              <p className="text-sm text-muted-foreground text-center py-12">No results for "{q}"</p>
            )}
          </>
        )}

        {/* LIBRARY TAB */}
        {tab === "library" && (
          <>
            <div className="flex gap-2 mb-6">
              {STATUS_TABS.map(s => {
                const Icon = s.icon;
                const count = Object.values(tracked).filter(t => t.status === s.key).length;
                return (
                  <button
                    key={s.key}
                    onClick={() => setLibStatus(s.key)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all flex-1 justify-center"
                    style={{
                      background: libStatus === s.key ? `${s.color}22` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${libStatus === s.key ? s.color + "66" : "transparent"}`,
                      color: libStatus === s.key ? s.color : "#6b7280",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {s.label}
                    <span className="text-xs opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            {libraryItems.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground text-sm">Nothing here yet.</p>
                <p className="text-muted-foreground text-xs mt-1">
                  {libStatus === "want" ? "Add movies/shows to your watchlist from Discover."
                  : libStatus === "watching" ? "Mark shows as Watching from Discover."
                  : "Mark movies/shows as Watched from Discover."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {libraryItems.map(t => {
                  const media = toMedia(t);
                  return (
                    <MediaCard
                      key={`${t.media_type}:${t.tmdb_id}`}
                      item={media}
                      tracked={trackedForLib(t)}
                      onOpen={setSelectedItem}
                      onStatus={setStatus}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* STATS TAB */}
        {tab === "stats" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: "Total tracked", value: stats.total, color: "#8b5cf6" },
                { label: "Watched", value: stats.watched, color: "#22c55e" },
                { label: "Watching", value: stats.watching, color: "#8b5cf6" },
                { label: "Avg rating", value: stats.avgRating, color: "#ffd36b" },
              ].map(s => (
                <div
                  key={s.label}
                  className="rounded-xl p-4"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                  <p className="text-2xl font-bold" style={{ color: s.color, fontFamily: "'Oswald', sans-serif" }}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            {allWatched.length > 0 ? (
              <>
                <div className="rounded-xl p-5 mb-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Ratings distribution</h3>
                  <RatingsBarChart items={allWatched} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Watched over time</h3>
                    <WatchedOverTimeChart items={allWatched} />
                  </div>
                  <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Genres</h3>
                    <GenrePieChart items={allWatched} />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-12">Watch and rate some movies to see your stats.</p>
            )}
          </>
        )}
      </div>

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
