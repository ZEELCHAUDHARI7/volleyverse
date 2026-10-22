/** The word for `n` of something: "ace", "aces". Pass the plural when adding "s" is wrong. */
export function pluralWord(n: number, singular: string, pluralForm = `${singular}s`): string {
  return n === 1 ? singular : pluralForm;
}

/** "1 point", "2 points". */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${pluralWord(n, singular, pluralForm)}`;
}

/** A score to at most one decimal place: 2 → "2", 3.5 → "3.5". */
export function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
