"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceDot,
} from "recharts";
import Protected from "@/components/Protected";
import {
  getExercises,
  getExerciseHistory,
  getWorkouts,
  type ExerciseRead,
  type ExerciseHistoryEntry,
  type WorkoutRead,
} from "@/lib/api";
import {
  readBodyWeights,
  upsertBodyWeight,
  removeBodyWeight,
  type BodyWeightEntry,
} from "@/lib/bodyweight";

const COLORS = {
  primary: "#6366f1", // indigo-500
  primarySoft: "#818cf8", // indigo-400
  pr: "#fbbf24", // amber-400
  grid: "#262626", // neutral-800
  axis: "#a3a3a3", // neutral-400
  bar: "#6366f1",
};

const tooltipStyle = {
  backgroundColor: "#171717",
  border: "1px solid #404040",
  borderRadius: "0.75rem",
  fontSize: "0.8rem",
} as const;

// ── date helpers (local-time, TZ-safe keys) ──────────────────────────────────

function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mondayOf(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay() || 7; // Sunday → 7
  out.setDate(out.getDate() - day + 1);
  out.setHours(0, 0, 0, 0);
  return out;
}

export default function ProgressPage() {
  return (
    <Protected>
      <ProgressInner />
    </Protected>
  );
}

function ProgressInner() {
  const [exercises, setExercises] = useState<ExerciseRead[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutRead[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [bodyWeights, setBodyWeights] = useState<BodyWeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Initial load: exercises (for selector) + workouts (for weekly volume).
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [ex, wo] = await Promise.all([
          getExercises(),
          getWorkouts({ limit: 100 }),
        ]);
        setExercises(ex);
        setWorkouts(wo);
        if (ex.length > 0) setSelectedId(ex[0].id);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load progress data");
      } finally {
        setLoading(false);
      }
    })();
    setBodyWeights(readBodyWeights());
  }, []);

  // Load history whenever the selected exercise changes.
  useEffect(() => {
    if (!selectedId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const h = await getExerciseHistory(selectedId);
        if (!cancelled) setHistory(h);
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // ── Strength curve data (weight over time) with PR marker ──────────────────
  const strengthData = useMemo(() => {
    const data = history
      .filter((h) => h.weight != null && parseFloat(h.weight) > 0)
      .map((h) => ({
        date: h.date,
        label: fmtShort(parseDate(h.date)),
        weight: parseFloat(h.weight as string),
        volume: parseFloat(h.volume_kg || "0"),
      }));
    return data;
  }, [history]);

  const prPoint = useMemo(() => {
    if (strengthData.length === 0) return null;
    return strengthData.reduce((best, d) => (d.weight > best.weight ? d : best), strengthData[0]);
  }, [strengthData]);

  // ── Weekly volume data (last 8 weeks, zero-filled) ─────────────────────────
  const weeklyVolume = useMemo(() => {
    const WEEKS = 8;
    const byWeek = new Map<string, number>();
    for (const w of workouts) {
      let vol = 0;
      for (const we of w.workout_exercises) {
        const weight = we.weight != null ? parseFloat(String(we.weight)) : 0;
        if (Number.isFinite(weight)) vol += weight * we.sets * we.reps;
      }
      const key = ymd(mondayOf(parseDate(w.date)));
      byWeek.set(key, (byWeek.get(key) || 0) + vol);
    }
    const curMonday = mondayOf(new Date());
    const result: { week: string; volume: number }[] = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const m = new Date(curMonday);
      m.setDate(m.getDate() - i * 7);
      result.push({ week: fmtShort(m), volume: Math.round(byWeek.get(ymd(m)) || 0) });
    }
    return result;
  }, [workouts]);

  // ── Body-weight trend data ─────────────────────────────────────────────────
  const bodyWeightData = useMemo(
    () => bodyWeights.map((e) => ({ label: fmtShort(parseDate(e.date)), date: e.date, weight: e.weight })),
    [bodyWeights]
  );

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 rounded-2xl bg-neutral-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="card p-6">
        <h1 className="h1">Progress</h1>
        <p className="muted mt-2">Visualize your strength, training volume and body-weight trends over time.</p>
        {err && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        )}
      </div>

      {/* ── Strength curve ─────────────────────────────────────────────────── */}
      <section className="card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="h2">Strength curve</h2>
            <p className="muted mt-1">Top weight lifted per session, with your personal record highlighted.</p>
          </div>
          <select
            className="input sm:w-64"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {exercises.length === 0 && <option value="">No exercises</option>}
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          {historyLoading ? (
            <div className="h-[300px] animate-pulse rounded-xl bg-neutral-800" />
          ) : strengthData.length === 0 ? (
            <EmptyChart message="No weighted sets logged for this exercise yet." />
          ) : (
            <>
              {prPoint && (
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: COLORS.pr }} />
                  <span className="muted">
                    Personal Record: <span className="font-semibold text-neutral-100">{prPoint.weight} kg</span> on {prPoint.date}
                  </span>
                </div>
              )}
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={strengthData} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                  <XAxis dataKey="label" stroke={COLORS.axis} fontSize={12} tickMargin={8} />
                  <YAxis stroke={COLORS.axis} fontSize={12} width={44} unit=" kg" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "#fafafa" }}
                    formatter={(value: number) => [`${value} kg`, "Weight"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    dot={{ r: 3, fill: COLORS.primary }}
                    activeDot={{ r: 5 }}
                    name="Weight"
                    isAnimationActive={false}
                  />
                  {prPoint && (
                    <ReferenceDot
                      x={prPoint.label}
                      y={prPoint.weight}
                      r={7}
                      fill={COLORS.pr}
                      stroke="#000"
                      strokeWidth={1}
                      label={{ value: "PR", position: "top", fill: COLORS.pr, fontSize: 12, fontWeight: 700 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </section>

      {/* ── Weekly volume ──────────────────────────────────────────────────── */}
      <section className="card p-6">
        <h2 className="h2">Weekly volume</h2>
        <p className="muted mt-1">Total weight moved per week (sets × reps × weight), last 8 weeks.</p>
        <div className="mt-5">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyVolume} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="week" stroke={COLORS.axis} fontSize={12} tickMargin={8} />
              <YAxis stroke={COLORS.axis} fontSize={12} width={52} unit=" kg" />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#fafafa" }}
                cursor={{ fill: "rgba(99,102,241,0.1)" }}
                formatter={(value: number) => [`${value.toLocaleString()} kg`, "Volume"]}
              />
              <Bar dataKey="volume" fill={COLORS.bar} radius={[6, 6, 0, 0]} name="Volume" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Body-weight trend ──────────────────────────────────────────────── */}
      <section className="card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="h2">Body-weight trend</h2>
            <p className="muted mt-1">Log your body weight to track it over time (stored on this device).</p>
          </div>
          <BodyWeightForm
            onAdd={(date, weight) => setBodyWeights(upsertBodyWeight(date, weight))}
          />
        </div>

        <div className="mt-5">
          {bodyWeightData.length === 0 ? (
            <EmptyChart message="No body-weight entries yet. Add one above to start your trend." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={bodyWeightData} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                  <XAxis dataKey="label" stroke={COLORS.axis} fontSize={12} tickMargin={8} />
                  <YAxis stroke={COLORS.axis} fontSize={12} width={44} unit=" kg" domain={["dataMin - 2", "dataMax + 2"]} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "#fafafa" }}
                    formatter={(value: number) => [`${value} kg`, "Body weight"]}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke={COLORS.primarySoft}
                    strokeWidth={2}
                    dot={{ r: 3, fill: COLORS.primarySoft }}
                    name="Body weight"
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>

              <div className="mt-4 flex flex-wrap gap-2">
                {[...bodyWeights].reverse().map((e) => (
                  <span
                    key={e.date}
                    className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs"
                  >
                    {e.date}: {e.weight} kg
                    <button
                      type="button"
                      className="text-neutral-500 hover:text-red-400"
                      onClick={() => setBodyWeights(removeBodyWeight(e.date))}
                      aria-label={`Remove entry for ${e.date}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-neutral-800 text-center">
      <p className="muted max-w-xs px-4">{message}</p>
    </div>
  );
}

function BodyWeightForm({ onAdd }: { onAdd: (date: string, weight: number) => void }) {
  const today = ymd(new Date());
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const w = parseFloat(weight);
    if (!date || !Number.isFinite(w) || w <= 0) return;
    onAdd(date, Math.round(w * 10) / 10);
    setWeight("");
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label text-xs">Date</label>
        <input type="date" className="input mt-1 w-40" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className="label text-xs">Weight (kg)</label>
        <input
          type="number"
          step="0.1"
          min="0"
          placeholder="75.0"
          className="input mt-1 w-28"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-primary">
        Add
      </button>
    </form>
  );
}
