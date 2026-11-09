import type { SupabaseClient } from '@supabase/supabase-js'

import { markSnapshotsStale } from '../artifacts'
import { isMissingColumnError, selectAll } from '../supabase-admin'
import { isMissingTable, scrubText } from './stored-prose'

// The analysis's own prose, scrubbed on an erasure request
// (scripts/erase-commenter.ts, step 7f; plan ~/.claude/plans/verbatim-erase-prose.md).
//
// Every pass that reads comments writes prose about them, and a model that has
// just read a comment can repeat it: Pass A's insight themes and descriptions,
// D-a's market insights and the run's executive brief, D-b's recommendations,
// the owned-account events' explanations. What is written FROM that prose
// (the themes and their registry, the profiles, the week's read, the subject
// reads, the briefs) can carry the words on, and a snapshot freezes them into
// every artefact built from it. None of it has a foreign key to `comments`, so
// deleting the comment leaves it all standing; this is the sweep.
//
// THE SAME MATCH AS THE REST OF THE SCRIPT, NARROWED ONCE. A stored string is
// scrubbed where it contains one of the erased texts whole (8+ characters,
// whitespace normalised), replaced with the same marker. The narrowing: a text
// of ONE word is not looked for here. "Gorgeous!" or "frustrating" is a word
// the model and a hundred other commenters use, and across a workspace's whole
// analysis it would erase their words, not this person's; the comment itself
// still goes. A text of two words or more is looked for everywhere. (It also
// means a stored string with no space in it, an id, a kind, a sentiment word,
// can never match, so a JSON column keeps its shape and every value a renderer
// switches on.)
//
// SAFE ON A ROW OF ANY AGE OR SHAPE. A column is walked, not read by a type:
// every string inside it, at any depth, is scrubbed in place, and nothing else
// changes (keys, numbers, arrays, nulls, order). A column this database does
// not have yet is skipped; a table it does not have reads as nothing. Scrubbing
// twice changes nothing, since the words are already gone.

/** The erased texts this sweep looks for: two words or more, longest first (a
 *  text inside another must not break the longer one's match). Pure. */
export function proseNeedles(texts: readonly string[]): string[] {
  return [...new Set(texts.map((t) => t.trim()).filter((t) => /\s/.test(t)))].sort((a, b) => b.length - a.length)
}

/**
 * A JSON value (or a text, or a text array) with every string inside it
 * scrubbed, the shape kept. The SAME value (===) where nothing changed, so a
 * caller can tell a row that carried the words from one that did not. Pure.
 */
export function scrubJson(value: unknown, needles: readonly string[]): unknown {
  if (typeof value === 'string') return scrubText(value, needles)
  if (Array.isArray(value)) {
    let changed = false
    const out = value.map((v) => {
      const next = scrubJson(v, needles)
      if (next !== v) changed = true
      return next
    })
    return changed ? out : value
  }
  if (value && typeof value === 'object') {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = scrubJson(v, needles)
      if (next !== v) changed = true
      out[k] = next
    }
    return changed ? out : value
  }
  return value
}

/** One table of stored prose: the row's key, and the columns (text, text[] or
 *  jsonb) whose strings can carry a commenter's words. Every table has
 *  `client_id`. */
export interface ProseTable {
  table: string
  key: readonly string[]
  columns: readonly string[]
}

/**
 * Where the analysis keeps prose written from (or after) a commenter's words,
 * each with its writer. The inventory with the reasons is in the plan.
 */
