// The gold button (Obsession roadmap #5). One press → one confident pick,
// full-bleed, with a truthful reason. "Another, please" excludes what you've
// seen and asks again — deterministic, never random. Luxury is editing.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import "./choose-for-me.css";
import type { Choice } from "@/lib/choose";

export function ChooseForMe({ pick, verb = "Take me there", noun = "idea" }: {
  /** Compute the best remaining choice given what's already been offered. */
  pick: (exclude: Set<string>) => Choice | null;
  /** CTA verb, e.g. "Take me there" / "Watch this one". */
  verb?: string;
  /** For the exhausted state: "idea" / "table" / "place" / "title". */
  noun?: string;
}) {
  const [, nav] = useLocation();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const excludeRef = useRef(new Set<string>());

  function start() {
    excludeRef.current.clear();
    setChoice(pick(excludeRef.current));
    setOpen(true);
  }
  function another() {
    if (choice) excludeRef.current.add(choice.id);
    setChoice(pick(excludeRef.current));
  }
  function close() { setOpen(false); }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="cfm-row">
        <button className="cfm-btn" onClick={start}>
          <span className="cfm-spark" aria-hidden>✦</span> Choose for me
        </button>
      </div>

      {open && (
        <div className="cfm-overlay" role="dialog" aria-modal="true" aria-label="A pick, made for you" onClick={close}>
          <div className="cfm-card" onClick={e => e.stopPropagation()}>
            {choice ? (
              <>
                <div className="cfm-eyebrow">The choice is made</div>
                <h2 className="cfm-title">{choice.title}</h2>
                <div className="cfm-sub">{choice.sub}</div>
                <p className="cfm-reason">{choice.reason}</p>
                <div className="cfm-actions">
                  <button className="cfm-btn" onClick={() => { close(); nav(choice.href); }}>{verb}</button>
                  <button className="cfm-ghost" onClick={another}>Another, please</button>
                  <button className="cfm-quiet" onClick={close}>Never mind</button>
                </div>
              </>
            ) : (
              <>
                <div className="cfm-eyebrow">That's my whole shortlist</div>
                <h2 className="cfm-title">You've seen my best {noun}s</h2>
                <p className="cfm-reason">Loosen a filter — or trust me and revisit the first one.</p>
                <div className="cfm-actions">
                  <button className="cfm-quiet" onClick={close}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
