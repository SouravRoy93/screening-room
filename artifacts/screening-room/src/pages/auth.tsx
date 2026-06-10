import { useState } from "react";
import { AuroraBg } from "@/components/aurora-bg";
import { supabase } from "@/lib/supabase";

export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  async function magicLink() {
    if (!email) { setMsg({ type: "error", text: "Enter your email first." }); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) setMsg({ type: "error", text: error.message });
    else setMsg({ type: "ok", text: "Magic link sent — check your inbox." });
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithApple() {
    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: window.location.origin },
    });
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-[#08080d]">
      <AuroraBg />

      <div className="w-full max-w-sm mx-auto">
        {/* Title */}
        <div className="mb-8">
          <h1
            className="text-4xl font-bold mb-2"
            style={{
              fontFamily: "'Oswald', sans-serif",
              background: "linear-gradient(90deg, #ffd36b 0%, #c084fc 50%, #f472b6 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "0.05em",
            }}
          >
            SCREENING ROOM
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Track everything you watch — and soon, everywhere you go.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="flex flex-col gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-1 focus:ring-primary"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={mode === "signup"}
              minLength={6}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-1 focus:ring-primary"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
              }}
            />
          </div>

          {msg && (
            <p
              className="text-sm rounded-xl px-3 py-2"
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
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff" }}
          >
            {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {/* Magic link */}
        <button
          onClick={magicLink}
          disabled={loading}
          className="text-sm font-medium mb-6 hover:opacity-80 transition-opacity"
          style={{ color: "#8b5cf6" }}
        >
          Email me a magic link instead
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
          <span className="text-xs text-muted-foreground">or continue with</span>
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
        </div>

        {/* Social buttons */}
        <div className="flex flex-col gap-3 mb-8">
          <button
            onClick={signInWithGoogle}
            className="flex items-center justify-center gap-3 w-full py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Google
          </button>

          <button
            onClick={signInWithApple}
            className="flex items-center justify-center gap-3 w-full py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          >
            <svg width="17" height="20" viewBox="0 0 814 1000" fill="currentColor">
              <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.8 0 663.2 0 541.8c0-207.5 135.4-317.3 270.1-317.3 69.8 0 127.9 45.6 172.1 45.6 42.4 0 109.2-48.7 188.3-48.7 30.1 0 108.2 2.6 168 97.6zm-234.5-172.7c31.7-38.7 54.3-92.4 54.3-146.1 0-7.1-.6-14.3-1.9-20.1-52 1.9-113.1 34.7-149.4 79.2-28.5 32.4-55.1 86.1-55.1 140.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 46.1 0 101.3-31.1 136.6-72.9z"/>
            </svg>
            Apple
          </button>
        </div>

        {/* Toggle mode */}
        <p className="text-sm text-center text-muted-foreground">
          {mode === "signin" ? (
            <>New here?{" "}
              <button
                onClick={() => { setMode("signup"); setMsg(null); }}
                className="font-semibold hover:opacity-80"
                style={{ color: "#8b5cf6" }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>Already have one?{" "}
              <button
                onClick={() => { setMode("signin"); setMsg(null); }}
                className="font-semibold hover:opacity-80"
                style={{ color: "#8b5cf6" }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
