"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/Protected";
import { useToast } from "@/components/Toast";
import { useTranslations } from "@/components/I18nProvider";
import {
  getApiBase,
  getExercises,
  getNewPrsForWorkout,
  getWorkout,
  updateWorkoutStatus,
  type ExerciseRead,
  type WorkoutExerciseRead,
} from "@/lib/api";
import { fireCelebration } from "@/lib/confetti";

type TimerState = "IDLE" | "RUNNING" | "PAUSED";

export default function WorkoutStartPage() {
  return (
      <Protected>
        <WorkoutPlayerInner />
      </Protected>
  );
}

function WorkoutPlayerInner() {
  const t = useTranslations();
  const params = useParams<{ id: string }>();
  const workoutId = params.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseRead[]>([]);
  const [exerciseMap, setExerciseMap] = useState<Map<string, ExerciseRead>>(new Map());

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);

  // Timer activo del ejercicio
  const [trainingElapsed, setTrainingElapsed] = useState(0);

  // Timer de descanso
  const [restElapsed, setRestElapsed] = useState(0);

  // Timer total del workout
  const [totalElapsed, setTotalElapsed] = useState(0);

  const [trainingTimerState, setTrainingTimerState] = useState<TimerState>("IDLE");
  const [restTimerState, setRestTimerState] = useState<TimerState>("IDLE");

  const base = useMemo(() => getApiBase(), []);
  const { toast } = useToast();
  const completingRef = useRef(false);
  const stopCelebrationRef = useRef<(() => void) | null>(null);

  // Stop any in-flight confetti when the user navigates away mid-celebration.
  useEffect(() => () => {
    stopCelebrationRef.current?.();
    stopCelebrationRef.current = null;
  }, []);

  async function completeAndCelebrate(elapsedMs: number) {
    if (completingRef.current) return; // guard against double-click on finish
    completingRef.current = true;
    try {
      try {
        await updateWorkoutStatus(workoutId, "COMPLETED", elapsedMs);
      } catch {
        return;
      }
      let prs;
      try {
        prs = await getNewPrsForWorkout(workoutId);
      } catch {
        return;
      }
      if (!prs.length) return;

      // Confetti and toasts are independent celebration channels: clicking a
      // toast dismisses just that toast; confetti runs its 5-second course
      // (or is cleared on page unmount).
      stopCelebrationRef.current?.();
      stopCelebrationRef.current = fireCelebration({ durationMs: 5000 });

      const visible = prs.slice(0, 3);
      visible.forEach((pr) => {
        const delta = pr.previous_max_kg == null
          ? `${pr.weight_kg} kg`
          : `+${pr.delta_kg} kg`;
        toast(`🎉 ${t("workoutPlayer.newPr")} ${delta} ${pr.exercise_name}`, {
          type: "success",
          durationMs: 5000,
        });
      });
      if (prs.length > visible.length) {
        toast(`+ ${prs.length - visible.length} ${t("workoutPlayer.morePrs")}`, {
          type: "success",
          durationMs: 5000,
        });
      }
    } finally {
      // Releasing the guard slightly after the celebration starts is enough —
      // we don't want it locked forever in case of partial failure.
      setTimeout(() => { completingRef.current = false; }, 1000);
    }
  }

  function beep(freq = 880, dur = 0.15) {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {}
  }
  const totalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [workout, exercises] = await Promise.all([
          getWorkout(workoutId),
          getExercises(),
        ]);

        const sorted = [...(workout.workout_exercises ?? [])].sort(
            (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
        );

        setWorkoutExercises(sorted);
        setExerciseMap(new Map(exercises.map((exercise) => [exercise.id, exercise])));

        // Reload of an already-finished workout: jump straight to the finished
        // view so the user doesn't see "Ready to start?" for completed work
        // and can't accidentally re-trigger the celebration by clicking Start.
        if (workout.status === "COMPLETED") {
          setFinished(true);
          setStarted(true);
          if (workout.duration_seconds) setTotalElapsed(workout.duration_seconds);
        }
      } catch (e: any) {
        setErr(e?.message ?? t("workoutPlayer.loadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [workoutId]);

  useEffect(() => {
    if (!started || finished) return;

    totalTimerRef.current = setInterval(() => {
      setTotalElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      if (totalTimerRef.current) clearInterval(totalTimerRef.current);
    };
  }, [started, finished]);

  useEffect(() => {
    if (!started || finished || trainingTimerState !== "RUNNING") return;

    const interval = setInterval(() => {
      setTrainingElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [started, finished, trainingTimerState]);

  useEffect(() => {
    if (!started || finished || restTimerState !== "RUNNING") return;

    const interval = setInterval(() => {
      setRestElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [started, finished, restTimerState]);

  const current = workoutExercises[currentExerciseIndex];
  const currentExercise = current ? exerciseMap.get(current.exercise_id) : undefined;

  const currentImage = currentExercise?.image_url
      ? currentExercise.image_url.startsWith("http")
          ? currentExercise.image_url
          : `${base}${currentExercise.image_url}`
      : "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=60";

  function startWorkout() {
    // Kill any in-flight confetti from a prior completion before the new
    // training UI takes over — otherwise particles keep rendering over the
    // fresh workout.
    stopCelebrationRef.current?.();
    stopCelebrationRef.current = null;

    setStarted(true);
    setFinished(false);
    setCurrentExerciseIndex(0);
    setCurrentSet(1);

    setTrainingElapsed(0);
    setRestElapsed(0);
    setTotalElapsed(0);

    setTrainingTimerState("RUNNING");
    setRestTimerState("IDLE");

    updateWorkoutStatus(workoutId, "IN_PROGRESS").catch(() => {});
  }

  // ---------- Training timer controls ----------
  function startTraining() {
    setTrainingTimerState("RUNNING");
    setRestTimerState("IDLE");
  }

  function pauseTraining() {
    setTrainingTimerState("PAUSED");
  }

  function resumeTraining() {
    setTrainingTimerState("RUNNING");
  }

  function resetTraining() {
    setTrainingElapsed(0);
    setTrainingTimerState("IDLE");
  }

  // ---------- Rest timer controls ----------
  function startRest() {
    setRestElapsed(0);
    setRestTimerState("RUNNING");
    setTrainingTimerState("PAUSED");
    beep(660, 0.1);
  }

  function pauseRest() {
    setRestTimerState("PAUSED");
  }

  function resumeRest() {
    setRestTimerState("RUNNING");
  }

  function resetRest() {
    setRestElapsed(0);
    setRestTimerState("IDLE");
  }

  // ---------- Flow ----------
  function finishCurrentSet() {
    if (!current) return;

    // Noch Sätze übrig → Training stoppen, Pause starten
    if (currentSet < current.sets) {
      setTrainingTimerState("IDLE");
      setTrainingElapsed(0);
      setCurrentSet((prev) => prev + 1);
      setRestElapsed(0);
      setRestTimerState("RUNNING");
      beep(660, 0.1);
      return;
    }

    // Übung fertig → Pause, dann nächste Übung
    if (currentExerciseIndex < workoutExercises.length - 1) {
      setTrainingTimerState("IDLE");
      setTrainingElapsed(0);
      setRestElapsed(0);
      setRestTimerState("RUNNING");
      beep(880, 0.2);
      // nach Pause zur nächsten Übung
      const restDuration = (current.rest_limit_seconds || current.rest_seconds || 60) * 1000;
      setTimeout(() => {
        setCurrentExerciseIndex((prev) => prev + 1);
        setCurrentSet(1);
        setRestTimerState("IDLE");
        setTrainingTimerState("RUNNING");
      }, restDuration);
      return;
    }

    // Workout abgeschlossen
    beep(880, 0.15);
    setTimeout(() => beep(1100, 0.25), 200);
    setFinished(true);
    setTrainingTimerState("IDLE");
    setRestTimerState("IDLE");
    completeAndCelebrate(totalElapsed);
  }

  function skipToNextExercise() {
    if (currentExerciseIndex < workoutExercises.length - 1) {
      setCurrentExerciseIndex((prev) => prev + 1);
      setCurrentSet(1);

      setTrainingElapsed(0);
      setRestElapsed(0);

      setTrainingTimerState("RUNNING");
      setRestTimerState("IDLE");
      return;
    }

    setFinished(true);
    setTrainingTimerState("IDLE");
    setRestTimerState("IDLE");
    completeAndCelebrate(totalElapsed);
  }

  if (loading) return <p className="muted">{t("workouts.loading")}</p>;

  if (err) {
    return (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {err}
          </div>
          <Link className="btn-ghost" href={`/workouts/${workoutId}`}>
            {t("workoutPlayer.back")}
          </Link>
        </div>
    );
  }

  if (!workoutExercises.length) {
    return (
        <div className="card p-6">
          <p className="muted">{t("workoutPlayer.noExercises")}</p>
        </div>
    );
  }

  if (!started) {
    return (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="card p-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600/20 text-4xl">
              ▶
            </div>
            <h1 className="h1">{t("workoutPlayer.readyTitle")}</h1>
            <p className="muted mt-3">
              {t("workoutPlayer.readyCountPrefix")} {workoutExercises.length} {t("common.exercises")}.
              {" "}{t("workoutPlayer.readyBody")}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className="btn-primary" type="button" onClick={startWorkout}>
                {t("workoutPlayer.startWorkout")}
              </button>
              <Link className="btn-ghost" href={`/workouts/${workoutId}`}>
                {t("workoutPlayer.backToDetails")}
              </Link>
            </div>
          </div>
        </div>
    );
  }

  if (!current || finished) {
    return (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="card p-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-600/20 text-4xl">
              ✓
            </div>
            <h1 className="h1">{t("workoutPlayer.finishedTitle")}</h1>
            <p className="muted mt-3">{t("workoutPlayer.totalTime")}: {formatSeconds(totalElapsed)}</p>

            <div className="mt-2 text-sm text-neutral-400">
              <p>{t("workoutPlayer.finishedTrainingNote")}</p>
              <p>{t("workoutPlayer.finishedRestNote")}</p>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className="btn-primary" type="button" onClick={startWorkout}>
                {t("workoutPlayer.restartWorkout")}
              </button>
              <Link className="btn-ghost" href={`/workouts/${workoutId}`}>
                {t("workoutPlayer.backToDetails")}
              </Link>
            </div>
          </div>
        </div>
    );
  }

  const recommended = current.rest_seconds ?? 30;
  const limit = current.rest_limit_seconds ?? 45;

  const restColorClasses = timerColor(restElapsed, recommended, limit);

  const trainingColorClasses =
      trainingTimerState === "RUNNING"
          ? "border-blue-500/30 bg-blue-500/10 text-blue-100"
          : trainingTimerState === "PAUSED"
              ? "border-neutral-700 bg-neutral-900/80 text-neutral-200"
              : "border-indigo-500/30 bg-indigo-500/10 text-indigo-100";

  const recommendedLeft = Math.max(recommended - restElapsed, 0);
  const overLimitBy = Math.max(restElapsed - limit, 0);
  const restStatusText = getRestStatusText(t, restElapsed, recommended, limit);

  return (
      <div className="space-y-6">
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="h1">{t("workoutPlayer.title")}</h1>
              <p className="muted mt-2">
                {t("workoutPlayer.exerciseLabel")} {currentExerciseIndex + 1} {t("workoutPlayer.of")} {workoutExercises.length} • {t("workoutPlayer.setLabel")} {currentSet} {t("workoutPlayer.of")} {current.sets}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-right">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                {t("workoutPlayer.totalWorkoutTime")}
              </div>
              <div className="text-xl font-semibold text-neutral-100">
                {formatSeconds(totalElapsed)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={currentImage}
                alt={currentExercise?.name || t("workoutPlayer.exerciseImageAlt")}
                className="h-[360px] w-full object-cover"
            />

            <div className="space-y-4 p-6">
              <div>
                <h2 className="text-2xl font-semibold">
                  {currentExercise?.name || t("workoutPlayer.exerciseFallback")}
                </h2>
                <p className="muted mt-2">
                  {currentExercise?.muscle_group || t("workoutPlayer.unknownMuscleGroup")}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MiniCard label={t("workoutPlayer.sets")} value={`${currentSet} / ${current.sets}`} />
                <MiniCard label={t("workoutPlayer.reps")} value={current.reps} />
                <MiniCard label={t("workoutPlayer.weight")} value={current.weight ?? t("workoutPlayer.bodyweight")} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={`rounded-3xl border p-6 transition ${trainingColorClasses}`}>
              <div className="text-xs uppercase tracking-wide opacity-80">
                {t("workoutPlayer.trainingTimer")}
              </div>
              <div className="mt-3 text-5xl font-bold tabular-nums">
                {formatSeconds(trainingElapsed)}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniCard label={t("workoutPlayer.exerciseLabel")} value={currentExercise?.name || t("workoutPlayer.exerciseFallback")} muted />
                <MiniCard label={t("workoutPlayer.status")} value={t(`workoutPlayer.timerState.${trainingTimerState}`)} muted />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button className="btn-primary" type="button" onClick={startTraining}>
                  {t("workoutPlayer.startTraining")}
                </button>
                <button
                    className="btn-ghost"
                    type="button"
                    onClick={pauseTraining}
                    disabled={trainingTimerState !== "RUNNING"}
                >
                  {t("workoutPlayer.pauseTraining")}
                </button>
                <button
                    className="btn-ghost"
                    type="button"
                    onClick={resumeTraining}
                    disabled={trainingTimerState !== "PAUSED"}
                >
                  {t("workoutPlayer.resumeTraining")}
                </button>
                <button className="btn-ghost" type="button" onClick={resetTraining}>
                  {t("workoutPlayer.resetTraining")}
                </button>
              </div>
            </div>

            <div className={`rounded-3xl border p-6 transition ${restColorClasses}`}>
              <div className="text-xs uppercase tracking-wide opacity-80">{t("workoutPlayer.restTimer")}</div>
              <div className="mt-3 text-5xl font-bold tabular-nums">
                {formatSeconds(restElapsed)}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniCard label={t("workoutPlayer.recommendedActiveRest")} value={`${recommended}s`} muted />
                <MiniCard label={t("workoutPlayer.limit")} value={`${limit}s`} muted />
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                <p className="font-semibold text-neutral-100">{t("workoutPlayer.mode")}</p>
                <p className="mt-1 text-neutral-300">
                  {t("workoutPlayer.modeDescription")}
                </p>
              </div>

              <div className="mt-4 space-y-1 text-sm opacity-90">
                <p>
                  {t("workoutPlayer.status")}: <span className="font-semibold">{restStatusText}</span>
                </p>
                <p>
                  {t("workoutPlayer.remainingToRecommended")}:{" "}
                  <span className="font-semibold">{recommendedLeft}s</span>
                </p>
                <p>
                  {t("workoutPlayer.aboveLimit")}: <span className="font-semibold">{overLimitBy}s</span>
                </p>
                <p>
                  {t("workoutPlayer.timerStateLabel")}: <span className="font-semibold">{t(`workoutPlayer.timerState.${restTimerState}`)}</span>
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button className="btn-primary" type="button" onClick={startRest}>
                  {t("workoutPlayer.startRest")}
                </button>
                <button
                    className="btn-ghost"
                    type="button"
                    onClick={pauseRest}
                    disabled={restTimerState !== "RUNNING"}
                >
                  {t("workoutPlayer.pauseRest")}
                </button>
                <button
                    className="btn-ghost"
                    type="button"
                    onClick={resumeRest}
                    disabled={restTimerState !== "PAUSED"}
                >
                  {t("workoutPlayer.resumeRest")}
                </button>
                <button className="btn-ghost" type="button" onClick={resetRest}>
                  {t("workoutPlayer.resetRest")}
                </button>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-primary disabled:opacity-40"
                  type="button"
                  onClick={finishCurrentSet}
                  disabled={restTimerState === "RUNNING"}
                  title={restTimerState === "RUNNING" ? t("workoutPlayer.waitForRestEnd") : ""}
                >
                  {restTimerState === "RUNNING" ? `⏳ ${t("workoutPlayer.restRunning")}` : `✓ ${t("workoutPlayer.setCompleted")}`}
                </button>
                <button className="btn-ghost" type="button" onClick={skipToNextExercise}>
                  {t("workoutPlayer.nextExercise")}
                </button>
                <Link className="btn-ghost" href={`/workouts/${workoutId}`}>
                  {t("workoutPlayer.exit")}
                </Link>
              </div>
            </div>

            <div className="card p-6 text-sm text-neutral-300">
              <p className="font-semibold text-neutral-100">{t("workoutPlayer.howItWorks")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><strong>{t("workoutPlayer.trainingTimer")}:</strong> {t("workoutPlayer.howTrainingTimer")}</li>
                <li><strong>{t("workoutPlayer.restTimer")}:</strong> {t("workoutPlayer.howRestTimer")}</li>
              </ul>
              <p className="mt-3">
                {t("workoutPlayer.howResetNote")}
              </p>
            </div>
          </div>
        </div>
      </div>
  );
}

function MiniCard({
                    label,
                    value,
                    muted = false,
                  }: {
  label: string;
  value: string | number;
  muted?: boolean;
}) {
  return (
      <div
          className={`rounded-2xl border p-4 ${
              muted
                  ? "border-white/10 bg-white/5"
                  : "border-neutral-800 bg-neutral-950/70"
          }`}
      >
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className="mt-1 text-lg font-semibold text-neutral-100">{value}</div>
      </div>
  );
}

function getRestStatusText(
    t: (key: string) => string,
    elapsed: number,
    recommended: number,
    limit: number,
) {
  if (elapsed <= recommended) {
    return t("workoutPlayer.recommendedActiveRest");
  }
  if (elapsed <= limit) {
    return t("workoutPlayer.aboveRecommendedRest");
  }
  return t("workoutPlayer.restLimitExceeded");
}

function timerColor(elapsed: number, recommended: number, limit: number) {
  if (elapsed <= recommended) {
    return "border-green-500/30 bg-green-500/10 text-green-200";
  }
  if (elapsed <= limit) {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-100";
  }
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}