"use client";

import { useParams } from "next/navigation";
import { ShowcaseSkeleton, usePublished } from "@/components/showcase";
import { PlayerDashboardView } from "@/components/player-dashboard-view";

/**
 * Public Pro Player Analytics Dashboard.
 */
export default function PublicPlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const { ready, db, matches, events } = usePublished();

  if (!ready) return <ShowcaseSkeleton />;

  const player = db.players.find((p) => p.id === id);
  if (!player) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center md:px-8">
        <p aria-hidden className="stat-display text-outline text-7xl font-extrabold">
          404
        </p>
        <p className="mt-4 text-dim">Player not found.</p>
      </div>
    );
  }

  const team = db.teams.find((t) => t.id === player.teamId);

  return (
    <PlayerDashboardView
      player={player}
      team={team}
      allMatches={matches}
      allEvents={events}
      allTeams={db.teams}
      allPlayers={db.players}
    />
  );
}
