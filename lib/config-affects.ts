import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from './chunk'
import type { ChangeAffects, ConfigSurface } from './config-log'
import { fold } from './gather/util'
import { rivalKey } from './rivals'
import { selectAll } from './supabase-admin'

// What a configuration change broke, on the axis the product actually draws
// (Phase 1 WP1, design items 2 and 16).
//
// THE PROBLEM IN ONE SENTENCE. `config_changes.changed_at` is a wall clock and
// every chart in this product is dated by the comment, so "draw a rule at the
// date of the change" names a month the change usually did not touch.
//
// Measured, on this database. Sealand's 2026-09-09 re-tag moved 253 videos; the
// comments on those videos span 34 calendar months from 2021-12 to 2026-09, and
// in three of them the moved videos are 90-100% of the month. A rule at
// 2026-09 would say nothing about any of that. The smallest clean change in the
// dataset is retroactive too: Össur added `#runningblade` on 3 July and the
// videos it found carry comments dated 11 June.
//
// SO A CHANGE CARRIES A BAND, NOT A DATE. `affects_months` is the span of
// calendar months holding a comment on a video the change touched, computed at
// SAVE TIME because the evidence decays: `videos` has no `updated_at` and no
// history, so a month later nothing can reconstruct which rows a re-tag moved
// (that is exactly why the 2026-09-09 re-tag is unrecoverable). `changed_at`
// stays the rule's identity — what the log lists and what a reader clicks.
//
// AND WHERE THE BAND IS A FLOOR, NOT THE ANSWER. A RIVAL change is matched on
// the rival's name as a search term, and that is narrower than the change twice
// over. Measured on Sealand's analysed corpus, read-only, 2026-09-15: 61 videos
// carry 'cotopaxi' in source_keywords and 169 carry 'cotopaxi backpack', and
// `.overlaps` is exact array-element equality, so neither term finds the
// other's videos; and rival tagging is by ACCOUNT and caption match
// (lib/gather/tagging.ts tagVideo), which source_keywords does not record at
// all — 164 of the 198 analysed videos tagged Cotopaxi, 83%, carry the term
// 'cotopaxi' nowhere. The band stored for a rivals / rival_rename change is
// therefore usually a strict subset of the months that moved.
// `AffectsPlan.partial` says so; the column cannot, so a reader that draws a
// rule from it (WP11/WP14) has to treat a rival's band as "at least these
// months".
//
// WHAT IS NOT COMPUTABLE, AND SAYS SO. A term REMOVED takes nothing out of the
// corpus by itself; only the re-tag or re-gate that follows moves rows. A
// handles edit moves rows stamped by account membership, which carry no search
// term. A cadence or knobs change alters what the NEXT gather finds and touches
// no stored month. All three return null — "not known" — rather than a band
// invented to fill the column.

/** The terms a change moved, and the audiences it names.
 *
 *  `terms` are matched against `videos.source_keywords`, which stores what each
 *  gather searched, lowercased (`r/<name>` for a subreddit). */
export interface AffectsPlan {
  terms: string[]
  audiences: string[]
  /** Where the terms came from — and `none` when nothing is derivable, which is
   *  an answer rather than an empty one. */
  basis: 'terms' | 'rivals' | 'subreddits' | 'none'
  /** True when the terms are known to find LESS than the change moved, so the
   *  band that comes back is a lower bound rather than the answer. See the
   *  header: a rival is the case, and nothing on the stored row can say so. */
  partial: boolean
}

/** Two configuration values → the entries that moved, in either direction.
 *
 *  Folded, because that is how a gather stores what it searched for: an added
 *  'Topo Designs' is `topo designs` in `source_keywords`. Deduped and sorted so
 *  a plan is comparable with itself. Non-arrays (a report_day, a jsonb of
 *  handles) yield nothing: this is the array case only. */
export function changedTerms(before: unknown, after: unknown): string[] {
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(fold).filter(Boolean) : []
  const b = new Set(list(before))
  const a = new Set(list(after))
  const moved = new Set<string>()
  for (const t of b) if (!a.has(t)) moved.add(t)
  for (const t of a) if (!b.has(t)) moved.add(t)
  return [...moved].sort()
}

/** The names a rival change moved, unfolded — the audience key keeps the
 *  spelling. */
function changedNames(before: unknown, after: unknown): string[] {
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean) : []
  const b = list(before)
  const a = list(after)
  const moved = [...b.filter((n) => !a.includes(n)), ...a.filter((n) => !b.includes(n))]
  return [...new Set(moved)].sort()
}

/** What to look for, from the change itself. Pure — the query comes after. */
export function planAffects(change: {
  surface: ConfigSurface
  field?: string | null
  before?: unknown
  after?: unknown
}): AffectsPlan {
  switch (change.surface) {
    case 'terms':
      // Exact: a gather records the term it searched, verbatim and folded.
      return { terms: changedTerms(change.before, change.after), audiences: [], basis: 'terms', partial: false }
    case 'rivals': {
      const names = changedNames(change.before, change.after)
      // Partial, always: see the header — composite terms and account tagging.
      return { terms: names.map(fold).filter(Boolean), audiences: names.map(rivalKey), basis: 'rivals', partial: true }
    }
    case 'rival_rename': {
      // before/after are {name}, not arrays: the pair IS the answer.
      const from = (change.before as { name?: string } | null)?.name
      const to = (change.after as { name?: string } | null)?.name
      const names = [from, to].filter((n): n is string => Boolean(n && n.trim()))
      return {
        terms: [...new Set(names.map(fold).filter(Boolean))],
        // Old first: lib/rivals.ts stitchRenames reads the pair in that order.
        audiences: names.map(rivalKey),
        basis: 'rivals',
        partial: true,
      }
    }
    case 'subreddits': {
      const moved = changedTerms(change.before, change.after)
      return { terms: moved.map((s) => (s.startsWith('r/') ? s : `r/${s}`)), audiences: [], basis: 'subreddits', partial: false }
    }
    default:
      // handles (account membership carries no search term), cadence and knobs
      // (they change the next gather, not a stored month), entity_retag and
      // regate (the moved rows are known only to the operation itself, which
      // passes its own video ids), schedule, subjects, other.
      return { terms: [], audiences: [], basis: 'none', partial: false }
  }
}