export const ANALYSIS_PROSE_TABLES: readonly ProseTable[] = [
  // Pass A (lib/pipeline/pass-a.ts:1281): read the comments. `evidence` is the
  // legacy jsonb from before insight_evidence; a current row holds [].
  { table: 'audience_insights', key: ['id'], columns: ['theme', 'description', 'evidence'] },
  // Pass B (lib/pipeline/themes.ts:544, :395/:421/:482, :463): written from
  // the insights' themes and descriptions.
  { table: 'themes', key: ['id'], columns: ['label', 'description', 'member_themes'] },
  { table: 'theme_registry', key: ['id'], columns: ['canonical_label', 'description'] },
  { table: 'theme_observations', key: ['id'], columns: ['label'] },
  // Pass D-a (lib/pipeline/pass-d.ts:700): shown the audiences' quotes. Its
  // brief, consumer-intelligence summary and say vs hear are on the run's
  // summary (lib/pipeline/run-summary.ts:105); top_insights and
  // wow_highlights are legacy columns an old row can still carry.
  { table: 'market_insights', key: ['id'], columns: ['title', 'description', 'evidence'] },
  { table: 'run_summary', key: ['id'], columns: ['executive_brief', 'consumer_intelligence_summary', 'say_vs_hear', 'top_insights', 'wow_highlights'] },
  // Pass C (lib/pipeline/pass-c.ts:394).
  { table: 'competitive_insights', key: ['id'], columns: ['title', 'finding', 'evidence'] },
  // Pass D-b (lib/pipeline/pass-d.ts:919): grounded in verbatim evidence.
  { table: 'recommendations', key: ['id'], columns: ['title', 'reasoning', 'based_on'] },
  // Owned-account events (lib/pipeline/owned-events.ts:523): shown comment text.
  { table: 'account_events', key: ['id'], columns: ['explanation', 'supporting_theme_labels'] },
  // Pass E (lib/pipeline/pass-e.ts:415): the personas' quotes are dropped
  // before the write, their prose is not.
  { table: 'consumer_profiles', key: ['id'], columns: ['headline', 'personas', 'dropped'] },
  // The written reads (lib/written/store.ts:60): the week's read, the long-run
  // read and the subjects' reads, quotes as refs, prose from the research.
  { table: 'week_reads', key: ['id'], columns: ['data'] },
  // A statement's reading (lib/statements/measure.ts:617): what the market says.
  { table: 'client_statement_readings', key: ['statement_id', 'month'], columns: ['data'] },
  // The monthly briefs' held headlines (lib/reports/briefs/store.ts:97); the
  // briefs' own words are in their snapshot.
  { table: 'monthly_briefs', key: ['id'], columns: ['held'] },
  // FROZEN ARTEFACTS (lib/snapshots.ts:69, lib/reports/briefs/store.ts:172,
  // lib/reports/reading-stamp.ts:63): every weekly read, brief, document and
  // export freezes the prose above as it stood. The share page and "the email
  // as sent" re-render from here, so scrubbing the snapshot reaches them; a
  // stored PDF or PNG of it does not, and the script deletes those
  // (`deleteSnapshotFiles`, run as each snapshot's `after`).
  { table: 'report_snapshots', key: ['id'], columns: ['title', 'data', 'workings'] },
  { table: 'reports', key: ['id'], columns: ['sections', 'cover'] },
  // A sent email's subject line.
  { table: 'report_sends', key: ['id'], columns: ['subject'] },
]

type Row = Record<string, unknown>

/** The columns of one row that carried the words, scrubbed; null where none
 *  did. Pure. */
export function scrubProseRow(row: Row, columns: readonly string[], needles: readonly string[]): Row | null {
  const patch: Row = {}
  for (const c of columns) {
    const next = scrubJson(row[c], needles)
    if (next !== row[c]) patch[c] = next
  }
  return Object.keys(patch).length ? patch : null
}

const messageOf = (e: unknown) => (e as { message?: string } | null)?.message ?? String(e)

/**
 * The spec's columns this database has, or null where it has no such table.
 * One probe read per missing column: a deploy can land before its migration,
 * and a column that is not there yet holds nothing to scrub.
 */
async function columnsHere(admin: SupabaseClient, spec: ProseTable, clientIds: readonly string[]): Promise<string[] | null> {
  // Longest first, so "canonical_label" is not read as "label" in a message.
  let cols = [...spec.columns].sort((a, b) => b.length - a.length)
  while (cols.length) {
    const probe = await admin.from(spec.table).select([...spec.key, ...cols].join(', ')).in('client_id', [...clientIds]).limit(1)
    if (!probe.error) return spec.columns.filter((c) => cols.includes(c))
    if (isMissingTable(probe.error, spec.table)) return null
    const gone = cols.find((c) => isMissingColumnError(probe.error, c))
    if (!gone) throw new Error(`read ${spec.table}: ${messageOf(probe.error)}`)
    cols = cols.filter((c) => c !== gone)
  }
  return []
}

export interface ProseScrubResult {
  /** Rows that carried an erased text. */
  rows: number
  /** Their keys, as the spec names them (the snapshots' ids, for the files
   *  built from them). */
  keys: Row[]
}

