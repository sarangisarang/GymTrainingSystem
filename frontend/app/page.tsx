"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 p-8 md:p-12">
      {/* Background glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-fuchsia-500/10 blur-3xl" />

      <div className="relative">
        <p className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
          <span>⚡</span>
          Next.js + FastAPI • JWT Auth • Uploads • Cart
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Track your workouts.
          <span className="block text-neutral-400">Stay consistent, get stronger.</span>
        </h1>

        <p className="mt-4 max-w-2xl text-neutral-300">
          Professional gym tracker UI that connects to your FastAPI backend (users, exercises, workouts, workout_exercises) and supports
          login/registration, exercise image uploads, and building workouts using a cart.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {loading ? null : user ? (
            <>
              <Link className="btn-primary" href="/dashboard">
                Go to Dashboard
              </Link>
              <Link className="btn-ghost" href="/exercises">
                Browse Exercises
              </Link>
              <Link className="btn-ghost" href="/cart">
                Open Cart
              </Link>
            </>
          ) : (
            <>
              <Link className="btn-primary" href="/register">
                Create account
              </Link>
              <Link className="btn-ghost" href="/login">
                Login
              </Link>
              <Link className="btn-ghost" href="/exercises">
                Browse exercises
              </Link>
            </>
          )}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="card p-5">
            <div className="text-2xl">🔐</div>
            <h2 className="mt-3 font-semibold">Authentication</h2>
            <p className="muted mt-2">Register, login and access your profile using JWT tokens.</p>
          </div>
          <div className="card p-5">
            <div className="text-2xl">📷</div>
            <h2 className="mt-3 font-semibold">Exercise images</h2>
            <p className="muted mt-2">Upload a photo for each exercise and show it in the UI.</p>
          </div>
          <div className="card p-5">
            <div className="text-2xl">🧺</div>
            <h2 className="mt-3 font-semibold">Workout cart</h2>
            <p className="muted mt-2">Add exercises to your cart, set sets/reps/weight, then create a workout.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
