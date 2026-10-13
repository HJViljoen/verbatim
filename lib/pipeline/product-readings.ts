import type { SupabaseClient } from '@supabase/supabase-js'

import type { Candidate } from '../brands/mentions'
import { readRivalFound } from '../brands/rival-searches'
import { PRODUCT_CLASSIFY_BUDGET_USD, PRODUCT_CLASSIFY_CAP, PRODUCT_CLASSIFY_PARALLEL, PRODUCT_STEP_MODEL_MS, productReadingsEnabled } from '../config'
import { chunk } from '../chunk'
import { readMonthVideos } from '../provenance/load'
import { denominatorKey, fillingMonths, isMissingMonthlyReading, monthsToRefresh, monthStartOf, nextMonth } from '../reading/monthly'
import { selectAll } from '../supabase-admin'
import { PRODUCT_CLASSIFY_PASS, runClassifier, type Classifier } from '../products/classify'
import { readSearchFound, readSearchTerms } from '../products/organic'
import type { MentionInsert } from '../products/match'
import {
  guardFreeze, HELD_COLUMNS, itemsLeft, mergeProductRows, placeProducts, pooledProductMonth, PRODUCT_COMMENT_COLUMNS, PRODUCT_READINGS_TABLE, PRODUCT_VIDEO_COLUMNS,
  storedProductRows, writeProductRows, type HeldRow, type ProductCommentRow, type ProductReadIO, type ProductVideoRow,
} from '../products/readings'
import {
  isMissingProductsSchema, loadProductCatalogue, PRODUCT_TAG_COLUMNS, TABLE_PRODUCT_MENTIONS, TABLE_PRODUCT_TAGS,
  type ProductCatalogue, type ProductTagRow,
} from '../products/types'

// The `product-readings` step (depth redesign v2, T11; plan decision 3,
// option B): `plan-product-readings` + `product-readings:${i}-of-${n}`, one
// month a step, immediately before freeze-months, after the brand-readings
// steps.
//
// For each month the run refreshes (the month tables' rule: every month still
// filling, and every month with a filling product row), the pass
// (lib/products/readings.ts placeProducts) reads the catalogue's talk over the
// month: the rules' new product_mentions rows are inserted (append-only, per
// catalogue version), the confirm call reads the generic names, the
// classifier reads what the rules missed under the category-relevant videos,
// and month_product_readings is written per audience, category and product.
// A month that freezes in this run is written frozen before freeze-months
// writes the denominator marker (the brand step's reason, which is why both
// sit where they do).
//
// THE MODEL (lib/products/classify.ts: the confirm on gpt-4.1, the classifier
// on gpt-4.1-mini, every answer held by code to what the text says) is held
// to the run's cap
// (PRODUCT_CLASSIFY_CAP items) and hard dollar cap
// (PRODUCT_CLASSIFY_BUDGET_USD): the pipeline hands each month what the
// earlier months of the run left, from their memoised returns, and each step
// stops starting calls after PRODUCT_STEP_MODEL_MS on its own clock. What a
// cap leaves is read next run.
//
// NON-FATAL (the deploy-4 precedent): each step ends in a `.catch` that logs
// and returns null, so a failed one never stops freeze-months; and a no-op,
// reading nothing and spending nothing, until the products migration is
// applied, for a tenant with no catalogue (Sealand today), and wherever
// PRODUCT_READINGS_ENABLED is off (every tenant until Heinrich turns one on).
// A model failure never throws (runClassifier's rule): its items wait for the
// next run. A database failure throws, and Inngest retries the step; the
// rows already written are held and not re-asked.

export interface ProductPlan {
  months: string[]
  catalogueVersion: string | null
  note: string
}

