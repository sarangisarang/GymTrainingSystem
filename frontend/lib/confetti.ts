"use client";

import confetti from "canvas-confetti";

/**
 * Fire a PR-style celebration: a 5-second burst pattern from both bottom
 * corners. Returns a `stop()` function the caller can use to cancel early
 * (e.g. on unmount of the workout page).
 *
 * Respects `prefers-reduced-motion: reduce` (WCAG 2.3.3) by short-circuiting
 * — users who opted out at the OS level get the PR toasts but no particles.
 * z-index 1000 sits below the toast layer (1100) so taps to dismiss the
 * toast are never absorbed by the canvas overlay.
 */
export function fireCelebration({ durationMs = 5000 }: { durationMs?: number } = {}): () => void {
  if (typeof window === "undefined") return () => {};

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return () => {};
  }

  const end = Date.now() + durationMs;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = () => {
    timer = null;
    if (stopped) return;
    const remaining = end - Date.now();
    if (remaining <= 0) return;

    // Particle count tapers as we approach `end` so the show fades out.
    const particleCount = Math.max(20, Math.floor(50 * (remaining / durationMs)));
    // y=0.85 keeps origins inside the viewport even when iOS Safari's dynamic
    // bottom toolbar reduces visible height, and clears the toast stack.
    confetti({
      particleCount, angle: 60, spread: 55,
      origin: { x: 0, y: 0.85 },
      startVelocity: 55, gravity: 1, ticks: 200, zIndex: 1000,
    });
    confetti({
      particleCount, angle: 120, spread: 55,
      origin: { x: 1, y: 0.85 },
      startVelocity: 55, gravity: 1, ticks: 200, zIndex: 1000,
    });

    timer = setTimeout(tick, 250);
  };
  tick();

  return () => {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
    try {
      confetti.reset();
    } catch {
      // canvas-confetti throws if reset is called before the canvas exists; ignore.
    }
  };
}
