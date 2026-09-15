import { createAdminClient } from '../lib/supabase-admin'
import {
  planQuoteTranslations, translateQuotesBatch, planQuoteSteps,
} from '../lib/pipeline/translate-quotes'
import {
  MODEL_PRICING, SEALAND_CLIENT_ID, TRANSLATE_QUOTES_BATCH, TRANSLATE_QUOTES_CAP, TRANSLATE_QUOTES_MODEL,
} from '../lib/config'

// Quote-translation inspector and backfill (Phase 1 WP6, design item 8).
//
// The pipeline step translates what the current analysis cites, capped per run.
// This is the one-off that fills the cache in front of it, so a back-read month
// and every already-shipped snapshot can show an English rendering on day one
// rather than accumulating one a week at a time.
//
//   node --env-file=.env.local --import tsx scripts/translate-quotes.ts [--client <uuid>] [--limit N] [--apply]
//
// Dry-run by default: it prints how many distinct (comment, text) pairs have no
// cache row, how many calls that is, and what it would cost — and spends
// nothing. --apply translates up to --limit comments and writes the rows.
//
// The count it prints is the honest one and it is larger than the design's:
// there is no stored per-comment language signal to pre-filter on (the video's
// transcript_lang is 34–58% precise used that way), so EVERY cited comment with
// no cache row goes to the model. An English one comes back "already English",
// which is cached like any other answer and never paid for twice.
//
// Token estimates here are a BOUND, not a number, for the reason
// translate-transcripts.ts states: the tokenizer costs Latin text about 4
// characters a token and CJK/Indic/Arabic closer to 1.5, and the population
// this script exists for is disproportionately the second kind. Billing is the
// truth.

export function parseArgs(argv: string[]): { clientId: string; limit: number | null; apply: boolean } {
  const args = { clientId: SEALAND_CLIENT_ID as string, limit: null as number | null, apply: false }
  let named = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') { args.clientId = argv[++i]; named = true }
    else if (argv[i] === '--limit') args.limit = Number(argv[++i])
    else if (argv[i] === '--apply') args.apply = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) throw new Error('--limit must be a positive integer')
  // Spending defaults are not defaults (translate-transcripts.ts's rule).
  if (args.apply && !named) throw new Error('--apply requires an explicit --client <uuid> — it writes to a real tenant')
  if (args.apply && args.limit === null) throw new Error('--apply requires an explicit --limit N — it spends per comment')
  return args
}

/** What a run of N calls costs, at the measured per-call token shape: ~550
 *  tokens of system block plus the batch's own source, and an English rendering
 *  that runs about 1.3× the source plus JSON scaffolding. A bound, both ways. */
export function estimateQuoteTranslationCost(calls: number, items: number): { low: number; high: number } {
  const price = MODEL_PRICING[TRANSLATE_QUOTES_MODEL] ?? { inputPer1M: 0.4, outputPer1M: 1.6 }
  const bound = (charsPerToken: number): number => {
    const sourceTokens = (items * 90) / charsPerToken
    const inputTokens = calls * 550 + sourceTokens
    const outputTokens = sourceTokens * 1.3 + items * 8
    return (inputTokens / 1e6) * price.inputPer1M + (outputTokens / 1e6) * price.outputPer1M
  }
  return { low: bound(4), high: bound(1.5) }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()
  const cap = args.limit ?? TRANSLATE_QUOTES_CAP
  const plan = await planQuoteTranslations(args.clientId, { cap, admin })
  const calls = Math.ceil(plan.needing / TRANSLATE_QUOTES_BATCH)
  const cost = estimateQuoteTranslationCost(calls, plan.needing)

  console.log(`client            ${args.clientId}`)
  console.log(`uncached texts    ${plan.needing} across ${plan.comments} comments`)
  console.log(`deferred by cap   ${plan.deferred} (cap ${cap})`)
  console.log(`calls @${TRANSLATE_QUOTES_BATCH}         ${calls} on ${TRANSLATE_QUOTES_MODEL}`)
  console.log(`estimated cost    $${cost.low.toFixed(3)} – $${cost.high.toFixed(3)} (a bound; billing is the truth)`)

  if (!args.apply) {
    console.log('\ndry run — nothing called, nothing written. --apply --client <uuid> --limit N to translate.')
    return
  }
  const totals = { translated: 0, english: 0, cached: 0, failed: 0, cost: 0 }
  const batches = planQuoteSteps(plan.batches.flat())
  for (let i = 0; i < batches.length; i++) {
    const r = await translateQuotesBatch({
      clientId: args.clientId, runId: null, commentIds: batches[i], batchNo: i + 1, admin,
    })
    totals.translated += r.translated
    totals.english += r.english
    totals.cached += r.cached
    totals.failed += r.failed
    totals.cost += r.costUsd
    for (const e of r.errors) console.warn(`  ${e}`)
    console.log(`batch ${i + 1}/${batches.length}: +${r.translated} translated · +${r.english} English · ${r.cached} cached · ${r.failed} not placed · $${r.costUsd.toFixed(4)}`)
    if (r.rateLimited) { console.warn('  rate limited — stopping; the rest come on the next invocation'); break }
  }
  console.log(`\ntotal: ${totals.translated} translated · ${totals.english} already English · ${totals.cached} already cached · ${totals.failed} not placed · $${totals.cost.toFixed(3)} actual`)
}

if (process.argv[1]?.includes('translate-quotes')) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
