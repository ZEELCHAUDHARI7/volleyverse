import type { Lineup, Side } from "./rally";
import type { Match, StatEvent } from "./types";

/**
 * The slice of courtside state the fan screens read. The /rally screen's
 * MatchState and the /spikes screen's own state both carry it, so either
 * can be shared as-is.
 */
export interface LiveScoreboard {
  set: number;
  usScore: number;
  oppScore: number;
  usSets: number;
  oppSets: number;
  /** Final scores of completed sets, oldest first. */
  setScores?: { us: number; opp: number }[];
  usLineup: Lineup;
  oppLineup: Lineup;
  rally: { serving: Side };
}

/**
 * The match the fan screens follow: of the matches marked live, the one with
 * the latest sign of life — its newest point, or its start time before the
 * first point. A match left "live" from an old day never outranks today's.
 */
export function pickLiveMatch<M extends Pick<Match, "id" | "status" | "dateISO" | "time">>(
  matches: M[],
  events: Pick<StatEvent, "matchId" | "ts">[],
): M | null {
  const live = matches.filter((m) => m.status === "live");
  if (live.length <= 1) return live[0] ?? null;
  const lastPoint = new Map<string, number>();
  for (const e of events) {
    if (e.ts > (lastPoint.get(e.matchId) ?? 0)) lastPoint.set(e.matchId, e.ts);
  }
  const lastSign = (m: M) =>
    Math.max(lastPoint.get(m.id) ?? 0, Date.parse(`${m.dateISO}T${m.time ?? "00:00"}`) || 0);
  return live.reduce((best, m) => (lastSign(m) > lastSign(best) ? m : best));
}

/**
 * When a fixture starts, as a local date-time the countdown can parse. No time
 * means 18:00. Postgres hands `time` back as HH:mm:ss, so only HH:mm is kept.
 */
export function kickoffISO(m: Pick<Match, "dateISO" | "time">): string {
  return `${m.dateISO}T${(m.time ?? "18:00").slice(0, 5)}:00`;
}

/**
 * The fixture the fan screens count down to: of the matches still scheduled,
 * the one kicking off soonest that has not kicked off yet. A fixture left
 * "scheduled" from an earlier day is skipped; its countdown can only read zero.
 * Equal kick-offs go to the lower id, so every screen and reload agree.
 */
export function pickNextFixture<M extends Pick<Match, "id" | "status" | "dateISO" | "time">>(
  matches: M[],
  now: number = Date.now(),
): M | null {
  let next: M | null = null;
  let nextAt = Infinity;
  for (const m of matches) {
    if (m.status !== "scheduled") continue;
    const at = Date.parse(kickoffISO(m));
    if (!(at > now)) continue;
    if (at < nextAt || (at === nextAt && next !== null && m.id < next.id)) {
      next = m;
      nextAt = at;
    }
  }
  return next;
}
