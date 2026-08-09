import { Bookmark, Play, Check } from "lucide-react";
import type { MediaItem, TrackedItem } from "@/types";
import { IMG_BASE, IMG_POSTER, IMG_POSTER_LG, colorFor } from "@/types";

type Status = "want" | "watching" | "watched";

/** Icon-only status row: bookmark → watchlist, play → watching, tick → done. */
const STATUS_META: Record<Status, { label: string; Icon: typeof Bookmark }> = {
  want: { label: "Watchlist", Icon: Bookmark },
  watching: { label: "Watching", Icon: Play },
  watched: { label: "Watched", Icon: Check },
};

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
            srcSet={`${IMG_POSTER}${item.poster_path} 185w, ${IMG_BASE}${item.poster_path} 342w, ${IMG_POSTER_LG}${item.poster_path} 500w`}
            sizes="(max-width: 600px) 48vw, (max-width: 860px) 31vw, (max-width: 1100px) 23vw, 240px"
            alt={item.title}
            loading="lazy"
            decoding="async"
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
            {(["want", "watching", "watched"] as const).map(s => {
              const { label, Icon } = STATUS_META[s];
              const on = tracked?.status === s;
              return (
                <button
                  key={s}
                  className={`${s}${on ? " on" : ""}`}
                  onClick={() => onStatus(item, s)}
                  title={label}
                  aria-label={`${label}: ${item.title}`}
                  aria-pressed={on}
                >
                  <Icon size={15} strokeWidth={2} aria-hidden />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
