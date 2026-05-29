"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

function passwordStrength(pw: string): "weak" | "ok" | "strong" | null {
  if (!pw) return null;
  if (pw.length < 8) return "weak";
  if (pw.length < 12) return "ok";
  return "strong";
}

const PERKS = [
  { icon: "⏱️", text: "Live workout sessions with timers" },
  { icon: "🤖", text: "AI coach powered by Gemini" },
  { icon: "📈", text: "Strength & volume analytics" },
  { icon: "📄", text: "Weekly PDF reports" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordStrength(password);
  const pwMismatch = confirmTouched && confirm !== "" && password !== confirm;
  const pwMatch = confirmTouched && confirm !== "" && password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      await register(name, email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-0 overflow-hidden rounded-3xl border border-neutral-800 shadow-2xl shadow-black/50">

        {/* Left panel */}
        <div className="relative hidden md:flex flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-fuchsia-700 p-10">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/20 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-12">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl">🏋️</span>
              <span className="text-lg font-bold text-white">Gym Tracker</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white leading-tight">
              Your personal<br />training system.
            </h2>
            <p className="mt-3 text-indigo-200 text-sm">
              Everything you need to train smarter, track progress and reach your goals.
            </p>
          </div>
          <div className="relative space-y-4">
            {PERKS.map((p) => (
              <div key={p.text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15 text-sm">{p.icon}</span>
                <span className="text-sm text-indigo-100">{p.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — form */}
        <div className="bg-neutral-950 p-8 md:p-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-neutral-50">Create your account</h1>
            <p className="mt-1 text-sm text-neutral-500">Free — no credit card required.</p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider" htmlFor="reg-name">
                Full name
              </label>
              <input
                id="reg-name"
                className="input mt-1.5 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider" htmlFor="reg-email">
                Email address
              </label>
              <input
                id="reg-email"
                className="input mt-1.5 w-full"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider" htmlFor="reg-password">
                Password
              </label>
              <input
                id="reg-password"
                className="input mt-1.5 w-full"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                required
              />
              {strength && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-800">
                    <div className={[
                      "h-full rounded-full transition-all duration-500",
                      strength === "weak" ? "w-1/4 bg-red-500" :
                      strength === "ok" ? "w-2/3 bg-yellow-400" :
                      "w-full bg-emerald-400"
                    ].join(" ")} />
                  </div>
                  <span className={`text-xs font-medium ${
                    strength === "weak" ? "text-red-400" :
                    strength === "ok" ? "text-yellow-400" : "text-emerald-400"
                  }`}>
                    {strength === "weak" ? "Too short" : strength === "ok" ? "OK" : "Strong"}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider" htmlFor="reg-confirm">
                Confirm password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="reg-confirm"
                  className={`input w-full pr-9 ${pwMismatch ? "border-red-500/60" : pwMatch ? "border-emerald-500/50" : ""}`}
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onBlur={() => setConfirmTouched(true)}
                  placeholder="••••••••"
                  required
                />
                {pwMatch && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-sm">✓</span>
                )}
                {pwMismatch && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✗</span>
                )}
              </div>
              {pwMismatch && <p className="mt-1 text-xs text-red-400">Passwords do not match</p>}
            </div>

            <button
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-3 font-semibold text-white transition-all shadow-lg shadow-indigo-600/20 mt-2"
              type="submit"
              disabled={loading || pwMismatch}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating account…
                </span>
              ) : "Create account →"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-600">
            Already have an account?{" "}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
              Sign in
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
