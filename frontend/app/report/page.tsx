"use client";

import { useEffect, useRef, useState } from "react";
import Protected from "@/components/Protected";
import { getWorkouts, getUserStats, type WorkoutRead, type UserStats } from "@/lib/api";

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
  const [generating, setGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

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

  async function downloadPDF() {
    setGenerating(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas");

      const el = reportRef.current;
      if (!el) return;

      const canvas = await html2canvas(el, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.height / canvas.width;
      const imgH = pageW * ratio;

      let yOffset = 0;
      while (yOffset < imgH) {
        if (yOffset > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, -yOffset, pageW, imgH);
        yOffset += pageH;
      }

      const now = new Date().toISOString().slice(0, 10);
      pdf.save(`GymTracker-Report-${now}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  function printReport() {
    window.print();
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

  // PRs per exercise (from completed workouts only)
  const prMap: Record<string, { name: string; weight: number; date: string }> = {};
  completed.forEach((w) => {
    w.workout_exercises.forEach((we) => {
      const weight = Number(we.weight) || 0;
      const key = we.exercise_id;
      if (!prMap[key] || weight > prMap[key].weight) {
        prMap[key] = { name: key, weight, date: w.date };
      }
    });
  });

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5 print:hidden">
        <div>
          <h1 className="h1">PDF-Report</h1>
          <p className="muted mt-0.5">Trainingsübersicht als PDF exportieren</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={printReport}
          >
            🖨️ Drucken
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={downloadPDF}
            disabled={generating}
          >
            {generating ? "Wird erstellt…" : "⬇️ PDF herunterladen"}
          </button>
        </div>
      </div>

      {/* Report content */}
      <div ref={reportRef} className="space-y-6 rounded-2xl bg-neutral-950 p-8 print:bg-white print:text-black print:rounded-none print:p-0">
        {/* Header */}
        <div className="border-b border-neutral-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-3xl print:bg-indigo-100">
              🏋️
            </div>
            <div>
              <h1 className="text-3xl font-bold text-neutral-50 print:text-black">Gym Tracker</h1>
              <p className="text-neutral-400 print:text-gray-600">Trainings-Report · {monthName}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
            {[
              { label: "Workouts gesamt", value: String(stats.total_workouts) },
              { label: "Aktuelle Streak", value: `${stats.current_streak} Tage` },
              { label: "Beste Streak", value: `${stats.best_streak} Tage` },
              { label: "Diese Woche", value: String(stats.workouts_this_week) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center print:border-gray-300 print:bg-gray-50">
                <div className="text-2xl font-bold text-indigo-400 print:text-indigo-700">{s.value}</div>
                <div className="mt-1 text-xs text-neutral-500 print:text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Volume */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-1 font-semibold text-neutral-200">Gesamtvolumen</h2>
          <p className="text-4xl font-bold text-indigo-400">
            {totalVolume.toLocaleString("de-DE")} kg
          </p>
          <p className="muted mt-1 text-sm">sets × wdh × gewicht</p>
        </div>

        {/* Recent workouts */}
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

        {/* Footer */}
        <div className="border-t border-neutral-800 pt-4 text-center text-xs text-neutral-600">
          Erstellt am {now.toLocaleDateString("de-DE")} · Gym Tracker
        </div>
      </div>
    </div>
  );
}
