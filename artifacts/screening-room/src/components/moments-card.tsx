// The hub's moments card — what Table Watch has to say today. Renders nothing
// when there's nothing worth saying, which is most days and entirely the point.
import { useLocation } from "wouter";
import "./watch.css";
import { useWatch } from "@/hooks/use-watch";
import type { Moment, MomentKind } from "@/lib/watch";

const KIND_STYLE: Record<MomentKind, { c1: string; c2: string }> = {
  release: { c1: "#f59e0b", c2: "#ef4444" },
  weather: { c1: "#14b8a6", c2: "#06b6d4" },
  episode: { c1: "#8b5cf6", c2: "#ec4899" },
};

function MomentIcon({ kind }: { kind: MomentKind }) {
  const base = {
    fill: "none", stroke: "currentColor", strokeWidth: "1.6",
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24", width: 15, height: 15,
  };
  if (kind === "release") {
    // A bell — something opening, something to be told about.
    return <svg {...base}><path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5Z"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg>;
  }
  if (kind === "weather") {
    return <svg {...base}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>;
  }
  return <svg {...base}><rect x="3" y="8.5" width="18" height="12" rx="2"/><path d="M3.4 8.5 6 4.2l3.2 2.1L11.4 4l3.2 2.1L17.8 4l2.8 4.5"/></svg>;
}

export function MomentRow({
  moment,
  onDismiss,
}: {
  moment: Moment;
  onDismiss: (m: Moment) => void;
}) {
  const [, nav] = useLocation();
  const st = KIND_STYLE[moment.kind];

  return (
    <div className="wt-moment">
      <span
        className="wt-medallion"
        style={{ background: `linear-gradient(135deg, ${st.c1}, ${st.c2})` }}
        aria-hidden
      >
        <MomentIcon kind={moment.kind} />
      </span>

      <div className="wt-body">
        <span className={`wt-when${moment.urgency === "now" ? " now" : ""}`}>{moment.when}</span>
        <button className="wt-title" onClick={() => nav(moment.href)}>
          {moment.title}
        </button>
        <div className="wt-sub">{moment.sub}</div>
        <p className="wt-line">{moment.line}</p>

        <div className="wt-actions">
          {moment.action && (
            moment.action.external ? (
              <a className="wt-action" href={moment.action.href} target="_blank" rel="noreferrer noopener">
                {moment.action.label}
              </a>
            ) : (
              <button className="wt-action" onClick={() => nav(moment.action!.href)}>
                {moment.action.label}
              </button>
            )
          )}
          <button
            className="wt-dismiss"
            onClick={() => onDismiss(moment)}
            aria-label={`Dismiss: ${moment.title}`}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function MomentsCard() {
  const [, nav] = useLocation();
  const { live, watches, dismiss } = useWatch();

  // Nothing live and nothing watched — the card has no business existing.
  if (!live.length) return null;

  return (
    <section className="wt-card" aria-label="What's worth knowing today">
      <div className="wt-head">
        <span className="wt-eyebrow">Worth knowing</span>
        {watches.length > 0 && (
          <button className="wt-all" onClick={() => nav("/watch")}>
            All {watches.length} watches
          </button>
        )}
      </div>
      {live.map((m) => (
        <MomentRow key={m.id} moment={m} onDismiss={dismiss} />
      ))}
    </section>
  );
}
