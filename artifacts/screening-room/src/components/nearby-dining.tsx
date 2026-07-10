import { useLocation } from "wouter";
import { UtensilsCrossed, Star } from "lucide-react";
import { useNearbyDining } from "@/hooks/use-nearby-dining";
import type { PlaceItem } from "@/types";

const priceStr = (p: number) => "$".repeat(Math.max(1, Math.min(4, p)));

/**
 * "Where to eat nearby" — the cross-vertical pairing shelf. Renders only once
 * the user has signalled interest in a place (Want to go / Been there).
 */
export function NearbyDining({
  place,
  userId,
  enabled,
}: {
  place: PlaceItem;
  userId: string | undefined;
  enabled: boolean;
}) {
  const [, nav] = useLocation();
  const result = useNearbyDining(place, userId, enabled);

  if (!enabled || result.source === "none") return null;

  const headerNote =
    result.source === "curated"
      ? "Paired to this spot and your taste"
      : "Live picks near this spot";

  return (
    <section className="nd-section" aria-label="Where to eat nearby">
      <div className="nd-head">
        <UtensilsCrossed size={16} />
        <h3 className="nd-title">Where to eat nearby</h3>
        <span className="nd-note">{headerNote}</span>
      </div>

      {result.loading && (
        <div className="nd-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="nd-card nd-skel" />
          ))}
        </div>
      )}

      {/* Curated NYC recommendations */}
      {result.source === "curated" && !result.loading && result.recs.length > 0 && (
        <div className="nd-grid">
          {result.recs.map((r) => (
            <button
              key={r.item.id}
              className="nd-card"
              onClick={() => nav(`/dining/${r.item.id}`)}
              aria-label={`${r.item.name} — ${r.reason}`}
            >
              <div className="nd-card-top">
                <span className="nd-name">{r.item.name}</span>
                {r.isFavorite && <span className="nd-fav">♥</span>}
              </div>
              <div className="nd-meta">
                {r.item.cuisine} · {priceStr(r.item.price)}
                {r.item.recognition ? ` · ${r.item.recognition.replace(/·.*/, "").trim()}` : ""}
              </div>
              <div className="nd-reason">{r.reason}</div>
            </button>
          ))}
        </div>
      )}

      {result.source === "curated" && !result.loading && result.recs.length === 0 && (
        <p className="nd-empty">No curated tables within a short walk — try the map for options further out.</p>
      )}

      {/* Live fallback (LA / Chicago / elsewhere) */}
      {result.source === "live" && !result.loading && result.live.length > 0 && (
        <div className="nd-grid">
          {result.live.map((r, i) => (
            <a
              key={i}
              className="nd-card"
              href={r.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="nd-card-top">
                <span className="nd-name">{r.name}</span>
              </div>
              <div className="nd-meta">
                {r.cuisine || "Restaurant"}
                {r.rating ? (
                  <>
                    {" · "}
                    <Star size={11} style={{ display: "inline", verticalAlign: "-1px" }} fill="#ffd36b" color="#ffd36b" /> {r.rating}
                  </>
                ) : ""}
              </div>
              <div className="nd-reason">{r.reason}</div>
            </a>
          ))}
        </div>
      )}

      {result.source === "live" && !result.loading && result.live.length === 0 && (
        <p className="nd-empty">No dining options found right nearby.</p>
      )}
    </section>
  );
}
