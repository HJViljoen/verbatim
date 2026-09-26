import type { SupabaseClient } from '@supabase/supabase-js'

import { brandRulesFor } from '../brands/aliases'
import { ambiguousMentions, confirmAmbiguous, countedUnlessRejected, hitKey, type ConfirmJudge } from '../brands/confirm'
import { mentionKey, type Candidate, type MentionRow } from '../brands/mentions'
import {
  BRAND_READINGS_TABLE, brandReadingRows, isMissingBrandReadings, mergeBrandRows, pooledBrandMonth, readBrands, storedBrandRows,
  writeBrandRows, type BrandRead, type BrandReadIO, type IdentityRow, type Tracking,
} from '../brands/readings'
import { brandConfirmEnabled } from '../config'
import { isMissingObject, readMonthVideos } from '../provenance/load'
import { denominatorKey, fillingMonths, isMissingMonthlyReading, monthsToRefresh, monthStartOf, nextMonth } from '../reading/monthly'
import { selectAll } from '../supabase-admin'

// The `brand-readings` step (market-first plan WP3.5, deploy 4), the last of
// the four ids before `freeze-months`: `plan-brand-readings` +
// `brand-readings:${i}-of-${n}`, one month a step.
//
// For each month the run refreshes it reads the brands over the month
// (lib/brands/readings.ts, the one copy the back-read paste shares): the new
// brand_mentions rows the rules give are inserted (append-only, per rule
// version), and month_brand_readings is written per audience and brand. As
// the lens step, a month that freezes in this run is written frozen before
// freeze-months writes the denominator marker.
//
// THE CONFIRM (lib/brands/confirm.ts) is called only where
// BRAND_CONFIRM_ENABLED is on for the tenant AND a judge is handed in; off,
// an ambiguous hit counts as the rule match it is, at $0.
//
// Non-fatal, and a no-op until MF3's month_brand_readings exists (and MF2's
// brand_mention_candidates, and for a tenant with no brand rules).

export async function planBrandReadings(admin: SupabaseClient, clientId: string, now: string): Promise<{ months: string[]; note: string }> {
  if (brandRulesFor(clientId).length === 0) return { months: [], note: 'no brand rules for this tenant' }
  let brandFilling: { month: string }[]
  try {
    brandFilling = await selectAll<{ month: string }>(() => admin.from(BRAND_READINGS_TABLE).select('month')
      .eq('client_id', clientId).eq('status', 'filling').order('month').order('audience').order('brand_key'))
  } catch (e) {
    if (isMissingBrandReadings(e)) return { months: [], note: `${BRAND_READINGS_TABLE} is not there (MF3 not applied)` }
    throw e
  }
  let filling: string[] = []
  try {
    filling = await fillingMonths(admin, clientId)
  } catch (e) {
    if (!isMissingMonthlyReading(e)) throw e
  }
  const months = monthsToRefresh(now, [...filling, ...brandFilling.map((r) => monthStartOf(r.month))])
  return { months, note: `months ${months.map((m) => m.slice(0, 7)).join(' ')}` }
}

/** The brand read's reads, through the admin client. */
export function stepBrandIO(admin: SupabaseClient, clientId: string, window: { from: string; to: string }): BrandReadIO {
  const idCols = 'id, platform, video_id, source, account_name, is_client, is_competitor, competitor_name'
  return {
    engine: 'are',
    tracking: async () => {
      const base = 'competitor_names, competitor_keywords, competitor_handles, own_handles, brand_keywords'
      const first = await admin.from('tracking_configs').select(`${base}, watched_brands`).eq('client_id', clientId).maybeSingle()
      if (!first.error && first.data) return first.data as Tracking
      // Before MF3 there is no watched_brands column: the rivals and the client alone.
      const { data, error } = await admin.from('tracking_configs').select(base).eq('client_id', clientId).maybeSingle()
      if (error || !data) throw new Error(`tracking_configs: ${error?.message ?? 'no row'}`)
      return data as Tracking
    },
    competitors: async () => {
      const { data, error } = await admin.from('competitors').select('id, name, retired_at').eq('client_id', clientId)
      if (error) throw new Error(`competitors: ${error.message}`)
      return (data ?? []) as { id: string; name: string; retired_at: string | null }[]
    },
    candidates: async (pattern) => {
      const rows = await selectAll<Candidate>(() => admin.rpc('brand_mention_candidates', { p_client: clientId, p_pattern: pattern, p_from: window.from, p_to: window.to })
        .order('video_id').order('source').order('field').order('comment_id'))
      return rows.map((r) => ({ ...r, comment_month: r.comment_month ? String(r.comment_month).slice(0, 10) : null }))
    },
    ownedVideos: () => selectAll<IdentityRow>(() => admin.from('videos').select(idCols).eq('client_id', clientId).in('source', ['owned', 'competitor_owned']).order('id')),
    videosById: (ids) => selectAll<IdentityRow>(() => admin.from('videos').select(idCols).eq('client_id', clientId).in('id', [...ids]).order('id')),
    monthVideos: (m) => readMonthVideos(admin, clientId, m, { n: 0 }),
    firstTerms: async (ids) => {
      const out = new Map<string, string[]>()
      try {
        for (let i = 0; i < ids.length; i += 100) {
          const rows = await selectAll<{ video_id: string; first_terms: string[] }>(() => admin.from('video_provenance')
            .select('video_id, first_terms').eq('client_id', clientId).in('video_id', ids.slice(i, i + 100)).order('video_id'))
          for (const r of rows) out.set(r.video_id, r.first_terms)
        }
      } catch (e) {
        if (isMissingObject(e, 'video_provenance')) return null
        throw e
      }
      return out
    },
  }
}

