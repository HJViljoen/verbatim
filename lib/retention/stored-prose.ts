import type { SupabaseClient } from '@supabase/supabase-js'

import { isMissingColumnError, selectAll } from '../supabase-admin'

// Stored model prose that can carry an erased commenter's words, scrubbed on
// an erasure request (scripts/erase-commenter.ts, step 7b).
//
// A plan check's model prose is written AFTER the model was shown real
// comments, so it can repeat a commenter's words even though no quote field is
// stored: each claim's `theySay` (the verdict pass's reading), and the
// judgement ("What I'd take from that"), which is written from those readings.
// Both are on the upload's row (`plan_checks`) and on every re-reading's
// (`plan_check_evaluations`, whose `judgement` column arrives with
// 20261113090000; until then its rows carry none and are read without it).
// The insight ids those rows store resolve through evidence rows the erasure
// has already deleted, so the live quotes go on their own; the prose does not.
//
// Same treatment as the script's report copies: the erased text is replaced in
// place, best effort, by exact match.

export const ERASED_WORDS = '[removed at the commenter\'s request]'

/** Every occurrence of every erased text, replaced. Pure. */
export function scrubText(s: string, texts: readonly string[]): string {
  let out = s
  for (const t of texts) if (t) out = out.split(t).join(ERASED_WORDS)
  return out
}

type TextItem = { text?: string | null }
type ClaimItem = { theySay?: string | null }

/**
 * One plan-check row: each claim's `theySay` and each judgement's `text`.
 * Returns the columns that changed, or null where nothing did. Items of an
 * unexpected shape are left as they are. Pure.
 */
export function scrubPlanCheckRow(
  row: { claims?: unknown; judgement?: unknown },
  texts: readonly string[],
): { claims?: unknown[]; judgement?: unknown[] } | null {
  const patch: { claims?: unknown[]; judgement?: unknown[] } = {}
  if (Array.isArray(row.claims)) {
    let touched = false
    const next = row.claims.map((c: ClaimItem | null) => {
      const said = typeof c?.theySay === 'string' ? c.theySay : null
      if (!said) return c
      const cleaned = scrubText(said, texts)
      if (cleaned === said) return c
      touched = true
      return { ...c, theySay: cleaned }
    })
    if (touched) patch.claims = next
  }
  if (Array.isArray(row.judgement)) {
    let touched = false
    const next = row.judgement.map((j: TextItem | null) => {
      const text = typeof j?.text === 'string' ? j.text : null
      if (!text) return j
      const cleaned = scrubText(text, texts)
      if (cleaned === text) return j
      touched = true
      return { ...j, text: cleaned }
    })
    if (touched) patch.judgement = next
  }
  return patch.claims || patch.judgement ? patch : null
}

export const PLAN_CHECK_PROSE_TABLES = ['plan_checks', 'plan_check_evaluations'] as const

/**
 * The plan-check rows of these workspaces that carry an erased text, scrubbed
 * (`apply`) or counted (a dry run). Returns how many rows carried it.
 *
 * The judgement column is probed first on each table: `selectAll` keeps only an
 * error's message, and a re-reading table without the column (its migration
 * not applied) is read for its claims alone, never skipped.
 */
export async function scrubStoredPlanChecks(
  admin: SupabaseClient,
  clientIds: readonly string[],
  texts: readonly string[],
  opts: { apply: boolean },
): Promise<number> {
  if (!clientIds.length || !texts.length) return 0
  let scrubbed = 0
  for (const table of PLAN_CHECK_PROSE_TABLES) {
    const probe = await admin.from(table).select('judgement').in('client_id', [...clientIds]).limit(1)
    if (probe.error && !isMissingColumnError(probe.error, 'judgement')) {
      throw new Error(`read ${table}: ${(probe.error as { message?: string }).message ?? probe.error}`)
    }
    type Row = { id: string; claims?: unknown; judgement?: unknown }
    const stored = probe.error
      ? await selectAll<Row>(() => admin.from(table).select('id, claims').in('client_id', [...clientIds]).order('id', { ascending: true }))
      : await selectAll<Row>(() => admin.from(table).select('id, claims, judgement').in('client_id', [...clientIds]).order('id', { ascending: true }))
    for (const row of stored) {
      const patch = scrubPlanCheckRow(row, texts)
      if (!patch) continue
      scrubbed++
      if (opts.apply) {
        const { error } = await admin.from(table).update(patch).eq('id', row.id)
        if (error) throw new Error(`scrub ${table} ${row.id}: ${(error as { message?: string }).message ?? error}`)
      }
    }
  }
  return scrubbed
}