/** The months to read, or none (with why). */
export async function planProductReadings(admin: SupabaseClient, clientId: string, now: string): Promise<ProductPlan> {
  const none = (note: string): ProductPlan => ({ months: [], catalogueVersion: null, note })
  if (!productReadingsEnabled(clientId)) return none('off for this tenant (PRODUCT_READINGS_ENABLED)')
  const read = await loadProductCatalogue(admin, clientId)
  if (read.state === 'missing') return none('the products migration (20261109090000) is not applied')
  if (read.state === 'empty') return none('no catalogue for this tenant')
  let productFilling: { month: string }[]
  try {
    productFilling = await selectAll<{ month: string }>(() => admin.from(PRODUCT_READINGS_TABLE).select('month')
      .eq('client_id', clientId).eq('status', 'filling').order('month').order('audience').order('object_kind').order('object_id'))
  } catch (e) {
    if (isMissingProductsSchema(e)) return none('the products migration (20261109090000) is not applied')
    throw e
  }
  let filling: string[] = []
  try {
    filling = await fillingMonths(admin, clientId)
  } catch (e) {
    if (!isMissingMonthlyReading(e)) throw e
  }
  const months = monthsToRefresh(now, [...filling, ...productFilling.map((r) => monthStartOf(r.month))])
  return { months, catalogueVersion: read.catalogue.version, note: `catalogue ${read.catalogue.version} · months ${months.map((m) => m.slice(0, 7)).join(' ')}` }
}

/** The pass's reads, through the admin client, over one window. */
export function stepProductIO(admin: SupabaseClient, clientId: string, window: { from: string; to: string }): ProductReadIO {
  const missingToNull = async <T>(read: () => Promise<T>): Promise<T | null> => {
    try { return await read() } catch (e) { if (isMissingProductsSchema(e)) return null; throw e }
  }
  return {
    engine: 'are',
    candidates: async (pattern) => {
      const rows = await selectAll<Candidate>(() => admin.rpc('brand_mention_candidates', { p_client: clientId, p_pattern: pattern, p_from: window.from, p_to: window.to })
        .order('video_id').order('source').order('field').order('comment_id'))
      return rows.map((r) => ({ ...r, comment_month: r.comment_month ? String(r.comment_month).slice(0, 10) : null }))
    },
    monthVideos: (m) => readMonthVideos(admin, clientId, m, { n: 0 }),
    videos: async (ids) => {
      const out: ProductVideoRow[] = []
      for (const part of chunk(ids, 100)) {
        out.push(...await selectAll<ProductVideoRow>(() => admin.from('videos').select(PRODUCT_VIDEO_COLUMNS).eq('client_id', clientId).in('id', part).order('id')))
      }
      return out
    },
    comments: async (videos) => {
      const out: ProductCommentRow[] = []
      const byPlatform = new Map<string, string[]>()
      for (const v of videos) byPlatform.set(v.platform, [...(byPlatform.get(v.platform) ?? []), v.video_id])
      for (const [platform, ids] of [...byPlatform].sort(([a], [b]) => a.localeCompare(b))) {
        for (const part of chunk([...new Set(ids)].sort(), 100)) {
          out.push(...await selectAll<ProductCommentRow>(() => admin.from('comments').select(PRODUCT_COMMENT_COLUMNS)
            .eq('client_id', clientId).eq('platform', platform).in('video_id', part)
            .gte('comment_date', `${window.from.slice(0, 10)}T00:00:00Z`).lt('comment_date', `${window.to.slice(0, 10)}T00:00:00Z`).order('id')))
        }
      }
      return out
    },
    held: (version, months) => missingToNull(async () => {
      const content = await selectAll<HeldRow>(() => admin.from(TABLE_PRODUCT_MENTIONS).select(HELD_COLUMNS)
        .eq('client_id', clientId).eq('catalogue_version', version).eq('source', 'content').order('id'))
      const comment = months.length ? await selectAll<HeldRow>(() => admin.from(TABLE_PRODUCT_MENTIONS).select(HELD_COLUMNS)
        .eq('client_id', clientId).eq('catalogue_version', version).eq('source', 'comment').in('comment_month', [...months]).order('id')) : []
      // Every tag's placement row, any version: where a tag's comment is dated.
      const tags = await selectAll<HeldRow>(() => admin.from(TABLE_PRODUCT_MENTIONS).select(HELD_COLUMNS)
        .eq('client_id', clientId).eq('method', 'tag').order('id'))
      return [...content, ...comment, ...tags.filter((t) => t.catalogue_version !== version)]
    }),
    tags: () => missingToNull(() => selectAll<ProductTagRow>(() => admin.from(TABLE_PRODUCT_TAGS).select(PRODUCT_TAG_COLUMNS).eq('client_id', clientId).order('id'))),
    rivalFound: async () => {
      const { data, error } = await admin.from('tracking_configs').select('competitor_keywords').eq('client_id', clientId).maybeSingle()
      if (error) throw new Error(`tracking_configs: ${error.message}`)
      return (await readRivalFound(admin, clientId, (data as { competitor_keywords: string[] | null } | null)?.competitor_keywords ?? null)).videos
    },
    searchTerms: () => readSearchTerms(admin, clientId),
    searchFound: (terms) => readSearchFound(admin, clientId, terms),
  }
}

