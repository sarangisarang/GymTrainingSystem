/**
 * Rep-counting logic for the in-browser MediaPipe pose tracker (Issue #13).
 *
 * This module is intentionally pure (no DOM, no MediaPipe imports) so the
 * logic can be reasoned about and unit-tested in isolation. The page layer
 * feeds it raw pose landmarks each frame; this module returns the current
 * joint angle, the running rep count and a live form hint.
 *
 * The core idea is a small state machine driven by a single joint angle:
 *
 *   TOP ──(angle drops below downAngle)──▶ BOTTOM
 *   BOTTOM ──(angle rises above upAngle)──▶ TOP   (+1 rep here)
 *
 * One full TOP → BOTTOM → TOP cycle is exactly one repetition, which holds
 * for squats (knee angle), bicep curls (elbow angle) and push-ups
 * (elbow angle) alike — only the landmarks and thresholds differ.
 */

// A single normalized landmark as emitted by MediaPipe PoseLandmarker.
// x/y are in [0, 1] relative to the image; visibility is the model's
// confidence that the joint is actually visible in frame.
export type Landmark = { x: number; y: number; z: number; visibility?: number };

export type ExerciseId =
  | "squat"
  | "curl"
  | "pushup"
  | "lunge"
  | "situp"
  | "shoulderpress"
  | "lateralraise"
  | "tricepsext";

export type RepPhase = "TOP" | "BOTTOM";

// BlazePose 33-point landmark indices we care about (left / right pairs).
// See https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
const LM = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/**
 * Per-exercise configuration.
 *
 * `joints` names the three landmarks forming the tracked angle, where the
 * MIDDLE one is the vertex (the joint that actually bends). `downAngle` and
 * `upAngle` define a hysteresis band: the gap between them prevents a single
 * jittery frame near the threshold from double-counting a rep.
 */
type ExerciseConfig = {
  label: string;
  // [pointA, vertex, pointC] — left-side indices; right-side mirrored below.
  joints: readonly [keyof typeof LM, keyof typeof LM, keyof typeof LM];
  downAngle: number; // lower threshold of the hysteresis band
  upAngle: number; // upper threshold of the hysteresis band
  // Where the muscular EFFORT happens in the movement:
  //   "low"  → effort at the bottom / small angle  (squat, curl, push-up, …)
  //   "high" → effort at the top / large angle     (shoulder press, raise)
  // This single flag lets one state machine handle both flexion-type and
  // extension-type exercises instead of duplicating the logic.
  effort: "low" | "high";
  // Angle the user should reach at the effort point, used for the form hint.
  targetAngle: number;
  hint: string;
  // Optional basic form-feedback rules (Beta). Only a handful of exercises
  // define these for now. `good` is the acceptable angle band AT the effort
  // point; outside it the movement is flagged. This is intentionally simple:
  // MediaPipe only sees pose landmarks — not weight, tension, foot pressure
  // or joint strain — so this is "basic form hints", never form correction.
  form?: {
    good: { min: number; max: number };
    notEnoughMsg: string; // effort=low: too shallow · effort=high: not high enough
    goodMsg: string;
    overMsg: string; // past the good band — usually "keep control"
  };
};

export type FormStatus = "good" | "warning" | "bad";

export type FormFeedback = { status: FormStatus; message: string };

