/**
 * Attribution judge eval — scores a judge against a labelled gold set.
 *
 *   node --env-file=<file with OPENAI_API_KEY only> --import tsx scripts/eval-attribution.ts \
 *     --config v3 --split train|holdout|all [--gold <gold.json>] [--tenant <tenant.json>] \
 *     [--model gpt-4.1] [--ledger <spend.jsonl>] [--budget 0.80] [--save <preds.json>] [--dry]
 *
 * THE GOLD FILE carries everything attributeVideos reads, so this needs NO
 * database: it builds the same AttrCandidate rows a re-tag builds and runs them
 * through the real attributeVideos — batching, verdict parsing, the exclusion
 * strip, the request bounds and the no-verdict fallback included. It writes
 * nothing to any database; the only files it writes are the optional --save
 * and --ledger. The versioned gold files live in scripts/eval-data/attribution/:
 *
 *   { "tenant": { "name", "config": { brand_keywords, competitor_names,
 *                 competitor_keywords, industry_keywords, exclude_terms },
 *                 "fullRetagJudged" },
 *     "labelling": "<how the labels were made>",
 *     "rows": [ { id, split, gold, reason, platform, account_name, caption,
 *                 hashtags, match_entities, stored?, contested?, stratum? } ] }
 *
 * The tenant's term lists are the ones the gold rows were matched under; a
 * bare array of rows (the 2026-09-24 scratch format) needs --tenant <file>
 * holding the `tenant` object. --tenant overrides a gold file's own.
 *
 * WHAT A GOLD LABEL IS. Labels are model labels, not a person's: two
 * independent model labellers per row, disagreements adjudicated (Sealand: 1
 * row by the building session; Össur: 7 rows by a third independent labeller,
 * majority of three), each row's `contested` saying so. Accuracy is printed on
 * every row and on the uncontested ones.
 *
 * WHAT THE NUMBER PREDICTS. The Sealand set (200 rows) was drawn mostly from
 * the attribution_v2 staging rehearsal's moves and its plan check, so it is
 * error-heavy by construction: it ranks judges, and it does not predict the
 * share of a full re-tag that moves wrongly. Its train/holdout split is by
 * ROW — 15 accounts sit on both sides. The Össur set (54 rows, 2026-09-25) is a
 * stratified sample of every judgeable name match by stored bucket and by
 * where the name sits, split by ACCOUNT; future gold sets split by account.
 *
 * Configs: v1 (main's prompt), v2 (the staging rehearsal's), v2-nosnip (v2
 * without mentions=), all frozen in scripts/eval-attribution-judges.ts, and v3
 * — the judge lib/gather/attribution.ts runs now, on its own model. --model
 * swaps any config's model (e.g. --config v3 --model gpt-4.1-mini).
 *
 * Holdout discipline: choose on train, run holdout once. With --ledger, a
 * second holdout (or `all`) run of the same config on the same tenant is
 * refused (--allow-second-holdout overrides, and says so), and every run's
 * cost is appended. With --budget, a run is refused when the ledger's total
 * PLUS this run's projected cost (rows × the ledger's dearest cost per video
 * on this model, or a token estimate when the ledger has none) would pass it.
 * --dry prints the first batch's prompts and makes no call.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { ATTRIBUTION_JUDGE, attributeVideos, projectedJudgeCost, type AttrCandidate, type AttributionJudge } from '../lib/gather/attribution'
import { matchEntities, type VideoTags } from '../lib/gather/tagging'
import { audienceOf, INDUSTRY_AUDIENCE } from '../lib/rivals'
import type { GatherConfig } from '../lib/gather/types'
import { FROZEN_JUDGES } from './eval-attribution-judges'

const DEFAULT_GOLD = join(import.meta.dirname, 'eval-data', 'attribution', 'sealand-gold-2026-09-24.json')

/** A tenant as the eval needs it: the term lists attribution reads. */
export interface TenantSpec {
  /** Short name for the ledger: holdout discipline is per tenant and config. */
  name: string
  config: Pick<GatherConfig, 'brand_keywords' | 'competitor_names' | 'competitor_keywords' | 'industry_keywords' | 'exclude_terms'>
  /** Videos a full re-tag of this tenant would send to the judge, for the
   *  projection line. */
  fullRetagJudged?: number
}

