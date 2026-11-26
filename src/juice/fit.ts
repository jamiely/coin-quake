/**
 * Big text must always fit the screen, in any orientation (a 1050x1680 cabinet, a 720x1280 phone, a 9:21 phone).
 * `fitScale` returns the scale that makes `el` (at its natural size, untransformed) fit `maxWidth` px, never more than
 * 1. Call it once when the text changes, not per frame.
 */
export function fitScale(el: HTMLElement, maxWidth: number): number {
  const w = el.offsetWidth;
  return w > maxWidth && w > 0 ? maxWidth / w : 1;
}

/**
 * A slam-in starts large and shrinks to rest. It may overshoot past the screen edges by at most `overshoot` of the
 * width, so the word still reads while it flies in instead of being a blur of giant cropped letters.
 */
export function slamStart(restWidth: number, screenWidth: number, wanted: number, overshoot = 1.25): number {
  if (restWidth <= 0) return wanted;
  return Math.max(1, Math.min(wanted, (screenWidth * overshoot) / restWidth));
}
