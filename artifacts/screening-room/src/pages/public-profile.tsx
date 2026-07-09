import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Film } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { IMG_BASE } from "@/types";

interface PublicProfile {
  display_name: string | null;
  watched_count: number;
  want_count: number;
  recent: { title: string; poster_path: string | null; media_type: string; rating: number | null }[];
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_public_profile", { p_user: id }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setState("missing"); return; }
      setProfile(data as PublicProfile);
      setState("ready");
    });
    return () => { alive = false; };
  }, [id]);

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => nav("/")} aria-label="Back to hub" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Profile</h1>
      </header>

      <div className="max-w-xl mx-auto px-4 py-8">
        {state === "loading" && <div className="h-40 rounded-2xl bg-card animate-pulse" />}

        {state === "missing" && (
          <div className="text-center py-16">
            <p className="text-foreground font-semibold mb-1">This profile isn't available</p>
            <p className="text-sm text-muted-foreground">It may be private or no longer exist.</p>
          </div>
        )}

        {state === "ready" && profile && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white" style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                {(profile.display_name || "S")[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-foreground">{profile.display_name || "Screening Room member"}</p>
                <p className="text-xs text-muted-foreground">
                  {profile.watched_count} watched · {profile.want_count} on watchlist
                </p>
              </div>
            </div>

            {profile.recent.length > 0 && (
              <>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Recently watched</p>
                <div className="grid grid-cols-4 gap-2">
                  {profile.recent.map((r, i) => (
                    <div key={i}>
                      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-card">
                        {r.poster_path ? (
                          <img src={`${IMG_BASE}${r.poster_path}`} alt={r.title} loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(139,92,246,0.2)" }}>
                            <Film className="w-5 h-5 text-primary" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {r.title}{r.rating ? ` · ★${r.rating}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