/**
 * One table's rows of these workspaces that carry an erased text, scrubbed
 * (`apply`) or counted (a dry run). Throws on a read or write that fails, so
 * the script's step fails and the comments are not deleted.
 *
 * `after` runs once a row is scrubbed (with `apply` only): the snapshots'
 * stored files are deleted there, AFTER their words are gone, so a download
 * that re-renders in between can only print the scrubbed snapshot (step 8's
 * order: the source first, then the files). Where it throws, the row is put
 * back as it was, so a re-run still finds it by its words and tries again;
 * the other rows go on, and the call then throws naming every failure.
 */
export async function scrubStoredProse(
  admin: SupabaseClient,
  spec: ProseTable,
  clientIds: readonly string[],
  texts: readonly string[],
  opts: { apply: boolean; after?: (key: Row) => Promise<void> },
): Promise<ProseScrubResult> {
  const needles = proseNeedles(texts)
  const none: ProseScrubResult = { rows: 0, keys: [] }
  if (!clientIds.length || !needles.length) return none
  const cols = await columnsHere(admin, spec, clientIds)
  if (!cols?.length) return none
  // A column list built at run time: typed as '*' (the client is untyped
  // either way), so the rows read as records.
  const select = [...spec.key, ...cols].join(', ') as '*'
  const stored = await selectAll<Row>(() => {
    let q = admin.from(spec.table).select(select).in('client_id', [...clientIds])
    for (const k of spec.key) q = q.order(k, { ascending: true })
    return q
  })
  const out: ProseScrubResult = { rows: 0, keys: [] }
  const failed: string[] = []
  for (const row of stored) {
    const patch = scrubProseRow(row, cols, needles)
    if (!patch) continue
    const key = Object.fromEntries(spec.key.map((k) => [k, row[k]]))
    out.rows++
    out.keys.push(key)
    if (!opts.apply) continue
    // What the row held, taken before the write, to put it back with.
    const was = Object.fromEntries(Object.keys(patch).map((c) => [c, structuredClone(row[c])]))
    const { error } = await admin.from(spec.table).update(patch).match(key)
    if (error) throw new Error(`scrub ${spec.table} ${JSON.stringify(key)}: ${messageOf(error)}`)
    if (!opts.after) continue
    try {
      await opts.after(key)
    } catch (e) {
      const back = await admin.from(spec.table).update(was).match(key)
      failed.push(`${JSON.stringify(key)}: ${messageOf(e)}${back.error ? ` (and it could not be put back for a re-run: ${messageOf(back.error)})` : ' (put back, so a re-run finds it)'}`)
    }
  }
  if (failed.length) throw new Error(`${spec.table}: ${failed.join('; ')}`)
  return out
}

export interface StoredFile { id: string; snapshot_id: string; storage_path: string }

/** The stored files (`artifacts`, not yet stale) built from these snapshots:
 *  what a dry run says would be deleted. Read only. */
export async function filesOfSnapshots(admin: SupabaseClient, snapshotIds: readonly string[]): Promise<StoredFile[]> {
  if (!snapshotIds.length) return []
  const out: StoredFile[] = []
  for (let i = 0; i < snapshotIds.length; i += 200) {
    const { data, error } = await admin.from('artifacts').select('id, snapshot_id, storage_path').in('snapshot_id', snapshotIds.slice(i, i + 200)).eq('stale', false)
    if (error) throw new Error(`read artifacts: ${messageOf(error)}`)
    out.push(...((data ?? []) as StoredFile[]))
  }
  return out
}

/**
 * A scrubbed snapshot's stored files (its PDFs and PNGs, a brief's included),
 * deleted and flagged stale through the path steps 7d and 8 use
 * (`markSnapshotsStale`): the next download re-renders from the scrubbed
 * snapshot. Only this snapshot's files. Returns what it deleted; throws naming
 * the files where the flag or the delete fails.
 */
export async function deleteSnapshotFiles(admin: SupabaseClient, snapshotId: string): Promise<StoredFile[]> {
  const files = await filesOfSnapshots(admin, [snapshotId])
  if (!files.length) return []
  try {
    await markSnapshotsStale(admin, [snapshotId], { apply: true })
  } catch (e) {
    throw new Error(`stored files of snapshot ${snapshotId} not deleted (${files.map((f) => f.storage_path).join(', ')}): ${messageOf(e)}`)
  }
  return files
}
