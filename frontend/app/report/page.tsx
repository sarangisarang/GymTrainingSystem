"use client";

import { useEffect, useState } from "react";
import Protected from "@/components/Protected";
import {
  getWorkouts,
  getUserStats,
  downloadReportPdf,
  type WorkoutRead,
  type UserStats,
  type ReportPeriod,
} from "@/lib/api";

export default function ReportPage() {
  return (
    <Protected>
      <ReportInner />
    </Protected>
  );
}

function ReportInner() {
  const [workouts, setWorkouts] = useState<WorkoutRead[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<ReportPeriod | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getWorkouts({ skip: 0, limit: 50 }),
      getUserStats(),
    ]).then(([w, s]) => {
      setWorkouts(w);
      setStats(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleDownload(period: ReportPeriod) {
    setDownloading(period);
    setErr(null);
    try {
      await downloadReportPdf(period);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Download fehlgeschlagen");
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  const now = new Date();
  const monthName = now.toLocaleString("de-DE", { month: "long", year: "numeric" });
  const completed = workouts.filter((w) => w.status === "COMPLETED");
  const totalVolume = completed.reduce((sum, w) =>
    sum + w.workout_exercises.reduce((s, we) =>
      s + (we.sets * we.reps * (Number(we.weight) || 0)), 0), 0
  );

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="h1">PDF-Report</h1>
          <p className="muted mt-0.5">
            Wochen- oder Monats-Report serverseitig generieren und herunterladen.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => handleDownload("weekly")}
            disabled={downloading !== null}
          >
            {downloading === "weekly" ? "Erstelle..." : "Wochen-Report (PDF)"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleDownload("monthly")}
            disabled={downloading !== null}
          >
            {downloading === "monthly" ? "Erstelle..." : "Monats-Report (PDF)"}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      <div className="space-y-6 rounded-2xl bg-neutral-950 p-8">
        <div className="border-b border-neutral-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-3xl">
              🏋️
            </div>
            <div>
              <h1 className="text-3xl font-bold text-neutral-50">Gym Tracker</h1>
              <p className="text-neutral-400">Vorschau · {monthName}</p>
            </div>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Workouts gesamt", value: String(stats.total_workouts) },
              { label: "Aktuelle Streak", value: `${stats.current_streak} Tage` },
              { label: "Beste Streak", value: `${stats.best_streak} Tage` },
              { label: "Diese Woche", value: String(stats.workouts_this_week) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center">
                <div className="text-2xl font-bold text-indigo-400">{s.value}</div>
                <div className="mt-1 text-xs text-neutral-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-1 font-semibold text-neutral-200">Gesamtvolumen</h2>
          <p className="text-4xl font-bold text-indigo-400">
            {totalVolume.toLocaleString("de-DE")} kg
          </p>
          <p className="muted mt-1 text-sm">sets × wdh × gewicht (alle abgeschlossenen Workouts)</p>
        </div>

        <div>
          <h2 className="mb-3 font-semibold text-neutral-200">Letzte Workouts</h2>
          <div className="overflow-hidden rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-4 py-3 text-left">Datum</th>
                  <th className="px-4 py-3 text-left">Übungen</th>
                  <th className="px-4 py-3 text-left">Sätze</th>
                  <th className="px-4 py-3 text-right">Volumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                {completed.slice(0, 20).map((w) => {
                  const vol = w.workout_exercises.reduce(
                    (s, we) => s + we.sets * we.reps * (Number(we.weight) || 0), 0
                  );
                  const sets = w.workout_exercises.reduce((s, we) => s + we.sets, 0);
                  return (
                    <tr key={w.id}>
                      <td className="px-4 py-3 text-neutral-300">{w.date}</td>
                      <td className="px-4 py-3 text-neutral-300">{w.workout_exercises.length}</td>
                      <td className="px-4 py-3 text-neutral-300">{sets}</td>
                      <td className="px-4 py-3 text-right font-mono text-neutral-300">
                        {vol.toLocaleString("de-DE")} kg
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-4 text-center text-xs text-neutral-600">
          Endgültiges PDF wird vom Backend mit reportlab erzeugt · Gym Tracker
        </div>
      </div>
    </div>
  );
}