/**
 * One post idea (`post_ideas`): its title, what the post should cover and its
 * sub-questions' labels. The idea is written from comments sent to the model
 * by handle (lib/post-ideas), and while a title or label that copies one is
 * held at write time (`copiesAComment`), the cover is never checked, so it can
 * carry a commenter's words. Returns the columns that changed, or null. Pure.
 */
export function scrubPostIdeaRow(
  row: { title?: unknown; cover?: unknown; subquestions?: unknown },
  texts: readonly string[],
): { title?: string; cover?: unknown; subquestions?: unknown[] } | null {
  const patch: { title?: string; cover?: unknown; subquestions?: unknown[] } = {}
  if (typeof row.title === 'string') {
    const cleaned = fitTitle(scrubText(row.title, texts), row.title, texts)
    if (cleaned !== row.title) patch.title = cleaned
  }
  const cover = row.cover as { text?: unknown } | null | undefined
  if (cover && typeof cover === 'object' && typeof cover.text === 'string') {
    const cleaned = scrubText(cover.text, texts)
    if (cleaned !== cover.text) patch.cover = { ...cover, text: cleaned }
  }
  if (Array.isArray(row.subquestions)) {
    let touched = false
    const next = row.subquestions.map((q: { label?: unknown } | null) => {
      if (!q || typeof q.label !== 'string') return q
      const cleaned = scrubText(q.label, texts)
      if (cleaned === q.label) return q
      touched = true
      return { ...q, label: cleaned }
    })
    if (touched) patch.subquestions = next
  }
  return Object.keys(patch).length ? patch : null
}

/** `post_ideas_title_check`: 1 to 200 characters, trimmed. */
export const POST_IDEA_TITLE_MAX = 200
const SHORT_ERASED = '[removed]'

/**
 * A scrubbed title inside the table's check. The marker is longer than the
 * shortest text it replaces, so a title near the limit could pass it and the
 * write would fail: then the short marker, and where even that is too long,
 * the title cut at the last space before the limit. Never empty. Pure.
 */
export function fitTitle(scrubbed: string, original: string, texts: readonly string[]): string {
  if (scrubbed.trim().length <= POST_IDEA_TITLE_MAX) return scrubbed
  let short = original
  for (const t of texts) if (t) short = short.split(t).join(SHORT_ERASED)
  if (short.trim().length <= POST_IDEA_TITLE_MAX) return short
  const cut = short.trim().slice(0, POST_IDEA_TITLE_MAX)
  const space = cut.lastIndexOf(' ')
  return (space > 0 ? cut.slice(0, space) : cut).trim() || SHORT_ERASED
}

/** "There is no such table here" (its migration not applied), and nothing
 *  else. */
export function isMissingTable(error: unknown, table: string): boolean {
  const { code, message } = (typeof error === 'object' && error ? error : {}) as { code?: string; message?: string }
  return ['PGRST205', '42P01'].includes(code ?? '') && (message ?? '').includes(table)
}

/**
 * These workspaces' post ideas that carry an erased text, scrubbed (`apply`)
 * or counted. Returns how many rows carried it; 0 where the table is not in
 * this database.
 */
export async function scrubStoredPostIdeas(
  admin: SupabaseClient,
  clientIds: readonly string[],
  texts: readonly string[],
  opts: { apply: boolean },
): Promise<number> {
  if (!clientIds.length || !texts.length) return 0
  const probe = await admin.from('post_ideas').select('id').in('client_id', [...clientIds]).limit(1)
  if (probe.error) {
    if (isMissingTable(probe.error, 'post_ideas')) return 0
    throw new Error(`read post_ideas: ${(probe.error as { message?: string }).message ?? probe.error}`)
  }
  const stored = await selectAll<{ id: string; title?: unknown; cover?: unknown; subquestions?: unknown }>(() =>
    admin.from('post_ideas').select('id, title, cover, subquestions').in('client_id', [...clientIds]).order('id', { ascending: true }),
  )
  let scrubbed = 0
  for (const row of stored) {
    const patch = scrubPostIdeaRow(row, texts)
    if (!patch) continue
    scrubbed++
    if (opts.apply) {
      const { error } = await admin.from('post_ideas').update(patch).eq('id', row.id)
      if (error) throw new Error(`scrub post_ideas ${row.id}: ${(error as { message?: string }).message ?? error}`)
    }
  }
  return scrubbed
}
