/** The write a rejection message names. */
export interface RejectedWrite {
  kind: "upsert" | "update" | "delete";
  table: string;
}

/**
 * Turn a PostgREST error into something a courtside human can act on.
 *
 * PostgREST surfaces a SQLSTATE-ish `code` on anything Postgres decided:
 * 23514 check violation, 23503 foreign key, 42501 row-level security.
 */
export function describeRejection(op: RejectedWrite, err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const what =
    op.kind === "upsert"
      ? `a write to ${op.table}`
      : op.kind === "update"
        ? `an update to ${op.table}`
        : `a delete from ${op.table}`;
  const code = e?.code ?? "";
  const base = e?.message ?? String(err ?? "unknown error");
  if (code === "23514")
    return `The database rejected ${what}: a value is outside what the schema allows (${base}). A migration is probably missing — run the SQL in supabase/migrations/.`;
  if (code === "23503") return `The database rejected ${what}: it references a row that does not exist (${base}).`;
  if (code === "42501")
    return `The database rejected ${what}: row-level security will not let the anon role write (${base}). Run supabase/FIX-RLS-NOW.sql in the Supabase SQL editor, then press Retry.`;
  return `The database rejected ${what}${code ? ` [${code}]` : ""}: ${base}`;
}
