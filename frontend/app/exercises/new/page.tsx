"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createExercise } from "@/lib/api";
import Protected from "@/components/Protected";
import { useTranslations } from "@/components/I18nProvider";

const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Arms", "Core", "Legs", "Glutes", "Cardio"];

export default function NewExercisePage() {
  return (
    <Protected>
      <NewExerciseInner />
    </Protected>
  );
}

function NewExerciseInner() {
  const t = useTranslations();
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
      setErr(e instanceof Error ? e.message : t("exerciseNew.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">{t("exerciseNew.title")}</h1>
        <Link className="btn-ghost" href="/exercises">{t("exerciseNew.back")}</Link>
      </div>

      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        {err && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>
        )}

        <div>
          <label className="label" htmlFor="exercise-name">{t("exerciseNew.name")}</label>
          <input
            id="exercise-name"
            className="input mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("exerciseNew.namePlaceholder")}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="muscle-group">{t("exercises.muscleGroup")}</label>
          <select
            id="muscle-group"
            className="input mt-2"
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value)}
            required
          >
            {MUSCLE_GROUPS.map((g) => (
              <option key={g} value={g}>{t(`muscle.${g}`)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="description">{t("exerciseNew.descriptionLabel")}</label>
          <textarea
            id="description"
            className="input min-h-[90px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("exerciseNew.descriptionPlaceholder")}
          />
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? t("exerciseNew.creating") : t("exerciseNew.create")}
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.push("/exercises")}>
            {t("exerciseNew.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
