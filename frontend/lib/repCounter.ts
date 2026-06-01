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

export type ExerciseId = "squat" | "curl" | "pushup";

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
  downAngle: number; // enter BOTTOM when the angle falls below this
  upAngle: number; // count a rep when the angle climbs back above this
  // Target depth used only for the form hint (e.g. "go deeper").
  depthHintAngle: number;
  hint: string;
};

const EXERCISES: Record<ExerciseId, ExerciseConfig> = {
  // Knee angle: standing ≈ 170°, deep squat ≈ 70-90°.
  squat: {
    label: "Squat",
    joints: ["leftHip", "leftKnee", "leftAnkle"],
    downAngle: 100,
    upAngle: 160,
    depthHintAngle: 95,
    hint: "Go deeper into the squat",
  },
  // Elbow angle: arm extended ≈ 170°, fully curled ≈ 40°.
  curl: {
    label: "Bicep Curl",
    joints: ["leftShoulder", "leftElbow", "leftWrist"],
    downAngle: 60,
    upAngle: 150,
    depthHintAngle: 55,
    hint: "Curl all the way up",
  },
  // Elbow angle: top of push-up ≈ 170°, bottom ≈ 80-90°.
  pushup: {
    label: "Push-Up",
    joints: ["leftShoulder", "leftElbow", "leftWrist"],
    downAngle: 95,
    upAngle: 160,
    depthHintAngle: 90,
    hint: "Lower your chest further",
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
  return (
    joints.reduce((sum, idx) => sum + (landmarks[idx]?.visibility ?? 0), 0) /
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

  const MIN_VISIBILITY = 0.5;
  if (Math.max(leftVis, rightVis) < MIN_VISIBILITY) return null;

  const useRight = rightVis > leftVis;
  const idx = useRight ? rightIdx : leftIdx;
  const [a, b, c] = idx.map((i) => landmarks[i]);
  if (!a || !b || !c) return null;

  return { angle: angleDeg(a, b, c), side: useRight ? "right" : "left" };
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
  private phase: RepPhase = "TOP";
  private smoothedAngle = 180;
  private deepestThisRep = 180;
  reps = 0;
  lastRepWasShallow = false;

  constructor(exercise: ExerciseId) {
    this.exercise = exercise;
  }

  /** Switch exercise mid-session and reset the per-rep tracking state. */
  setExercise(exercise: ExerciseId) {
    this.exercise = exercise;
    this.phase = "TOP";
    this.deepestThisRep = 180;
  }

  reset() {
    this.phase = "TOP";
    this.smoothedAngle = 180;
    this.deepestThisRep = 180;
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
      // Descending: once we cross below downAngle we are in the BOTTOM phase.
      if (a < cfg.downAngle) {
        this.phase = "BOTTOM";
        this.deepestThisRep = a;
      }
    } else {
      // In BOTTOM: keep tracking the deepest point of the descent.
      this.deepestThisRep = Math.min(this.deepestThisRep, a);

      // Ascending back above upAngle completes the rep.
      if (a > cfg.upAngle) {
        this.reps += 1;
        repCompleted = true;
        // Flag a shallow rep when the descent never reached target depth.
        this.lastRepWasShallow = this.deepestThisRep > cfg.depthHintAngle;
        this.phase = "TOP";
        this.deepestThisRep = 180;
      }
    }

    // Live form hint while the user is in the bottom of the movement but
    // hasn't reached the target depth yet.
    if (this.phase === "BOTTOM" && a > cfg.depthHintAngle) {
      hint = cfg.hint;
    }

    return { phase: this.phase, angle: a, reps: this.reps, repCompleted, hint };
  }
}
