import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../chunk'
import { normForMatch } from '../pipeline/quote-match'
import { selectAll } from '../supabase-admin'
import { proseNeedles, scrubJson } from './analysis-prose'
import { isMissingTable } from './stored-prose'
import { REGATE_BACKUP_TABLE } from './youtube-refresh'

// The regate's backup, on an erasure request (scripts/erase-commenter.ts).
//
// `regate_videos()` (supabase/migrations/20261109090000_products.sql:867)
// copies every row it removes into `regate_backup` first, whole, as jsonb:
// the video, its COMMENTS (author and text), their insights, evidence,
// language samples, translations and mentions. It keeps them 30 days, and
// `regate_restore(batch)` puts a batch back. So a commenter whose video was
// regated is not in `comments` at all, and erasure that only reads `comments`
// finds nothing, says "nothing to erase", and leaves their words where an undo
// would restore them past the suppression (which is checked at ingest, never
// at restore).
//
// Three things, in the script's order:
//   1. FIND the handle's backed-up comments as the script finds live ones
//      (that platform, the author case-insensitive), so their words are
//      looked for by every scrub and their ids reach the delete.
//   2. SCRUB the backed-up prose (an insight's theme and description, an
//      owned-account event's explanation, theme labels and hero quote), the
//      analysis sweep's rule.
//   3. REMOVE, with the delete, the backup rows that ARE the commenter's: the
//      comment rows, and the rows hanging off them (an undo of evidence whose
//      comment is gone would fail on its foreign key).
// A database without the table holds no backup: nothing to find, scrub or
// remove. One whose service role may not delete from it (20261106094000 not
// applied) fails the removal, and the comments stay for a re-run.

/** PostgREST turns '*' into '%' inside ilike patterns, so escape it too. */
export const escapeLike = (s: string) => s.replace(/[\\%_*]/g, (m) => `\\${m}`)

/** A backed-up comment, as its row held it. */
export interface BackedUpComment {
  id: string
  client_id: string
  author: string | null
  text: string | null
  platform: string
  video_id: string
  comment_id: string
}

const messageOf = (e: unknown) => (e as { message?: string } | null)?.message ?? String(e)

/** Is the table here? A missing one is "no backup"; any other error throws. */
async function backupHere(admin: SupabaseClient): Promise<boolean> {
  const probe = await admin.from(REGATE_BACKUP_TABLE).select('batch_id').limit(1)
  if (!probe.error) return true
  if (isMissingTable(probe.error, REGATE_BACKUP_TABLE)) return false
  throw new Error(`read ${REGATE_BACKUP_TABLE}: ${messageOf(probe.error)}`)
}

/**
 * The comments of these author strings on this platform that a regate backed
 * up, every tenant's, once each (a comment regated twice is in two batches).
 * `patterns` are the handle's forms; equality is case-insensitive, as the
 * script's live match is.
 */
export async function findBackedUpComments(
  admin: SupabaseClient,
  platform: string,
  patterns: readonly string[],
): Promise<BackedUpComment[]> {
  if (!patterns.length || !(await backupHere(admin))) return []
  const wanted = new Set(patterns.map((p) => p.trim().toLowerCase()))
  const found = new Map<string, BackedUpComment>()
  for (const p of patterns) {
    const rows = await selectAll<{ row_data: BackedUpComment | null }>(() =>
      admin.from(REGATE_BACKUP_TABLE).select('row_data')
        .eq('source_table', 'comments').eq('row_data->>platform', platform).ilike('row_data->>author', escapeLike(p))
        .order('row_data->>id', { ascending: true }),
    )
    for (const { row_data: c } of rows) {
      if (c?.id && c.author && wanted.has(c.author.trim().toLowerCase())) found.set(c.id, c)
    }
  }
  return [...found.values()]
}

/** The backed-up tables that hold prose, and its fields. */
const BACKUP_PROSE: Record<string, readonly string[]> = {
  audience_insights: ['theme', 'description', 'evidence'],
  account_events: ['explanation', 'supporting_theme_labels'],
}

/**
 * One backup row's data with the erased words gone: its prose scrubbed by the
 * analysis sweep's rule, and an event's hero quote nulled where it is part of
 * an erased comment (the live hero-quote rule, lib/pipeline/hero-quotes.ts).
 * Null where nothing changed. Pure.
 */
