// "Perfect Evening" (roadmap #7) — the occasion-first planner. Ask what the
// night is for, get a composed three-act arc: somewhere to start, a table,
// and a way to end. Every act is swappable; the whole evening exports as one
// calendar invite. Composition lives in lib/evening.ts, data in
// hooks/use-evening.ts — this page is the room they're shown in.
import { useLocation, useSearch } from "wouter";
import { ArrowLeft } from "lucide-react";
import "@/components/evening.css";
import { EveningPlanView } from "@/components/evening-plan";
import { useEvening } from "@/hooks/use-evening";
import { OCCASIONS, type OccasionId } from "@/lib/evening";
import { preferredName } from "@/lib/profile";
import { useAuth } from "@/hooks/use-auth";

/** `/evening?for=celebration` — so the hub can point straight at an occasion. */
function occasionFromSearch(search: string): OccasionId {
  const asked = new URLSearchParams(search).get("for");
  const match = OCCASIONS.find((o) => o.id === asked);
  return match ? match.id : "date-night";
}

export default function Evening() {
  const [, nav] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const {
    plan, ready, cities, city, setCity,
    occasion, setOccasion, swap, reset, touched,
  } = useEvening(occasionFromSearch(search));

  const name = preferredName(user);

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => nav("/")} aria-label="Back to hub" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Perfect Evening</h1>
      </header>

      <div className="px-4 py-8">
        <div className="ev-wrap">
          <h2 className="ev-ask">
            {name ? `What's the evening for, ${name}?` : "What's the evening for?"}
          </h2>
          <p className="ev-ask-sub">
            Tell me the occasion and I'll plan the whole night — somewhere to start,
            a table, and a way to end it.
          </p>

          <div className="ev-occasions" role="group" aria-label="Choose an occasion">
            {OCCASIONS.map((o) => (
              <button
                key={o.id}
                className="ev-occasion"
                aria-pressed={o.id === occasion}
                onClick={() => setOccasion(o.id)}
              >
                <span className="ev-occasion-name">{o.label}</span>
                <span className="ev-occasion-tag">{o.tagline}</span>
              </button>
            ))}
          </div>

          {/* The city switch only earns its place once there's a second city. */}
          {cities.length > 1 && (
            <div className="ev-cities" role="group" aria-label="Choose a city">
              {cities.map((c) => (
                <button
                  key={c}
                  className="ev-city"
                  aria-pressed={c === city}
                  onClick={() => setCity(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {!ready && (
            <div className="ev-empty">Composing the evening…</div>
          )}

          {ready && !plan && (
            <div className="ev-empty">
              There isn't enough of a city here yet to plan a whole evening.
              The curated tables and places grow every day — try again soon, or
              browse <button className="ev-reset" onClick={() => nav("/dining")}>Dining</button> and{" "}
              <button className="ev-reset" onClick={() => nav("/places")}>Places</button> in the meantime.
            </div>
          )}

          {ready && plan && (
            <EveningPlanView plan={plan} onSwap={swap} onReset={reset} touched={touched} />
          )}
        </div>
      </div>
    </div>
  );
}
