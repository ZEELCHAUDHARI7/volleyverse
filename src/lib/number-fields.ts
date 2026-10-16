/**
 * What a League Setup number box may hold. The columns behind them are
 * Postgres `integer`, so anything but a whole number is refused by the
 * database after the row is already on screen; checking here stops it first.
 * A blank box is a real answer ("not listed") and maps to null.
 */
export type NumberCheck = { ok: true; value: number | null } | { ok: false; error: string };

function wholeNumber(raw: string, min: number, max: number, error: string): NumberCheck {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, error };
  const value = Number(text);
  return value >= min && value <= max ? { ok: true, value } : { ok: false, error };
}

/** FIVB and USA Volleyball rule 4.3.3: shirts are numbered 1 to 99. */
export const checkShirtNumber = (raw: string) =>
  wholeNumber(raw, 1, 99, "Shirt numbers are whole numbers from 1 to 99.");

export const checkHeightCm = (raw: string) =>
  wholeNumber(raw, 100, 250, "Height is whole centimetres from 100 to 250.");

export const checkCapacity = (raw: string) =>
  wholeNumber(raw, 1, 200_000, "Capacity is a whole number of seats from 1 to 200,000.");
