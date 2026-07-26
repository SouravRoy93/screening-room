import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Share2, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { preferredName } from "@/lib/profile";

export default function Social() {
  const [, nav] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("share_enabled")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setShareEnabled(!!data?.share_enabled));
  }, [user]);

  async function toggleShare() {
    if (!user) return;
    setShareLoading(true);
    const next = !shareEnabled;
    const { error } = await supabase.from("profiles").upsert({
      user_id: user.id,
      display_name: preferredName(user) || user.email?.split("@")[0] || null,
      share_enabled: next,
      updated_at: new Date().toISOString(),
    });
    setShareLoading(false);
    if (error) { toast({ title: "Couldn't update sharing", description: error.message, variant: "destructive" }); return; }
    setShareEnabled(next);
    toast({ title: next ? "Public profile enabled" : "Public profile disabled" });
  }

  const shareLink = () => {
    const url = user && shareEnabled ? `${window.location.origin}/u/${user.id}` : window.location.origin;
    navigator.clipboard
      .writeText(url)
      .then(() => toast({ title: "Link copied!" }))
      .catch(() => toast({ title: "Couldn't copy link", variant: "destructive" }));
  };

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => nav("/")} aria-label="Back to hub" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Social</h1>
      </header>

      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Share the app */}
        <div
          className="rounded-2xl p-5 mb-8"
          style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(236,72,153,0.15))", border: "1px solid rgba(139,92,246,0.25)" }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">Share your taste</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {shareEnabled
                  ? "Copies your public profile link — your recently watched, ready to show off."
                  : "Copies an invite link. Enable your public profile below to share your list instead."}
              </p>
              <button
                onClick={shareLink}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
              >
                Copy invite link
              </button>
            </div>
          </div>
        </div>

        {/* Public profile (opt-in) */}
        {user && (
          <div
            className="rounded-2xl p-5 mb-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground mb-1">Public profile</h3>
                <p className="text-sm text-muted-foreground">
                  {shareEnabled
                    ? "Anyone with your link can see your recently watched titles and counts."
                    : "Off by default. Turn on to share your watch activity via a link."}
                </p>
              </div>
              <button
                onClick={toggleShare}
                disabled={shareLoading}
                aria-pressed={shareEnabled}
                className="px-4 py-2 rounded-lg text-sm font-medium shrink-0 transition-opacity hover:opacity-90"
                style={shareEnabled
                  ? { background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff" }
                  : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
              >
                {shareLoading ? "…" : shareEnabled ? "On" : "Off"}
              </button>
            </div>
            {shareEnabled && (
              <button
                onClick={() => nav(`/u/${user.id}`)}
                className="text-sm font-medium mt-3 hover:opacity-80"
                style={{ color: "#8b5cf6" }}
              >
                Preview your public profile →
              </button>
            )}
          </div>
        )}

        {/* Friend profiles — coming soon */}
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ background: "rgba(139,92,246,0.2)" }}>
            <Users className="w-6 h-6" style={{ color: "#8b5cf6" }} />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Friend profiles are coming soon</h3>
          <p className="text-sm text-muted-foreground">
            Soon you'll be able to follow friends, compare watchlists, and swap recommendations — with full control over what you share.
          </p>
        </div>

        {!user && (
          <p className="text-center text-sm text-muted-foreground mt-12">
            Sign in to connect with other viewers.
          </p>
        )}
      </div>
    </div>
  );
}
