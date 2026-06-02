/**
 * Rep-counter regression tests.
 *
 * The frontend has no test framework wired up, so this is a self-contained
 * suite runnable with:  npx tsx tests/repCounter.test.mjs
 * It exits non-zero on the first failure so CI can gate on it.
 *
 * Covers the pure logic of lib/repCounter.ts: the landmark→angle gate
 * (measureAngle), the rep state machine (RepCounter) and the form feedback
 * (evaluateForm) — everything except the camera / MediaPipe layer.
 */
import {
  RepCounter,
  measureAngle,
  evaluateForm,
} from "../lib/repCounter.ts";

let pass = 0,
  fail = 0;
function check(name, got, want) {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${got}, want ${want}`);
  ok ? pass++ : fail++;
}

// ── helpers ──────────────────────────────────────────────────────────────
// Build a 33-point frame where the squat joints (hip23, knee25, ankle27)
// form a given knee angle. `opts.visibility` / `opts.shift` let tests target
// the visibility gate and the off-frame coordinate gate.
function squatFrame(kneeDeg, opts = {}) {
  const { visibility, shift = 0 } = opts;
  const base = () => {
    const p = { x: 0.5 + shift, y: 0.5, z: 0 };
    if (visibility !== undefined) p.visibility = visibility;
    return p;
  };
  const lm = Array.from({ length: 33 }, base);
  const t = (kneeDeg * Math.PI) / 180;
  const knee = { x: 0.5 + shift, y: 0.6 };
  const mk = (x, y) => {
    const p = { x, y, z: 0 };
    if (visibility !== undefined) p.visibility = visibility;
    return p;
  };
  lm[23] = mk(knee.x, knee.y - 0.15); // hip
  lm[25] = mk(knee.x, knee.y); // knee (vertex)
  lm[27] = mk(knee.x + 0.15 * Math.sin(t), knee.y - 0.15 * Math.cos(t)); // ankle
  return lm;
}

function cycle(rest, effort, n, steps = 12) {
  const s = [];
  for (let r = 0; r < n; r++) {
    for (let i = 0; i <= steps; i++) s.push(rest + (effort - rest) * (i / steps));
    for (let i = 0; i <= steps; i++) s.push(effort + (rest - effort) * (i / steps));
  }
  return s;
}
function simAngles(ex, seq) {
  const c = new RepCounter(ex);
  for (const a of seq) c.update(a);
  return c.reps;
}

// ── measureAngle: visibility + coordinate gates (the regression bug) ───────

// REGRESSION: visibility missing but coordinates valid → must NOT return null.
const noVis = measureAngle(squatFrame(90), "squat"); // no `visibility` field
check("missing visibility → angle returned", noVis !== null, true);
check("missing visibility → ~90°", noVis && Math.abs(noVis.angle - 90) < 3, true);

// REGRESSION: landmark clearly outside the [0,1] frame → reject even with no
// visibility (coordinates are the reliable gate).
const offFrame = measureAngle(squatFrame(90, { shift: 0.8 }), "squat"); // x ≈ 1.3
check("off-frame coords → null", offFrame, null);

// Low visibility but in frame → rejected by the visibility gate.
const lowVis = measureAngle(squatFrame(90, { visibility: 0.05 }), "squat");
check("very low visibility → null", lowVis, null);

// Good visibility in frame → accepted.
const goodVis = measureAngle(squatFrame(90, { visibility: 0.9 }), "squat");
check("good visibility → angle returned", goodVis !== null, true);

// ── RepCounter: counting + hysteresis ──────────────────────────────────────
check("squat 3 full reps", simAngles("squat", cycle(170, 80, 3)), 3);
check("curl 5 full reps", simAngles("curl", cycle(170, 40, 5)), 5);
check("shoulder press 4 reps", simAngles("shoulderpress", cycle(85, 165, 4)), 4);
check("squat shallow → 0 reps", simAngles("squat", cycle(170, 130, 3)), 0);
check(
  "jitter near threshold → 1 rep",
  simAngles("squat", [170, 150, 120, 99, 101, 98, 80, 98, 101, 120, 150, 170, 170]),
  1,
);

// ── evaluateForm: traffic-light classification ─────────────────────────────
check("form squat good depth", evaluateForm(90, "BOTTOM", "squat").status, "good");
check("form squat shallow → bad", evaluateForm(130, "BOTTOM", "squat").status, "bad");
check("form press not high → bad", evaluateForm(120, "BOTTOM", "shoulderpress").status, "bad");
check("form resting → neutral good", evaluateForm(170, "TOP", "squat").status, "good");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
