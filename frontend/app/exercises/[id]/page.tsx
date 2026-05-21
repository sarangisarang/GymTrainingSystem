"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Protected from "@/components/Protected";
import { getExercise, getExerciseHistory, type ExerciseRead, type ExerciseHistoryEntry } from "@/lib/api";

export default function ExerciseDetailPage() {
  return (
    <Protected>
      <ExerciseDetail />
    </Protected>
  );
}

function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const [exercise, setExercise] = useState<ExerciseRead | null>(null);
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [ex, hist] = await Promise.all([getExercise(id), getExerciseHistory(id)]);
        setExercise(ex);
        setHistory(hist);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-neutral-800" />)}
      </div>
    );
  }

  if (err) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-400">{err}</p>
        <Link href="/exercises" className="btn-ghost mt-4 inline-block">Back to exercises</Link>
      </div>
    );
  }

  if (!exercise) return null;

  const maxWeightEntry = history.reduce<ExerciseHistoryEntry | null>((best, e) => {
    if (!e.weight) return best;
    if (!best?.weight) return e;
    return parseFloat(e.weight) > parseFloat(best.weight) ? e : best;
  }, null);

  const totalVolume = history.reduce((sum, e) => sum + parseFloat(e.volume_kg || "0"), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          {exercise.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={exercise.image_url.startsWith("/") ? `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}${exercise.image_url}` : exercise.image_url}
              alt={exercise.name}
              className="h-20 w-20 rounded-xl object-cover"
            />
          )}
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-indigo-400">{exercise.muscle_group}</p>
            <h1 className="h1 mt-1">{exercise.name}</h1>
            {exercise.description && <p className="muted mt-2">{exercise.description}</p>}
          </div>
        </div>
      </div>

      {/* PR summary */}
      {history.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="muted text-xs">Personal Record</p>
            <p className="mt-1 text-2xl font-semibold">
              {maxWeightEntry?.weight ? `${maxWeightEntry.weight} kg` : "—"}
            </p>
            {maxWeightEntry && <p className="muted text-xs mt-1">{maxWeightEntry.date}</p>}
          </div>
          <div className="card p-5">
            <p className="muted text-xs">Total sessions</p>
            <p className="mt-1 text-2xl font-semibold">{history.length}</p>
          </div>
          <div className="card p-5">
            <p className="muted text-xs">Total volume</p>
            <p className="mt-1 text-2xl font-semibold">{totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg</p>
          </div>
        </div>
      )}

      {/* History table */}
      <div>
        <h2 className="mb-3 font-semibold">History</h2>
        {history.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="muted">This exercise hasn't been logged in any workout yet.</p>
            <Link href="/cart" className="btn-primary mt-4 inline-block">Start a workout</Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left">
                  <th className="px-4 py-3 text-neutral-400 font-medium">Date</th>
                  <th className="px-4 py-3 text-neutral-400 font-medium">Sets</th>
                  <th className="px-4 py-3 text-neutral-400 font-medium">Reps</th>
                  <th className="px-4 py-3 text-neutral-400 font-medium">Weight</th>
                  <th className="px-4 py-3 text-neutral-400 font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((entry, i) => {
                  const isPR = entry === maxWeightEntry;
                  return (
                    <tr
                      key={i}
                      className={[
                        "border-b border-neutral-800/50 last:border-0",
                        isPR && "bg-indigo-500/10",
                      ].filter(Boolean).join(" ")}
                    >
                      <td className="px-4 py-3">
                        {entry.date}
                        {isPR && (
                          <span className="ml-2 rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs text-white">PR</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{entry.sets}</td>
                      <td className="px-4 py-3">{entry.reps}</td>
                      <td className="px-4 py-3">{entry.weight ? `${entry.weight} kg` : "—"}</td>
                      <td className="px-4 py-3">{parseFloat(entry.volume_kg).toLocaleString()} kg</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Link href="/exercises" className="btn-ghost inline-block">← Back to exercises</Link>
    </div>
  );
}
