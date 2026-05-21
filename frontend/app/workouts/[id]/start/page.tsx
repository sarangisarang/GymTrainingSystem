"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/Protected";
import {
  getApiBase,
  getExercises,
  getWorkout,
  type ExerciseRead,
  type WorkoutExerciseRead,
} from "@/lib/api";

type TimerState = "IDLE" | "RUNNING" | "PAUSED";

export default function WorkoutStartPage() {
  return (
      <Protected>
        <WorkoutPlayerInner />
      </Protected>
  );
}

function WorkoutPlayerInner() {
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
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load workout player");
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
    setStarted(true);
    setFinished(false);
    setCurrentExerciseIndex(0);
    setCurrentSet(1);

    setTrainingElapsed(0);
    setRestElapsed(0);
    setTotalElapsed(0);

    setTrainingTimerState("RUNNING");
    setRestTimerState("IDLE");
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

    // Si aún quedan sets -> parar training y arrancar rest automáticamente
    if (currentSet < current.sets) {
      setTrainingTimerState("IDLE");
      setTrainingElapsed(0);

      setCurrentSet((prev) => prev + 1);

      setRestElapsed(0);
      setRestTimerState("RUNNING");
      return;
    }

    // Si terminó el ejercicio, pasar al siguiente
    if (currentExerciseIndex < workoutExercises.length - 1) {
      setCurrentExerciseIndex((prev) => prev + 1);
      setCurrentSet(1);

      setTrainingElapsed(0);
      setRestElapsed(0);

      setTrainingTimerState("RUNNING");
      setRestTimerState("IDLE");
      return;
    }

    // Si no hay más ejercicios, terminar workout
    setFinished(true);
    setTrainingTimerState("IDLE");
    setRestTimerState("IDLE");
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
  }

  if (loading) return <p className="muted">Loading…</p>;

  if (err) {
    return (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {err}
          </div>
          <Link className="btn-ghost" href={`/workouts/${workoutId}`}>
            Back
          </Link>
        </div>
    );
  }

  if (!workoutExercises.length) {
    return (
        <div className="card p-6">
          <p className="muted">No exercises found for this workout.</p>
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
            <h1 className="h1">Ready to start?</h1>
            <p className="muted mt-3">
              This workout has {workoutExercises.length} exercises.
              Press start to open the guided workout player with two timers:
              one for active training and one for rest.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className="btn-primary" type="button" onClick={startWorkout}>
                Start workout
              </button>
              <Link className="btn-ghost" href={`/workouts/${workoutId}`}>
                Back to details
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
            <h1 className="h1">Workout finished</h1>
            <p className="muted mt-3">Total time: {formatSeconds(totalElapsed)}</p>

            <div className="mt-2 text-sm text-neutral-400">
              <p>Training timer tracked active exercise time.</p>
              <p>Rest timer tracked rest/pause time separately.</p>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className="btn-primary" type="button" onClick={startWorkout}>
                Restart workout
              </button>
              <Link className="btn-ghost" href={`/workouts/${workoutId}`}>
                Back to details
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
  const restStatusText = getRestStatusText(restElapsed, recommended, limit);

  return (
      <div className="space-y-6">
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="h1">Workout player</h1>
              <p className="muted mt-2">
                Exercise {currentExerciseIndex + 1} of {workoutExercises.length} • Set {currentSet} of {current.sets}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-right">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Total workout time
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
                alt={currentExercise?.name || "Exercise image"}
                className="h-[360px] w-full object-cover"
            />

            <div className="space-y-4 p-6">
              <div>
                <h2 className="text-2xl font-semibold">
                  {currentExercise?.name || "Exercise"}
                </h2>
                <p className="muted mt-2">
                  {currentExercise?.muscle_group || "Unknown muscle group"}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MiniCard label="Sets" value={`${currentSet} / ${current.sets}`} />
                <MiniCard label="Reps" value={current.reps} />
                <MiniCard label="Weight" value={current.weight ?? "Bodyweight"} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={`rounded-3xl border p-6 transition ${trainingColorClasses}`}>
              <div className="text-xs uppercase tracking-wide opacity-80">
                Training timer
              </div>
              <div className="mt-3 text-5xl font-bold tabular-nums">
                {formatSeconds(trainingElapsed)}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniCard label="Exercise" value={currentExercise?.name || "Exercise"} muted />
                <MiniCard label="Status" value={trainingTimerState} muted />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button className="btn-primary" type="button" onClick={startTraining}>
                  Start training
                </button>
                <button
                    className="btn-ghost"
                    type="button"
                    onClick={pauseTraining}
                    disabled={trainingTimerState !== "RUNNING"}
                >
                  Pause training
                </button>
                <button
                    className="btn-ghost"
                    type="button"
                    onClick={resumeTraining}
                    disabled={trainingTimerState !== "PAUSED"}
                >
                  Resume training
                </button>
                <button className="btn-ghost" type="button" onClick={resetTraining}>
                  Reset training
                </button>
              </div>
            </div>

            <div className={`rounded-3xl border p-6 transition ${restColorClasses}`}>
              <div className="text-xs uppercase tracking-wide opacity-80">Rest timer</div>
              <div className="mt-3 text-5xl font-bold tabular-nums">
                {formatSeconds(restElapsed)}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniCard label="Recommended active rest" value={`${recommended}s`} muted />
                <MiniCard label="Limit" value={`${limit}s`} muted />
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                <p className="font-semibold text-neutral-100">Mode</p>
                <p className="mt-1 text-neutral-300">
                  White muscle fiber / explosive strength focus
                </p>
              </div>

              <div className="mt-4 space-y-1 text-sm opacity-90">
                <p>
                  Status: <span className="font-semibold">{restStatusText}</span>
                </p>
                <p>
                  Remaining to recommended rest:{" "}
                  <span className="font-semibold">{recommendedLeft}s</span>
                </p>
                <p>
                  Above limit: <span className="font-semibold">{overLimitBy}s</span>
                </p>
                <p>
                  Timer state: <span className="font-semibold">{restTimerState}</span>
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button className="btn-primary" type="button" onClick={startRest}>
                  Start rest
                </button>
                <button
                    className="btn-ghost"
                    type="button"
                    onClick={pauseRest}
                    disabled={restTimerState !== "RUNNING"}
                >
                  Pause rest
                </button>
                <button
                    className="btn-ghost"
                    type="button"
                    onClick={resumeRest}
                    disabled={restTimerState !== "PAUSED"}
                >
                  Resume rest
                </button>
                <button className="btn-ghost" type="button" onClick={resetRest}>
                  Reset rest
                </button>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex flex-wrap gap-3">
                <button className="btn-primary" type="button" onClick={finishCurrentSet}>
                  Complete set / continue
                </button>
                <button className="btn-ghost" type="button" onClick={skipToNextExercise}>
                  Next exercise
                </button>
                <Link className="btn-ghost" href={`/workouts/${workoutId}`}>
                  Exit
                </Link>
              </div>
            </div>

            <div className="card p-6 text-sm text-neutral-300">
              <p>Ahora tienes dos relojes:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Training timer: cuenta el tiempo activo mientras haces el ejercicio.</li>
                <li>Rest timer: cuenta la pausa/descanso entre sets.</li>
              </ul>
              <p className="mt-3">
                Cuando terminas un set, el descanso puede empezar automáticamente.
                Cuando pasas al siguiente ejercicio, se reinician los dos relojes y
                empieza el training timer del nuevo ejercicio.
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

function getRestStatusText(elapsed: number, recommended: number, limit: number) {
  if (elapsed <= recommended) {
    return "Recommended active rest";
  }
  if (elapsed <= limit) {
    return "Above recommended rest";
  }
  return "Rest limit exceeded";
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