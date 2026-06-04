"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createWorkout, getExercises, getUsers } from "@/lib/api";
import type { Exercise, User, UUID } from "@/lib/types";
import { getSelectedUser } from "@/lib/storage";
import { useTranslations } from "@/components/I18nProvider";

type Row = {
  exercise_id: UUID;
  sets: number;
  reps: number;
  weight: string;
  rest_seconds: number;
  rest_limit_seconds: number;
  order_index: number;
};

export default function NewWorkoutPage() {
  const t = useTranslations();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = getSelectedUser();
  const [userId, setUserId] = useState<string>(selected?.id ?? "");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [u, e] = await Promise.all([getUsers(), getExercises()]);
        setUsers(
          u.map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name ?? "",
            created_at: user.created_at ?? "",
          }))
        );
        setExercises(e);

        if (e.length && rows.length === 0) {
          setRows([
            {
              exercise_id: e[0].id,
              sets: 3,
              reps: 10,
              weight: "",
              rest_seconds: 30,
              rest_limit_seconds: 45,
              order_index: 0,
            },
          ]);
        }
      } catch (e: any) {
        setErr(e?.message ?? t("workoutNew.loadError"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => Boolean(userId) && Boolean(date) && rows.length > 0, [userId, date, rows.length]);

  function addRow() {
    if (exercises.length === 0) return;
    setRows((prev) => [
      ...prev,
      {
        exercise_id: exercises[0].id,
        sets: 3,
        reps: 10,
        weight: "",
        rest_seconds: 30,
        rest_limit_seconds: 45,
        order_index: prev.length,
      },
    ]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i).map((row, idx) => ({ ...row, order_index: idx })));
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setErr(null);
    try {
      await createWorkout({
        workout_date: date,
        notes: notes.trim() ? notes.trim() : undefined,
        exercises: rows.map((r, index) => ({
          exercise_id: r.exercise_id,
          sets: Number(r.sets),
          reps: Number(r.reps),
          weight: r.weight.trim() ? r.weight.trim() : null,
          rest_seconds: Number(r.rest_seconds),
          rest_limit_seconds: Number(r.rest_limit_seconds),
          order_index: index,
        })),
      });
      router.push("/workouts");
    } catch (e: any) {
      setErr(e?.message ?? t("workoutNew.createError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-600">{t("workouts.loading")}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">{t("workoutNew.title")}</h1>
        <Link className="btn-ghost" href="/workouts">{t("workoutNew.back")}</Link>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <form onSubmit={onSubmit} className="card space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">{t("workoutNew.user")}</label>
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="" disabled>{t("workoutNew.selectUser")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">{t("workoutNew.date")}</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="label">{t("workoutNew.notes")}</label>
          <textarea className="input min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="h2">{t("exercises.title")}</h2>
            <button className="btn-ghost" type="button" onClick={addRow}>{t("workoutNew.addRow")}</button>
          </div>

          {exercises.length === 0 ? (
            <p className="text-sm text-zinc-600">{t("workoutNew.noExercisesPrefix")} <Link className="underline" href="/exercises/new">{t("exercises.title")}</Link>.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="rounded-2xl border border-zinc-200 p-4">
                  <div className="grid gap-3 lg:grid-cols-7">
                    <div className="lg:col-span-2">
                      <label className="label">{t("workoutNew.exercise")}</label>
                      <select className="input" value={r.exercise_id} onChange={(e) => updateRow(i, { exercise_id: e.target.value })}>
                        {exercises.map((ex) => (
                          <option key={ex.id} value={ex.id}>{ex.name} ({t(`muscle.${ex.muscle_group}`)})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="label">{t("workoutNew.sets")}</label>
                      <input className="input" type="number" min={1} value={r.sets} onChange={(e) => updateRow(i, { sets: Number(e.target.value) })} />
                    </div>

                    <div>
                      <label className="label">{t("workoutNew.reps")}</label>
                      <input className="input" type="number" min={1} value={r.reps} onChange={(e) => updateRow(i, { reps: Number(e.target.value) })} />
                    </div>

                    <div>
                      <label className="label">{t("programs.colWeight")}</label>
                      <input className="input" type="number" step="0.5" placeholder={t("workoutNew.weightPlaceholder")} value={r.weight} onChange={(e) => updateRow(i, { weight: e.target.value })} />
                    </div>

                    <div>
                      <label className="label">{t("workoutNew.restSec")}</label>
                      <input className="input" type="number" min={0} value={r.rest_seconds} onChange={(e) => updateRow(i, { rest_seconds: Number(e.target.value) })} />
                    </div>

                    <div>
                      <label className="label">{t("workoutNew.limitSec")}</label>
                      <input className="input" type="number" min={0} value={r.rest_limit_seconds} onChange={(e) => updateRow(i, { rest_limit_seconds: Number(e.target.value) })} />
                      <button className="mt-2 text-xs text-zinc-600 hover:underline" type="button" onClick={() => removeRow(i)}>{t("programs.remove")}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" type="submit" disabled={!canSubmit || saving}>{saving ? t("programs.saving") : t("workoutNew.save")}</button>
          <button className="btn-ghost" type="button" onClick={() => router.push("/workouts")}>{t("workoutNew.cancel")}</button>
        </div>
      </form>
    </div>
  );
}
