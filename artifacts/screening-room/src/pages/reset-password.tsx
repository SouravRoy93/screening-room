import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { AuroraBg } from "@/components/aurora-bg";

export default function ResetPassword() {
  const [, nav] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setMsg({ type: "error", text: "Use at least 8 characters." }); return; }
    if (password !== confirm) { setMsg({ type: "error", text: "Passwords don't match." }); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setMsg({ type: "error", text: error.message }); return; }
    setMsg({ type: "ok", text: "Password updated — taking you home…" });
    setTimeout(() => nav("/"), 1200);
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-[#08080d]">
      <AuroraBg />
      <div className="w-full max-w-sm mx-auto">
        <h1 className="text-2xl font-bold mb-2 text-foreground" style={{ fontFamily: "'Oswald', sans-serif" }}>
          Set a new password
        </h1>
        <p className="text-sm text-muted-foreground mb-6">Choose a new password for your account.</p>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">New password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-1 focus:ring-primary"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-1 focus:ring-primary"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
          </div>

          {msg && (
            <p className="text-sm rounded-xl px-3 py-2" style={{
              background: msg.type === "error" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
              color: msg.type === "error" ? "#f87171" : "#4ade80",
            }}>{msg.text}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff" }}
          >
            {loading ? "…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
