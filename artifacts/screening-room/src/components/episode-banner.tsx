import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { IMG_BASE } from "@/types";

interface EpisodeAlert {
  tmdb_id: number;
  title: string;
  season_number: number;
  episode_number: number;
  episode_name: string;
  air_date: string;
  poster_path: string | null;
}

interface Props {
  alerts: EpisodeAlert[];
}

export function EpisodeBanner({ alerts }: Props) {
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (alerts.length > 0) setVisible(true);
  }, [alerts]);

  if (!visible || alerts.length === 0) return null;

  const a = alerts[idx];

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-border p-3 shadow-lg max-w-sm"
      style={{ background: "rgba(20,20,29,0.95)", backdropFilter: "blur(12px)" }}
    >
      {a.poster_path && (
        <img
          src={`${IMG_BASE}${a.poster_path}`}
          alt={a.title}
          className="w-10 h-14 object-cover rounded"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-1">
          <Bell className="w-3 h-3" style={{ color: "#ffd36b" }} />
          <span className="text-xs font-semibold" style={{ color: "#ffd36b" }}>New episode</span>
        </div>
        <p className="text-sm font-semibold text-foreground truncate">{a.title}</p>
        <p className="text-xs text-muted-foreground">
          S{String(a.season_number).padStart(2, "0")}E{String(a.episode_number).padStart(2, "0")} · {a.episode_name}
        </p>
        <p className="text-xs text-muted-foreground">{a.air_date}</p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <button onClick={() => setVisible(false)} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
        {alerts.length > 1 && (
          <div className="flex gap-1 mt-1">
            {alerts.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: i === idx ? "#8b5cf6" : "#374151" }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
