import { statText, type MatchAnalytics } from "./framework.ts";

/**
 * EXPORT & SHARE — client-side, no server round-trip.
 *
 * CSV is assembled by hand (analytics are small, flat tables). "PDF" export
 * uses the browser's print pipeline scoped to the dashboard, which is the
 * dependency-free way to get a clean, paginated document from a live page;
 * the print stylesheet lives in globals.css. Share uses the Web Share API
 * where available and falls back to copying a text digest to the clipboard.
 */

function download(filename: string, text: string, mime = "text/csv") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells: (string | number)[]) => cells.map(csvCell).join(",");

/** Without the byte-order mark Excel reads the file as ANSI and garbles "–" and "—". */
const csvText = (lines: string[]) => `﻿${lines.join("\n")}`;

/** A full match analytics payload as a multi-section CSV. */
export function matchCsv(
  a: MatchAnalytics,
  meta: { home: string; away: string; date: string },
): string {
  const lines: string[] = [];
  lines.push(csvRow(["Volleytics Match Analytics"]));
  lines.push(csvRow(["Fixture", `${meta.home} vs ${meta.away}`]));
  lines.push(csvRow(["Date", meta.date]));
  lines.push(csvRow(["Result", a.result.scoreline]));
  lines.push("");

  lines.push(csvRow(["Headline"]));
  lines.push(csvRow(["Metric", "Value"]));
  for (const k of a.headline) lines.push(csvRow([k.label, statText(k.value, k.unit)]));
  lines.push("");

  lines.push(csvRow(["Team comparison"]));
  lines.push(csvRow(["Metric", meta.home, meta.away]));
  for (const c of a.comparison)
    lines.push(csvRow([c.label, statText(c.home, c.unit), statText(c.away, c.unit)]));
  lines.push("");

  lines.push(csvRow(["Team statistics"]));
  lines.push(csvRow(["Metric", meta.home, meta.away]));
  const away = new Map(a.teamStats.away.stats.map((s) => [s.key, s]));
  for (const s of a.teamStats.home.stats) {
    const av = away.get(s.key);
    lines.push(csvRow([s.label, statText(s.value, s.unit), av ? statText(av.value, av.unit) : ""]));
  }
  lines.push("");

  lines.push(csvRow(["Box score"]));
  lines.push(csvRow(a.boxScore.columns.map((c) => c.label)));
  for (const r of a.boxScore.rows)
    lines.push(csvRow(a.boxScore.columns.map((c) => r[c.key] ?? "")));

  return csvText(lines);
}

/** Download a match's analytics as CSV. */
export function exportMatchCsv(
  a: MatchAnalytics,
  meta: { home: string; away: string; date: string },
): void {
  download(`analytics_${slug(meta.home)}_vs_${slug(meta.away)}.csv`, matchCsv(a, meta));
}

/** Any flat table (season records etc.) as CSV. */
export function tableCsv(headers: string[], rows: (string | number)[][]): string {
  return csvText([csvRow(headers), ...rows.map(csvRow)]);
}

/** Download a flat table as CSV. */
export function exportTableCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  download(filename, tableCsv(headers, rows));
}

/** Print-to-PDF: the print stylesheet limits output to the dashboard. */
export function exportPdf(): void {
  window.print();
}

/** Share via Web Share API, else copy a text digest to the clipboard. */
export async function shareAnalytics(
  a: MatchAnalytics,
  meta: { home: string; away: string },
): Promise<"shared" | "copied" | "failed"> {
  const text = `${meta.home} ${a.result.scoreline} ${meta.away} — Volleytics analytics.\n${a.headline
    .slice(0, 4)
    .map((k) => `${k.label}: ${statText(k.value, k.unit)}`)
    .join(" · ")}`;
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: "Match Analytics", text });
      return "shared";
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch {
    return "failed";
  }
  return "failed";
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
