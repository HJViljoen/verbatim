import { readFileSync, writeFileSync } from 'node:fs'

import { createAdminClient } from '../lib/supabase-admin'
import { longMonth } from '../lib/format'
import { measureStatements, measureSummary, type MeasureResult } from '../lib/statements/measure'
import type { StatementReading } from '../lib/statements/types'

// Your statements: measure how a workspace's market treats each statement
// (pages build, package MOVES). The same module the add action and the weekly
// run (`ask-reevaluate`) call: lib/statements/measure.ts.
//
// DRY BY DEFAULT: bands and prices, no model call, no write.
//
//   node --env-file=.env.local --import tsx scripts/statements.ts --client <uuid>             # price
//   node --env-file=.env.local --import tsx scripts/statements.ts --client <uuid> --measure   # spend, print, write nothing
//   node --env-file=.env.local --import tsx scripts/statements.ts --client <uuid> --write     # spend and store the readings
//
//   --month YYYY-MM     the month to read (default: the latest closed run's, the week read's rule)
//   --texts "a|b|c"     measure these sentences instead of the stored statements (never writes)
//   --band <file.json>  a band computed elsewhere, { "<text>": [{ "audience_insight_id", "score" }] },
//                       for a database where statement_band() does not exist yet (the dry run)
//   --gloss <file.json> the glosses that band was read from, { "<text>": "<gloss>" }
//   --out <file.md>     also write the block as the page would print it
//
// Spend: one embeddings call, then per statement ceil(judged band / 20) judge
// calls and one stance call on gpt-4.1-mini (a few cents a statement).

interface Args {
  clientId: string
  month: string | null
  texts: string[] | null
  band: string | null
  gloss: string | null
  out: string | null
  measure: boolean
  write: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: '', month: null, texts: null, band: null, gloss: null, out: null, measure: false, write: false }
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]
    if (f === '--client') a.clientId = argv[++i] ?? ''
    else if (f === '--month') a.month = argv[++i] ?? null
    else if (f === '--texts') a.texts = (argv[++i] ?? '').split('|').map((t) => t.trim()).filter(Boolean)
    else if (f === '--band') a.band = argv[++i] ?? null
    else if (f === '--gloss') a.gloss = argv[++i] ?? null
    else if (f === '--out') a.out = argv[++i] ?? null
    else if (f === '--measure') a.measure = true
    else if (f === '--write') { a.write = true; a.measure = true }
    else throw new Error(`unknown flag: ${f}`)
  }
  if (!/^[0-9a-f-]{36}$/.test(a.clientId)) throw new Error('--client <uuid> is required')
  if (a.month && !/^\d{4}-\d{2}$/.test(a.month)) throw new Error('--month takes YYYY-MM')
  if (a.write && a.texts) throw new Error('--texts never writes: the sentences are not stored statements')
  return a
}

const pct = (k: number, n: number) => (n > 0 ? Math.floor((100 * k) / n + 0.5) : 0)

function whoLine(r: StatementReading, brand: string): string {
  const name = (about: string) => (about === 'client' ? brand : about.startsWith('rival:') ? about.slice(6) : 'Other bags in your market')
  if (r.who.length === 0) return ''
  if (r.who.length === 1) return name(r.who[0].about)
  return r.who.map((w) => `${w.about === 'market' ? 'other bags' : name(w.about)} ${w.videos}`).join(' · ')
}

/** The block as the page prints it, for a reviewer to read. */
export function statementsMarkdown(results: readonly MeasureResult[], month: string, complete: boolean, brand: string): string {
  const m = complete ? longMonth(month) : `${longMonth(month)} so far`
  const base = results.find((r) => r.reading)?.reading?.market.base ?? null
  const lines = [
    '## Your statements',
    '',
    base != null ? `_Share of the ${base} videos in your market in ${m}_` : '',
    '',
    `What you say about ${brand}. For each statement, how much your market talks about the idea, and whether people back it up, doubt it or ask about it.`,
    '',
  ]
  for (const r of results) {
    lines.push(`### ${r.text}`)
    const x = r.reading
    if (!x) {
      lines.push('', `_(not measured: ${r.skipped ?? 'no reading'})_`, '')
      continue
    }
    const who = whoLine(x, brand)
    if (who) lines.push('', who)
    lines.push('', `**${pct(x.market.videos, x.market.base)}%** of your market’s videos`)
    lines.push(x.market.videos > 0 ? `${x.market.videos} of ${x.market.base} videos` : `Nobody in your market raised it in ${m}.`)
    if (x.own.videos > 0) lines.push(`Talked about under ${x.own.videos} of your own posts.`)
    if (x.stance) {
      lines.push('', `Of the ${x.stance.base} videos${x.stance.of === 'own' ? ' under your posts' : ''}:`)
      lines.push(`- Back it up: ${x.stance.backs}`, `- Doubt it: ${x.stance.doubts}`, `- Ask about it: ${x.stance.asks}`)
      if (x.says) lines.push('', x.says)
    } else {
      lines.push('', 'Nobody repeats it, in your market or under your own posts.')
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()
  const bandOverride = args.band
    ? new Map(Object.entries(JSON.parse(readFileSync(args.band, 'utf8')) as Record<string, { audience_insight_id: string; score: number }[]>))
    : undefined
  const glossOverride = args.gloss
    ? new Map(Object.entries(JSON.parse(readFileSync(args.gloss, 'utf8')) as Record<string, string>))
    : undefined
  const month = args.month
    ? { month: `${args.month}-01`, complete: new Date().toISOString().slice(0, 7) > args.month }
    : undefined

  const r = await measureStatements(admin, {
    clientId: args.clientId,
    texts: args.texts ?? undefined,
    month,
    dryRun: !args.measure,
    write: args.write,
    bandOverride,
    glossOverride,
    // An operator run is not on the step's clock.
    deadlineMs: 30 * 60_000,
    // Nothing is written on a run that does not store: the call log included.
    log: args.write,
  })
  if (r.skipped) {
    console.log(`statements: SKIPPED ${r.skipped}`)
    return
  }
  console.log(`statements: ${r.month} · ${r.results.length} statement(s) · ${args.measure ? 'measured' : 'PRICED ONLY (pass --measure or --write)'}${args.write ? ' · WRITTEN' : ''}`)
  for (const x of r.results) console.log(`  ${measureSummary(x)}`)
  console.log(`  total ~$${r.costUsd.toFixed(4)}`)
  if (args.out && args.measure) {
    const { data: client } = await admin.from('clients').select('company_name').eq('id', args.clientId).maybeSingle()
    const brand = (client as { company_name?: string } | null)?.company_name ?? 'the brand'
    const first = r.results.find((x) => x.reading)?.reading
    writeFileSync(args.out, statementsMarkdown(r.results, r.month ?? '', first?.complete ?? false, brand))
    console.log(`  wrote ${args.out}`)
  }
}

if (process.argv[1]?.endsWith('statements.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
