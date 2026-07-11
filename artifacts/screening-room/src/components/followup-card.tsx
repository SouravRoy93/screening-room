// The follow-up card — the maître d' checking back in. Shows at most one
// gentle question on the hub; resolves naturally when the user journals,
// rates, or answers honestly. Renders nothing when there's nothing to ask.
import { useLocation } from "wouter";
import "./followup.css";
import { useFollowUps } from "@/hooks/use-followups";

export function FollowUpCard() {
  const [, nav] = useLocation();
  const { followUp, snooze, didntGo } = useFollowUps();

  if (!followUp) return null;

  const accent = followUp.kind === "film-rate"
    ? "linear-gradient(135deg,#8b5cf6,#ec4899)"
    : "linear-gradient(135deg,#f59e0b,#ef4444)";

  return (
    <section className="fu-card" aria-label="A quick follow-up">
      <span className="fu-dot" style={{ background: accent }} aria-hidden />
      <div className="fu-body">
        <div className="fu-eyebrow">One quick thing</div>
        <h3 className="fu-title">{followUp.title}</h3>
        <p className="fu-prompt">{followUp.prompt}</p>
        <div className="fu-actions">
          <button className="fu-btn fu-primary" style={{ background: accent }} onClick={() => nav(followUp.href)}>
            {followUp.cta}
          </button>
          {followUp.altAction === "didnt-go" && (
            <button className="fu-btn" onClick={didntGo}>I didn't go</button>
          )}
          <button className="fu-btn fu-quiet" onClick={snooze}>Not now</button>
        </div>
      </div>
    </section>
  );
}
