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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
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
    <div className="mx-auto max-w-md">
      <div className="card p-6">
        <h1 className="h1">Create your account</h1>
        <p className="muted mt-2">Register and start tracking your workouts.</p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="reg-name">Name</label>
            <input
              id="reg-name"
              className="input mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              className="input mt-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              className="input mt-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              minLength={8}
              required
            />
            {strength && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-700">
                  <div
                    className={[
                      "h-full rounded-full transition-all duration-300",
                      strength === "weak" && "w-1/4 bg-red-500",
                      strength === "ok" && "w-2/4 bg-yellow-500",
                      strength === "strong" && "w-full bg-emerald-500",
                    ].filter(Boolean).join(" ")}
                  />
                </div>
                <span className={[
                  "text-xs",
                  strength === "weak" && "text-red-400",
                  strength === "ok" && "text-yellow-400",
                  strength === "strong" && "text-emerald-400",
                ].filter(Boolean).join(" ")}>
                  {strength === "weak" ? "Too short" : strength === "ok" ? "OK" : "Strong"}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="reg-confirm">Confirm password</label>
            <input
              id="reg-confirm"
              className={["input mt-2", pwMismatch ? "border-red-500/60" : ""].join(" ")}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              placeholder="••••••••"
              required
            />
            {pwMismatch && (
              <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
            )}
            {confirmTouched && confirm && !pwMismatch && (
              <p className="mt-1 text-xs text-emerald-400">Passwords match</p>
            )}
          </div>

          <button
            className="btn-primary w-full"
            type="submit"
            disabled={loading || pwMismatch}
          >
            {loading ? "Creating account…" : "Register"}
          </button>
        </form>

        <p className="muted mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