interface GoldRow {
  id: string
  split: 'train' | 'holdout'
  /** 'none' | 'client' | 'competitor:<name>' */
  gold: string
  reason: string
  platform: string
  account_name: string | null
  caption: string | null
  hashtags: string[] | null
  match_entities: { brand: boolean; competitors: string[] }
  /** The stored audience when the row was drawn, in the gold spelling. */
  stored?: string
  /** The labellers disagreed and the label was adjudicated. */
  contested?: boolean
  stratum?: string
}

type Split = 'train' | 'holdout' | 'all'

interface Args {
  config: string
  split: Split
  gold: string
  tenant?: string
  model?: string
  ledger?: string
  budget?: number
  save?: string
  dry: boolean
  allowSecondHoldout: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = { gold: DEFAULT_GOLD, dry: false, allowSecondHoldout: false }
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${f} needs a value`)
      return v
    }
    if (f === '--config') a.config = next()
    else if (f === '--split') {
      const s = next()
      if (s !== 'train' && s !== 'holdout' && s !== 'all') throw new Error('--split is train, holdout or all')
      a.split = s
    } else if (f === '--gold') a.gold = next()
    else if (f === '--tenant') a.tenant = next()
    else if (f === '--model') a.model = next()
    else if (f === '--ledger') a.ledger = next()
    else if (f === '--budget') {
      const b = Number(next())
      if (!Number.isFinite(b) || b <= 0) throw new Error('--budget is a positive number of US dollars')
      a.budget = b
    } else if (f === '--save') a.save = next()
    else if (f === '--dry') a.dry = true
    else if (f === '--allow-second-holdout') a.allowSecondHoldout = true
    else throw new Error(`unknown flag ${f}`)
  }
  if (!a.config) throw new Error(`--config is one of: ${Object.keys(judges()).join(', ')}`)
  if (!a.split) throw new Error('--split train|holdout|all is required')
  return a as Args
}

/** The frozen earlier judges, and the current one under its version's short
 *  name ('v3' for attribution_v3). */
function judges(): Record<string, AttributionJudge> {
  return { ...FROZEN_JUDGES, [ATTRIBUTION_JUDGE.version.replace(/^attribution_/, '')]: ATTRIBUTION_JUDGE }
}

function readTenant(path: string): TenantSpec {
  const t = JSON.parse(readFileSync(path, 'utf8')) as Partial<TenantSpec> & { tenant?: TenantSpec }
  return validTenant(t.tenant ?? t, path)
}

function validTenant(t: Partial<TenantSpec>, from: string): TenantSpec {
  if (!t.name || !t.config || !Array.isArray(t.config.brand_keywords) || !Array.isArray(t.config.competitor_names)) {
    throw new Error(`${from}: a tenant needs name and config.{brand_keywords, competitor_names, …}`)
  }
  return t as TenantSpec
}

/** The gold rows and the tenant they were matched under. */
function loadGold(args: Args): { tenant: TenantSpec; rows: GoldRow[] } {
  const raw = JSON.parse(readFileSync(args.gold, 'utf8')) as GoldRow[] | { tenant?: TenantSpec; rows: GoldRow[] }
  const rows = Array.isArray(raw) ? raw : raw.rows
  const own = Array.isArray(raw) ? undefined : raw.tenant
  if (args.tenant) return { tenant: readTenant(args.tenant), rows }
  if (!own) throw new Error(`${args.gold} carries no tenant; pass --tenant <file> with the term lists its rows were matched under`)
  return { tenant: validTenant(own, args.gold), rows }
}

/** A GatherConfig with the tenant's term lists; attribution reads nothing else. */
function gatherConfig(t: TenantSpec): GatherConfig {
  return {
    brand_keywords: t.config.brand_keywords ?? [],
    competitor_names: t.config.competitor_names ?? [],
    competitor_keywords: t.config.competitor_keywords ?? [],
    industry_keywords: t.config.industry_keywords ?? [],
    exclude_terms: t.config.exclude_terms ?? [],
    platforms: [],
    max_videos: 0,
    comment_depth: 0,
    report_period: 'weekly',
    own_handles: {},
    subreddits: [],
  }
}

/** The single audience a video lands in, in the gold file's spelling ('none'
 *  for the industry bucket). The precedence is lib/rivals.ts audienceOf's. */
function judgedAudience(t: VideoTags | undefined): string {
  const a = t ? audienceOf(t) : INDUSTRY_AUDIENCE
  return a === INDUSTRY_AUDIENCE ? 'none' : a
}

interface LedgerLine {
  at: string
  config: string
  model: string
  split: string
  n: number
  accuracy: number
  costUsd: number
  /** Absent on the 2026-09-24/25 Sealand lines written before the field. */
  tenant?: string
  gold?: string
}

function readLedger(path: string | undefined): LedgerLine[] {
  if (!path || !existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as LedgerLine)
}

const ledgerTenant = (l: LedgerLine) => l.tenant ?? 'sealand'

/** What one gold row is expected to cost on this model: the dearest cost per
 *  row any earlier run on the model recorded, or — with no history — the
 *  re-tag's own per-video projection (lib/gather/attribution.ts). */
function projectedPerRow(ledger: readonly LedgerLine[], model: string): number {
  const seen = ledger.filter((l) => l.model === model && l.n > 0).map((l) => l.costUsd / l.n)
  return seen.length > 0 ? Math.max(...seen) : projectedJudgeCost(1, model)
}

const clip = (s: string, n: number) => {
  const pts = [...s.replace(/\s+/g, ' ').trim()]
  return pts.length > n ? `${pts.slice(0, n).join('')}…` : pts.join('')
}

/** A false Freitag tag whose gold reason is the German day, not a list of brands. */
const DAY_SENSE = /friday|freitag\s*=|weekday|wochenende|weekend|\bday\b|party|music|sign-language|no sign of the bag/i
/** A false Patagonia tag whose gold reason is the region. */
const REGION_SENSE = /region|chile|argentin|punta arenas|landscape|scenery|solo travel|mochilao/i
const MULTI_BRAND = /round-up|roundup|several|brands|list|options|haul|comparison| vs /i

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const all = judges()
  const base = all[args.config]
  if (!base) throw new Error(`unknown --config ${args.config}; one of: ${Object.keys(all).join(', ')}`)
  const judge: AttributionJudge = args.model ? { ...base, model: args.model } : base

  const { tenant, rows: goldRows } = loadGold(args)
  const config = gatherConfig(tenant)
  const rows = goldRows.filter((r) => args.split === 'all' || r.split === args.split)

  const ledger = readLedger(args.ledger)
  const spent = ledger.reduce((s, l) => s + l.costUsd, 0)
  const projected = rows.length * projectedPerRow(ledger, judge.model)
  if (!args.dry && args.budget !== undefined && spent + projected > args.budget) {
    throw new Error(
      `the ledger holds $${spent.toFixed(4)} and this run projects $${projected.toFixed(4)} ` +
      `(${rows.length} rows on ${judge.model}); together they pass the $${args.budget.toFixed(2)} budget — refusing`,
    )
  }
  if (!args.dry && args.split !== 'train') {
    const before = ledger.filter((l) => ledgerTenant(l) === tenant.name && l.config === args.config && l.split !== 'train')
    if (before.length > 0) {
      if (!args.allowSecondHoldout) {
        throw new Error(`holdout has already been run for ${args.config} on ${tenant.name} (ledger ${before[0].at}); choose on train. --allow-second-holdout overrides`)
      }
      console.warn('! SECOND HOLDOUT RUN — this number is no longer an unbiased estimate')
    }
  }

  const cands: AttrCandidate[] = rows.map((r) => ({
    video_id: r.id,
    account_name: r.account_name ?? '',
    caption: r.caption ?? '',
    hashtags: r.hashtags ?? [],
  }))

  // The gold file recorded the candidates the matcher proposed when it was
  // built; the matcher here must propose the same ones, or the eval is judging
  // different questions.
  const drift = rows.filter((r, i) => {
    const m = matchEntities(cands[i], config)
    return m.brand !== r.match_entities.brand || m.competitors.join('|') !== r.match_entities.competitors.join('|')
  })
  if (drift.length > 0) {
    console.warn(`! ${drift.length} row(s) where today's matcher proposes different candidates than the gold file records: ${drift.map((r) => r.id.slice(0, 8)).join(', ')}`)
  }

  console.log(`tenant=${tenant.name} gold=${basename(args.gold)} config=${args.config} (${judge.version}) model=${judge.model} split=${args.split} rows=${rows.length}`)
  console.log(`projected ≈ $${projected.toFixed(4)}; ledger so far $${spent.toFixed(4)}${args.budget !== undefined ? ` of $${args.budget.toFixed(2)}` : ''}`)
  if (args.dry) {
    const items = cands.slice(0, 60).map((c) => {
      const m = matchEntities(c, config)
      return { cand: c, labels: [...(m.brand ? ['BRAND'] : []), ...m.competitors, 'NONE'] }
    })
    console.log('--- system ---\n' + judge.systemPrompt(config))
    console.log('--- user (first batch) ---\n' + judge.userPrompt(items, config))
    return
  }

  const started = Date.now()
  const r = await attributeVideos(cands, { method: 'gpt', config, judge })
  const seconds = (Date.now() - started) / 1000

  const preds = rows.map((row) => ({ row, pred: judgedAudience(r.tags.get(row.id)), why: r.reasons.get(row.id) ?? '' }))
  const correct = preds.filter((p) => p.pred === p.row.gold).length
  const accuracy = rows.length === 0 ? 0 : correct / rows.length
  const settled = preds.filter((p) => !p.row.contested)
  const isBrand = (a: string) => a !== 'none'
  const wrongBrand = preds.filter((p) => isBrand(p.pred) && p.pred !== p.row.gold)
  const missed = preds.filter((p) => isBrand(p.row.gold) && p.pred === 'none')
  const freitagDay = wrongBrand.filter((p) => p.pred === 'competitor:Freitag' && p.row.gold === 'none' && DAY_SENSE.test(p.row.reason) && !MULTI_BRAND.test(p.row.reason))
  const patagoniaRegion = wrongBrand.filter((p) => p.pred === 'competitor:Patagonia' && p.row.gold === 'none' && REGION_SENSE.test(p.row.reason) && !MULTI_BRAND.test(p.row.reason))

  // Confusion: gold rows × predicted columns.
  const labels = [...new Set([...preds.map((p) => p.row.gold), ...preds.map((p) => p.pred)])].sort((a, b) =>
    a === 'none' ? -1 : b === 'none' ? 1 : a.localeCompare(b))
  const short = (l: string) => l.replace('competitor:', '').replace('The North Face', 'TNF').replace('Freedom of Movement', 'FoM')
  const w = Math.max(6, ...labels.map((l) => short(l).length))
  console.log(`\nCONFUSION (rows = gold, columns = judged)`)
  console.log(`${'gold \\ judged'.padEnd(w + 2)}${labels.map((l) => short(l).padStart(w + 1)).join('')}${'  total'.padStart(8)}`)
  for (const g of labels) {
    const inRow = preds.filter((p) => p.row.gold === g)
    if (inRow.length === 0) continue
    console.log(`${short(g).padEnd(w + 2)}${labels.map((l) => {
      const n = inRow.filter((p) => p.pred === l).length
      return (n === 0 ? '.' : String(n)).padStart(w + 1)
    }).join('')}${String(inRow.length).padStart(8)}`)
  }

  console.log(`\nACCURACY          ${correct}/${rows.length} = ${accuracy.toFixed(3)}`)
  if (settled.length !== preds.length) {
    const ok = settled.filter((p) => p.pred === p.row.gold).length
    console.log(`  uncontested     ${ok}/${settled.length} = ${(settled.length ? ok / settled.length : 0).toFixed(3)}  (${preds.length - settled.length} adjudicated row(s) left out)`)
  }
  console.log(`wrong brand tags  ${wrongBrand.length}  (tagged to a brand whose gold is none or another brand)`)
  if (config.competitor_names.includes('Freitag') || config.competitor_names.includes('Patagonia')) {
    console.log(`  of which German-Freitag-day ${freitagDay.length}, region-Patagonia ${patagoniaRegion.length}`)
  }
  console.log(`missed brand      ${missed.length}  (gold is a brand, judged none)`)
  // Against the tags the rows held when the gold set was drawn: how much a
  // switch to this judge would move, and whether the moves are corrections.
  const withStored = preds.filter((p) => p.row.stored !== undefined)
  if (withStored.length > 0) {
    const moved = withStored.filter((p) => p.pred !== p.row.stored)
    const storedRight = withStored.filter((p) => p.row.stored === p.row.gold).length
    console.log(`vs stored tags    stored right ${storedRight}/${withStored.length}; this judge moves ${moved.length}: ` +
      `${moved.filter((p) => p.pred === p.row.gold).length} to the gold, ${moved.filter((p) => p.row.stored === p.row.gold).length} away from it, ` +
      `${moved.filter((p) => p.pred !== p.row.gold && p.row.stored !== p.row.gold).length} wrong to wrong`)
    const pairs = new Map<string, number>()
    for (const p of moved) {
      const k = `${short(p.row.stored!)} → ${short(p.pred)}`
      pairs.set(k, (pairs.get(k) ?? 0) + 1)
    }
    for (const [k, n] of [...pairs].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(28)} ${n}`)
  }
  console.log(`judged ${r.gptJudged}, rejected ${r.rejected}, failed batches ${r.failedBatches}, fallbacks ${r.fallbackIds.size}${r.errors.length > 0 ? `, errors: ${r.errors.join(' | ')}` : ''}`)
  const perVideo = r.gptJudged === 0 ? 0 : r.costUsd / r.gptJudged
  const full = tenant.fullRetagJudged
  console.log(`costUsd ${r.costUsd.toFixed(5)}  (${r.promptTokens} in / ${r.completionTokens} out, ${seconds.toFixed(1)}s)` +
    (full ? `  → full ${tenant.name} re-tag (${full} judged) ≈ $${(perVideo * full).toFixed(3)}` : ''))

  const errs = preds.filter((p) => p.pred !== p.row.gold)
  console.log(`\nERRORS (${errs.length})`)
  for (const p of errs) {
    console.log(`  ${p.row.id.slice(0, 8)} ${p.row.platform.padEnd(9)} gold=${short(p.row.gold).padEnd(9)} judged=${short(p.pred).padEnd(9)}${p.row.contested ? ' (contested)' : ''} ${clip(p.row.account_name ?? '', 22)} | ${clip(p.row.caption ?? '', 90)}`)
    console.log(`      judge: ${clip(p.why, 160)}`)
    console.log(`      gold:  ${clip(p.row.reason, 160)}`)
  }

  if (args.save) {
    writeFileSync(args.save, JSON.stringify({
      tenant: tenant.name, config: args.config, version: judge.version, model: judge.model, split: args.split, accuracy, costUsd: r.costUsd,
      rows: preds.map((p) => ({ id: p.row.id, gold: p.row.gold, stored: p.row.stored, stratum: p.row.stratum, contested: p.row.contested ?? false, pred: p.pred, why: p.why })),
    }, null, 2))
  }
  if (args.ledger) {
    const line: LedgerLine = {
      at: new Date().toISOString(), config: args.config, model: judge.model, split: args.split, n: rows.length, accuracy, costUsd: r.costUsd,
      tenant: tenant.name, gold: basename(args.gold),
    }
    appendFileSync(args.ledger, `${JSON.stringify(line)}\n`)
    console.log(`\nledger: $${(spent + r.costUsd).toFixed(4)} spent across ${ledger.length + 1} run(s)`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
