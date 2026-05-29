"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Protected from "@/components/Protected";
import { useToast } from "@/components/Toast";
import {
  getApiBase,
  getExercises,
  getWorkout,
  getWorkoutAnalysis,
  updateWorkout,
  type ExerciseRead,
  type WorkoutAnalysisRead,
  type WorkoutRead,
} from "@/lib/api";

function formatNum(value: number | string | null | undefined, digits = 2) {
  if (value == null || value === "") return "-";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function formatSeconds(totalSeconds: number | null | undefined) {
  if (!totalSeconds || totalSeconds <= 0) return "0m";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  if (!seconds) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export default function WorkoutDetailPage() {
  return (
    <Protected>
      <WorkoutDetailInner />
    </Protected>
  );
}

function WorkoutDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { toast } = useToast();

  const [workout, setWorkout] = useState<WorkoutRead | null>(null);
  const [exercises, setExercises] = useState<ExerciseRead[]>([]);
  const [analysis, setAnalysis] = useState<WorkoutAnalysisRead | null>(null);
  const [bodyWeightKg, setBodyWeightKg] = useState("80");
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [analysisErr, setAnalysisErr] = useState<string | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const base = useMemo(() => getApiBase(), []);

  async function loadAnalysis(weightValue?: string) {
    if (!id) return;
    setAnalysisLoading(true);
    setAnalysisErr(null);
    try {
      const parsed = Number(weightValue ?? bodyWeightKg);
      const payloadWeight = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
      const data = await getWorkoutAnalysis(id, payloadWeight);
      setAnalysis(data);
    } catch (e: unknown) {
      setAnalysisErr(e instanceof Error ? e.message : "Failed to calculate workout analysis");
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const [w, ex] = await Promise.all([getWorkout(id), getExercises()]);
      setWorkout(w);
      setExercises(ex);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load workout");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!workout?.id) return;
    loadAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id]);

  async function saveEdit() {
    if (!workout) return;
    setEditSaving(true);
    try {
      const updated = await updateWorkout(workout.id, {
        workout_date: editDate,
        notes: editNotes.trim() || null,
        exercises: workout.workout_exercises.map((we) => ({
          exercise_id: we.exercise_id,
          sets: we.sets,
          reps: we.reps,
        })),
      });
      setWorkout(updated);
      setEditing(false);
      toast("Workout updated", "success");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Failed to update", "error");
    } finally {
      setEditSaving(false);
    }
  }

  const exerciseMap = useMemo(() => new Map(exercises.map((x) => [x.id, x])), [exercises]);
  const sortedExercises = useMemo(() => {
    const list = [...(workout?.workout_exercises ?? [])];
    return list.sort((a, b) => a.order_index - b.order_index);
  }, [workout?.workout_exercises]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-neutral-800" />)}
      </div>
    );
  }

  if (err) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{err}</div>
        <Link className="btn-ghost" href="/workouts">Back</Link>
      </div>
    );
  }

  if (!workout) return null;

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="h1">Workout</h1>
            <p className="muted mt-2">
              {new Date(workout.date).toLocaleDateString()} • {sortedExercises.length} exercises
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-primary" data-testid="start-workout" href={`/workouts/${workout.id}/start`}>Start workout</Link>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setEditDate(workout.date);
                setEditNotes(workout.notes || "");
                setEditing(true);
              }}
            >
              Edit
            </button>
            <Link className="btn-ghost" href="/workouts">Back</Link>
          </div>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold">Edit workout</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-date">Date</label>
              <input
                id="edit-date"
                className="input mt-2"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="edit-notes">Notes</label>
              <input
                id="edit-notes"
                className="input mt-2"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Leg day, felt strong…"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card space-y-2 p-6">
        {workout.created_at ? (
          <p className="muted"><span className="text-neutral-200">Created:</span> {new Date(workout.created_at).toLocaleString()}</p>
        ) : null}
        {workout.notes ? <p className="muted">{workout.notes}</p> : <p className="muted">No notes</p>}
      </div>

      <div className="card p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="h2">Workout analysis</h2>
            <p className="muted mt-2">
              Estimated volume, duration, calories and fat usage based on sets, reps, weight, rest and tempo heuristics.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="body-weight">Body weight (kg)</label>
              <input
                id="body-weight"
                className="input mt-2 w-36"
                type="number"
                min={1}
                step="0.1"
                value={bodyWeightKg}
                onChange={(e) => setBodyWeightKg(e.target.value)}
              />
            </div>
            <button type="button" className="btn-ghost" onClick={() => loadAnalysis(bodyWeightKg)} disabled={analysisLoading}>
              {analysisLoading ? "Calculating…" : "Recalculate"}
            </button>
          </div>
        </div>

        {analysisErr ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{analysisErr}</div>
        ) : null}

        {analysis ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Stat label="Detected goal" value={analysis.goal} />
              <Stat label="Total volume" value={`${formatNum(analysis.total_volume_kg)} kg`} />
              <Stat label="Estimated duration" value={formatSeconds(analysis.estimated_total_seconds)} />
              <Stat label="Estimated calories" value={analysis.estimated_calories_kcal != null ? `${formatNum(analysis.estimated_calories_kcal)} kcal` : "Need body weight"} />
              <Stat label="Fat energy" value={analysis.fat_energy_share != null ? `${formatNum(Number(analysis.fat_energy_share) * 100)}%` : "-"} />
              <Stat label="Estimated fat" value={analysis.estimated_fat_burned_grams != null ? `${formatNum(analysis.estimated_fat_burned_grams)} g` : "Need body weight"} />
              <Stat label="Average weight / rep" value={`${formatNum(analysis.average_weight_per_rep_kg)} kg`} />
              <Stat label="MET estimate" value={analysis.met_value != null ? formatNum(analysis.met_value) : "-"} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Tempo formula</div>
                <div className="mt-2 text-sm text-neutral-200">
                  {analysis.concentric_seconds}s up • {analysis.pause_seconds}s pause • {analysis.eccentric_seconds}s down
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Rest structure</div>
                <div className="mt-2 text-sm text-neutral-200">
                  Recommended {analysis.recommended_rest_seconds}s • Estimated total rest {formatSeconds(analysis.estimated_rest_seconds)}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Training density</div>
                <div className="mt-2 text-sm text-neutral-200">
                  {analysis.total_sets} sets • {analysis.total_reps} reps • {analysis.total_exercises} exercises
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="card p-6">
        <h2 className="h2">Exercises</h2>
        {!sortedExercises.length ? (
          <p className="muted mt-2">No exercises recorded.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {sortedExercises.map((we, index) => {
              const exercise = exerciseMap.get(we.exercise_id);
              const imageUrl = exercise?.image_url
                ? exercise.image_url.startsWith("http")
                  ? exercise.image_url
                  : `${base}${exercise.image_url}`
                : "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=60";

              return (
                <div key={we.id} className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/70">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt={exercise?.name || `Exercise ${index + 1}`} className="h-48 w-full object-cover" />
                  <div className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{exercise?.name || `Exercise ${index + 1}`}</h3>
                        <p className="muted mt-1">{exercise?.muscle_group || "Unknown group"}</p>
                      </div>
                      <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300">#{index + 1}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Stat label="Sets" value={we.sets} />
                      <Stat label="Reps" value={we.reps} />
                      <Stat label="Weight" value={we.weight ?? "-"} />
                      <Stat label="Rest" value={`${we.rest_seconds}s / ${we.rest_limit_seconds}s`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-neutral-100">{value}</div>
    </div>
  );
}
