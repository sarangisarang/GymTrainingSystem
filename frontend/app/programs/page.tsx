"use client";

import { useEffect, useMemo, useState } from "react";
import Protected from "@/components/Protected";
import { useAuth } from "@/components/AuthProvider";
import {
  generateNextCycle,
  generateProgram,
  getExercises,
  getMyPrograms,
  getStrengthMaxes,
  saveStrengthMax,
  type ExerciseRead,
  type ProgramRead,
  type StrengthMaxRead,
} from "@/lib/api";


type Goal = "strength" | "hypertrophy" | "endurance";
type LoadMode = "TOTAL" | "PER_HAND";
type ProgressResult = "SUCCESS" | "REPEAT" | "FAIL";

type MaxRow = {
  exercise_id: string;
  one_rep_max: string;
  increment_step: string;
  load_mode: LoadMode;
  result: ProgressResult;
};

function formatNum(value: number | string | null | undefined) {
  if (value == null || value === "") return "-";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}


function formatDuration(totalSeconds: number | null | undefined) {
  if (!totalSeconds || totalSeconds <= 0) return "0m";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  if (!seconds) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export default function ProgramsPage() {
  return (
    <Protected>
      <ProgramsInner />
    </Protected>
  );
}

function ProgramsInner() {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<ExerciseRead[]>([]);
  const [maxes, setMaxes] = useState<StrengthMaxRead[]>([]);
  const [programs, setPrograms] = useState<ProgramRead[]>([]);
  const [rows, setRows] = useState<MaxRow[]>([]);
  const [goal, setGoal] = useState<Goal>("strength");
  const [trainingDays, setTrainingDays] = useState(3);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const [exerciseData, maxData, programData] = await Promise.all([
        getExercises(),
        getStrengthMaxes(),
        getMyPrograms(),
      ]);
      setExercises(exerciseData);
      setMaxes(maxData);
      setPrograms(programData);

      if (maxData.length > 0) {
        setRows(
          maxData.map((m) => ({
            exercise_id: m.exercise_id,
            one_rep_max: String(m.one_rep_max),
            increment_step: String(m.increment_step),
            load_mode: (m.load_mode as LoadMode) || "TOTAL",
            result: "SUCCESS",
          }))
        );
      } else if (exerciseData.length > 0) {
        setRows([
          {
            exercise_id: exerciseData[0].id,
            one_rep_max: "",
            increment_step: "2.5",
            load_mode: "TOTAL",
            result: "SUCCESS",
          },
        ]);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load programs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.id) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const exName = useMemo(() => {
    const map = new Map(exercises.map((x) => [x.id, x.name]));
    return (exerciseId: string) => map.get(exerciseId) || exerciseId.slice(0, 8) + "…";
  }, [exercises]);

  const latestProgram = programs[0] || null;

  const groupedByWeek = useMemo(() => {
    if (!latestProgram) return [] as Array<{ week: number; items: ProgramRead["items"] }>;
    const map = new Map<number, ProgramRead["items"]>();
    for (const item of latestProgram.items || []) {
      const arr = map.get(item.week_number) || [];
      arr.push(item);
      map.set(item.week_number, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, items]) => ({
        week,
        items: [...items].sort((a, b) => a.day_number - b.day_number || a.exercise_id.localeCompare(b.exercise_id)),
      }));
  }, [latestProgram]);

  function addRow() {
    if (!exercises.length) return;
    setRows((prev) => [
      ...prev,
      {
        exercise_id: exercises[0].id,
        one_rep_max: "",
        increment_step: "2.5",
        load_mode: "TOTAL",
        result: "SUCCESS",
      },
    ]);
  }

  function updateRow(index: number, patch: Partial<MaxRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function persistMaxes() {
    const validRows = rows.filter((r) => r.exercise_id && Number(r.one_rep_max) > 0);
    if (validRows.length === 0) {
      throw new Error("Please add at least one valid exercise max.");
    }
    for (const row of validRows) {
      await saveStrengthMax({
        exercise_id: row.exercise_id,
        one_rep_max: Number(row.one_rep_max),
        increment_step: Number(row.increment_step || 2.5),
        load_mode: row.load_mode,
      });
    }
    return validRows;
  }

  async function onSaveMaxes() {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      await persistMaxes();
      setOk("Max values saved.");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Failed to save max values");
    } finally {
      setSaving(false);
    }
  }

  async function onGenerateProgram() {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const validRows = await persistMaxes();
      await generateProgram({
        goal,
        start_date: startDate,
        training_days_per_week: trainingDays,
        exercise_ids: validRows.map((x) => x.exercise_id),
      });
      setOk("4-week plan generated successfully.");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Failed to generate program");
    } finally {
      setSaving(false);
    }
  }

  async function onGenerateNextCycle() {
    if (!latestProgram) return;
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const validRows = await persistMaxes();
      await generateNextCycle(latestProgram.id, {
        start_date: startDate,
        goal,
        training_days_per_week: trainingDays,
        adjustments: validRows.map((row) => ({
          exercise_id: row.exercise_id,
          result: row.result,
        })),
      });
      setOk("Next cycle generated successfully.");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Failed to generate next cycle");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="h1">📈 Smart Programs</h1>
            <p className="muted mt-2">
              Save one-rep max values, generate a 4-week plan, and include percentages, rest times, tempo and duration formulas automatically.
            </p>
          </div>
          <button className="btn-ghost" type="button" onClick={loadAll}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {err ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{err}</div> : null}
      {ok ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">{ok}</div> : null}

      <div className="card p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Goal</label>
            <select className="input" value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
              <option value="strength">Strength</option>
              <option value="hypertrophy">Hypertrophy</option>
              <option value="endurance">Endurance</option>
            </select>
          </div>
          <div>
            <label className="label">Training days / week</label>
            <input
              className="input"
              type="number"
              min={1}
              max={7}
              value={trainingDays}
              onChange={(e) => setTrainingDays(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Cycle start date</label>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="h2">Exercise maxes</h2>
            <button className="btn-ghost" type="button" onClick={addRow}>+ Add</button>
          </div>

          {rows.length === 0 ? <p className="muted">No rows yet.</p> : null}

          {rows.map((row, index) => (
            <div key={index} className="rounded-2xl border border-neutral-800 p-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div>
                  <label className="label">Exercise</label>
                  <select
                    className="input"
                    value={row.exercise_id}
                    onChange={(e) => updateRow(index, { exercise_id: e.target.value })}
                  >
                    {exercises.map((exercise) => (
                      <option key={exercise.id} value={exercise.id}>
                        {exercise.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">1RM / Max</label>
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    value={row.one_rep_max}
                    onChange={(e) => updateRow(index, { one_rep_max: e.target.value })}
                    placeholder="100"
                  />
                </div>
                <div>
                  <label className="label">Increment</label>
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    value={row.increment_step}
                    onChange={(e) => updateRow(index, { increment_step: e.target.value })}
                    placeholder="2.5"
                  />
                </div>
                <div>
                  <label className="label">Load mode</label>
                  <select
                    className="input"
                    value={row.load_mode}
                    onChange={(e) => updateRow(index, { load_mode: e.target.value as LoadMode })}
                  >
                    <option value="TOTAL">Total weight</option>
                    <option value="PER_HAND">Per hand / dumbbell</option>
                  </select>
                </div>
                <div>
                  <label className="label">Next cycle result</label>
                  <select
                    className="input"
                    value={row.result}
                    onChange={(e) => updateRow(index, { result: e.target.value as ProgressResult })}
                  >
                    <option value="SUCCESS">Completed well</option>
                    <option value="REPEAT">Repeat same max</option>
                    <option value="FAIL">Too hard / failed</option>
                  </select>
                  <button className="mt-2 text-xs text-neutral-400 hover:underline" type="button" onClick={() => removeRow(index)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" type="button" onClick={onSaveMaxes} disabled={saving}>
            {saving ? "Saving…" : "Save maxes"}
          </button>
          <button className="btn-primary" type="button" onClick={onGenerateProgram} disabled={saving}>
            Generate 4-week program
          </button>
          <button className="btn-ghost" type="button" onClick={onGenerateNextCycle} disabled={saving || !latestProgram}>
            Generate next cycle
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="h2">Saved max values</h2>
          {maxes.length === 0 ? (
            <p className="muted mt-3">No maxes saved yet.</p>
          ) : (
            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-neutral-400">
                  <tr>
                    <th className="py-2">Exercise</th>
                    <th className="py-2">1RM</th>
                    <th className="py-2">Training max</th>
                    <th className="py-2">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {maxes.map((max) => (
                    <tr key={max.id} className="border-t border-neutral-800">
                      <td className="py-2">{exName(max.exercise_id)}</td>
                      <td className="py-2">{formatNum(max.one_rep_max)} kg</td>
                      <td className="py-2">{formatNum(max.training_max)} kg</td>
                      <td className="py-2">{max.load_mode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="h2">Generated cycles</h2>
          {programs.length === 0 ? (
            <p className="muted mt-3">No programs generated yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {programs.slice(0, 5).map((program) => (
                <div key={program.id} className="rounded-2xl border border-neutral-800 p-4 text-sm">
                  <p className="font-medium capitalize">{program.goal}</p>
                  <p className="muted mt-1">
                    {program.start_date} → {program.end_date}
                  </p>
                  <p className="muted mt-1">{program.items.length} prescriptions</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="h2">Latest program preview</h2>
            {latestProgram ? (
              <p className="muted mt-2 capitalize">
                {latestProgram.goal} • {latestProgram.start_date} → {latestProgram.end_date}
              </p>
            ) : (
              <p className="muted mt-2">Generate a program to see the schedule.</p>
            )}
          </div>
        </div>

        {latestProgram ? (
          <div className="mt-6 space-y-6">
            {groupedByWeek.map((group) => (
              <div key={group.week}>
                <h3 className="text-lg font-semibold">Week {group.week}</h3>
                <div className="mt-3 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-neutral-400">
                      <tr>
                        <th className="py-2">Day</th>
                        <th className="py-2">Exercise</th>
                        <th className="py-2">Sets</th>
                        <th className="py-2">Reps</th>
                        <th className="py-2">%</th>
                        <th className="py-2">Weight</th>
                        <th className="py-2">Rest</th>
                        <th className="py-2">Tempo</th>
                        <th className="py-2">Duration</th>
                        <th className="py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr key={item.id} className="border-t border-neutral-800 align-top">
                          <td className="py-2">Day {item.day_number}</td>
                          <td className="py-2 font-medium">{exName(item.exercise_id)}</td>
                          <td className="py-2">{item.sets}</td>
                          <td className="py-2">{item.reps}</td>
                          <td className="py-2">{formatNum(item.percentage)}%</td>
                          <td className="py-2">
                            {item.weight_per_hand != null
                              ? `${formatNum(item.weight_per_hand)} kg / hand (${formatNum(item.total_weight)} kg total)`
                              : `${formatNum(item.total_weight ?? item.calculated_weight)} kg`}
                          </td>
                          <td className="py-2">{item.rest_seconds}s</td>
                          <td className="py-2 whitespace-nowrap">
                            {item.concentric_seconds}-{item.pause_seconds}-{item.eccentric_seconds}
                          </td>
                          <td className="py-2 whitespace-nowrap">
                            {formatDuration(item.estimated_set_duration_seconds)} / set
                            <div className="text-xs text-neutral-500">{formatDuration(item.estimated_total_duration_seconds)} total</div>
                          </td>
                          <td className="py-2 text-neutral-400">{item.notes || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
