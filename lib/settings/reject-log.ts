import { fullDate } from '../format'
import { subredditKey, subredditLabel } from '../gather/subreddits'

/**
 * The reject log (Phase 1 WP16, design ST5, decision V).
 *
 * "The only method surface a buyer can personally check": what the relevance
 * gate threw away, on which term, in which community, and — for an owner or an
 * admin — the excerpt it judged. The gate discards 38–61% of what an update
 * gathers, and until M8 none of that left the service role.
 *
 * TWO GRADES OF ACCESS, DECIDED IN THE DATABASE AND MIRRORED HERE. Every member
 * may read the counts and the rates (M8's column grant). Only an owner or an
 * admin sees `caption_excerpt`, `account_name` and `reason`, and that read goes
 * through a server component on the service-role client. So the shapes below
 * are split the same way: `GateCount` carries nothing a member may not see, and
 * `RejectRow` — the twenty rows with the excerpt — is built only from rows the
 * caller has already decided it may read.
 *
 * `source = 'default'` means NOBODY judged it and the gate failed open. It is
 * the only place in the product where "we did not actually decide" is
 * countable, and it is printed rather than folded into "kept".
 *
 * Pure. Rows in, rates out.
 */

export interface GateVerdict {
  platform: string
  keyword: string | null
  kept: boolean
  source: string
  createdAt: string
  /** Reddit rows carry `r/<community>` here. Absent for a member's read. */
  accountName?: string | null
}

export interface KeptRate {
  key: string
  label: string
  found: number
  kept: number
  /** kept / found as a percentage, rounded to one place. */
  keptPct: number
  /** Rows nobody judged — the gate failed open. */
  unjudged: number
}

const rate = (found: number, kept: number): number =>
  found > 0 ? Math.round((kept / found) * 1000) / 10 : 0

function tally(
  rows: readonly GateVerdict[],
  keyOf: (r: GateVerdict) => string | null,
  labelOf: (key: string) => string,
): KeptRate[] {
  const acc = new Map<string, { found: number; kept: number; unjudged: number }>()
  for (const r of rows) {
    const key = keyOf(r)
    if (!key) continue
    const row = acc.get(key) ?? { found: 0, kept: 0, unjudged: 0 }
    row.found++
    if (r.kept) row.kept++
    if (r.source === 'default') row.unjudged++
    acc.set(key, row)
  }
  return [...acc.entries()]
    .map(([key, v]) => ({ key, label: labelOf(key), ...v, keptPct: rate(v.found, v.kept) }))
    // Most-looked-at first, then worst rate: a term with 264 candidates and a
    // 2.3% rate is the row worth reading, and sorting by rate alone puts a
    // three-candidate community above it.
    .sort((a, b) => b.found - a.found || a.keptPct - b.keptPct)
}

/** Per search term. The term is what a client can act on — it is the thing
 *  they edit one panel up. */
export const keptByTerm = (rows: readonly GateVerdict[]): KeptRate[] =>
  tally(rows, (r) => (r.keyword ?? '').trim() || null, (k) => k)

/** Per platform. The discard share the record line prints. */
export const keptByPlatform = (rows: readonly GateVerdict[]): KeptRate[] =>
  tally(rows, (r) => r.platform || null, (k) => k)

/** Per Reddit community, through the one canonical fold, so `r/Prosthetics`
 *  and `prosthetics` are one row. Needs `accountName`, so it is empty on a
 *  member's read — and the caller must say "we cannot show you this" rather
 *  than print an empty table as "no communities". */
export const keptByCommunity = (rows: readonly GateVerdict[]): KeptRate[] =>
  tally(
    rows.filter((r) => r.platform === 'reddit'),
    (r) => subredditKey(r.accountName ?? '') || null,
    (k) => subredditLabel(k),
  )

