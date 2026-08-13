"use client";

/**
 * SET NAVIGATOR — every set of the match, always on screen, and the control
 * that scopes the stats below it.
 *
 * Banking a set used to make it vanish from the tracker: the score reset to
 * 0-0 and only a `Sets 1-0` tally remained, which reads as "set 1 was
 * deleted". Nothing was ever deleted — every StatEvent carries its `setNo`
 * and each finished set's score is written to the match row — so this is the
 * missing window onto data that was already there.
 *
 * One control does both jobs on purpose: the chips ARE the scoreboard, and
 * tapping one narrows the charts to that set. Nothing to learn.
 */

/** The scope the stats below are showing: the whole match, or one set. */
export type SetScope = "ALL" | number;

export interface SetEntry {
  setNo: number;
  homePoints: number;
  awayPoints: number;
  /** The set in progress — score still moving, no winner yet. */
  live?: boolean;
}

/**
 * Every set to offer, oldest first: the recorded ones plus the set in progress.
 * A recorded score for the live set (an abandoned match banks the set it was
 * in) is superseded by the live entry rather than shown twice.
 */
export function setEntries(
  recorded: { setNo: number; homePoints: number; awayPoints: number }[],
  live: { setNo: number; homePoints: number; awayPoints: number } | null,
): SetEntry[] {
  const entries: SetEntry[] = recorded
    .filter((s) => !live || s.setNo !== live.setNo)
    .map((s) => ({ ...s }));
  if (live) entries.push({ ...live, live: true });
  return entries.sort((a, b) => a.setNo - b.setNo);
}

export function SetNavigator({
  sets,
  scope,
  onScope,
  homeShort,
  awayShort,
}: {
  sets: SetEntry[];
  scope: SetScope;
  onScope: (scope: SetScope) => void;
  homeShort: string;
  awayShort: string;
}) {
  if (sets.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
        {homeShort}–{awayShort}
      </span>

      {sets.map((s) => {
        const selected = scope === s.setNo;
        // Colour the winning side's number, so a glance reads who took the set.
        const homeWon = !s.live && s.homePoints > s.awayPoints;
        const awayWon = !s.live && s.awayPoints > s.homePoints;
        return (
          <button
            key={s.setNo}
            type="button"
            onClick={() => onScope(selected ? "ALL" : s.setNo)}
            aria-pressed={selected}
            title={`Set ${s.setNo}${s.live ? " (in progress)" : ""} — tap to show only this set`}
            className={`flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 transition-all active:scale-[0.97] ${
              selected
                ? "border-accent bg-accent/10"
                : "border-line bg-surface2/40 hover:border-accent/40"
            }`}
          >
            <span className="tnum text-[9px] font-bold uppercase tracking-wider text-dim">
              S{s.setNo}
            </span>
            <span className="tnum text-xs font-bold">
              <span className={homeWon ? "text-accent" : "text-ink"}>{s.homePoints}</span>
              <span className="mx-0.5 text-dim">–</span>
              <span className={awayWon ? "text-azure" : "text-ink"}>{s.awayPoints}</span>
            </span>
            {s.live && (
              <span className="live-ring inline-block h-1.5 w-1.5 rounded-full bg-err" />
            )}
          </button>
        );
      })}

      {/* Only offered once there is something to come back FROM. */}
      {sets.length > 1 && (
        <button
          type="button"
          onClick={() => onScope("ALL")}
          aria-pressed={scope === "ALL"}
          title="Show every set together"
          className={`flex min-h-9 items-center rounded-xl border px-2.5 text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.97] ${
            scope === "ALL"
              ? "border-accent bg-accent/10 text-accent"
              : "border-line text-dim hover:border-accent/40"
          }`}
        >
          All sets
        </button>
      )}
    </div>
  );
}

/** How to label the stats below, given the scope. */
export function scopeLabel(scope: SetScope): string {
  return scope === "ALL" ? "all sets" : `set ${scope}`;
}