export interface BrandMonthResult {
  month: string
  status: 'written' | 'skipped'
  mentionsInserted: number
  confirm: 'off' | 'on' | 'no_judge'
  confirmCostUsd: number
  written: number
  frozen: number
  keptFrozen: number
  refusedLate: number
  note: string
}

/** Insert the planned mentions this table does not hold yet. */
async function insertFresh(admin: SupabaseClient, clientId: string, rows: readonly MentionRow[]): Promise<number> {
  if (rows.length === 0) return 0
  const versions = [...new Set(rows.map((r) => r.rule_version))]
  const held = await selectAll<Pick<MentionRow, 'client_id' | 'video_id' | 'brand_key' | 'source' | 'comment_id' | 'rule_version'>>(() =>
    admin.from('brand_mentions').select('client_id, video_id, brand_key, source, comment_id, rule_version')
      .eq('client_id', clientId).in('rule_version', versions).order('id'))
  const heldKeys = new Set(held.map(mentionKey))
  const fresh = rows.filter((r) => !heldKeys.has(mentionKey(r)))
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await admin.from('brand_mentions').insert(fresh.slice(i, i + 500))
    if (error) throw new Error(`brand_mentions insert: ${error.message}`)
  }
  return fresh.length
}

/** Read and write one month's brand rows. */
export async function runBrandMonth(admin: SupabaseClient, args: {
  clientId: string
  runId: string | null
  now: string
  month: string
  judge?: ConfirmJudge | null
}): Promise<BrandMonthResult> {
  const { clientId, now } = args
  const month = monthStartOf(args.month)
  const base: BrandMonthResult = { month, status: 'skipped', mentionsInserted: 0, confirm: 'off', confirmCostUsd: 0, written: 0, frozen: 0, keptFrozen: 0, refusedLate: 0, note: '' }
  const stored = await storedBrandRows(admin, clientId, [month])
  if (stored == null) return { ...base, note: `${BRAND_READINGS_TABLE} is not there (MF3 not applied)` }
  const window = { from: month, to: nextMonth(month) }
  let read: BrandRead | null
  try {
    read = await readBrands(clientId, stepBrandIO(admin, clientId, window), window)
  } catch (e) {
    if (isMissingObject(e, 'brand_mention_candidates')) return { ...base, note: 'brand_mention_candidates is not there (MF2 not applied)' }
    throw e
  }
  if (!read) return { ...base, note: 'no brand rules for this tenant' }
  if (!read.markets.has(month)) return { ...base, note: 'market_month_videos is not there (MF1 not applied)' }

  const mentionsInserted = await insertFresh(admin, clientId, read.plan.mentions.map((m) => m.row))

  // The confirm: only with the tenant's switch on AND a judge handed in.
  const confirm: BrandMonthResult['confirm'] = brandConfirmEnabled(clientId) ? (args.judge ? 'on' : 'no_judge') : 'off'
  const verdictRows = await selectAll<Pick<MentionRow, 'video_id' | 'brand_key' | 'source' | 'comment_id'> & { method: string }>(() =>
    admin.from('brand_mentions').select('video_id, brand_key, source, comment_id, method')
      .eq('client_id', clientId).in('method', ['confirmed', 'rejected']).order('id'))
  let confirmCostUsd = 0
  if (confirm === 'on' && args.judge) {
    const r = await confirmAmbiguous(ambiguousMentions(read.plan.mentions, read.brands), args.judge, new Set(verdictRows.map(hitKey)))
    confirmCostUsd = r.costUsd
    await insertFresh(admin, clientId, r.rows)
    verdictRows.push(...r.rows)
  }
  const rejected = new Set(verdictRows.filter((r) => r.method === 'rejected').map(hitKey))

  const fresh = brandReadingRows(clientId, read, countedUnlessRejected(rejected)).filter((r) => r.month === month)
  const closed = await selectAll<{ month: string; audience: string }>(() => admin.from('month_denominators').select('month, audience')
    .eq('client_id', clientId).eq('month', month).eq('status', 'frozen').order('audience'))
  const merged = mergeBrandRows({ months: [month], fresh, stored, now, runId: args.runId, closedAudienceMonths: closed.map(denominatorKey) })
  const { written } = await writeBrandRows(admin, clientId, merged)
  const pooled = read.brands.map((b) => {
    const p = pooledBrandMonth(fresh, month, b.brandKey)
    return `${b.rule.brand} ${p.k_any} of ${p.n} (${p.k_organic} of ${p.n_organic} without its own searches)`
  })
  return {
    month, status: 'written', mentionsInserted, confirm, confirmCostUsd, written,
    frozen: merged.writes.filter((w) => w.status === 'frozen').length, keptFrozen: merged.keptFrozen, refusedLate: merged.refusedLate.length,
    note: pooled.join(' · '),
  }
}

export const brandSummary = (r: BrandMonthResult): string =>
  r.status === 'skipped'
    ? `${r.month.slice(0, 7)}: skipped · ${r.note}`
    : `${r.month.slice(0, 7)}: ${r.mentionsInserted} new mentions, ${r.written} rows written (${r.frozen} frozen), ${r.keptFrozen} already frozen, ${r.refusedLate} refused as late · confirm ${r.confirm}${r.confirm === 'on' ? ` $${r.confirmCostUsd.toFixed(4)}` : ''} · ${r.note}`
