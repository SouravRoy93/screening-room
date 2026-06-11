import type { MediaItem, TrackedItem } from "@/types";
import { IMG_BASE, colorFor } from "@/types";

interface Props {
  item: MediaItem;
  tracked?: TrackedItem;
  onOpen?: (item: MediaItem) => void;
  onStatus?: (item: MediaItem, status: "want" | "watching" | "watched") => void;
  compact?: boolean;
}

export function MediaCard({ item, tracked, onOpen, onStatus }: Props) {
  const genre = item.genres?.[0] || "";
  const [g1, g2] = colorFor(genre);
  const genres = item.genres?.slice(0, 3).join(" · ") || "";
  const meta = [
    item.year,
    item.media_type === "tv" ? "TV" : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="card" onClick={() => onOpen?.(item)}>
      <div className="poster">
        {item.poster_path ? (
          <img
            src={`${IMG_BASE}${item.poster_path}`}
            alt={item.title}
            loading="lazy"
          />
        ) : (
          <div
            className="fallback"
            style={{ background: `linear-gradient(150deg,${g1},${g2})` }}
          />
        )}

        {/* Type badge */}
        <div className="ptype">{item.media_type === "tv" ? "TV" : "Film"}</div>

        {/* Vote badge */}
        {item.vote_average && item.vote_average > 0 && (
          <div className="badge-vote">★ {item.vote_average.toFixed(1)}</div>
        )}

        {/* Rating badge (if watched + rated) */}
        {tracked?.status === "watched" && tracked.rating != null && (
          <div className="badge-rating">★ {Number(tracked.rating).toFixed(1)}</div>
        )}

        {/* Title + meta overlay */}
        <div className="pscrim">
          <div className="ptitle">{item.title}</div>
          {meta && <div className="pmeta">{meta}</div>}
        </div>
      </div>

      <div className="cbody">
        {genres && <div className="cgenres">{genres}</div>}
        {onStatus && (
          <div className="statusrow" onClick={e => e.stopPropagation()}>
            {(["want", "watching", "watched"] as const).map(s => (
              <button
                key={s}
                className={`${s}${tracked?.status === s ? " on" : ""}`}
                onClick={() => onStatus(item, s)}
                title={s === "want" ? "Watchlist" : s === "watching" ? "Watching" : "Watched"}
              >
                {s === "want" ? "Want" : s === "watching" ? "Watch" : "Done"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
