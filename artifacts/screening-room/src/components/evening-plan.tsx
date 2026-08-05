// The composed evening: three acts on a single thread, each swappable, with
// the whole arc exportable as one calendar invite. Pure presentation — every
// decision was already made by lib/evening.ts.
import { useLocation } from "wouter";
import "./evening.css";
import { AddToCalendar } from "@/components/add-to-calendar";
import { mapsUrl } from "@/lib/handoffs";
import type { ActKind, EveningAct, EveningPlan } from "@/lib/evening";

const KIND_STYLE: Record<ActKind, { c1: string; c2: string }> = {
  opener: { c1: "#14b8a6", c2: "#06b6d4" },
  table: { c1: "#f59e0b", c2: "#ef4444" },
  finale: { c1: "#8b5cf6", c2: "#ec4899" },
};

function ActIcon({ act }: { act: EveningAct }) {
  const base = {
    fill: "none", stroke: "currentColor", strokeWidth: "1.6",
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24", width: 15, height: 15,
  };
  // The finale changes shape depending on where the night ends.
  if (act.href.startsWith("/films/")) {
    return <svg {...base}><rect x="3" y="8.5" width="18" height="12" rx="2"/><path d="M3.4 8.5 6 4.2l3.2 2.1L11.4 4l3.2 2.1L17.8 4l2.8 4.5"/></svg>;
  }
  if (act.href.startsWith("/dining/")) {
    return <svg {...base}><path d="M7 3v5M11 3v5"/><path d="M9 8v13"/><path d="M7 8c0 1.1.7 1.6 2 1.6s2-.5 2-1.6"/><path d="M16 3c-1.6 1.6-1.6 6.4 0 8v10"/></svg>;
  }
  return <svg {...base}><path d="M12 21s6.5-5.8 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.2 12 21 12 21Z"/><circle cx="12" cy="10.3" r="2.4"/></svg>;
}

/** One .ics for the whole evening, with the arc written into the notes. */
function eveningEvent(plan: EveningPlan, when: Date) {
  const lines = plan.acts.map((a) => `${a.at} — ${a.label}: ${a.title} (${a.sub})`);
  const anchor = plan.acts.find((a) => a.kind === "table") ?? plan.acts[0];
  return {
    title: `${plan.occasion.label} — ${plan.city}`,
    start: when,
    durationMin: 240,
    description: [plan.note, "", ...lines, "", "Composed by Screening Room."].join("\n"),
    location: anchor ? `${anchor.title}, ${plan.city}` : plan.city,
  };
}

export function EveningPlanView({
  plan,
  onSwap,
  onReset,
  touched,
}: {
  plan: EveningPlan;
  onSwap: (kind: ActKind) => void;
  onReset: () => void;
  touched: boolean;
}) {
  const [, nav] = useLocation();
  const firstAt = plan.acts.length ? new Date(plan.acts[0].atISO) : new Date();

  return (
    <section className="ev-plan" aria-label={`${plan.occasion.label} in ${plan.city}`}>
      <div className="ev-eyebrow">{plan.occasion.eyebrow}</div>
      <h2 className="ev-context">{plan.context}</h2>
      <p className="ev-note">{plan.note}</p>

      <div className="ev-acts">
        {plan.acts.map((a) => {
          const st = KIND_STYLE[a.kind];
          return (
            <div className="ev-act" key={a.id}>
              <div className="ev-time">{a.at}</div>

              <div className="ev-rail">
                <span
                  className="ev-medallion"
                  style={{ background: `linear-gradient(135deg, ${st.c1}, ${st.c2})` }}
                  aria-hidden
                >
                  <ActIcon act={a} />
                </span>
              </div>

              <div className="ev-body">
                <div className="ev-label">{a.label}</div>
                <button className="ev-title" onClick={() => nav(a.href)}>
                  {a.title}
                </button>
                <div className="ev-sub">{a.sub}</div>
                <p className="ev-reason">{a.reason}</p>

                <div className="ev-tags">
                  {a.fromSaves && <span className="ev-tag ev-tag-gold">From your list</span>}
                  {a.walkMin != null && <span className="ev-tag">{a.walkMin} min walk</span>}
                  {!a.href.startsWith("/films/") && (
                    <a
                      className="ev-tag"
                      href={mapsUrl(`${a.title} ${plan.city}`)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Map
                    </a>
                  )}
                </div>
              </div>

              <button
                className="ev-swap"
                onClick={() => onSwap(a.kind)}
                aria-label={`Show me a different option for ${a.label.toLowerCase()}`}
              >
                Another
              </button>
            </div>
          );
        })}
      </div>

      <div className="ev-foot">
        <AddToCalendar
          defaultWhen={firstAt}
          makeEvent={(when) => eveningEvent(plan, when)}
          label="Put the evening in my calendar"
        />
        {touched && (
          <button className="ev-reset ev-foot-spacer" onClick={onReset}>
            Start the evening over
          </button>
        )}
      </div>
    </section>
  );
}
