import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const CATS = [
  {
    v: "films",
    name: "Entertainment",
    sub: "Movies & TV",
    c1: "#8b5cf6",
    c2: "#ec4899",
    glow: "rgba(139,92,246,.55)",
    active: true,
    href: "/films",
    icon: "clap",
  },
  {
    v: "dining",
    name: "Dining",
    sub: "New York · 50 tables",
    c1: "#f59e0b",
    c2: "#ef4444",
    glow: "rgba(245,158,11,.5)",
    ready: true,
    href: "/dining",
    icon: "fork",
  },
  {
    v: "places",
    name: "Places",
    sub: "A curated city guide",
    c1: "#14b8a6",
    c2: "#06b6d4",
    glow: "rgba(20,184,166,.5)",
    ready: true,
    href: "/places",
    icon: "pin",
  },
  {
    v: "theater",
    name: "Theater",
    sub: "Broadway & live",
    c1: "#fb7185",
    c2: "#e11d48",
    glow: "rgba(251,113,133,.5)",
    soon: true,
    icon: "mask",
  },
  {
    v: "music",
    name: "Music",
    sub: "Albums & gigs",
    c1: "#6366f1",
    c2: "#22d3ee",
    glow: "rgba(99,102,241,.5)",
    soon: true,
    icon: "note",
  },
  {
    v: "books",
    name: "Books",
    sub: "Reads",
    c1: "#34d399",
    c2: "#10b981",
    glow: "rgba(52,211,153,.5)",
    soon: true,
    icon: "book",
  },
];

function CatIcon({ type }: { type: string }) {
  const base = { fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };
  if (type === "clap") return <svg {...base}><rect x="3" y="8.5" width="18" height="12" rx="2"/><path d="M3.4 8.5 6 4.2l3.2 2.1L11.4 4l3.2 2.1L17.8 4l2.8 4.5"/></svg>;
  if (type === "fork") return <svg {...base}><path d="M7 3v5M11 3v5"/><path d="M9 8v13"/><path d="M7 8c0 1.1.7 1.6 2 1.6s2-.5 2-1.6"/><path d="M16 3c-1.6 1.6-1.6 6.4 0 8v10"/></svg>;
  if (type === "pin") return <svg {...base}><path d="M12 21s6.5-5.8 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.2 12 21 12 21Z"/><circle cx="12" cy="10.3" r="2.4"/></svg>;
  if (type === "mask") return <svg {...base}><path d="M5 4.5h14V10a7 7 0 0 1-14 0z"/><path d="M9 8.5h.01M15 8.5h.01"/><path d="M9.3 13c.9.9 4.5.9 5.4 0"/></svg>;
  if (type === "note") return <svg {...base}><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16" cy="15.5" r="2.5"/><path d="M9 17.5V6l9.5-2.2v11.7"/></svg>;
  if (type === "book") return <svg {...base}><path d="M12 6.5C10.3 5.2 7.6 4.5 4.5 4.5V18c3.1 0 5.8.7 7.5 2 1.7-1.3 4.4-2 7.5-2V4.5c-3.1 0-5.8.7-7.5 2z"/><path d="M12 6.5V20"/></svg>;
  return null;
}

export default function Hub() {
  const [, nav] = useLocation();
  const { user, supabase: sb } = useAuth();
  const [skip, setSkip] = useState(false);
  const playedRef = useRef(false);

  useEffect(() => {
    if (playedRef.current) {
      setSkip(true);
    } else {
      playedRef.current = true;
      setTimeout(() => setSkip(false), 50);
    }
  }, []);

  const displayName = user?.email ? user.email.split("@")[0] : "";

  function handleTile(cat: typeof CATS[0]) {
    if (cat.href) nav(cat.href);
  }

  return (
    <div style={{ position: "relative", zIndex: 2 }}>
      {/* Aurora background */}
      <div className="aurora">
        <i /><i /><i />
      </div>
      <div className="vignette" />

      {/* Top bar */}
      <div className="hub-top">
        <div className="hub-brand">Screening Room</div>
        <div className="hub-user">
          {displayName && <span>Hi, {displayName}</span>}
          <button onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
      </div>

      {/* Stage */}
      <div className="hub-stage">
        <div className="intro">
          <div className={`intro-eyebrow${skip ? " skip" : ""}`}>✦ Your taste, beautifully kept</div>
          <h1 className={`intro-title${skip ? " skip" : ""}`}>Screening Room</h1>
          <p className={`intro-tag${skip ? " skip" : ""}`}>Pick a world. Track what you love. Discover what's next.</p>
        </div>

        <div className="cat-grid">
          {CATS.map(cat => {
            const enterable = cat.active || cat.ready;
            const cls = `cat-tile${cat.active ? " active" : cat.ready ? " ready" : " soon"}`;
            return (
              <button
                key={cat.v}
                className={cls}
                onClick={() => enterable && handleTile(cat)}
                disabled={cat.soon}
              >
                {cat.soon && <span className="lock">Soon</span>}
                {cat.ready && <span className="newbadge">New</span>}

                <span
                  className="cat-medallion"
                  style={{ "--c1": cat.c1, "--c2": cat.c2, "--glow": cat.glow } as React.CSSProperties}
                >
                  <CatIcon type={cat.icon} />
                </span>

                <span className="cat-name">{cat.name}</span>
                <span className="cat-sub">{cat.sub}</span>
                {enterable && <span className="enter">Enter</span>}
              </button>
            );
          })}
        </div>

        <div className={`hub-hint${skip ? " skip" : ""}`}>Tap a world to dive in</div>
      </div>
    </div>
  );
}
