import type { MatchAnalytics, TeamStatLine } from "./framework";

/**
 * NARRATIVE ENGINE — the "AI-generated" match summary & insights.
 *
 * This is a deterministic, offline generator: it reads the structured
 * MatchAnalytics and writes natural-language prose from templated rules. No
 * external model call, so it works instantly in demos and never invents a
 * number it can't point to. The public surface (`generateSummary`,
 * `generateInsights`) is model-agnostic — a real LLM can later back the same
 * two functions without any change to callers.
 */

export interface Insight {
  icon: string;
  title: string;
  body: string;
  tone: "accent" | "azure" | "ok" | "err" | "violet";
}

interface Names {
  home: string;
  away: string;
}

function stat(line: TeamStatLine, key: string): number | null {
  const s = line.stats.find((x) => x.key === key);
  if (!s) return null;
  const v = typeof s.value === "number" ? s.value : parseFloat(String(s.value));
  return Number.isFinite(v) ? v : null;
}

function marginPhrase(homeSets: number, awaySets: number): string {
  const diff = Math.abs(homeSets - awaySets);
  const total = homeSets + awaySets;
  if (total >= 5) return "in a five-set thriller";
  if (diff >= 2 && Math.min(homeSets, awaySets) === 0) return "in a straight-sets sweep";
  if (diff === 1) return "in a tight contest";
  return "in a hard-fought win";
}

/** A 2–4 sentence auto-generated match summary. */
export function generateSummary(a: MatchAnalytics, names: Names): string {
  const { result } = a;
  if (result.winner === null) {
    return `${names.home} and ${names.away} finished level at ${result.scoreline} on the available data. Not enough was recorded to call a decisive story — the box score below carries what was logged.`;
  }
  const winnerName = result.winner === "home" ? names.home : names.away;
  const loserName = result.winner === "home" ? names.away : names.home;
  const winnerLine = result.winner === "home" ? a.teamStats.home : a.teamStats.away;
  const loserLine = result.winner === "home" ? a.teamStats.away : a.teamStats.home;

  const parts: string[] = [];
  parts.push(
    `${winnerName} beat ${loserName} ${result.scoreline} ${marginPhrase(
      result.homeSetsWon,
      result.awaySetsWon,
    )}.`,
  );

  // What decided it — pick the winner's strongest edge.
  const edges: { label: string; wv: number; lv: number }[] = [
    { label: "attacking", wv: stat(winnerLine, "kills") ?? 0, lv: stat(loserLine, "kills") ?? 0 },
    { label: "serving", wv: stat(winnerLine, "aces") ?? 0, lv: stat(loserLine, "aces") ?? 0 },
    { label: "blocking", wv: stat(winnerLine, "blocks") ?? 0, lv: stat(loserLine, "blocks") ?? 0 },
  ];
  const topEdge = edges
    .filter((e) => e.wv > e.lv)
    .sort((x, y) => y.wv - y.lv - (x.wv - x.lv))[0];
  if (topEdge) {
    parts.push(
      `The difference was ${topEdge.label}: ${topEdge.wv} to ${topEdge.lv}.`,
    );
  }

  const mvp = a.performers.find((p) => p.award === "MVP");
  if (mvp) {
    parts.push(
      `${mvp.name} led all performers with an impact rating of ${mvp.value}${mvp.detail ? ` (${mvp.detail})` : ""}.`,
    );
  }

  const run = a.headline.find((k) => k.key === "run");
  if (run && typeof run.value === "number" && run.value >= 4) {
    parts.push(`A ${run.value}-point run${run.hint ? ` from ${run.hint}` : ""} proved pivotal to the momentum.`);
  }

  return parts.join(" ");
}

/** Auto-generated tactical insights, most significant first. */
export function generateInsights(a: MatchAnalytics, names: Names): Insight[] {
  const insights: Insight[] = [];
  const h = a.teamStats.home;
  const aw = a.teamStats.away;

  // Serving.
  const hAces = stat(h, "aces") ?? 0;
  const aAces = stat(aw, "aces") ?? 0;
  if (Math.max(hAces, aAces) >= 3 && hAces !== aAces) {
    const lead = hAces > aAces ? names.home : names.away;
    insights.push({
      icon: "🎯",
      title: "Serving pressure told",
      tone: "accent",
      body: `${lead} out-aced the opposition ${Math.max(hAces, aAces)}–${Math.min(hAces, aAces)}, repeatedly starting rallies on the front foot.`,
    });
  }

  // Errors.
  const hErr = errorTotal(h);
  const aErr = errorTotal(aw);
  if (Math.abs(hErr - aErr) >= 4) {
    const cleaner = hErr < aErr ? names.home : names.away;
    insights.push({
      icon: "🧹",
      title: "Discipline gap",
      tone: "ok",
      body: `${cleaner} were the cleaner side, conceding ${Math.min(hErr, aErr)} unforced points to ${Math.max(hErr, aErr)} — a margin that swung several rallies.`,
    });
  }

  // Reception.
  const hRecv = stat(h, "recvEff");
  const aRecv = stat(aw, "recvEff");
  if (hRecv != null && aRecv != null && Math.abs(hRecv - aRecv) >= 8) {
    const better = hRecv > aRecv ? names.home : names.away;
    insights.push({
      icon: "🛡️",
      title: "Passing set the platform",
      tone: "azure",
      body: `${better} passed at ${Math.max(hRecv, aRecv)}% positive reception vs ${Math.min(hRecv, aRecv)}%, giving their setter far more to work with.`,
    });
  }

  // Side-out battle.
  const hSide = stat(h, "sideout");
  const aSide = stat(aw, "sideout");
  if (hSide != null && aSide != null && Math.abs(hSide - aSide) >= 6) {
    const better = hSide > aSide ? names.home : names.away;
    insights.push({
      icon: "🔁",
      title: "Won the side-out battle",
      tone: "violet",
      body: `${better} sided out at ${Math.max(hSide, aSide)}%, breaking serve runs before they built.`,
    });
  }

  // Attack efficiency.
  const hAtt = stat(h, "attPct");
  const aAtt = stat(aw, "attPct");
  if (hAtt != null && aAtt != null && Math.abs(hAtt - aAtt) >= 6) {
    const better = hAtt > aAtt ? names.home : names.away;
    insights.push({
      icon: "💥",
      title: "Attack efficiency",
      tone: "accent",
      body: `${better} converted attacks at ${Math.max(hAtt, aAtt)}% to ${Math.min(hAtt, aAtt)}%, finishing rallies the opponent kept extending.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      icon: "📊",
      title: "An even contest",
      tone: "azure",
      body: `The two sides were closely matched across the core metrics — no single department ran away with it. The charts below show where the small margins fell.`,
    });
  }

  return insights.slice(0, 5);
}

function errorTotal(line: TeamStatLine): number {
  return (
    (numOr0(line, "attErr")) +
    (numOr0(line, "serveErr")) +
    (numOr0(line, "recvErr"))
  );
}
function numOr0(line: TeamStatLine, key: string): number {
  return stat(line, key) ?? 0;
}
