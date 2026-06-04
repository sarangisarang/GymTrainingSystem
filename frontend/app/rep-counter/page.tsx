"use client";

/**
 * In-browser rep counter (Issue #13).
 *
 * Runs Google MediaPipe PoseLandmarker entirely client-side — the webcam
 * frames never leave the device, and no backend is involved. Each video
 * frame is fed to the pose model; the resulting joint angle drives the
 * RepCounter state machine in lib/repCounter.ts.
 *
 * The heavy WASM runtime and the pose model are streamed from a CDN on first
 * use, so they are not bundled into the app and only download when the user
 * actually opens this page.
 */

import { useEffect, useRef, useState } from "react";
import Protected from "@/components/Protected";
import { useTranslations } from "@/components/I18nProvider";
import {
  RepCounter,
  measureAngle,
  evaluateForm,
  EXERCISE_LIST,
  type ExerciseId,
  type Landmark,
  type FormFeedback,
} from "@/lib/repCounter";

// Traffic-light styles for the form-feedback card and skeleton color.
const FORM_CARD_STYLES: Record<string, string> = {
  good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  bad: "border-red-500/40 bg-red-500/10 text-red-200",
};
const FORM_SKELETON_COLOR: Record<string, string> = {
  good: "#22c55e",
  warning: "#eab308",
  bad: "#ef4444",
};
const FORM_EMOJI: Record<string, string> = { good: "🟢", warning: "🟡", bad: "🔴" };

// CDN locations for the MediaPipe vision WASM bundle and the pose model.
// Pinned to the installed @mediapipe/tasks-vision version for reproducibility.
const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export default function RepCounterPage() {
  return (
    <Protected>
      <RepCounterInner />
    </Protected>
  );
}

