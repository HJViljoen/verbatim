/**
 * How a stored file's size prints, once.
 *
 * It was a `const` inside `app/dashboard/reports/page.tsx` and the brief cards
 * now print it too (Block D wave 2). Two copies of a formatter is two ways to
 * round one number, which is the rule `lib/prose/figures.ts` states for
 * figures and holds just as well for bytes.
 *
 * MB past a million, KB below it, and never "0 KB" for a file that exists —
 * a 400-byte PDF is a file, and a row saying it is nothing is a row a reader
 * will not click.
 */
export function fmtBytes(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`
}
