import { useState } from "react";
import { AuroraBg } from "@/components/aurora-bg";
import { supabase } from "@/lib/supabase";
import { Film, Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg({ type: "error", text: error.message });
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setMsg({ type: "error", text: error.message });
        else setMsg({ type: "ok", text: "Check your email to confirm your account." });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <AuroraBg />

      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-2xl"
        style={{
          background: "rgba(13,13,24,0.85)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
          >
            <Film className="w-7 h-7 text-white" />
          </div>
          <h1
            className="text-3xl font-bold text-white tracking-wide"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            SCREENING ROOM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your city, curated.</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg p-1 mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
          {(["signin", "signup"] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setMsg(null); }}
              className="flex-1 py-2 rounded-md text-sm font-medium transition-all"
              style={{
                background: mode === m ? "rgba(139,92,246,0.4)" : "transparent",
                color: mode === m ? "#fff" : "#6b7280",
              }}
            >
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
              }}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type={showPw ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {msg && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{
                background: msg.type === "error" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                color: msg.type === "error" ? "#f87171" : "#4ade80",
              }}
            >
              {msg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff" }}
          >
            {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
