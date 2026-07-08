import { useLocation } from "wouter";
import { ArrowLeft, Share2, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function Social() {
  const [, nav] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const shareLink = () => {
    const url = window.location.origin;
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
              <h3 className="font-semibold text-foreground mb-1">Invite a friend</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Share Screening Room with people whose taste you trust.
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
