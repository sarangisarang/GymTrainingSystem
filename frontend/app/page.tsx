"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTranslations } from "@/components/I18nProvider";

// Titles/descriptions live in i18n (home.features.*); week tag drives the badge color.
const FEATURES = [
  { icon: "⏱️", key: "f1", week: 2 },
  { icon: "🔮", key: "f2", week: 2 },
  { icon: "🤖", key: "f3", week: 2 },
  { icon: "📈", key: "f4", week: 2 },
  { icon: "📊", key: "f5", week: 2 },
  { icon: "📄", key: "f6", week: 2 },
  { icon: "👨‍💼", key: "f7", week: 3 },
  { icon: "📱", key: "f8", week: 2 },
  { icon: "🔐", key: "f9", week: 1 },
  { icon: "📋", key: "f10", week: 3 },
  { icon: "🏠", key: "f11", week: 3 },
  { icon: "🌐", key: "f12", week: 3 },
];

const BACKEND = ["FastAPI", "SQLAlchemy", "PostgreSQL", "MongoDB (Logs)", "JWT (python-jose)", "Argon2 (passlib)", "Pydantic v2", "reportlab", "httpx (Gemini SSE)", "uvicorn"];
const FRONTEND = ["Next.js 15", "TypeScript", "Tailwind CSS", "Recharts", "Playwright", "PWA (Service Worker)", "jsPDF", "html2canvas"];
const TOOLS = ["GitHub", "Git", "Pytest", "VS Code", "Postman"];

export default function HomePage() {
  const { user, loading } = useAuth();
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const STATS = [
    { value: "30+", label: t("home.stats.endpoints") },
    { value: "12", label: t("home.stats.pages") },
    { value: "12", label: t("home.stats.features") },
    { value: "3", label: t("home.stats.sprint") },
  ];

  return (
    <div className="space-y-20">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 px-8 py-20 md:px-20 md:py-28 text-center">
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 rounded-full bg-fuchsia-600/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-cyan-600/10 blur-3xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 mb-6">
            <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            {t("home.badge")}
          </div>

          <h1 className="text-6xl font-extrabold tracking-tight md:text-7xl lg:text-8xl leading-none">
            <span className="text-neutral-50">Gym Tracker</span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Training System
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-xl text-neutral-400 leading-relaxed">
            {t("home.subtitle")}
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {!mounted ? null : user ? (
              <Link href="/dashboard" className="rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-8 py-4 text-base font-semibold text-white transition-all shadow-lg shadow-indigo-600/30">
                {t("home.openDashboard")}
              </Link>
            ) : (
              <>
                <Link href="/register" className="rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-8 py-4 text-base font-semibold text-white transition-all shadow-lg shadow-indigo-600/30">
                  {t("home.getStarted")}
                </Link>
                <Link href="/login" className="rounded-2xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 px-8 py-4 text-base font-semibold text-neutral-200 transition-all">
                  {t("home.signIn")}
                </Link>
              </>
            )}
            <a href="https://github.com/sarangisarang/GymTrainingSystem" target="_blank" rel="noopener noreferrer"
              className="rounded-2xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 px-8 py-4 text-base font-semibold text-neutral-200 transition-all flex items-center gap-2">
              {t("home.github")}
            </a>
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
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-400 mb-3">{t("home.featuresKicker")}</p>
          <h2 className="text-4xl font-extrabold text-neutral-50">{t("home.featuresTitle")}</h2>
          <p className="mt-4 text-neutral-500 text-lg">{t("home.featuresSubtitle")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.key}
              className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 p-5 hover:border-indigo-500/50 transition-all duration-300">
              <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-indigo-600/5 blur-xl group-hover:bg-indigo-600/10 transition-all" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{f.icon}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    f.week === 1 ? "bg-neutral-800 text-neutral-400" :
                    f.week === 2 ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" :
                    "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
                  }`}>{t("home.weekTag")} {f.week}</span>
                </div>
                <h3 className="font-bold text-neutral-100 text-sm mb-1">{t(`home.features.${f.key}.title`)}</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">{t(`home.features.${f.key}.desc`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tech Stack ── */}
      <div>
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-400 mb-3">{t("home.techKicker")}</p>
          <h2 className="text-4xl font-extrabold text-neutral-50">{t("home.techTitle")}</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {[
            { title: "Backend", icon: "⚙️", color: "border-green-500/20 bg-green-500/5", badge: "text-green-400", items: BACKEND },
            { title: "Frontend", icon: "🎨", color: "border-blue-500/20 bg-blue-500/5", badge: "text-blue-400", items: FRONTEND },
            { title: "Tools", icon: "🛠️", color: "border-neutral-700 bg-neutral-900/50", badge: "text-neutral-400", items: TOOLS },
          ].map((col) => (
            <div key={col.title} className={`rounded-2xl border p-6 ${col.color}`}>
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xl">{col.icon}</span>
                <h3 className={`font-bold text-lg ${col.badge}`}>{col.title}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {col.items.map((t) => (
                  <span key={t} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Architektur ── */}
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 px-8 py-14 md:px-16">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-400 mb-3">{t("home.archKicker")}</p>
          <h2 className="text-4xl font-extrabold">{t("home.archTitle")}</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: "🗄️", title: "Backend — FastAPI", items: ["30+ REST Endpoints", "JWT Authentication", "PostgreSQL (Business-Daten)", "MongoDB (Request-Logs)", "Gemini AI (SSE Streaming)", "reportlab PDF Generator"] },
            { icon: "💻", title: "Frontend — Next.js", items: ["12 App-Seiten (App Router)", "TypeScript — vollständig typisiert", "Tailwind CSS + Recharts", "PWA mit Service Worker", "Playwright E2E Tests", "data-testid Selektoren"] },
            { icon: "🔄", title: "Workflow — GitHub", items: ["Feature Branches", "Pull Requests (#22 gemergt)", "12 Issues geschlossen", "Co-Authorship (TEAM3)", "Commit-Historie sauber", "Merge-Konflikte gelöst"] },
          ].map((col) => (
            <div key={col.title} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
              <div className="text-3xl mb-3">{col.icon}</div>
              <h3 className="font-bold text-neutral-100 mb-4">{col.title}</h3>
              <ul className="space-y-2">
                {col.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-neutral-400">
                    <span className="text-indigo-500">✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── GitHub CTA ── */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600/10 via-neutral-900 to-fuchsia-600/10 px-8 py-16 text-center">
        <h2 className="text-4xl font-extrabold md:text-5xl">{t("home.ctaTitle")}</h2>
        <p className="mt-4 text-lg text-neutral-400">
          {t("home.ctaText")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {mounted && !user && (
            <Link href="/register" className="rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-10 py-4 text-base font-bold text-white transition-all shadow-xl shadow-indigo-600/30">
              {t("home.ctaStart")}
            </Link>
          )}
          <a href="https://github.com/sarangisarang/GymTrainingSystem" target="_blank" rel="noopener noreferrer"
            className="rounded-2xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 px-10 py-4 text-base font-semibold text-neutral-200 transition-all">
            {t("home.ctaRepo")}
          </a>
        </div>
      </div>

    </div>
  );
}
