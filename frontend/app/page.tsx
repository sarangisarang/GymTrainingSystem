"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const FEATURES = [
  { icon: "⏱️", title: "Live Workout Session", desc: "Guided workout player with training & rest timers, audio signals and set tracking." },
  { icon: "📈", title: "Progress Charts", desc: "Strength curve, weekly volume bars and body-weight trend — powered by Recharts." },
  { icon: "🔮", title: "Predictive Engine", desc: "Linear regression tells you exactly when you will reach your target weight." },
  { icon: "🤖", title: "KI-Coach", desc: "AI trainer analyses your last 10 workouts and gives personalised recommendations." },
  { icon: "📄", title: "PDF Reports", desc: "Download weekly or monthly training reports with volume, PRs and streak stats." },
  { icon: "👨‍💼", title: "Coach Dashboard", desc: "Coaches can invite athletes, view their workouts and assign training programs." },
  { icon: "📊", title: "Training Programs", desc: "Auto-generate 4-week strength, hypertrophy or endurance programs from your 1RM." },
  { icon: "📱", title: "PWA", desc: "Install on your phone. Works offline. Feels like a native app." },
];

const STATS = [
  { value: "30+", label: "API Endpoints" },
  { value: "12", label: "App Pages" },
  { value: "24", label: "Exercises" },
  { value: "100%", label: "TypeScript" },
];

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <div className="space-y-20">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 px-8 py-16 md:px-16 md:py-24 text-center">
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs text-indigo-300">
            <span>🏋️</span> Gym Tracker — Professional Training System
          </p>

          <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            Train smarter.
            <span className="block bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
              Get stronger.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
            A full-stack gym tracking system with AI coaching, progress analytics,
            live workout sessions, PDF reports and a coach dashboard.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {loading ? null : user ? (
              <>
                <Link className="btn-primary text-base px-6 py-3" href="/dashboard">
                  Go to Dashboard →
                </Link>
                <Link className="btn-ghost text-base px-6 py-3" href="/workouts">
                  My Workouts
                </Link>
              </>
            ) : (
              <>
                <Link className="btn-primary text-base px-6 py-3" href="/register">
                  Get started — free
                </Link>
                <Link className="btn-ghost text-base px-6 py-3" href="/login">
                  Login
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
            <p className="text-4xl font-bold text-indigo-400">{s.value}</p>
            <p className="mt-1 text-sm text-neutral-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Features */}
      <div>
        <h2 className="mb-2 text-center text-3xl font-bold">Everything you need</h2>
        <p className="mb-10 text-center text-neutral-500">Built with FastAPI + Next.js + TypeScript</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5 hover:border-indigo-500/40 transition-colors">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-3 font-semibold text-neutral-100">{f.title}</h3>
              <p className="muted mt-2 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      {!user && !loading && (
        <div className="rounded-3xl border border-indigo-500/20 bg-indigo-500/5 px-8 py-12 text-center">
          <h2 className="text-3xl font-bold">Ready to start training?</h2>
          <p className="mt-3 text-neutral-400">Create your free account and track your first workout today.</p>
          <Link className="btn-primary mt-6 inline-block text-base px-8 py-3" href="/register">
            Create free account
          </Link>
        </div>
      )}
    </div>
  );
}
