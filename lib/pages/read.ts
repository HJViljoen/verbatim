// Say when a page read failed.
//
// Every loader in this directory consumed Supabase results as `data ?? []` and
// never looked at `error`. A failed query and an empty table are the same
// value, so a broken week renders as a quiet one: the tiles say "nothing yet",
// the client believes them, and nothing anywhere says otherwise. There is no
// Sentry in this codebase and no error boundary under app/ — the server log is
// the only place a failure can surface.
//
// So these keep the graceful degradation (a page with one dead query still
// renders the rest) and add the one thing that was missing: a line saying so.
// `selectAll` already throws on error and is left alone.

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

function say(label: string, error: { message: string }): void {
  console.error(`[pages] ${label}: ${error.message}`)
}

/** Rows from a list read; `[]` on failure, with the failure logged. */
export function rows<T>(res: QueryResult, label: string): T[] {
  if (res.error) {
    say(label, res.error)
    return []
  }
  if (res.data == null) return []
  // A `maybeSingle()` result sent through here instead of `row()` is an object,
  // and casting it to T[] moves the failure to the first `.map` at render time.
  // Say it here, where the label names the read.
  if (!Array.isArray(res.data)) {
    say(label, { message: `expected rows, got ${typeof res.data} — use row() for a single read` })
    return []
  }
  return res.data as T[]
}

/** One row from a `maybeSingle()` read; null on failure, with the failure logged. */
export function row<T>(res: QueryResult, label: string): T | null {
  if (res.error) {
    say(label, res.error)
    return null
  }
  return (res.data ?? null) as T | null
}
