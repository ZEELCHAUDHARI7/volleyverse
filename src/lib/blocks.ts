import type { StatEvent } from "./types";

/**
 * BLOCK TALLIES — the blocking half of every attack tap.
 *
 * Nothing here needs its own collection step. When a scorer says an attack was
 * BLOCKED they name the blocker, and when they say it was a TOOL they name the
 * blocker who got used; those two answers are the whole input. This file turns
 * them into a blocker's profile, a leaderboard, and the spiker-vs-blocker
 * matrix a coach reads before deciding a rotation.
 *
 * WHAT A "SUCCESS RATE" CAN HONESTLY MEAN HERE. The app never sees a block
 * that was simply jumped too late — no tap describes one. So the denominator is
 * the duels we DID witness: blocks won plus times tooled. Read it as "when the
 * ball came through this blocker's hands, how often did it stay down", never as
 * "how often they stopped an attack" — every attack hit past the block is
 * invisible to it. `attempts` is named for what it counts, not for the FIVB
 * block-attempt column, which is a different and larger number.
 *
 * Callers must pass events already scoped to one match (or one season — the
 * functions do not care which) — nothing here filters by matchId.
 *
 * Pure: no React, no storage, no DOM. Type-only import so the Node
 * type-stripping test runner can load this file directly.
 */

export interface BlockLine {
  playerId: string;
  /** BLOCK_WIN — attacks stopped dead. */
  blocks: number;
  /** BLOCK_TOOLED — the spiker scored off this blocker's hands. */
  tooled: number;
  /** BLOCK_MISS — a beaten block from the phase-based tracker. */
  missed: number;
  /** Duels seen: blocks + tooled + missed. NOT the FIVB block-attempt count. */
  attempts: number;
  /** blocks / attempts as whole percent. null when there were no duels. */
  successRate: number | null;
  /** Blocks per set number, for the per-set record and the set filter. */
  blocksBySet: Record<number, number>;
  /** The spiker this blocker stopped most often. null until one is blocked. */
  topVictim: { playerId: string; blocks: number } | null;
}

/** null rather than 0 for "never in a duel" — charts drop them, not draw 0%. */
const rate = (n: number, d: number): number | null =>
  d === 0 ? null : Math.round((n / d) * 100);

export function blockLine(playerId: string, events: StatEvent[]): BlockLine {
  let blocks = 0;
  let tooled = 0;
  let missed = 0;
  const blocksBySet: Record<number, number> = {};
  /** spikerId → times blocked, for topVictim. */
  const victims = new Map<string, number>();

  for (const e of events) {
    if (e.playerId !== playerId) continue;
    if (e.type === "BLOCK_WIN") {
      blocks++;
      blocksBySet[e.setNo] = (blocksBySet[e.setNo] ?? 0) + 1;
      // A BLOCK_WIN from the phase-based tracker names no spiker. Counting it
      // in `blocks` but not in the matchup is the honest split: the block
      // happened, who it beat was never asked.
      if (e.vsPlayerId) victims.set(e.vsPlayerId, (victims.get(e.vsPlayerId) ?? 0) + 1);
    } else if (e.type === "BLOCK_TOOLED") tooled++;
    else if (e.type === "BLOCK_MISS") missed++;
  }

  let topVictim: BlockLine["topVictim"] = null;
  for (const [pid, n] of victims) {
    // Ties keep the first seen, which is the earliest-blocked spiker — stable
    // ordering matters more than the tie-break, so a card does not flicker
    // between two names as the same events are re-derived.
    if (!topVictim || n > topVictim.blocks) topVictim = { playerId: pid, blocks: n };
  }

  const attempts = blocks + tooled + missed;
  return {
    playerId,
    blocks,
    tooled,
    missed,
    attempts,
    successRate: rate(blocks, attempts),
    blocksBySet,
    topVictim,
  };
}

export function blockLines(playerIds: string[], events: StatEvent[]): BlockLine[] {
  return playerIds.map((id) => blockLine(id, events));
}

/** Blockers with at least one block, best first. Ties break on fewer tooled. */
export function blockLeaders(playerIds: string[], events: StatEvent[]): BlockLine[] {
  return blockLines(playerIds, events)
    .filter((l) => l.blocks > 0)
    .sort((a, b) => b.blocks - a.blocks || a.tooled - b.tooled);
}

/**
 * One cell of the spiker-vs-blocker matrix: how often this blocker stopped this
 * spiker, and how often that spiker went the other way and tooled them.
 *
 * Only duels with both players named appear — see the BLOCK_WIN note above.
 */
export interface Duel {
  blockerId: string;
  spikerId: string;
  /** Times the blocker stopped the spiker. */
  blocks: number;
  /** Times the spiker scored off the blocker. */
  tools: number;
}

export function duels(events: StatEvent[]): Duel[] {
  const cells = new Map<string, Duel>();
  const cell = (blockerId: string, spikerId: string): Duel => {
    const key = `${blockerId}|${spikerId}`;
    let d = cells.get(key);
    if (!d) {
      d = { blockerId, spikerId, blocks: 0, tools: 0 };
      cells.set(key, d);
    }
    return d;
  };

  for (const e of events) {
    if (!e.vsPlayerId) continue;
    // Read from the BLOCKER's event in both directions, so a duel is counted
    // once even though each rally logs two events. BLOCK_WIN and BLOCK_TOOLED
    // both belong to the blocker, and both name the spiker.
    if (e.type === "BLOCK_WIN") cell(e.playerId, e.vsPlayerId).blocks++;
    else if (e.type === "BLOCK_TOOLED") cell(e.playerId, e.vsPlayerId).tools++;
  }

  return [...cells.values()].sort(
    (a, b) => b.blocks - a.blocks || b.tools - a.tools,
  );
}

/**
 * Best single-SET block count for a player across the given events.
 *
 * Sets are numbered per match, so a season's events have many set 1s — the key
 * is match + set, or every set 1 in the season would pile into one total.
 */
export function bestSetBlocks(
  playerId: string,
  events: StatEvent[],
): { matchId: string; setNo: number; blocks: number } | null {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.playerId !== playerId || e.type !== "BLOCK_WIN") continue;
    const key = `${e.matchId}|${e.setNo}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: { matchId: string; setNo: number; blocks: number } | null = null;
  for (const [key, blocks] of counts) {
    if (best && blocks <= best.blocks) continue;
    const [matchId, setNo] = key.split("|");
    best = { matchId, setNo: Number(setNo), blocks };
  }
  return best;
}
