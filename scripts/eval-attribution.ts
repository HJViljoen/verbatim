/**
 * Attribution judge eval — scores a judge against a hand-labelled gold set.
 *
 *   node --env-file=<file with OPENAI_API_KEY only> --import tsx scripts/eval-attribution.ts \
 *     --config v3 --split train [--gold <gold.json>] [--model gpt-4.1] \
 *     [--ledger <spend.jsonl>] [--budget 0.80] [--save <preds.json>] [--dry]
 *
 * The gold file (one row per video: id, split, gold, account_name, caption,
 * hashtags, reason) carries everything attributeVideos reads, so this needs NO
 * database: it builds the same AttrCandidate rows a re-tag builds and runs them
 * through the real attributeVideos — batching, verdict parsing, the exclusion
 * strip and the no-verdict fallback included. It writes nothing to any
 * database; the only files it writes are the optional --save and --ledger.
 *
 * Configs: v1 (main's prompt), v2 (the staging rehearsal's), v2-nosnip (v2
 * without mentions=), all frozen in scripts/eval-attribution-judges.ts, and v3
 * — the judge lib/gather/attribution.ts runs now, on its own model. --model
 * swaps any config's model (e.g. --config v3 --model gpt-4.1-mini).
 *
 * Holdout discipline: choose on train, run holdout once. With --ledger, a
 * second holdout run is refused (--allow-second-holdout overrides, and says so),
 * and every run's cost is appended; with --budget, a run is refused once the
 * ledger's total has reached it. --dry prints the first batch's prompts and
 * makes no call.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ATTRIBUTION_JUDGE, attributeVideos, type AttrCandidate, type AttributionJudge } from '../lib/gather/attribution'
import { matchEntities, type VideoTags } from '../lib/gather/tagging'
import { audienceOf, INDUSTRY_AUDIENCE } from '../lib/rivals'
import type { GatherConfig } from '../lib/gather/types'
import { FROZEN_JUDGES } from './eval-attribution-judges'

const DEFAULT_GOLD = `${process.env.HOME ?? '/Users/heinrichviljoen'}/.claude/plans/verbatim-fixes-0924/gold/gold.json`

/** Videos the 2026-09-24 staging rehearsal sent to the judge: the size of a
 *  full Sealand re-tag, for projecting one from an eval's cost per video. */
const FULL_RETAG_JUDGED = 957

/** Sealand's tracking config as of 2026-09-17 (scripts/sealand-config-2026-09-17.ts),
 *  the one the staging rehearsal judged under (fingerprint b23e16b4c8877cd2).
 *  Only the term lists matter to attribution. */
const SEALAND: GatherConfig = {
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  competitor_names: ['Cotopaxi', 'Freitag', 'Rareform', 'The North Face', 'Patagonia', 'Freedom of Movement', 'Old School'],
  competitor_keywords: [
    'cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag',
    'north face backpack', 'patagonia black hole', 'fombrand',
  ],
  industry_keywords: [
    'eco backpack', 'handmade bag', 'recycled bag', 'recycled sailcloth',
    'sailcloth bag', 'sustainable backpack', 'sustainable fashion', 'travel gear',
    'upcycled backpack', 'upcycled bag',
    'made from waste', 'locally made south africa',
  ],
  exclude_terms: ['argentina', 'chile', 'torres del paine', 'ecuador', 'volcano', 'schengen', 'immigration', 'border control', 'hip hop'],
  platforms: ['tiktok', 'youtube', 'instagram', 'reddit'],
  max_videos: 25,
  comment_depth: 50,
  report_period: 'weekly',
  own_handles: {},
  subreddits: [],
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
}

interface Args {
  config: string
  split: 'train' | 'holdout'
  gold: string
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
      if (s !== 'train' && s !== 'holdout') throw new Error('--split is train or holdout')
      a.split = s
    } else if (f === '--gold') a.gold = next()
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
  if (!a.split) throw new Error('--split train|holdout is required')
  return a as Args
}

/** The frozen earlier judges, and the current one under its version's short
 *  name ('v3' for attribution_v3). */
function judges(): Record<string, AttributionJudge> {
  return { ...FROZEN_JUDGES, [ATTRIBUTION_JUDGE.version.replace(/^attribution_/, '')]: ATTRIBUTION_JUDGE }
}

/** The single audience a video lands in, in the gold file's spelling ('none'
 *  for the industry bucket). The precedence is lib/rivals.ts audienceOf's. */
function judgedAudience(t: VideoTags | undefined): string {
  const a = t ? audienceOf(t) : INDUSTRY_AUDIENCE
  return a === INDUSTRY_AUDIENCE ? 'none' : a
}

interface LedgerLine { at: string; config: string; model: string; split: string; n: number; accuracy: number; costUsd: number }