export interface GateTotals {
  found: number
  kept: number
  dropped: number
  keptPct: number
  /** Nobody judged these and the gate let them through. */
  unjudged: number
  /** The day the record begins. Everything gathered before it is uncounted,
   *  which is why no month earlier than this can show a discard share. */
  firstAt: string | null
}

/**
 * How many of the most recent verdicts a RATE is computed over.
 *
 * The totals above are exact and cost three head counts. The per-term and
 * per-platform rates need the rows themselves, and the rows are unbounded:
 * 1,700 on Össur and 2,777 on Sealand today, several hundred more every update,
 * on a page any member can refresh. A thousand is PostgREST's own page (a bare
 * select caps there silently — AGENTS.md), so this is one request that can
 * never become four, and the surface says what the rates are over whenever the
 * record is bigger than the sample.
 */
export const GATE_SAMPLE = 1000

/** What to say when the rates are over a sample rather than the record. Null
 *  when the sample IS the record, because a basis line nobody needs is noise. */
export function sampleNote(sampled: number, found: number): string | null {
  if (sampled <= 0 || found <= sampled) return null
  return `Rates are over the ${sampled.toLocaleString('en-GB')} most recent judgements, of ${found.toLocaleString('en-GB')} recorded.`
}

/** The totals from COUNTS rather than from rows — three head counts and one
 *  one-row read, which is what a loader should be spending on a number it only
 *  prints. */
export function gateTotalsFrom(c: {
  found: number
  kept: number
  unjudged: number
  firstAt: string | null
}): GateTotals {
  return {
    found: c.found,
    kept: c.kept,
    dropped: c.found - c.kept,
    keptPct: rate(c.found, c.kept),
    unjudged: c.unjudged,
    firstAt: c.firstAt,
  }
}

/** The same totals over rows in hand. Kept for a caller that already holds the
 *  whole set (the scripts, and the tests that state the rule). */
export function gateTotals(rows: readonly GateVerdict[]): GateTotals {
  return gateTotalsFrom({
    found: rows.length,
    kept: rows.filter((r) => r.kept).length,
    unjudged: rows.filter((r) => r.source === 'default').length,
    firstAt: rows.reduce<string | null>((min, r) => (min === null || r.createdAt < min ? r.createdAt : min), null),
  })
}

/** The line above the table. States the record's start date every time,
 *  because "38% was set aside" without it reads as a claim about all of
 *  history and is one about a few weeks. */
export function gateSummary(t: GateTotals, tenantFirstUpdate: string | null): string {
  if (t.found === 0) return 'Nothing has been judged for this workspace yet.'
  const from = t.firstAt ? fullDate(t.firstAt) : null
  const before = t.firstAt && tenantFirstUpdate && tenantFirstUpdate.slice(0, 10) < t.firstAt.slice(0, 10)
  return [
    `${t.dropped.toLocaleString('en-GB')} of ${t.found.toLocaleString('en-GB')} candidates were set aside (${(100 - t.keptPct).toFixed(1)}%)`,
    from ? `recorded from ${from}` : null,
    before ? 'so updates before that date show no share at all' : null,
  ].filter(Boolean).join(' · ') + '.'
}

// ---- The rows an owner or an admin may read --------------------------------

export interface RejectRow {
  runId: string | null
  platform: string
  videoId: string
  accountName: string | null
  captionExcerpt: string | null
  keyword: string | null
  reason: string | null
  source: string
  createdAt: string
  /** Already appealed — the button is a statement, and a second one is the
   *  same statement (gate_appeals_unique). */
  appealed: boolean
}

/** How many discarded candidates the record shows at once. Twenty is the
 *  design's number: enough to judge the judgement, not a second corpus. */
export const REJECT_ROWS = 20

/** What "this should have been kept" files. A complaint, not a re-gather —
 *  a re-gather is Apify money spent from a button. */
export interface AppealKey {
  runId: string | null
  platform: string
  videoId: string
}

export const appealKey = (k: AppealKey): string => `${k.runId ?? 'none'}|${k.platform}|${k.videoId}`
