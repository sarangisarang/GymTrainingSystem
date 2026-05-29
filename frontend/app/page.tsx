"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const FEATURES = [
  {
    icon: "⏱️",
    title: "Live Workout Session",
    desc: "Dual-timer system with training & rest countdown. Audio signals. Auto-advance between exercises. Set completion tracking.",
    badge: "Real-time",
  },
  {
    icon: "🔮",
    title: "Predictive Strength Engine",
    desc: "Linear regression on your training history. Predicts exactly when you'll hit your target weight — down to the week.",
    badge: "AI-powered",
  },
  {
    icon: "🤖",
    title: "KI-Coach",
    desc: "Personal AI trainer powered by Gemini. Analyses your last 10 workouts and delivers specific, data-driven recommendations.",
    badge: "Gemini AI",
  },
  {
    icon: "📊",
    title: "Training Programs",
    desc: "Auto-generate 4-week periodised programs from your 1RM. Strength, hypertrophy or endurance. Week-by-week progression built in.",
    badge: "Periodisation",
  },
  {
    icon: "📈",
    title: "Progress Analytics",
    desc: "Strength curve with personal record highlights. Weekly volume bars. Body-weight trend. All COMPLETED workouts only — no noise.",
    badge: "Data-driven",
  },
  {
    icon: "📄",
    title: "PDF Reports",
    desc: "Server-generated weekly and monthly reports via reportlab. Total volume, top exercises, new PRs, streak stats — download in one click.",
    badge: "Export",
  },
  {
    icon: "👨‍💼",
    title: "Coach Dashboard",
    desc: "Invite athletes by email. View their full workout history. Assign training programs. Role-based access — coaches only.",
    badge: "Multi-user",
  },
  {
    icon: "📱",
    title: "PWA — Install on Device",
    desc: "Service worker caching, offline fallback, installable on Android and iOS. Feels like a native app — no app store needed.",
    badge: "Offline-ready",
  },
];

const STATS = [
  { value: "30+", label: "API Endpoints" },
  { value: "12", label: "App Pages" },
  { value: "8", label: "Core Features" },
  { value: "100%", label: "TypeScript" },
];

const STACK = ["FastAPI", "SQLAlchemy", "Next.js 15", "TypeScript", "Tailwind CSS", "Recharts", "Gemini AI", "reportlab", "PWA"];

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <div className="space-y-24">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 px-8 py-20 md:px-20 md:py-28 text-center">
        {/* Glows */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 rounded-full bg-fuchsia-600/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-cyan-600/10 blur-3xl" />

        <div className="relative">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 mb-8">
            <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            Full-stack Gym Training System — FastAPI + Next.js
          </div>

          {/* Headline */}
          <h1 className="text-6xl font-extrabold tracking-tight md:text-7xl lg:text-8xl leading-none">
            <span className="text-neutral-50">Train smarter.</span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Get stronger.
            </span>
          </h1>

          {/* Sub */}
          <p className="mx-auto mt-8 max-w-2xl text-xl text-neutral-400 leading-relaxed">
            The complete gym tracking platform — live sessions, AI coaching,
            predictive analytics, PDF reports and a coach dashboard.
            <span className="text-neutral-300"> All in one app.</span>
          </p>

          {/* CTA */}
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            {loading ? null : user ? (
              <>
                <Link href="/dashboard"
                  className="rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-8 py-4 text-base font-semibold text-white transition-all shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40">
                  Go to Dashboard →
                </Link>
                <Link href="/workouts"
                  className="rounded-2xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 px-8 py-4 text-base font-semibold text-neutral-200 transition-all">
                  My Workouts
                </Link>
              </>
            ) : (
              <>
                <Link href="/register"
                  className="rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-8 py-4 text-base font-semibold text-white transition-all shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40">
                  Start for free →
                </Link>
                <Link href="/login"
                  className="rounded-2xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 px-8 py-4 text-base font-semibold text-neutral-200 transition-all">
                  Sign in
                </Link>
              </>
            )}
          </div>

          {/* Tech stack */}
          <div className="mt-12 flex flex-wrap justify-center gap-2">
            {STACK.map((t) => (
              <span key={t} className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-500">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 text-center">
            <p className="text-5xl font-extrabold text-indigo-400">{s.value}</p>
            <p className="mt-2 text-sm text-neutral-500 uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Features ── */}
      <div>
        <div className="mb-12 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400 mb-3">Features</p>
          <h2 className="text-4xl font-extrabold text-neutral-50">Everything a serious athlete needs</h2>
          <p className="mt-4 text-neutral-500 text-lg">Eight production-grade features — all verified, all working.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 p-6 hover:border-indigo-500/50 transition-all duration-300 hover:bg-neutral-900/80">
              <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-indigo-600/5 blur-2xl group-hover:bg-indigo-600/10 transition-all" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl">{f.icon}</span>
                  <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-xs text-indigo-400">
                    {f.badge}
                  </span>
                </div>
                <h3 className="font-bold text-neutral-100 mb-2">{f.title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ── */}
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 px-8 py-14 md:px-16">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400 mb-3">How it works</p>
          <h2 className="text-4xl font-extrabold">From zero to PR in 3 steps</h2>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { step: "01", title: "Create your workout", desc: "Add exercises to your cart, set sets, reps and weight. Save as a workout plan." },
            { step: "02", title: "Start live session", desc: "The guided player tracks active time and rest. Audio signals keep you on pace." },
            { step: "03", title: "Analyse & improve", desc: "View your strength curve, get AI recommendations and predict your next PR." },
          ].map((s) => (
            <div key={s.step} className="flex gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 font-bold text-sm">
                {s.step}
              </div>
              <div>
                <h3 className="font-bold text-neutral-100">{s.title}</h3>
                <p className="mt-1 text-sm text-neutral-500">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Final CTA ── */}
      {!user && !loading && (
        <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600/10 via-neutral-900 to-fuchsia-600/10 px-8 py-16 text-center">
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-r from-indigo-600/5 to-fuchsia-600/5" />
          <div className="relative">
            <h2 className="text-4xl font-extrabold md:text-5xl">Ready to start?</h2>
            <p className="mt-4 text-lg text-neutral-400">
              Free account. No credit card. Start tracking your first workout in 60 seconds.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/register"
                className="rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-10 py-4 text-base font-bold text-white transition-all shadow-xl shadow-indigo-600/30">
                Create free account →
              </Link>
              <Link href="/exercises"
                className="rounded-2xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 px-10 py-4 text-base font-semibold text-neutral-200 transition-all">
                Browse exercises
              </Link>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
