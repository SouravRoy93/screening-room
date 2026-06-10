import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, Users, Share2, Film } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { IMG_BASE } from "@/types";

interface FriendProfile {
  id: string;
  email: string;
  watched_count: number;
  want_count: number;
  recent: Array<{ title: string; poster_path: string | null; media_type: string }>;
}

export default function Social() {
  const [, nav] = useLocation();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from("tracked_items")
      .select("user_id")
      .neq("user_id", user?.id || "")
      .limit(5);

    const unique: string[] = Array.from(new Set((data || []).map((r: { user_id: string }) => r.user_id)));
    setResults(unique.map((id: string) => ({ id, email: `user-${id.slice(0, 6)}` })));
    setSearching(false);
  }

  async function viewProfile(userId: string, email: string) {
    setLoading(true);
    const { data } = await supabase
      .from("tracked_items")
      .select("title, poster_path, media_type, status, vertical")
      .eq("user_id", userId)
      .eq("vertical", "films")
      .limit(50);

    const items = data || [];
    const watched = items.filter((r: { status: string }) => r.status === "watched");
    const want = items.filter((r: { status: string }) => r.status === "want");
    const recent = watched.slice(0, 8).map((r: { title: string; poster_path: string | null; media_type: string }) => ({
      title: r.title,
      poster_path: r.poster_path,
      media_type: r.media_type,
    }));

    setProfile({ id: userId, email, watched_count: watched.length, want_count: want.length, recent });
    setLoading(false);
  }

  const shareLink = () => {
    const url = `${window.location.origin}?ref=${user?.id}`;
    navigator.clipboard.writeText(url).then(() => alert("Link copied!")).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => nav("/")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Social</h1>
      </header>

      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Share your list */}
        <div
          className="rounded-2xl p-5 mb-8"
          style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(236,72,153,0.15))", border: "1px solid rgba(139,92,246,0.25)" }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">Share your list</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Share your watchlist & recommendations with friends.
              </p>
              <button
                onClick={shareLink}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
              >
                Copy share link
              </button>
            </div>
          </div>
        </div>

        {/* Find friends */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Find viewers
          </h3>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search by email…"
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") search(); }}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
              />
            </div>
            <button
              onClick={search}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: "#8b5cf6" }}
            >
              {searching ? "…" : "Search"}
            </button>
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-2 mb-6">
            {results.map(r => (
              <button
                key={r.id}
                onClick={() => viewProfile(r.id, r.email)}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-white/5"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                  {r.email[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{r.email}</p>
                  <p className="text-xs text-muted-foreground">Screening Room member</p>
                </div>
                <Users className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* Friend profile */}
        {loading && <div className="h-40 rounded-2xl bg-card animate-pulse" />}
        {profile && !loading && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white" style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                {profile.email[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-foreground">{profile.email}</p>
                <p className="text-xs text-muted-foreground">
                  {profile.watched_count} watched · {profile.want_count} on watchlist
                </p>
              </div>
            </div>

            {profile.recent.length > 0 && (
              <>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Recently watched</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {profile.recent.map((r, i) => (
                    <div key={i} className="shrink-0 w-16">
                      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-card">
                        {r.poster_path ? (
                          <img src={`${IMG_BASE}${r.poster_path}`} alt={r.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(139,92,246,0.2)" }}>
                            <Film className="w-5 h-5 text-primary" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{r.title}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {!user && (
          <p className="text-center text-sm text-muted-foreground mt-12">
            Sign in to connect with other viewers.
          </p>
        )}
      </div>
    </div>
  );
}
