import type { MediaItem, TrackedItem } from "@/types";
import { IMG_BASE, colorFor } from "@/types";
import { Film, Tv, Star, Bookmark, Eye, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  item: MediaItem;
  tracked?: TrackedItem;
  onOpen?: (item: MediaItem) => void;
  onStatus?: (item: MediaItem, status: "want" | "watching" | "watched") => void;
  compact?: boolean;
}

const STATUS_ICONS = {
  want: <Bookmark className="w-3 h-3" />,
  watching: <Eye className="w-3 h-3" />,
  watched: <CheckCircle className="w-3 h-3" />,
};

export function MediaCard({ item, tracked, onOpen, onStatus, compact }: Props) {
  const genre = item.genres?.[0] || "";
  const [g1, g2] = colorFor(genre);
  const statusColor = tracked
    ? tracked.status === "want" ? "#ffd36b"
    : tracked.status === "watching" ? "#8b5cf6"
    : "#22c55e"
    : null;

  return (
    <div
      className="group relative flex flex-col cursor-pointer select-none"
      onClick={() => onOpen?.(item)}
    >
      <div className="relative overflow-hidden rounded-lg aspect-[2/3] bg-card">
        {item.poster_path ? (
          <img
            src={`${IMG_BASE}${item.poster_path}`}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center p-3 text-center"
            style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}
          >
            {item.media_type === "tv"
              ? <Tv className="w-8 h-8 mb-2 text-white/80" />
              : <Film className="w-8 h-8 mb-2 text-white/80" />}
            <span className="text-xs font-medium text-white/90 leading-tight">{item.title}</span>
          </div>
        )}

        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* status badge */}
        {tracked && statusColor && (
          <div
            className="absolute top-2 right-2 p-1 rounded-full"
            style={{ backgroundColor: statusColor }}
          >
            {STATUS_ICONS[tracked.status]}
          </div>
        )}

        {/* vote average */}
        {item.vote_average && item.vote_average > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 rounded px-1.5 py-0.5">
            <Star className="w-3 h-3 fill-[#ffd36b] text-[#ffd36b]" />
            <span className="text-xs font-medium text-white">{item.vote_average.toFixed(1)}</span>
          </div>
        )}

        {/* quick-track buttons on hover */}
        {onStatus && (
          <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {(["want", "watching", "watched"] as const).map(s => (
              <button
                key={s}
                onClick={e => { e.stopPropagation(); onStatus(item, s); }}
                className={cn(
                  "p-1.5 rounded-full transition-colors",
                  tracked?.status === s
                    ? s === "want" ? "bg-[#ffd36b] text-black"
                    : s === "watching" ? "bg-[#8b5cf6] text-white"
                    : "bg-green-500 text-white"
                    : "bg-black/60 text-white hover:bg-white/20"
                )}
                title={s}
              >
                {STATUS_ICONS[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-2 px-0.5">
          <p className="text-sm font-medium text-foreground truncate leading-snug">{item.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {item.year && <span className="text-xs text-muted-foreground">{item.year}</span>}
            {genre && (
              <span
                className="text-xs px-1.5 py-0.5 rounded text-white/90"
                style={{ background: `linear-gradient(135deg, ${g1}99, ${g2}99)` }}
              >
                {genre}
              </span>
            )}
          </div>
          {tracked?.rating != null && (
            <div className="flex items-center gap-1 mt-1">
              <Star className="w-3 h-3 fill-[#ffd36b] text-[#ffd36b]" />
              <span className="text-xs text-[#ffd36b] font-medium">{tracked.rating}/10</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
