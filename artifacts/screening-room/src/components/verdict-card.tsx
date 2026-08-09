// The question that appears where the genres were, the moment something is
// marked watched. Flips in place inside the card body — no modal, no
// navigation, no gate. "Later" is always one tap, and the status was saved
// before this ever appeared: the rating is a bonus, never a toll.
import { useState } from "react";
import { Star } from "lucide-react";
import "./verdict.css";
import {
  ADVOCACY_OPTIONS,
  ADVOCACY_QUESTION,
  VERDICT_OPTIONS,
  VERDICT_QUESTION,
  type Advocacy,
  type Question,
  type Verdict,
} from "@/lib/verdict";

export function VerdictCard({
  question,
  onAnswer,
  onExplicit,
  onDismiss,
  compact = true,
}: {
  question: Question;
  onAnswer: (value: Verdict | Advocacy) => void;
  /** They'd rather pick a number. */
  onExplicit: (rating: number) => void;
  onDismiss: () => void;
  compact?: boolean;
}) {
  const [stars, setStars] = useState(false);
  const [hover, setHover] = useState(0);

  const prompt = question === "verdict" ? VERDICT_QUESTION : ADVOCACY_QUESTION;
  const options = question === "verdict" ? VERDICT_OPTIONS : ADVOCACY_OPTIONS;

  if (stars) {
    return (
      <div className={`vd${compact ? " vd-compact" : ""}`} onClick={e => e.stopPropagation()}>
        <div className="vd-q">Your rating</div>
        <div className="vd-stars" onMouseLeave={() => setHover(0)}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              className={`vd-star${n <= hover ? " lit" : ""}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => onExplicit(n)}
              aria-label={`Rate ${n} out of 10`}
            >
              <Star size={13} strokeWidth={2} aria-hidden />
            </button>
          ))}
        </div>
        <div className="vd-foot">
          <button className="vd-link" onClick={() => setStars(false)}>Back to the question</button>
          <button className="vd-link vd-later" onClick={onDismiss}>Later</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`vd${compact ? " vd-compact" : ""}`} onClick={e => e.stopPropagation()}>
      <div className="vd-q">{prompt}</div>
      <div className="vd-opts">
        {options.map(o => (
          <button key={o.value} className="vd-opt" onClick={() => onAnswer(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="vd-foot">
        <button className="vd-link" onClick={() => setStars(true)}>or just rate it ★</button>
        <button className="vd-link vd-later" onClick={onDismiss}>Later</button>
      </div>
    </div>
  );
}
