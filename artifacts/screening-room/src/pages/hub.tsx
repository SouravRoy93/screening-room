import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AuroraBg } from "@/components/aurora-bg";
import { Film, UtensilsCrossed, MapPin, Users, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const TILES = [
  {
    id: "films",
    label: "Films & TV",
    sub: "Track everything you watch",
    icon: Film,
    gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
    href: "/films",
  },
  {
    id: "dining",
    label: "Dining",
    sub: "Your restaurant guide",
    icon: UtensilsCrossed,
    gradient: "linear-gradient(135deg,#ec4899,#be185d)",
    href: "/dining",
  },
  {
    id: "places",
    label: "Places",
    sub: "The city, curated",
    icon: MapPin,
    gradient: "linear-gradient(135deg,#ffd36b,#f59f00)",
    href: "/places",
  },
  {
    id: "social",
    label: "Social",
    sub: "Share lists with friends",
    icon: Users,
    gradient: "linear-gradient(135deg,#3bc9db,#0c8599)",
    href: "/social",
  },
];

export default function Hub() {
  const [, nav] = useLocation();
  const { user, supabase: sb } = useAuth();
  const [entered, setEntered] = useState(false);

  useEffect(() => { setTimeout(() => setEntered(true), 80); }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden">
      <AuroraBg />

      <div
        className="flex flex-col items-center transition-all duration-700"
        style={{ opacity: entered ? 1 : 0, transform: entered ? "none" : "translateY(20px)" }}
      >
        {/* Title */}
        <div className="mb-2 flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
          >
            <Film className="w-5 h-5 text-white" />
          </div>
        </div>
        <h1
          className="text-5xl sm:text-6xl font-bold text-white tracking-widest mb-2 text-center"
          style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: "0.15em" }}
        >
          SCREENING ROOM
        </h1>
        <p
          className="text-lg text-muted-foreground mb-12 text-center"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic" }}
        >
          {user?.email ? `Welcome back, ${user.email.split("@")[0]}` : "Your city, curated."}
        </p>

        {/* Tiles */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
          {TILES.map((tile, i) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                onClick={() => nav(tile.href)}
                className="group relative overflow-hidden rounded-2xl p-6 text-left transition-transform duration-200 hover:scale-105 active:scale-95"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  transitionDelay: `${i * 60}ms`,
                  opacity: entered ? 1 : 0,
                  transform: entered ? "none" : "translateY(16px)",
                }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: tile.gradient.replace("135deg", "135deg").replace(")", ", transparent)").replace(",", " 0%,") + " 0%" }}
                />
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: tile.gradient }}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <p className="font-semibold text-foreground text-sm">{tile.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tile.sub}</p>
              </button>
            );
          })}
        </div>

        {/* Sign out */}
        <button
          onClick={() => sb.auth.signOut()}
          className="mt-10 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
