/**
 * Why a start and end date do not make a range, or null when they do. Either
 * end may be left open. Dates are yyyy-mm-dd, which order correctly as text.
 */
export function dateRangeProblem(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return end < start ? "The end date is before the start date." : null;
}
