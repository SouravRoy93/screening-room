// The "Tonight" card — the hub's living centrepiece. Renders a time- and
// weather-aware plan (place → table → film) composed by lib/tonight.ts.
// Renders nothing until data is ready so the hub never shows a skeleton.
import { useLocation } from "wouter";
import "./tonight.css";
import { useTonight } from "@/hooks/use-tonight";
import type { TonightPick } from "@/lib/tonight";

const KIND_STYLE: Record<TonightPick["kind"], { c1: string; c2: string; label: string }> = {
  place: { c1: "#14b8a6", c2: "#06b6d4", label: "Step out" },
  dining: { c1: "#f59e0b", c2: "#ef4444", label: "Then dinner" },
  film: { c1: "#8b5cf6", c2: "#ec4899", label: "End on" },
};

function KindIcon({ kind }: { kind: TonightPick["kind"] }) {
  const base = {
    fill: "none", stroke: "currentColor", strokeWidth: "1.6",
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24", width: 16, height: 16,
  };
  if (kind === "place") return <svg {...base}><path d="M12 21s6.5-5.8 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.2 12 21 12 21Z"/><circle cx="12" cy="10.3" r="2.4"/></svg>;
  if (kind === "dining") return <svg {...base}><path d="M7 3v5M11 3v5"/><path d="M9 8v13"/><path d="M7 8c0 1.1.7 1.6 2 1.6s2-.5 2-1.6"/><path d="M16 3c-1.6 1.6-1.6 6.4 0 8v10"/></svg>;
  return <svg {...base}><rect x="3" y="8.5" width="18" height="12" rx="2"/><path d="M3.4 8.5 6 4.2l3.2 2.1L11.4 4l3.2 2.1L17.8 4l2.8 4.5"/></svg>;
}

export function TonightCard() {
  const [, nav] = useLocation();
  const { plan, ready } = useTonight();

  if (!ready || !plan || plan.picks.length === 0) return null;

  return (
    <section className="tonight-card" aria-label="Composed for you right now">
      <div className="tn-head">
        <div>
          <div className="tn-eyebrow">{plan.eyebrow}, composed for you</div>
          <h2 className="tn-greeting">{plan.greeting}</h2>
          <p className="tn-context">{plan.context}</p>
        </div>
      </div>

      <div className="tn-picks">
        {plan.picks.map((p, i) => {
          const st = KIND_STYLE[p.kind];
          return (
            <button
              key={`${p.kind}-${p.href}`}
              className="tn-pick"
              onClick={() => nav(p.href)}
              aria-label={`${st.label}: ${p.title} — ${p.reason}`}
            >
              <span
                className="tn-medallion"
                style={{ background: `linear-gradient(135deg, ${st.c1}, ${st.c2})` }}
                aria-hidden
              >
                <KindIcon kind={p.kind} />
              </span>
              <span className="tn-body">
                <span className="tn-step">{i + 1} · {st.label}</span>
                <span className="tn-title">{p.title}</span>
                <span className="tn-sub">{p.sub}</span>
                <span className="tn-reason">{p.reason}</span>
              </span>
              <span className="tn-go" aria-hidden>→</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
