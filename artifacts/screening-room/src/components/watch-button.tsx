// "Watch this" — the control that turns a thing into a standing request.
// On a table it also asks the one question that makes the watch sharp: which
// night? Without a date we can only describe the booking window; with one we
// can tell them the morning to be at their laptop.
import { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import "./watch.css";
import { useWatch } from "@/hooks/use-watch";
import { ymd } from "@/lib/watch";
import type { WatchKind } from "@/lib/watch";

export function WatchButton({
  kind,
  refId,
  title,
  subtitle,
  /** Tables get a date field; places and shows don't need one. */
  askForDate = false,
}: {
  kind: WatchKind;
  refId: string | number;
  title: string;
  subtitle?: string;
  askForDate?: boolean;
}) {
  const { isWatching, add, remove, watches } = useWatch();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");

  const existing = watches.find((w) => w.kind === kind && w.ref === String(refId));
  const on = isWatching(kind, refId);

  const label =
    kind === "table" ? "Watch for a table"
    : kind === "place" ? "Watch for a good day"
    : "Watch for new episodes";

  async function toggle() {
    if (on && existing) {
      await remove(existing.id);
      setOpen(false);
      return;
    }
    if (askForDate && !open) { setOpen(true); return; }
    await add({ kind, ref: refId, title, subtitle, targetDate: date || null });
    setOpen(false);
  }

  // Only future dates make sense for a reservation.
  const min = ymd(new Date());

  return (
    <>
      <button
        className={`wt-btn${on ? " on" : ""}`}
        onClick={toggle}
        aria-pressed={on}
        title={on ? "Stop watching" : label}
      >
        {on ? <BellRing size={13} /> : <Bell size={13} />}
        {on ? "Watching" : label}
      </button>

      {open && !on && (
        <div className="wt-when-form">
          <label className="wt-when-label" htmlFor={`wt-date-${refId}`}>
            Any night in mind?
          </label>
          <input
            id={`wt-date-${refId}`}
            className="wt-input"
            type="date"
            min={min}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="wt-btn on" onClick={toggle}>
            {date ? "Watch this night" : "Just watch it"}
          </button>
          <button className="wt-mini" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </>
  );
}
