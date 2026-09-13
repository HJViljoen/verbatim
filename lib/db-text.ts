// Making model output safe to WRITE (2026-09-13).
//
// Every write this app makes goes to PostgREST as a JSON body, and Postgres
// parses that JSON — for a jsonb column and for a text one alike. So a single
// U+0000 anywhere in the body kills the whole request with
//   22P05  unsupported Unicode escape sequence  (\u0000 cannot be converted to text)
// and a Postgres text column cannot hold one at that — the character has no
// representation in the type.
//
// Model output can contain one. On the 2026-09-13 Össur run, at 05:23:25 UTC,
// one gpt-4.1 response carried a U+0000 and took down both writes it touched:
// PATCH /rest/v1/videos and POST /rest/v1/ai_call_log, 400 apiece. Nothing
// downstream noticed, because a PostgREST error is a returned value that two
// call sites were not reading.
//
// So: anything that came out of a model passes through here on the way to a
// write. Stripped, not escaped — the characters carry no meaning in a
// transcript and we would rather lose a byte than a row:
//   - U+0000, and the other C0 controls except tab/newline/carriage return
//   - lone surrogates, which are not valid UTF-8 and so cannot survive the
//     JSON body either (a real astral pair — emoji — is left alone)

const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** One string, safe to put in a text or jsonb column. */
export function dbSafeText(s: string): string {
  return s.replace(CONTROL, '').replace(LONE_SURROGATE, '')
}

/** The same, over a whole value bound for a jsonb column: every string inside
 *  an object, array or key. Non-strings pass through untouched.
 *
 *  Pass PLAIN data: anything object-like is rebuilt from its own enumerable
 *  entries, so a Date, Map or class instance comes back as {} — fine for the
 *  log payloads this serves (they are already JSON-shaped), lossy for anything
 *  else. */
export function dbSafeJson<T>(v: T): T {
  if (typeof v === 'string') return dbSafeText(v) as unknown as T
  if (Array.isArray(v)) return v.map(dbSafeJson) as unknown as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[dbSafeText(k)] = dbSafeJson(val)
    return out as T
  }
  return v
}
