// Draw a stored monthly brief's deck locally, a PNG a page (and its PDF with
// --pdf), and check that no page clips (lib/reports/briefs/deck.ts fits each
// page by an estimate; this is the measurement it errs high against). No
// database and no model: the brief is a JSON file.
//
//   node --import tsx scripts/brief-render.ts --in <brief.json> --out <dir> [--built 2026-10-05] [--pdf]
//
// <brief.json> is a `MonthlyBriefData` (a `report_snapshots.data`, quotes as
// refs with no words: their panels draw nothing), or `{ data, texts }` where
// `texts` maps each quote ref to `{ text, english, lang }` (a dry build's
// words, kept local). Exits 1 when any page clips. The drawing itself is
// scripts/brief-render-local.ts, which the dry builds share.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { renderBriefLocal, type QuoteWords } from './brief-render-local'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

async function main() {
  const input = flag('in')
  const out = flag('out')
  if (!input || !out) {
    console.error('Usage: scripts/brief-render.ts --in <brief.json> --out <dir> [--built YYYY-MM-DD] [--pdf]')
    process.exit(2)
  }
  const { isMonthlyBriefData } = await import('../lib/reports/briefs/types')
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), input), 'utf8')) as { data?: unknown; texts?: Record<string, QuoteWords | null> }
  const data = isMonthlyBriefData(raw) ? raw : raw.data
  if (!isMonthlyBriefData(data)) throw new Error(`${input} is not a monthly brief`)
  const r = await renderBriefLocal({ data, texts: raw.texts ?? {} }, resolve(process.cwd(), out), { built: flag('built', new Date().toISOString()), pdf: args.includes('--pdf') })
  for (const c of r.clipped) console.log(`page ${c.page}: clips ${c.px}px`)
  console.log(`${data.company} · ${data.role}: ${r.pages} pages, ${r.clipped.length} clipping, in ${resolve(process.cwd(), out)}${r.pdf ? ` (and ${r.pdf})` : ''}`)
  if (r.clipped.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
