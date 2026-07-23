/**
 * Analytics public entry point.
 *
 * Importing this module registers every built-in sport (side effect of the
 * sport imports below), then re-exports the framework, general maths,
 * narrative and export surfaces. Pages import from here so they never depend
 * on a specific sport module directly — new sports appear automatically.
 */

// Side-effect imports: each sport self-registers with the framework.
import "./volleyball";

export * from "./framework";
export * from "./general";
export * from "./narrative";
export * from "./export";
export {
  playerAnalytics,
  rallyOutcomes,
  progression,
  biggestRun,
  type PlayerAnalytic,
  type RallyOutcome,
} from "./volleyball";
