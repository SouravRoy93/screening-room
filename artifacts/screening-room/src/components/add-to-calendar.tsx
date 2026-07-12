// "Add to calendar" — the moment a save becomes a plan. Opens a small inline
// picker (defaulting to a civilised time) and downloads an .ics carrying the
// app's concierge notes into the user's real calendar.
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import "./handoffs.css";
import { downloadIcs, toLocalInput, type CalendarEvent } from "@/lib/handoffs";

export function AddToCalendar({ defaultWhen, makeEvent, label = "Add to calendar" }: {
  defaultWhen: Date;
  makeEvent: (when: Date) => CalendarEvent;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(defaultWhen));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = new Date(when);
    if (Number.isNaN(d.getTime())) return;
    downloadIcs(makeEvent(d));
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="ho-btn" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <CalendarPlus size={12} /> {label}
      </button>
      {open && (
        <form className="ho-cal-form" onSubmit={submit}>
          <input
            type="datetime-local"
            className="ho-cal-input"
            value={when}
            onChange={e => setWhen(e.target.value)}
            aria-label="When"
          />
          <button type="submit" className="ho-btn ho-btn-gold">Download invite</button>
        </form>
      )}
    </>
  );
}
