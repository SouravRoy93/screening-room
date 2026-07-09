import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  const [, nav] = useLocation();
  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => nav("/")} aria-label="Back to hub" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Privacy & Terms</h1>
      </header>

      <div className="max-w-xl mx-auto px-4 py-8 text-sm text-muted-foreground leading-relaxed space-y-4">
        <p className="text-foreground font-semibold">What we store</p>
        <p>
          Your email address (for sign-in) and the items you track — titles, statuses, and ratings.
          That's it. We don't sell your data, run ads, or share your activity with anyone.
        </p>
        <p className="text-foreground font-semibold">Where it lives</p>
        <p>
          Data is stored with Supabase (Postgres, US region) and protected so only your signed-in
          account can read or change your rows.
        </p>
        <p className="text-foreground font-semibold">Third-party content</p>
        <p>
          Film and TV metadata comes from TMDB. This product uses the TMDB API but is not endorsed
          or certified by TMDB. Restaurant and place details, photos, and reviews are provided by
          Google. Their respective terms apply to that content.
        </p>
        <p className="text-foreground font-semibold">Deleting your account</p>
        <p>
          You can permanently delete your account and all tracked data at any time from the home
          screen ("Delete account"). Deletion is immediate and irreversible.
        </p>
        <p className="text-foreground font-semibold">Contact</p>
        <p>Questions? Reach out to the maintainer via the GitHub repository.</p>
      </div>
    </div>
  );
}