/** A month list → the Postgres daterange literal the column stores,
 *  `[first-of-the-earliest, first-of-the-month-after-the-latest)`. Null for an
 *  empty list, because a band over nothing is not a band.
 *
 *  Accepts 'YYYY-MM' or any 'YYYY-MM-DD'; only the month is used. */
export function monthsRange(months: readonly string[]): string | null {
  const keys = [...new Set(months.map((m) => (m ?? '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort()
  if (keys.length === 0) return null
  const first = keys[0]
  const last = keys[keys.length - 1]
  const [y, mo] = last.split('-').map(Number)
  const endYear = mo === 12 ? y + 1 : y
  const endMonth = mo === 12 ? 1 : mo + 1
  const end = `${String(endYear).padStart(4, '0')}-${String(endMonth).padStart(2, '0')}-01`
  return `[${first}-01,${end})`
}

/** Does a stored `affects_months` band cover this month? The inverse of
 *  `monthsRange`, and the reader's half of it: a change draws a faint band over
 *  the months it moved, so the reading layer has to ask each month whether it is
 *  inside one. Half-open `[first, last+1)`, exactly as written; a null or
 *  malformed band covers nothing, because a band nobody can parse is not a
 *  record of anything. */
export function rangeCoversMonth(range: string | null | undefined, month: string): boolean {
  if (!range) return false
  const m = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)$/.exec(range.trim())
  if (!m) return false
  const key = (month ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  return key >= m[1] && key < m[2]
}

/** A comment's month key, in UTC — the same clock `monthly_denominators` uses
 *  (`date_trunc('month', c.comment_date at time zone 'UTC')`). */
export function monthKeyOf(commentDate: string): string | null {
  const d = new Date(commentDate)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The pair that identifies a video row. `video_id` is unique per platform,
 *  not globally, which is why nothing here trusts an id on its own. */
export interface VideoKey { platform: string; video_id: string }
type CommentDateRow = { platform: string; video_id: string; comment_date: string | null }

/**
 * The band over a known set of videos: every calendar month holding a dated
 * comment on one of them, as a daterange literal.
 *
 * This is the half a corpus operation supplies for itself. A re-tag knows
 * exactly which rows it moved and nothing else ever will — `videos` has no
 * `updated_at` and no history, which is why the 2026-09-09 re-tag's moved set
 * is gone — so the operation computes its band while it still can.
 */
export async function monthsOfVideos(
  client: SupabaseClient,
  clientId: string,
  videos: readonly VideoKey[],
): Promise<string | null> {
  if (videos.length === 0) return null
  const wanted = new Set(videos.map((v) => `${v.platform}::${v.video_id}`))
  const months: string[] = []
  for (const ids of chunk([...new Set(videos.map((v) => v.video_id))], 200)) {
    const rows = await selectAll<CommentDateRow>(() =>
      client
        .from('comments')
        .select('platform, video_id, comment_date')
        .eq('client_id', clientId)
        .not('comment_date', 'is', null)
        .in('video_id', ids),
    )
    for (const r of rows) {
      if (!r.comment_date || !wanted.has(`${r.platform}::${r.video_id}`)) continue
      const key = monthKeyOf(r.comment_date)
      if (key) months.push(key)
    }
  }
  return monthsRange(months)
}

/**
 * The calendar months a change could have moved, as a daterange literal.
 *
 * One query shape, twice: the analysed videos whose `source_keywords` carry a
 * moved term, then the dated comments under them. Analysed only, because an
 * unanalysed video is in no month reading — a month it alone appears in was not
 * moved by anything.
 *
 * Null when nothing is derivable (see the header) or when the moved videos
 * carry no dated comment. Never throws the caller's write away: the change has
 * already happened by the time this is asked, so a failure here is logged and
 * becomes "not known", the same asymmetry `recordConfigChanges` has.
 */
export async function affectsMonths(
  client: SupabaseClient,
  clientId: string,
  change: { surface: ConfigSurface; field?: string | null; before?: unknown; after?: unknown },
): Promise<string | null> {
  const plan = planAffects(change)
  if (plan.terms.length === 0) return null
  try {
    const videos = await selectAll<VideoKey>(() =>
      client
        .from('videos')
        .select('platform, video_id')
        .eq('client_id', clientId)
        .not('analyzed_run_id', 'is', null)
        .overlaps('source_keywords', plan.terms),
    )
    return await monthsOfVideos(client, clientId, videos)
  } catch (error) {
    const msg = (error as { message?: string }).message ?? String(error)
    console.error(`[config-affects] months not computed for ${clientId} (${change.surface}): ${msg}`)
    return null
  }
}

/** Both halves at once, ready for `ConfigChangeInput.affects`. */
export async function affectsFor(
  client: SupabaseClient,
  clientId: string,
  change: { surface: ConfigSurface; field?: string | null; before?: unknown; after?: unknown },
): Promise<ChangeAffects> {
  const plan = planAffects(change)
  return {
    audiences: plan.audiences.length ? plan.audiences : null,
    months: await affectsMonths(client, clientId, change),
  }
}