export interface ProductMonthResult {
  month: string
  status: 'written' | 'skipped'
  catalogueVersion: string | null
  ruleRowsInserted: number
  confirmAsked: number
  classified: number
  /** Items sent to the model (the run's item cap counts these). */
  itemsAsked: number
  /** Items left for the next run: a cap, the clock, a failed call or a refused answer. */
  deferred: number
  costUsd: number
  written: number
  frozen: number
  /** Rows this run would have frozen, written filling because the model left
   *  items: the next run reads the month again and freezes it. */
  heldOpen: number
  keptFrozen: number
  refusedLate: number
  note: string
}

/** Insert rows, 500 a statement (append-only; the caller filtered held rows). */
export async function insertMentions(admin: SupabaseClient, rows: readonly MentionInsert[]): Promise<void> {
  for (const part of chunk(rows, 500)) {
    const { error } = await admin.from(TABLE_PRODUCT_MENTIONS).insert(part)
    if (error) throw new Error(`${TABLE_PRODUCT_MENTIONS} insert: ${error.message}`)
  }
}

/** The client's name as the classifier calls it. */
export async function clientNameOf(admin: SupabaseClient, clientId: string): Promise<string> {
  const { data, error } = await admin.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  if (error) throw new Error(`clients: ${error.message}`)
  return (data as { company_name: string } | null)?.company_name ?? 'the client'
}

/** Read and write one month's product rows. */
export async function runProductMonth(admin: SupabaseClient, args: {
  clientId: string
  runId: string | null
  now: string
  month: string
  /** What the run's hard dollar cap leaves for this month. */
  budgetUsd: number
  /** What the run's item cap leaves for this month. */
  cap: number
  /** When this step stops starting model calls (ms since the epoch). */
  deadline?: number
  /** A test seam; production passes none (the real calls). */
  classifier?: Classifier
}): Promise<ProductMonthResult> {
  const month = monthStartOf(args.month)
  const base: ProductMonthResult = {
    month, status: 'skipped', catalogueVersion: null, ruleRowsInserted: 0, confirmAsked: 0, classified: 0, itemsAsked: 0, deferred: 0, costUsd: 0,
    written: 0, frozen: 0, heldOpen: 0, keptFrozen: 0, refusedLate: 0, note: '',
  }
  if (!productReadingsEnabled(args.clientId)) return { ...base, note: 'off for this tenant (PRODUCT_READINGS_ENABLED)' }
  const stored = await storedProductRows(admin, args.clientId, [month], isMissingProductsSchema)
  if (stored == null) return { ...base, note: 'the products migration (20261109090000) is not applied' }
  const read = await loadProductCatalogue(admin, args.clientId)
  if (read.state !== 'ready') return { ...base, note: read.state === 'missing' ? 'the products migration is not applied' : 'no catalogue for this tenant' }
  const catalogue: ProductCatalogue = read.catalogue
  const clientName = await clientNameOf(admin, args.clientId)
  const window = { from: month, to: nextMonth(month) }
  const pass = await placeProducts({
    clientId: args.clientId, clientName, io: stepProductIO(admin, args.clientId, window), catalogue, window,
    budgetUsd: args.budgetUsd, queueCap: args.cap,
    insert: (rows) => insertMentions(admin, rows),
    ask: (items, videos, budgetUsd, compiled) => runClassifier({
      admin, clientId: args.clientId, runId: args.runId, clientName, catalogue, compiled, items, videos, budgetUsd,
      deadline: args.deadline, parallel: PRODUCT_CLASSIFY_PARALLEL, classifier: args.classifier,
      write: (rows) => insertMentions(admin, rows),
    }),
  })
  const fresh = pass.rows.filter((r) => r.month === month)
  const closed = await selectAll<{ month: string; audience: string }>(() => admin.from('month_denominators').select('month, audience')
    .eq('client_id', args.clientId).eq('month', month).eq('status', 'frozen').order('audience'))
  const left = itemsLeft(pass, args.cap)
  // A month this run would freeze is frozen only from a pass that read it in
  // full; otherwise it is written filling and the next run freezes it.
  const guarded = guardFreeze(mergeProductRows({ months: [month], fresh, stored, now: args.now, runId: args.runId, closedAudienceMonths: closed.map(denominatorKey) }), left, 'filling')
  const merged = guarded.merged!
  const { written } = await writeProductRows(admin, args.clientId, merged)
  const groups = catalogue.groups.map((g) => {
    const p = pooledProductMonth(fresh, month, g.id)
    return `${g.name} ${p.k_any} of ${p.n} (${p.k_named} named, ${p.k_unclear} not which, ${p.k_unbranded} in general)`
  })
  const confirm = pass.confirmResult
  const classify = pass.classifyResult
  return {
    month, status: 'written', catalogueVersion: catalogue.version, ruleRowsInserted: pass.freshRuleRows.length,
    confirmAsked: confirm?.asked ?? 0, classified: classify?.answered ?? 0,
    itemsAsked: (confirm?.asked ?? 0) + (classify?.asked ?? 0) + (confirm?.failed ?? 0) + (classify?.failed ?? 0),
    deferred: left,
    costUsd: pass.costUsd, written, frozen: merged.writes.filter((w) => w.status === 'frozen').length, heldOpen: guarded.held,
    keptFrozen: merged.keptFrozen, refusedLate: merged.refusedLate.length, note: groups.join(' · '),
  }
}

