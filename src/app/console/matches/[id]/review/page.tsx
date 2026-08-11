"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMatch, useStore } from "@/lib/store";
import { lines } from "@/lib/metrics";
import {
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  PageSkeleton,
  StatusChip,
} from "@/components/ui";
import type { Match, MatchSet } from "@/lib/types";

/**
 * MATCH REVIEW - the post-match summary the Rally Tracker lands on after
 * "End match". Everything shown is DERIVED from persisted data (match set
 * scores + StatEvents via metrics.ts); nothing is invented. When a match
 * ended with little data recorded, the page degrades gracefully instead of
 * showing a dead end.
 */
export default function MatchReview() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const { match, homeTeam, awayTeam, homeRoster, awayRoster, events } =
    useMatch(id);

  const allRoster = useMemo(
    () => [...homeRoster, ...awayRoster],
    [homeRoster, awayRoster],
  );
  const ls = useMemo(() => lines(allRoster, events), [allRoster, events]);
  const [editingSets, setEditingSets] = useState(false);

  // playerId -> display name + team short code, for the box score.
  const meta = useMemo(() => {
    const m = new Map<string, { name: string; team: string }>();
    for (const p of homeRoster)
      m.set(p.id, { name: p.fullName, team: homeTeam?.shortName ?? "" });
    for (const p of awayRoster)
      m.set(p.id, { name: p.fullName, team: awayTeam?.shortName ?? "" });
    return m;
  }, [homeRoster, awayRoster, homeTeam, awayTeam]);

  if (!store.ready) return <PageSkeleton />;

  if (!match || !homeTeam || !awayTeam) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          title="Match not found"
          hint="This match may have been removed, or the link is out of date."
          action={
            <LinkButton href="/console" variant="primary">
              Back to console
            </LinkButton>
          }
        />
      </div>
    );
  }

  const sets = match.setScores ?? [];
  const homeSetWins = sets.filter((s) => s.homePoints > s.awayPoints).length;
  const awaySetWins = sets.filter((s) => s.awayPoints > s.homePoints).length;

  const winnerName =
    match.winnerTeamId === homeTeam.id
      ? homeTeam.name
      : match.winnerTeamId === awayTeam.id
        ? awayTeam.name
        : null;

  // Box score: everyone who recorded at least one contact, best scorers first.
  const contributors = [...ls]
    .filter(
      (l) =>
        l.points > 0 ||
        l.aces > 0 ||
        l.blocks > 0 ||
        l.saves > 0 ||
        l.assists > 0,
    )
    .sort((a, b) => b.points - a.points);

  const nameOf = (pid: string) => meta.get(pid)?.name ?? "Unknown";
  const teamOf = (pid: string) => meta.get(pid)?.team ?? "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Match review"
        subtitle={`${homeTeam.name} vs ${awayTeam.name}`}
        action={
          <div className="flex gap-2">
            <LinkButton href="/console" variant="ghost">
              Console
            </LinkButton>
            <LinkButton href="/console/matches/new" variant="primary">
              New match
            </LinkButton>
          </div>
        }
      />

      {/* Result banner */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <StatusChip tone={match.status === "completed" ? "ok" : "dim"}>
            {match.status}
          </StatusChip>
          {winnerName ? (
            <StatusChip tone="accent">Winner: {winnerName}</StatusChip>
          ) : (
            <StatusChip tone="dim">No winner recorded</StatusChip>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <p className="stat-display text-right text-lg font-extrabold uppercase leading-tight">
            {homeTeam.name}
          </p>
          <p className="stat-display tnum text-4xl font-extrabold">
            <span className={homeSetWins > awaySetWins ? "text-accent" : ""}>
              {homeSetWins}
            </span>
            <span className="mx-2 text-dim">-</span>
            <span className={awaySetWins > homeSetWins ? "text-accent" : ""}>
              {awaySetWins}
            </span>
          </p>
          <p className="stat-display text-left text-lg font-extrabold uppercase leading-tight">
            {awayTeam.name}
          </p>
        </div>
        <p className="mt-2 text-center text-xs text-dim">
          Best of {match.totalSets}
        </p>
      </Card>

      {/* Set-by-set scores — editable, because a match can end without them */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="stat-display text-sm font-bold uppercase tracking-wide text-accent">
            Sets
          </h2>
          {!editingSets && (
            <Button variant="ghost" onClick={() => setEditingSets(true)}>
              {sets.length === 0 ? "Add set scores" : "Edit"}
            </Button>
          )}
        </div>

        {editingSets ? (
          <SetScoreEditor
            match={match}
            homeShort={homeTeam.shortName}
            awayShort={awayTeam.shortName}
            onSave={(next) => {
              store.setSetScores(match.id, next);
              setEditingSets(false);
            }}
            onCancel={() => setEditingSets(false)}
          />
        ) : sets.length === 0 ? (
          <p className="text-sm text-dim">
            No set scores were recorded for this match — it ended before a set
            was banked, so the scoreboard was never written down. The tapped
            events are all still here; type each set&apos;s final score in and
            the match starts counting in standings and season analytics.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sets.map((s) => {
              const homeWon = s.homePoints > s.awayPoints;
              return (
                <div
                  key={s.setNo}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface2/40 px-3 py-2 text-sm"
                >
                  <span className="text-dim">Set {s.setNo}</span>
                  <span className="tnum font-bold">
                    <span className={homeWon ? "text-accent" : ""}>
                      {s.homePoints}
                    </span>
                    <span className="mx-2 text-dim">-</span>
                    <span className={!homeWon ? "text-accent" : ""}>
                      {s.awayPoints}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Player box score */}
      <Card>
        <h2 className="stat-display mb-3 text-sm font-bold uppercase tracking-wide text-accent">
          Box score
        </h2>
        {contributors.length === 0 ? (
          <p className="text-sm text-dim">
            No player statistics were recorded for this match.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-dim">
                  <th className="py-1 pr-2">Player</th>
                  <th className="py-1 pr-2">Team</th>
                  <th className="py-1 pr-2 text-right">Pts</th>
                  <th className="py-1 pr-2 text-right">Aces</th>
                  <th className="py-1 pr-2 text-right">Blk</th>
                  <th className="py-1 pr-2 text-right">Ast</th>
                  <th className="py-1 text-right">Digs</th>
                </tr>
              </thead>
              <tbody>
                {contributors.map((l) => (
                  <tr key={l.playerId} className="border-t border-line/60">
                    <td className="py-1.5 pr-2 font-semibold">
                      {nameOf(l.playerId)}
                    </td>
                    <td className="py-1.5 pr-2 text-dim">
                      {teamOf(l.playerId)}
                    </td>
                    <td className="tnum py-1.5 pr-2 text-right font-bold">
                      {l.points}
                    </td>
                    <td className="tnum py-1.5 pr-2 text-right">{l.aces}</td>
                    <td className="tnum py-1.5 pr-2 text-right">{l.blocks}</td>
                    <td className="tnum py-1.5 pr-2 text-right">{l.assists}</td>
                    <td className="tnum py-1.5 text-right">{l.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * SET-SCORE EDITOR — the correction path for a match whose scoreboard never
 * got written down.
 *
 * A match that ended before its first set was banked keeps every tapped
 * StatEvent but has no `match_sets` rows, and set scores are what standings
 * and season analytics are derived from. Rather than leave that match dead,
 * the scores can be typed in here.
 *
 * A row left blank (or 0-0) is treated as "this set was not played" and is
 * dropped, so an accidentally banked set can be removed too.
 */
function SetScoreEditor({
  match,
  homeShort,
  awayShort,
  onSave,
  onCancel,
}: {
  match: Match;
  homeShort: string;
  awayShort: string;
  onSave: (sets: MatchSet[]) => void;
  onCancel: () => void;
}) {
  const setNos = Array.from({ length: match.totalSets }, (_, i) => i + 1);
  const [draft, setDraft] = useState<Record<number, { home: string; away: string }>>(
    () => {
      const d: Record<number, { home: string; away: string }> = {};
      for (const n of setNos) {
        const existing = match.setScores.find((s) => s.setNo === n);
        d[n] = {
          home: existing ? String(existing.homePoints) : "",
          away: existing ? String(existing.awayPoints) : "",
        };
      }
      return d;
    },
  );

  /** Digits only, and never negative — the input cannot produce a bad score. */
  const clean = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 3);

  const set = (n: number, side: "home" | "away", v: string) =>
    setDraft((d) => ({ ...d, [n]: { ...d[n], [side]: clean(v) } }));

  const built: MatchSet[] = setNos
    .map((n) => ({
      setNo: n,
      homePoints: Number(draft[n].home || 0),
      awayPoints: Number(draft[n].away || 0),
    }))
    // 0-0 means "not played": dropping it is how a set gets removed.
    .filter((s) => s.homePoints > 0 || s.awayPoints > 0);

  // Sets must be consecutive from 1 — a score for set 3 with set 2 blank would
  // silently renumber nothing and read as a two-set match with a gap.
  const gap = built.some((s, i) => s.setNo !== i + 1);

  const tally = built.reduce(
    (t, s) => ({
      home: t.home + (s.homePoints > s.awayPoints ? 1 : 0),
      away: t.away + (s.awayPoints > s.homePoints ? 1 : 0),
    }),
    { home: 0, away: 0 },
  );
  const drawnSet = built.some((s) => s.homePoints === s.awayPoints);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
        <span>Set</span>
        <span>
          {homeShort} &middot; {awayShort}
        </span>
      </div>

      {setNos.map((n) => (
        <div key={n} className="flex items-center gap-3">
          <span className="tnum w-12 text-sm text-dim">Set {n}</span>
          <input
            inputMode="numeric"
            value={draft[n].home}
            onChange={(e) => set(n, "home", e.target.value)}
            placeholder="—"
            aria-label={`Set ${n} ${homeShort} points`}
            className="tnum min-h-11 w-full flex-1 rounded-xl border border-line bg-surface2/40 px-3 text-center text-sm font-bold text-ink outline-none focus:border-accent"
          />
          <span className="text-dim">–</span>
          <input
            inputMode="numeric"
            value={draft[n].away}
            onChange={(e) => set(n, "away", e.target.value)}
            placeholder="—"
            aria-label={`Set ${n} ${awayShort} points`}
            className="tnum min-h-11 w-full flex-1 rounded-xl border border-line bg-surface2/40 px-3 text-center text-sm font-bold text-ink outline-none focus:border-accent"
          />
        </div>
      ))}

      <p className="text-xs text-dim">
        Leave a set blank if it was not played. Result as entered:{" "}
        <span className="tnum font-bold text-ink">
          {tally.home}–{tally.away}
        </span>{" "}
        on sets.
      </p>

      {gap && (
        <p className="text-xs text-err">
          Sets have to run consecutively from set 1 — fill the gap before saving.
        </p>
      )}
      {drawnSet && (
        <p className="text-xs text-err">
          A set cannot finish level. Check the scores above.
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={() => onSave(built)} disabled={gap || drawnSet}>
          Save set scores
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
