import type { MatchStatus } from "./types";

/**
 * What a scoring screen shows for a match.
 *
 * The scoring session lives in this browser's localStorage, so a second
 * device opening the same match has none. Without this, "no session" fell
 * through to the setup steps: a finished match offered a fresh toss, and a
 * live match restarted at 0–0 and pushed that score to the Live page.
 */
export type TrackerView =
  /** Finished: the result and statistics, read from the database. */
  | "report"
  /** Live, but scored on another device: say so before offering a restart. */
  | "elsewhere"
  /** Not started here yet: toss and line-ups. */
  | "setup"
  /** This browser's session: keep scoring. */
  | "tracker";

export function trackerView(status: MatchStatus, hasSession: boolean): TrackerView {
  if (status === "completed") return "report";
  if (hasSession) return "tracker";
  return status === "live" ? "elsewhere" : "setup";
}
