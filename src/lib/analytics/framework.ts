import type { Match, Player, StatEvent, Team } from "../types";

/**
 * ANALYTICS FRAMEWORK — the sport-agnostic core.
 *
 * The analytics dashboard renders from a single normalised shape,
 * `MatchAnalytics`, no matter which sport produced it. Each sport ships a
 * `SportModule` that knows how to turn raw match data (events, set scores,
 * rosters) into that shape. New sports — football, cricket, basketball,
 * tennis, badminton — plug in by implementing `SportModule` and calling
 * `registerSport()`; every screen, chart and export keeps working unchanged.
 *
 * Nothing here is volleyball-specific. See `volleyball.ts` for the first
 * concrete module and `registry.ts` for wiring.
 */

export type SportId =
  | "volleyball"
  | "football"
  | "cricket"
  | "basketball"
  | "tennis"
  | "badminton";

export type Tone = "accent" | "azure" | "ok" | "err" | "violet" | "dim";

/** A headline KPI rendered as a stat card. */
export interface Kpi {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: Tone;
}

/** One rally on the scoring-progression / momentum series. */
export interface ProgressionPoint {
  /** 1-based rally index across the whole match. */
  rally: number;
  setNo: number;
  /** Cumulative match points. */
  home: number;
  away: number;
  /** Points ahead for home (can be negative). */
  margin: number;
  scorer: "home" | "away";
  label: string;
}

/** A timeline entry — set milestones plus notable events. */
export interface TimelineItem {
  ts: number;
  setNo: number;
  side: "home" | "away" | "neutral";
  kind: string;
  title: string;
  detail?: string;
}

/** A single metric compared across the two teams (radar + bars). */
export interface ComparisonMetric {
  key: string;
  label: string;
  home: number;
  away: number;
  unit?: string;
  /** Radar normalisation ceiling; defaults to max(home, away). */
  max?: number;
  higherIsBetter?: boolean;
}

/** A ranked / awarded performer. */
export interface Performer {
  playerId: string;
  name: string;
  teamId: string;
  teamShort: string;
  award: string;
  value: number | string;
  unit: string;
  detail?: string;
}

/** A generic table (box score, team stat sheet). */
export interface StatTable {
  title: string;
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, string | number>[];
}

/** One team's sport-specific stat line. */
export interface TeamStatLine {
  teamId: string;
  stats: {
    key: string;
    label: string;
    value: string | number;
    unit?: string;
    /** Set when a metric isn't captured in this build (shown greyed). */
    note?: string;
  }[];
}

/** A slice of a distribution (attack outcomes, court zones, …). */
export interface DistributionDatum {
  key: string;
  label: string;
  value: number;
  tone?: Tone;
}

export interface DistributionSeries {
  key: string;
  label: string;
  hint?: string;
  /** "pie" | "bar" | "court" — a hint to the renderer. */
  shape: "pie" | "bar" | "court";
  data: DistributionDatum[];
}

/** The complete analytics payload for one match. */
export interface MatchAnalytics {
  sport: SportId;
  matchId: string;
  /** Final result, resolved. */
  result: {
    homeSetsWon: number;
    awaySetsWon: number;
    winner: "home" | "away" | null;
    /** Human score string, e.g. "3–1". */
    scoreline: string;
  };
  headline: Kpi[];
  comparison: ComparisonMetric[];
  teamStats: { home: TeamStatLine; away: TeamStatLine };
  performers: Performer[];
  boxScore: StatTable;
  progression: ProgressionPoint[];
  timeline: TimelineItem[];
  distributions: DistributionSeries[];
  durationMs: number | null;
}

/** Everything a SportModule needs to analyse one match. */
export interface MatchContext {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  homeRoster: Player[];
  awayRoster: Player[];
  events: StatEvent[];
}

/** The contract every sport implements. */
export interface SportModule {
  id: SportId;
  label: string;
  icon: string;
  analyzeMatch(ctx: MatchContext): MatchAnalytics;
}

// ---------------------------------------------------------------------
// Registry — sports register themselves at import time.
// ---------------------------------------------------------------------

const registry = new Map<SportId, SportModule>();

export function registerSport(module: SportModule): void {
  registry.set(module.id, module);
}

export function getSport(id: SportId): SportModule | undefined {
  return registry.get(id);
}

export function listSports(): SportModule[] {
  return [...registry.values()];
}

/**
 * Resolve which sport a match belongs to. Today the platform is
 * volleyball-only, so this returns "volleyball"; when multi-sport lands,
 * this reads the sport from the tournament/league configuration without any
 * change to callers.
 */
export function resolveSport(_match: Match): SportId {
  return "volleyball";
}
