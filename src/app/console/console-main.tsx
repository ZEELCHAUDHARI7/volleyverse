/**
 * The console's content column: every routed page gets the same centered,
 * padded column.
 *
 * This was a client component only to special-case the full-bleed sign-in
 * panel. With sign-in gone there is nothing to branch on, so it is a plain
 * server component again — one less client boundary in the shell.
 */
export function ConsoleMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      {children}
    </main>
  );
}