const EXERCISES: Record<ExerciseId, ExerciseConfig> = {
  // Knee angle: standing ≈ 170°, deep squat ≈ 70-90°.
  squat: {
    label: "Squat",
    joints: ["leftHip", "leftKnee", "leftAnkle"],
    downAngle: 100,
    upAngle: 160,
    effort: "low",
    targetAngle: 95,
    hint: "Go deeper into the squat",
    form: {
      good: { min: 70, max: 110 },
      notEnoughMsg: "Too shallow — go deeper",
      goodMsg: "Good squat depth",
      overMsg: "Very deep — keep control",
    },
  },
  // Elbow angle: arm extended ≈ 170°, fully curled ≈ 40°.
  curl: {
    label: "Bicep Curl",
    joints: ["leftShoulder", "leftElbow", "leftWrist"],
    downAngle: 60,
    upAngle: 150,
    effort: "low",
    targetAngle: 55,
    hint: "Curl all the way up",
    form: {
      good: { min: 30, max: 60 },
      notEnoughMsg: "Complete the curl range",
      goodMsg: "Good curl range",
      overMsg: "Move slower and controlled",
    },
  },
  // Elbow angle: top of push-up ≈ 170°, bottom ≈ 80-90°.
  pushup: {
    label: "Push-Up",
    joints: ["leftShoulder", "leftElbow", "leftWrist"],
    downAngle: 95,
    upAngle: 160,
    effort: "low",
    targetAngle: 90,
    hint: "Lower your chest further",
  },
  // Front-knee angle: standing ≈ 170°, deep lunge ≈ 90°.
  lunge: {
    label: "Lunge",
    joints: ["leftHip", "leftKnee", "leftAnkle"],
    downAngle: 110,
    upAngle: 160,
    effort: "low",
    targetAngle: 100,
    hint: "Drop your back knee lower",
  },
  // Hip angle (shoulder-hip-knee): lying flat ≈ 160°, crunched up ≈ 70°.
  situp: {
    label: "Sit-Up",
    joints: ["leftShoulder", "leftHip", "leftKnee"],
    downAngle: 80,
    upAngle: 135,
    effort: "low",
    targetAngle: 75,
    hint: "Sit up higher",
  },
  // Elbow angle: racked at shoulders ≈ 80°, pressed overhead ≈ 165°.
  // Effort is at the TOP (extension), so effort = "high".
  shoulderpress: {
    label: "Shoulder Press",
    joints: ["leftShoulder", "leftElbow", "leftWrist"],
    downAngle: 95,
    upAngle: 155,
    effort: "high",
    targetAngle: 160,
    hint: "Press all the way overhead",
    form: {
      good: { min: 155, max: 180 },
      notEnoughMsg: "Not high enough — press fully overhead",
      goodMsg: "Full extension",
      overMsg: "Locked out — keep control",
    },
  },
  // Shoulder abduction (hip-shoulder-wrist): arm down ≈ 15°, raised ≈ 90°.
  // Effort is at the TOP of the raise, so effort = "high".
  lateralraise: {
    label: "Lateral Raise",
    joints: ["leftHip", "leftShoulder", "leftWrist"],
    downAngle: 35,
    upAngle: 75,
    effort: "high",
    targetAngle: 85,
    hint: "Raise your arm to shoulder height",
    form: {
      good: { min: 80, max: 110 },
      notEnoughMsg: "Raise to shoulder height",
      goodMsg: "Good height",
      overMsg: "Too high — keep shoulders controlled",
    },
  },
  // Elbow angle: bent behind head ≈ 60°, extended up ≈ 165°.
  // Effort is at the extension (top), so effort = "high".
  tricepsext: {
    label: "Triceps Ext.",
    joints: ["leftShoulder", "leftElbow", "leftWrist"],
    downAngle: 80,
    upAngle: 150,
    effort: "high",
    targetAngle: 160,
    hint: "Fully extend your elbow",
  },
};

export const EXERCISE_LIST: { id: ExerciseId; label: string }[] = (
  Object.keys(EXERCISES) as ExerciseId[]
).map((id) => ({ id, label: EXERCISES[id].label }));

/**
 * Interior angle (in degrees) at vertex `b` formed by points a-b-c.
 *
 * Uses the dot product of the two vectors (b→a) and (b→c). The z-axis is
 * deliberately ignored: MediaPipe's depth estimate is noisy from a single
 * webcam, and the 2D projection is accurate enough for rep counting.
 */
export function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;

  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return 180;

  // Clamp guards against floating-point drift pushing the ratio past ±1,
  // which would make Math.acos return NaN.
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Average visibility of the three joints on one side — used to auto-pick
// whichever side of the body is more clearly facing the camera.
function sideVisibility(
  landmarks: Landmark[],
  joints: readonly [number, number, number],
): number {
  // IMPORTANT: some MediaPipe builds don't populate `visibility` on the
  // normalized landmarks (it comes back undefined). Treat a missing value as
  // "present" (1) instead of 0 — otherwise the visibility gate would reject
  // every frame and NOTHING would count on any exercise. A landmark that is
  // genuinely absent is caught separately by the coordinate check below.
  return (
    joints.reduce((sum, idx) => sum + (landmarks[idx]?.visibility ?? 1), 0) /
    joints.length
  );
}

