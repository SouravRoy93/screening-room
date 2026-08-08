// Table Watch (roadmap #8) — everything the member has asked to be told about,
// and what each watch is currently waiting on. Moments live on the hub; this
// page is where you see the whole standing order and change your mind.
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import "@/components/watch.css";
import { MomentRow } from "@/components/moments-card";
import { useWatch } from "@/hooks/use-watch";
import type { Watch, WatchKind } from "@/lib/watch";

const GROUPS: { kind: WatchKind; title: string; empty: string }[] = [
  { kind: "table", title: "Tables", empty: "No tables on watch. Open a restaurant and tap “Watch for a table”." },
  { kind: "place", title: "Places", empty: "No places on watch. I'll tell you when the weather turns good for one." },
  { kind: "show", title: "Shows", empty: "No shows on watch. I'll tell you when the next episode lands." },
];

export default function WatchPage() {
  const [, nav] = useLocation();
  const { watches, moments, loading, remove, update, dismiss } = useWatch();

  const momentFor = (w: Watch) => moments.find((m) => m.watchId === w.id);

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,13,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => nav("/")} aria-label="Back to hub" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Table Watch</h1>
      </header>

      <div className="px-4 py-8">
        <div className="wt-wrap">
          <p className="wt-page-intro">
            Standing requests. I'll say something on the hub when one of these is
            worth acting on — a reservation window opening, a clear day for
            somewhere outdoors, an episode landing — and stay quiet otherwise.
          </p>

          {loading && <div className="wt-empty">Loading your watches…</div>}

          {!loading && watches.length === 0 && (
            <div className="wt-empty">
              You're not watching anything yet.
              <br />
              Open a{" "}
              <button className="wt-all" onClick={() => nav("/dining")}>restaurant</button>,{" "}
              a <button className="wt-all" onClick={() => nav("/places")}>place</button> or{" "}
              a <button className="wt-all" onClick={() => nav("/films")}>series</button>{" "}
              and tap Watch.
            </div>
          )}

          {!loading && watches.length > 0 && GROUPS.map((g) => {
            const mine = watches.filter((w) => w.kind === g.kind);
            if (!mine.length) return null;
            return (
              <div key={g.kind}>
                <h2 className="wt-group-title">{g.title}</h2>
                {mine.map((w) => {
                  const m = momentFor(w);
                  const paused = w.active === false;
                  return (
                    <div className={`wt-row${paused ? " paused" : ""}`} key={w.id}>
                      <div>
                        <div className="wt-row-title">{w.title}</div>
                        {w.subtitle && <div className="wt-row-sub">{w.subtitle}</div>}
                        {w.target_date && (
                          <div className="wt-row-sub">Aiming for {w.target_date}</div>
                        )}
                        {paused ? (
                          <div className="wt-row-quiet">Paused — I won't mention this one.</div>
                        ) : m ? (
                          <div className="wt-row-next">{m.line}</div>
                        ) : (
                          <div className="wt-row-quiet">Nothing to say about this yet.</div>
                        )}
                      </div>
                      <div className="wt-row-actions">
                        <button
                          className="wt-mini"
                          onClick={() => void update(w.id, { active: paused })}
                        >
                          {paused ? "Resume" : "Pause"}
                        </button>
                        <button
                          className="wt-mini danger"
                          onClick={() => void remove(w.id)}
                        >
                          Stop watching
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {!loading && moments.length > 0 && (
            <>
              <h2 className="wt-group-title">Everything that's live</h2>
              <section className="wt-card" style={{ width: "100%", margin: 0 }}>
                {moments.map((m) => (
                  <MomentRow key={m.id} moment={m} onDismiss={dismiss} />
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
