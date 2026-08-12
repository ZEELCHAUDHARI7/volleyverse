/**
 * HOLD AND DRAG — one gesture where there used to be two taps.
 *
 * Tapping a player and then tapping ✓ / O / ✗ costs two deliberate touches and
 * a glance down at a second panel. During a fast rally that is the difference
 * between logging the touch and missing it. Holding the player and flicking in
 * a direction is one movement, and the finger never has to find a second
 * target: the direction is read from how far the finger travelled, NOT from
 * what is under it when it lifts. Nothing has to be hit, so nothing can be
 * missed — the on-screen zones are a readout, not a hit test.
 *
 * That is also why the sectors below are so wide. Fingers are not precise under
 * pressure, and a scorer watching the court is not looking at the screen at
 * all; anything past the dead zone resolves to one of the three answers.
 *
 * Pure: no React, no DOM, no runtime imports at all, so the Node type-stripping
 * test runner loads this file without resolving anything else.
 */

/**
 * Where a drag ended up. NONE covers both "barely moved" and "pulled down",
 * and both mean the same thing to the caller: log nothing, fall back to the
 * tap. Down is deliberately not a fourth answer — it is the escape hatch, so a
 * scorer who starts a gesture and thinks better of it has somewhere to go that
 * cannot record anything.
 */
export type DragDirection = "LEFT" | "RIGHT" | "UP" | "NONE";

/**
 * How far the finger must travel, in CSS pixels, before a direction counts.
 *
 * Small enough that a flick registers without a deliberate stroke, large enough
 * that the wobble in a press-and-lift never does. Below it the gesture is still
 * a tap, which is what makes the two input styles able to share one press.
 */
export const DRAG_THRESHOLD = 24;

/**
 * How long a stationary press waits before the direction readout appears.
 *
 * Short, because it is only there to keep the overlay from flashing on every
 * ordinary tap. A drag that passes DRAG_THRESHOLD opens the readout straight
 * away without waiting this out, so a fast flick is never slowed down by it.
 */
export const HOLD_MS = 160;

/**
 * Resolve a pointer delta to one of the three answers.
 *
 * Sector shape, reading round from straight up:
 *
 *        UP  (90° — ±45° either side of vertical)
 *      ╲  ↑  ╱
 *  LEFT ╲   ╱ RIGHT     LEFT and RIGHT take ~108° each. They are the two that
 *   ←    ╳    →         end rallies, so they are pressed under the most time
 *      ╱   ╲            pressure and get the most room.
 *      ╱ ↓ ╲
 *      cancel (~53°) — resolves to NONE
 *
 * Cancel is the narrow one on purpose. It is chosen deliberately, by someone
 * who has already decided not to record anything, so it can afford to ask for
 * a straighter stroke than the three answers do.
 *
 * The comparisons are on |dx| vs |dy| rather than an angle, so there is no
 * trigonometry to get wrong and the boundaries are exact: a perfect 45° upward
 * diagonal is UP, not a coin flip.
 *
 * `dy` follows screen coordinates — negative is up the screen.
 */
export function dragDirection(
  dx: number,
  dy: number,
  threshold: number = DRAG_THRESHOLD,
): DragDirection {
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  // Squared distance rather than a square root: same test, and it keeps a
  // threshold of 0 meaning "any movement at all" instead of a rounding coin toss.
  if (ax * ax + ay * ay < threshold * threshold) return "NONE";
  // Up: anything within 45° of vertical, so |dy| alone has to win.
  if (dy < 0 && ay >= ax) return "UP";
  // Cancel: within ~27° of straight down. Doubling rather than a tangent keeps
  // the boundary exact and integer-friendly.
  if (dy > 0 && ay >= ax * 2) return "NONE";
  return dx < 0 ? "LEFT" : "RIGHT";
}

/**
 * How far through the dead zone the finger is, 0 → 1, for the ramp that fades
 * the readout in. Clamped at 1: past the threshold the answer is committed and
 * the readout should not keep growing as if it were still deciding.
 */
export function dragProgress(
  dx: number,
  dy: number,
  threshold: number = DRAG_THRESHOLD,
): number {
  if (threshold <= 0) return 1;
  const d = Math.sqrt(dx * dx + dy * dy) / threshold;
  return d > 1 ? 1 : d;
}

/** True once a drag has travelled far enough to mean something. */
export function dragEngaged(
  dx: number,
  dy: number,
  threshold: number = DRAG_THRESHOLD,
): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}
