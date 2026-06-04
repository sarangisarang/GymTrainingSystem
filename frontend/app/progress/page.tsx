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
import { useTranslations } from "@/components/I18nProvider";
import {
  getExercises,
  getExerciseHistory,
  getExercisePrediction,
  getWorkouts,
  type ExerciseRead,
  type ExerciseHistoryEntry,
  type ExercisePrediction,
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
  const t = useTranslations();
  const [exercises, setExercises] = useState<ExerciseRead[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutRead[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [bodyWeights, setBodyWeights] = useState<BodyWeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ── Predictive Strength Engine ────────────────────────────────────────────
  const [targetInput, setTargetInput] = useState<string>("");
  const [prediction, setPrediction] = useState<ExercisePrediction | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionErr, setPredictionErr] = useState<string | null>(null);

  async function runPrediction() {
    if (!selectedId) return;
    const target = parseFloat(targetInput);
    if (!Number.isFinite(target) || target <= 0) {
      setPredictionErr(t("progress.enterTarget"));
      return;
    }
    setPredictionLoading(true);
    setPredictionErr(null);
    try {
      const p = await getExercisePrediction(selectedId, target);
      setPrediction(p);
    } catch (e: unknown) {
      setPrediction(null);
      setPredictionErr(e instanceof Error ? e.message : t("progress.predictionFailed"));
    } finally {
      setPredictionLoading(false);
    }
  }

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
        setErr(e instanceof Error ? e.message : t("progress.loadError"));
      } finally {
        setLoading(false);
      }
    })();
    setBodyWeights(readBodyWeights());
  }, []);

  // Load history whenever the selected exercise changes.
  useEffect(() => {
    setPrediction(null);
    setPredictionErr(null);
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

  // Combined chart data: historical points + a projection segment.
  // Recharts treats `connectNulls={false}` lines as: drawn only between adjacent non-null
  // points. So we seed the LAST historical point's `projection` with its weight, then
  // append a synthetic future point whose `projection = target_weight`.
  type StrengthChartPoint = {
    date: string;
    label: string;
    weight: number | null;
    projection: number | null;
  };
  const strengthChartData = useMemo<StrengthChartPoint[]>(() => {
    const base: StrengthChartPoint[] = strengthData.map((d, i) => ({
      date: d.date,
      label: d.label,
      weight: d.weight,
      projection: i === strengthData.length - 1 ? d.weight : null,
    }));
    if (
      prediction &&
      prediction.predicted_date &&
      prediction.weeks_to_target != null &&
      prediction.weeks_to_target > 0 &&
      !prediction.already_achieved &&
      base.length > 0
    ) {
      base.push({
        date: prediction.predicted_date,
        label: fmtShort(parseDate(prediction.predicted_date)),
        weight: null,
        projection: prediction.target_weight,
      });
    }
    return base;
  }, [strengthData, prediction]);

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
        <h1 className="h1">{t("progress.title")}</h1>
        <p className="muted mt-2">{t("progress.subtitle")}</p>
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
            <h2 className="h2">{t("progress.strengthCurve")}</h2>
            <p className="muted mt-1">{t("progress.strengthCurveSub")}</p>
          </div>
          <select
            className="input sm:w-64"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {exercises.length === 0 && <option value="">{t("progress.noExercises")}</option>}
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </div>

        {/* ── Prediction controls ───────────────────────────────────────────── */}
        <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label text-xs">{t("progress.predictReaching")}</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="100"
                  className="input w-28"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runPrediction();
                  }}
                />
                <span className="muted text-sm">{t("common.kg")}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={runPrediction}
              disabled={predictionLoading || !selectedId || !targetInput}
            >
              {predictionLoading ? t("progress.predicting") : t("progress.predict")}
            </button>
            {prediction && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setPrediction(null);
                  setPredictionErr(null);
                }}
              >
                {t("progress.clear")}
              </button>
            )}
          </div>

          {predictionErr && (
            <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {predictionErr}
            </div>
          )}

          {prediction && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-neutral-900/70 p-3">
                <p className="muted text-xs">{t("progress.current")}</p>
                <p className="mt-1 text-lg font-semibold">{prediction.current_weight} {t("common.kg")}</p>
                <p className="muted text-xs mt-1">{prediction.sessions} {t("progress.sessions")}</p>
              </div>
              <div className="rounded-lg bg-neutral-900/70 p-3">
                <p className="muted text-xs">{t("progress.target")}</p>
                <p className="mt-1 text-lg font-semibold">{prediction.target_weight} {t("common.kg")}</p>
                <p className="muted text-xs mt-1">
                  {prediction.slope_kg_per_week >= 0 ? "+" : ""}
                  {prediction.slope_kg_per_week} {t("progress.kgPerWeek")}
                </p>
              </div>
              <div className="rounded-lg bg-neutral-900/70 p-3 sm:col-span-2">
                {prediction.already_achieved ? (
                  <>
                    <p className="muted text-xs">{t("progress.result")}</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-400">{t("progress.alreadyAchieved")} 🎉</p>
                  </>
                ) : prediction.weeks_to_target != null && prediction.predicted_date ? (
                  <>
                    <p className="muted text-xs">{t("progress.estTimeToTarget")}</p>
                    <p className="mt-1 text-lg font-semibold">
                      ~{prediction.weeks_to_target} {t("progress.weeks")}
                    </p>
                    <p className="muted text-xs mt-1">{t("progress.around")} {prediction.predicted_date}</p>
                  </>
                ) : (
                  <>
                    <p className="muted text-xs">{t("progress.result")}</p>
                    <p className="mt-1 text-sm text-amber-300">
                      {prediction.reason === "regression"
                        ? t("progress.cannotRegression")
                        : t("progress.cannotFlat")}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {prediction && prediction.reason === "plateau" && !prediction.already_achieved && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              ⚠ <span className="font-semibold">{t("progress.plateauTitle")}</span> — {t("progress.plateauBody")}
            </div>
          )}

          {prediction && prediction.reason === "regression" && !prediction.already_achieved && (
            <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              🔻 <span className="font-semibold">{t("progress.regressionTitle")}</span> — {t("progress.regressionBody")}
            </div>
          )}
        </div>

        <div className="mt-5">
          {historyLoading ? (
            <div className="h-[300px] animate-pulse rounded-xl bg-neutral-800" />
          ) : strengthData.length === 0 ? (
            <EmptyChart message={t("progress.noWeightedSets")} />
          ) : (
            <>
              {prPoint && (
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: COLORS.pr }} />
                  <span className="muted">
                    {t("progress.prLabel")} <span className="font-semibold text-neutral-100">{prPoint.weight} {t("common.kg")}</span> {prPoint.date}
                  </span>
                </div>
              )}
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={strengthChartData} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                  <XAxis dataKey="label" stroke={COLORS.axis} fontSize={12} tickMargin={8} />
                  <YAxis stroke={COLORS.axis} fontSize={12} width={44} unit=" kg" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "#fafafa" }}
                    formatter={(value: number, name: string) => [`${value} ${t("common.kg")}`, name]}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    dot={{ r: 3, fill: COLORS.primary }}
                    activeDot={{ r: 5 }}
                    name={t("progress.weightSeries")}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="projection"
                    stroke={COLORS.primarySoft}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 3, fill: COLORS.primarySoft }}
                    name={t("progress.projection")}
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
        <h2 className="h2">{t("progress.weeklyVolume")}</h2>
        <p className="muted mt-1">{t("progress.weeklyVolumeSub")}</p>
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
                formatter={(value: number) => [`${value.toLocaleString()} ${t("common.kg")}`, t("progress.volume")]}
              />
              <Bar dataKey="volume" fill={COLORS.bar} radius={[6, 6, 0, 0]} name={t("progress.volume")} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Body-weight trend ──────────────────────────────────────────────── */}
      <section className="card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="h2">{t("progress.bodyWeightTrend")}</h2>
            <p className="muted mt-1">{t("progress.bodyWeightTrendSub")}</p>
          </div>
          <BodyWeightForm
            onAdd={(date, weight) => setBodyWeights(upsertBodyWeight(date, weight))}
          />
        </div>

        <div className="mt-5">
          {bodyWeightData.length === 0 ? (
            <EmptyChart message={t("progress.noBodyWeight")} />
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
                    formatter={(value: number) => [`${value} ${t("common.kg")}`, t("progress.bodyWeight")]}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke={COLORS.primarySoft}
                    strokeWidth={2}
                    dot={{ r: 3, fill: COLORS.primarySoft }}
                    name={t("progress.bodyWeight")}
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
                    {e.date}: {e.weight} {t("common.kg")}
                    <button
                      type="button"
                      className="text-neutral-500 hover:text-red-400"
                      onClick={() => setBodyWeights(removeBodyWeight(e.date))}
                      aria-label={`${t("progress.removeEntry")} ${e.date}`}
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
  const t = useTranslations();
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
        <label className="label text-xs">{t("progress.date")}</label>
        <input type="date" className="input mt-1 w-40" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className="label text-xs">{t("progress.weightKg")}</label>
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
        {t("progress.add")}
      </button>
    </form>
  );
}