/**
 * Resolve the tracked angle for the current frame, automatically choosing the
 * better-visible side (left vs. right). Returns null when neither side is
 * confidently visible, so the caller can skip the frame instead of counting
 * garbage reps.
 */
export function measureAngle(
  landmarks: Landmark[],
  exercise: ExerciseId,
): { angle: number; side: "left" | "right" } | null {
  const cfg = EXERCISES[exercise];

  const leftIdx = cfg.joints.map((j) => LM[j]) as [number, number, number];
  // Mirror "leftX" → "rightX" by swapping the index to its right-side pair.
  const rightIdx = cfg.joints.map((j) => {
    const rightKey = j.replace("left", "right") as keyof typeof LM;
    return LM[rightKey];
  }) as [number, number, number];

  const leftVis = sideVisibility(landmarks, leftIdx);
  const rightVis = sideVisibility(landmarks, rightIdx);

  // Lenient gate: only skip the frame if a side is clearly NOT visible.
  const MIN_VISIBILITY = 0.3;
  if (Math.max(leftVis, rightVis) < MIN_VISIBILITY) return null;

  const useRight = rightVis > leftVis;
  const idx = useRight ? rightIdx : leftIdx;
  const [a, b, c] = idx.map((i) => landmarks[i]);
  // Reject missing landmarks (off-frame joints come back undefined).
  if (!a || !b || !c) return null;
  if (a.x === undefined || b.x === undefined || c.x === undefined) return null;

  // Coordinates are the reliable gate (more so than the optional visibility):
  // reject a joint clearly outside the normalized [0,1] frame. A small margin
  // keeps borderline-edge poses usable instead of dropping every frame.
  const inFrame = (p: Landmark) =>
    p.x >= -0.1 && p.x <= 1.1 && p.y >= -0.1 && p.y <= 1.1;
  if (!inFrame(a) || !inFrame(b) || !inFrame(c)) return null;

  return { angle: angleDeg(a, b, c), side: useRight ? "right" : "left" };
}

/**
 * Basic real-time form feedback (Beta).
 *
 * Returns a traffic-light status from the joint angle while the user is in
 * the effort phase. This is deliberately shallow: it only checks range of
 * motion at the working point, because pose landmarks carry no information
 * about load, tension or balance. Exercises without `form` rules return a
 * neutral "good" so the UI never shows a misleading warning.
 *
 *   effort "low"  (squat/curl): angle ABOVE the good band → too shallow (bad)
 *                               angle BELOW the good band → too deep (warning)
 *   effort "high" (press/raise): angle BELOW the good band → not enough (bad)
 *                                angle ABOVE the good band → overshoot (warning)
 */
export function evaluateForm(
  angle: number,
  phase: RepPhase,
  exercise: ExerciseId,
): FormFeedback {
  const cfg = EXERCISES[exercise];

  // No rules, or resting between reps → neutral, no nagging.
  if (!cfg.form || phase === "TOP") {
    return { status: "good", message: "Controlled movement" };
  }

  const { good, notEnoughMsg, goodMsg, overMsg } = cfg.form;

  if (angle >= good.min && angle <= good.max) {
    return { status: "good", message: goodMsg };
  }

  if (cfg.effort === "low") {
    // Working at a small angle: above the band means the rep is too shallow.
    return angle > good.max
      ? { status: "bad", message: notEnoughMsg }
      : { status: "warning", message: overMsg };
  }

  // effort === "high": working at a large angle; below the band is too little.
  return angle < good.min
    ? { status: "bad", message: notEnoughMsg }
    : { status: "warning", message: overMsg };
}

/**
 * Stateful rep counter. One instance per active set.
 *
 * Holds the smoothed angle, the current phase and the deepest angle reached
 * during the ongoing descent (used to decide whether the rep was deep enough
 * for a form hint).
 */
