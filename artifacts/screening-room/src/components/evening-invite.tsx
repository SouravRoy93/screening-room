// The hub's doorway into Perfect Evening (roadmap #7). Tonight answers
// "what should I do?" on its own; this asks the question Tonight can't —
// what is the night *for* — and hands the answer straight to the planner.
import { useLocation } from "wouter";
import "./evening.css";
import { OCCASIONS } from "@/lib/evening";

export function EveningInvite() {
  const [, nav] = useLocation();

  return (
    <section className="ev-invite" aria-label="Plan an evening around an occasion">
      <div className="ev-invite-head">
        <div className="ev-invite-eyebrow">Perfect Evening</div>
        <h3 className="ev-invite-title">Planning something?</h3>
        <p className="ev-invite-sub">
          Tell me the occasion and I'll plan the whole night.
        </p>
      </div>
      <div className="ev-invite-chips">
        {OCCASIONS.map((o) => (
          <button
            key={o.id}
            className="ev-invite-chip"
            onClick={() => nav(`/evening?for=${o.id}`)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}
