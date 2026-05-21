"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createExercise } from "@/lib/api";
import Protected from "@/components/Protected";

const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Arms", "Core", "Legs", "Glutes", "Cardio"];

export default function NewExercisePage() {
  return (
    <Protected>
      <NewExerciseInner />
    </Protected>
  );
}

function NewExerciseInner() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState(MUSCLE_GROUPS[0]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      await createExercise({
        name: name.trim(),
        muscle_group: muscleGroup,
        description: description.trim() || undefined,
      });
      router.push("/exercises");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create exercise");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">Create exercise</h1>
        <Link className="btn-ghost" href="/exercises">Back</Link>
      </div>

      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        {err && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>
        )}

        <div>
          <label className="label" htmlFor="exercise-name">Name</label>
          <input
            id="exercise-name"
            className="input mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bench Press"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="muscle-group">Muscle group</label>
          <select
            id="muscle-group"
            className="input mt-2"
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value)}
            required
          >
            {MUSCLE_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="description">Description (optional)</label>
          <textarea
            id="description"
            className="input min-h-[90px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the exercise, muscles worked, tips..."
          />
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.push("/exercises")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