function readLedger(path: string | undefined): LedgerLine[] {
  if (!path || !existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as LedgerLine)
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

  const ledger = readLedger(args.ledger)
  const spent = ledger.reduce((s, l) => s + l.costUsd, 0)
  if (!args.dry && args.budget !== undefined && spent >= args.budget) {
    throw new Error(`the ledger already holds $${spent.toFixed(4)} of the $${args.budget.toFixed(2)} budget; refusing`)
  }
  if (!args.dry && args.split === 'holdout' && ledger.some((l) => l.split === 'holdout')) {
    if (!args.allowSecondHoldout) throw new Error('holdout has already been run once (ledger); choose on train. --allow-second-holdout overrides')
    console.warn('! SECOND HOLDOUT RUN — this number is no longer an unbiased estimate')
  }

  const rows = (JSON.parse(readFileSync(args.gold, 'utf8')) as GoldRow[]).filter((r) => r.split === args.split)
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
    const m = matchEntities(cands[i], SEALAND)
    return m.brand !== r.match_entities.brand || m.competitors.join('|') !== r.match_entities.competitors.join('|')
  })
  if (drift.length > 0) {
    console.warn(`! ${drift.length} row(s) where today's matcher proposes different candidates than the gold file records: ${drift.map((r) => r.id.slice(0, 8)).join(', ')}`)
  }

  console.log(`config=${args.config} (${judge.version}) model=${judge.model} split=${args.split} rows=${rows.length}`)
  if (args.dry) {
    const items = cands.slice(0, 60).map((c) => {
      const m = matchEntities(c, SEALAND)
      return { cand: c, labels: [...(m.brand ? ['BRAND'] : []), ...m.competitors, 'NONE'] }
    })
    console.log('--- system ---\n' + judge.systemPrompt(SEALAND))
    console.log('--- user (first batch) ---\n' + judge.userPrompt(items, SEALAND))
    return
  }

  const started = Date.now()
  const r = await attributeVideos(cands, { method: 'gpt', config: SEALAND, judge })
  const seconds = (Date.now() - started) / 1000

  const preds = rows.map((row) => ({ row, pred: judgedAudience(r.tags.get(row.id)), why: r.reasons.get(row.id) ?? '' }))
  const correct = preds.filter((p) => p.pred === p.row.gold).length
  const accuracy = rows.length === 0 ? 0 : correct / rows.length
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
  console.log(`wrong brand tags  ${wrongBrand.length}  (tagged to a brand whose gold is none or another brand)`)
  console.log(`  of which German-Freitag-day ${freitagDay.length}, region-Patagonia ${patagoniaRegion.length}`)
  console.log(`missed brand      ${missed.length}  (gold is a brand, judged none)`)
  console.log(`judged ${r.gptJudged}, rejected ${r.rejected}, failed batches ${r.failedBatches}, fallbacks ${r.fallbackIds.size}${r.errors.length > 0 ? `, errors: ${r.errors.join(' | ')}` : ''}`)
  const perVideo = r.gptJudged === 0 ? 0 : r.costUsd / r.gptJudged
  console.log(`costUsd ${r.costUsd.toFixed(5)}  (${r.promptTokens} in / ${r.completionTokens} out, ${seconds.toFixed(1)}s)  → full Sealand re-tag (${FULL_RETAG_JUDGED} judged) ≈ $${(perVideo * FULL_RETAG_JUDGED).toFixed(3)}`)

  const errs = preds.filter((p) => p.pred !== p.row.gold)
  console.log(`\nERRORS (${errs.length})`)
  for (const p of errs) {
    console.log(`  ${p.row.id.slice(0, 8)} ${p.row.platform.padEnd(9)} gold=${short(p.row.gold).padEnd(9)} judged=${short(p.pred).padEnd(9)} ${clip(p.row.account_name ?? '', 22)} | ${clip(p.row.caption ?? '', 90)}`)
    console.log(`      judge: ${clip(p.why, 160)}`)
    console.log(`      gold:  ${clip(p.row.reason, 160)}`)
  }

  if (args.save) {
    writeFileSync(args.save, JSON.stringify({
      config: args.config, version: judge.version, model: judge.model, split: args.split, accuracy, costUsd: r.costUsd,
      rows: preds.map((p) => ({ id: p.row.id, gold: p.row.gold, pred: p.pred, why: p.why })),
    }, null, 2))
  }
  if (args.ledger) {
    const line: LedgerLine = { at: new Date().toISOString(), config: args.config, model: judge.model, split: args.split, n: rows.length, accuracy, costUsd: r.costUsd }
    appendFileSync(args.ledger, `${JSON.stringify(line)}\n`)
    console.log(`\nledger: $${(spent + r.costUsd).toFixed(4)} spent across ${ledger.length + 1} run(s)`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