export class RepCounter {
  private exercise: ExerciseId;
  // "TOP" = the resting / ready position, "BOTTOM" = the active / effort
  // position. These labels stay constant across exercise types even though
  // the actual joint angle at "effort" is low for some (squat) and high for
  // others (shoulder press) — see ExerciseConfig.effort.
  private phase: RepPhase = "TOP";
  private smoothedAngle: number;
  // The most extreme angle reached during the ongoing effort phase, used to
  // judge whether the rep was performed through full range of motion.
  private extremeThisRep: number;
  reps = 0;
  lastRepWasShallow = false;

  constructor(exercise: ExerciseId) {
    this.exercise = exercise;
    this.smoothedAngle = this.restValue();
    this.extremeThisRep = this.restValue();
  }

  // The angle the joint sits at while resting, used to seed the smoother so
  // the counter never fires a phantom rep on the very first frames.
  //   effort "low"  → rests at a high angle (≈180°)
  //   effort "high" → rests at a low angle  (≈0°)
  private restValue(): number {
    return EXERCISES[this.exercise].effort === "low" ? 180 : 0;
  }

  /**
   * Switch exercise mid-session. This starts the new exercise from a clean
   * slate: the phase, smoothed angle AND the rep count are all reset, because a
   * squat's reps are not a curl's. (Set `this.exercise` first so `reset()` seeds
   * the smoother from the *new* exercise's rest angle.)
   */
  setExercise(exercise: ExerciseId) {
    this.exercise = exercise;
    this.reset();
  }

  reset() {
    this.phase = "TOP";
    this.smoothedAngle = this.restValue();
    this.extremeThisRep = this.restValue();
    this.reps = 0;
    this.lastRepWasShallow = false;
  }

  /**
   * Feed one frame's angle. Returns the live UI state, including whether a
   * rep was completed on THIS frame (so the page can beep / flash exactly
   * once per rep).
   */
  update(angle: number): {
    phase: RepPhase;
    angle: number;
    reps: number;
    repCompleted: boolean;
    hint: string | null;
  } {
    const cfg = EXERCISES[this.exercise];
    const effortLow = cfg.effort === "low";

    // Light exponential smoothing tames per-frame landmark jitter while
    // staying responsive. The new sample is weighted 0.7 so the smoothed
    // value still reaches the movement's extremes within a single phase
    // (a heavier weight on history would lag past the rep thresholds and
    // drop reps); a lone spike frame is still pulled back by the 0.3 history.
    this.smoothedAngle = this.smoothedAngle * 0.3 + angle * 0.7;
    const a = this.smoothedAngle;

    let repCompleted = false;
    let hint: string | null = null;

    if (this.phase === "TOP") {
      // From REST, entering the effort phase. For flexion exercises that
      // means the angle drops below downAngle; for extension exercises it
      // means the angle rises above upAngle.
      const enteringEffort = effortLow ? a < cfg.downAngle : a > cfg.upAngle;
      if (enteringEffort) {
        this.phase = "BOTTOM";
        this.extremeThisRep = a;
      }
    } else {
      // In the effort phase: track the most extreme angle reached so far.
      this.extremeThisRep = effortLow
        ? Math.min(this.extremeThisRep, a)
        : Math.max(this.extremeThisRep, a);

      // Returning to REST completes the rep (mirror of the entry condition).
      const returningToRest = effortLow ? a > cfg.upAngle : a < cfg.downAngle;
      if (returningToRest) {
        this.reps += 1;
        repCompleted = true;
        // A rep is "shallow" if it never reached the target range of motion.
        this.lastRepWasShallow = effortLow
          ? this.extremeThisRep > cfg.targetAngle
          : this.extremeThisRep < cfg.targetAngle;
        this.phase = "TOP";
        this.extremeThisRep = this.restValue();
      }
    }

    // Live form hint while in the effort phase but short of the target ROM.
    if (this.phase === "BOTTOM") {
      const shortOfTarget = effortLow ? a > cfg.targetAngle : a < cfg.targetAngle;
      if (shortOfTarget) hint = cfg.hint;
    }

    return { phase: this.phase, angle: a, reps: this.reps, repCompleted, hint };
  }
}