export const productSummary = (r: ProductMonthResult): string =>
  r.status === 'skipped'
    ? `${r.month.slice(0, 7)}: skipped · ${r.note}`
    : `${r.month.slice(0, 7)}: ${r.ruleRowsInserted} new rule placements, ${r.confirmAsked} generic names checked, ${r.classified} comments classified, ${r.deferred} left for the next run · $${r.costUsd.toFixed(4)} · ${r.written} rows written (${r.frozen} frozen${r.heldOpen ? `; ${r.heldOpen} held filling because items were left: the next run freezes them` : ''}), ${r.keptFrozen} already frozen, ${r.refusedLate} refused as late · ${r.note}`

/** The run's item cap, for the pipeline's loop (what each month's step may
 *  still send is this less what the earlier months' returns say they sent). */
export const PRODUCT_RUN_CAP = PRODUCT_CLASSIFY_CAP

/** What the run has spent on the product classifier so far, from the ledger
 *  (ai_call_log, every call logged the moment it returns): a month step that
 *  ran out of retries still spent, and the next month's budget must know. */
export async function productSpendSoFar(admin: SupabaseClient, runId: string | null): Promise<number> {
  if (!runId) return 0
  const rows = await selectAll<{ id: string; cost_usd: number | null }>(() => admin.from('ai_call_log').select('id, cost_usd')
    .eq('run_id', runId).eq('pass', PRODUCT_CLASSIFY_PASS).order('id'))
  return rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)
}

/** One `product-readings:${i}-of-${n}` step: the month, under what the run's
 *  hard dollar cap has left (read from the ledger) and the item cap the loop
 *  hands in, on the step's own clock. */
export async function runProductStep(admin: SupabaseClient, args: { clientId: string; runId: string; now: string; month: string; cap: number }): Promise<ProductMonthResult> {
  const deadline = Date.now() + PRODUCT_STEP_MODEL_MS
  const spent = await productSpendSoFar(admin, args.runId)
  return runProductMonth(admin, { ...args, budgetUsd: Math.max(0, PRODUCT_CLASSIFY_BUDGET_USD - spent), deadline })
}