function RepCounterInner() {
  const t = useTranslations();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The PoseLandmarker instance and the rep-counter are kept in refs because
  // they live across frames and must not trigger React re-renders themselves.
  const landmarkerRef = useRef<unknown>(null);
  const counterRef = useRef<RepCounter | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const [exercise, setExercise] = useState<ExerciseId>("squat");
  const [status, setStatus] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState<"TOP" | "BOTTOM">("TOP");
  const [angle, setAngle] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [form, setForm] = useState<FormFeedback | null>(null);
  const [fps, setFps] = useState(0);

  // Keep the counter's exercise in sync when the user switches mid-session.
  useEffect(() => {
    counterRef.current?.setExercise(exercise);
  }, [exercise]);

  // Short audio blip on each completed rep — gives feedback without looking.
  function beep() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      /* AudioContext may be blocked before a user gesture — ignore. */
    }
  }

  async function start() {
    setErrorMsg(null);
    setStatus("loading");
    // Guard: some browsers (older Safari, non-secure origins, in-app webviews)
    // expose no camera API at all. Fail with a clear message instead of a
    // cryptic "cannot read getUserMedia of undefined".
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorMsg(t("repCounter.noCameraSupport"));
      return;
    }

    try {
      // 1. Lazy-load the MediaPipe vision module (kept out of the main bundle).
      const vision = await import("@mediapipe/tasks-vision");
      const { FilesetResolver, PoseLandmarker, DrawingUtils } = vision;

      // 2. Resolve the WASM runtime and build the pose model in VIDEO mode.
      //    The GPU delegate is fastest but fails on some drivers / headless
      //    setups, so fall back to the CPU delegate instead of erroring out.
      const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
      let landmarker;
      try {
        landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch {
        landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }
      landmarkerRef.current = landmarker;
      counterRef.current = new RepCounter(exercise);
      counterRef.current.reset();
      setReps(0);

      // 3. Request the webcam and wait until the first frame is available.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      runningRef.current = true;
      setStatus("running");

      const drawing = new DrawingUtils(canvasRef.current!.getContext("2d")!);
      let lastTs = performance.now();
      let frameCount = 0;
      let fpsClock = performance.now();

      // 4. Per-frame loop: detect pose → draw skeleton → update rep counter.
      const loop = () => {
        if (!runningRef.current) return;
        const now = performance.now();

        // PoseLandmarker requires a strictly increasing timestamp in VIDEO mode.
        const result = (landmarker as any).detectForVideo(video, now);

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (result.landmarks && result.landmarks.length > 0) {
          const landmarks = result.landmarks[0] as Landmark[];

          // Feed the tracked joint angle into the rep counter + form check.
          const measured = measureAngle(landmarks, exercise);
          let skeletonColor = "#6366f1"; // default indigo when not tracking
          if (measured && counterRef.current) {
            const out = counterRef.current.update(measured.angle);
            setAngle(out.angle);
            setPhase(out.phase);
            setHint(out.hint);

            // Basic form feedback drives both the card and the skeleton color.
            const fb = evaluateForm(out.angle, out.phase, exercise);
            setForm(fb);
            skeletonColor = FORM_SKELETON_COLOR[fb.status] ?? "#6366f1";

            if (out.repCompleted) {
              setReps(out.reps);
              beep();
            }
          }

          // Draw the skeleton overlay, colored by the current form status.
          drawing.drawConnectors(
            result.landmarks[0],
            (PoseLandmarker as any).POSE_CONNECTIONS,
            { color: skeletonColor, lineWidth: 3 },
          );
          drawing.drawLandmarks(result.landmarks[0], {
            color: skeletonColor,
            radius: 3,
          });
        }
        ctx.restore();

        // FPS meter, refreshed roughly once per second.
        frameCount += 1;
        if (now - fpsClock >= 1000) {
          setFps(Math.round((frameCount * 1000) / (now - fpsClock)));
          frameCount = 0;
          fpsClock = now;
        }
        lastTs = now;

        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e: unknown) {
      setStatus("error");
      // Map the common getUserMedia failures to actionable, human messages.
      const name = (e as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErrorMsg(t("repCounter.cameraBlocked"));
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setErrorMsg(t("repCounter.noCameraFound"));
      } else if (name === "NotReadableError") {
        setErrorMsg(t("repCounter.cameraInUse"));
      } else {
        setErrorMsg(
          e instanceof Error ? e.message : t("repCounter.startFailed"),
        );
      }
    }
  }

  function stop() {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
    setForm(null);
    setStatus("idle");
  }

  // Always release the camera when the component unmounts (navigating away).
  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fpsOk = fps >= 15;

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="h1">📷 {t("repCounter.title")}</h1>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                {t("repCounter.beta")}
              </span>
            </div>
            <p className="muted mt-1">
              {t("repCounter.subtitle")}
            </p>
            <p className="mt-1 text-xs text-emerald-400">
              🔒 {t("repCounter.privacy")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {EXERCISE_LIST.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => setExercise(ex.id)}
                className={`rounded-xl px-3 py-2 text-sm transition ${
                  exercise === ex.id
                    ? "bg-indigo-600 text-white"
                    : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                }`}
              >
                {t(`repCounter.ex.${ex.id}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {errorMsg}
        </div>
      )}

      {/* Safety disclaimer — Form Feedback is basic movement guidance, NOT a
          medical or injury-prevention tool. MediaPipe only sees body points;
          it cannot detect pain, joint load, fatigue or weight. */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200/90">
        ⚠️ <strong>{t("repCounter.safetyLead")}</strong> {t("repCounter.safetyMid")} <strong>{t("repCounter.safetyStop")}</strong>.
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        {/* Camera + skeleton overlay */}
        <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-black">
          {/* The video is mirrored so it feels like a mirror to the user.
              The canvas overlay is mirrored to match. */}
          <video
            ref={videoRef}
            className="h-[320px] w-full -scale-x-100 object-cover sm:h-[480px]"
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
          />
          {status === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <button type="button" className="btn-primary" onClick={start}>
                ▶ {t("repCounter.startCamera")}
              </button>
            </div>
          )}
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-neutral-200">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
              <p className="text-sm">{t("repCounter.loadingModel")}</p>
            </div>
          )}
        </div>

        {/* Live stats */}
        <div className="space-y-4">
          <div className="card p-6 text-center">
            <p className="muted text-xs uppercase tracking-wide">{t("repCounter.reps")}</p>
            <p className="mt-1 text-7xl font-bold tabular-nums text-indigo-400">{reps}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4 text-center">
              <p className="muted text-xs">{t("repCounter.phase")}</p>
              <p className={`mt-1 text-lg font-semibold ${phase === "BOTTOM" ? "text-amber-400" : "text-emerald-400"}`}>
                {phase}
              </p>
            </div>
            <div className="card p-4 text-center">
              <p className="muted text-xs">{t("repCounter.angle")}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {angle != null ? `${Math.round(angle)}°` : "—"}
              </p>
            </div>
          </div>

          <div className="card p-4 text-center">
            <p className="muted text-xs">{t("repCounter.cameraFps")}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${fpsOk ? "text-emerald-400" : "text-amber-400"}`}>
              {fps} {fps > 0 && (fpsOk ? "✓" : t("repCounter.low"))}
            </p>
          </div>

          {/* Form Feedback (Beta) — traffic-light status from body angles.
              Basic range-of-motion check only; not form correction. */}
          {status === "running" && form && (
            <div className={`rounded-xl border p-4 text-center text-sm font-medium ${FORM_CARD_STYLES[form.status]}`}>
              <span className="mr-1 text-xs uppercase tracking-wide opacity-70">{t("repCounter.formBeta")}</span>
              <br />
              {FORM_EMOJI[form.status]} {form.message}
            </div>
          )}

          <div className="flex gap-3">
            {status === "running" ? (
              <button type="button" className="btn-ghost flex-1" onClick={stop}>
                ⏹ {t("repCounter.stop")}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={start}
                disabled={status === "loading"}
              >
                ▶ {t("repCounter.start")}
              </button>
            )}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                counterRef.current?.reset();
                setReps(0);
              }}
            >
              {t("repCounter.reset")}
            </button>
          </div>

          <div className="card p-4 text-sm text-neutral-400">
            <p className="font-semibold text-neutral-200">{t("repCounter.tips")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t("repCounter.tip1")}</li>
              <li>{t("repCounter.tip2")}</li>
              <li>{t("repCounter.tip3")}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