export function scrubBackupRow(
  sourceTable: string,
  rowData: Record<string, unknown>,
  texts: readonly string[],
): Record<string, unknown> | null {
  const fields = BACKUP_PROSE[sourceTable]
  if (!fields) return null
  const needles = proseNeedles(texts)
  const next = { ...rowData }
  let changed = false
  for (const f of fields) {
    const scrubbed = scrubJson(rowData[f], needles)
    if (scrubbed !== rowData[f]) { next[f] = scrubbed; changed = true }
  }
  const hero = rowData.hero_quote
  if (sourceTable === 'account_events' && typeof hero === 'string') {
    const needle = normForMatch(hero)
    if (needle && texts.some((t) => normForMatch(t).includes(needle))) { next.hero_quote = null; changed = true }
  }
  return changed ? next : null
}

/**
 * These workspaces' backed-up prose that carries an erased text, scrubbed
 * (`apply`) or counted. Returns how many backup rows carried it.
 */
export async function scrubRegateBackup(
  admin: SupabaseClient,
  clientIds: readonly string[],
  texts: readonly string[],
  opts: { apply: boolean },
): Promise<number> {
  if (!clientIds.length || !texts.length || !(await backupHere(admin))) return 0
  type Row = { batch_id: string; source_table: string; row_data: Record<string, unknown> | null }
  const rows = await selectAll<Row>(() =>
    admin.from(REGATE_BACKUP_TABLE).select('batch_id, source_table, row_data')
      .in('client_id', [...clientIds]).in('source_table', Object.keys(BACKUP_PROSE))
      .order('batch_id', { ascending: true }).order('row_data->>id', { ascending: true }),
  )
  let scrubbed = 0
  for (const r of rows) {
    if (!r.row_data || typeof r.row_data.id !== 'string') continue
    const next = scrubBackupRow(r.source_table, r.row_data, texts)
    if (!next) continue
    scrubbed++
    if (opts.apply) {
      const { error } = await admin.from(REGATE_BACKUP_TABLE).update({ row_data: next })
        .eq('batch_id', r.batch_id).eq('source_table', r.source_table).eq('row_data->>id', r.row_data.id)
      if (error) throw new Error(`scrub ${REGATE_BACKUP_TABLE} ${r.source_table} ${r.row_data.id}: ${messageOf(error)}`)
    }
  }
  return scrubbed
}

/** The backed-up tables whose rows hang off a comment (`comment_id`). */
export const BACKUP_COMMENT_DEPENDENTS = [
  'insight_evidence', 'language_samples', 'comment_translations', 'brand_mentions', 'product_tags', 'product_mentions',
] as const

/**
 * The backup rows that ARE these comments, or hang off them, counted and
 * (`apply`) deleted. Run with the delete, after every scrub.
 */
export async function removeBackedUpCopies(
  admin: SupabaseClient,
  commentIds: readonly string[],
  opts: { apply: boolean },
): Promise<{ comments: number; dependents: number }> {
  const out = { comments: 0, dependents: 0 }
  if (!commentIds.length || !(await backupHere(admin))) return out
  for (const part of chunk([...commentIds], 150)) {
    const own = () => admin.from(REGATE_BACKUP_TABLE).select('batch_id', { count: 'exact', head: true })
      .eq('source_table', 'comments').in('row_data->>id', part)
    const hanging = () => admin.from(REGATE_BACKUP_TABLE).select('batch_id', { count: 'exact', head: true })
      .in('source_table', [...BACKUP_COMMENT_DEPENDENTS]).in('row_data->>comment_id', part)
    const [a, b] = await Promise.all([own(), hanging()])
    if (a.error) throw new Error(`count ${REGATE_BACKUP_TABLE} comments: ${messageOf(a.error)}`)
    if (b.error) throw new Error(`count ${REGATE_BACKUP_TABLE} dependents: ${messageOf(b.error)}`)
    out.comments += a.count ?? 0
    out.dependents += b.count ?? 0
    if (!opts.apply) continue
    // The rows hanging off the comments first, then the comments: a failure
    // between the two leaves the comments, which a re-run finds again.
    if (b.count) {
      const { error } = await admin.from(REGATE_BACKUP_TABLE).delete()
        .in('source_table', [...BACKUP_COMMENT_DEPENDENTS]).in('row_data->>comment_id', part)
      if (error) throw new Error(`delete ${REGATE_BACKUP_TABLE} dependents: ${messageOf(error)}`)
    }
    if (a.count) {
      const { error } = await admin.from(REGATE_BACKUP_TABLE).delete()
        .eq('source_table', 'comments').in('row_data->>id', part)
      if (error) throw new Error(`delete ${REGATE_BACKUP_TABLE} comments: ${messageOf(error)}`)
    }
  }
  return out
}
