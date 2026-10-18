// The weekly read's email (and its full read) OFFLINE: what Sunday's send
// would put in an inbox, rendered to HTML files to read and compare with the
// boards (H7-Email-Weekly-Alt, H7-Weekly-Full, -Print), with no database and
// no network.
//
// Three ways in:
//
//   1. A FIXTURE, version 3 (the H7 boards' three issues):
//        node --import tsx scripts/weekly-read-email.ts --fixture ossur|sealand|month-end --out <email.html>
//
//   2. A STORED SNAPSHOT, as it is: a `report_snapshots.data` value (any
//      version: 1 the report, 2 level 1, 3 the H7 issue), or the row with it
//      under `data`, e.g. one dumped from production for a check. Its quotes
//      are refs with no words; give their words with --quotes (a JSON map
//      ref → words) or --quotes-from:
//        node --import tsx scripts/weekly-read-email.ts --snapshot <data.json> --out <email.html> [--client <uuid>]
//
//   3. A STORED READ (scripts/week-read.ts's JSON, or a `week_reads.data` on
//      its own), built into a new snapshot (version 3) with the parts given:
//        node --import tsx scripts/weekly-read-email.ts --read <read.json> --out <email.html> \
//          [--parts <parts.json>] [--quotes-from <dry-run.md>] [--company Sealand] [--client <uuid>] [--run <uuid>]
//
// --parts        { subjects, pages, monthClose }: what a build freezes beside
//                the read (lib/reports/weekly-read-v3.ts); none without, and
//                the issue prints what the read alone holds.
// --level-one    with --read: build a version-2 snapshot instead, with
//                --lines (a JSON array of WeeklyReadLine) as its page lines.
// --report       with --read: build a version-1 snapshot (the report).
// --quotes       a JSON object { "<ref>": "<words>" } for the quotes' words.
// --quotes-from  a dry run's rendering (scripts/week-read.ts --out's .md):
//                each `> "words"` line followed by its `> <sub>e:… ·` line.
// --client       the workspace's id: in a medical market (`printsMedicalLine`)
//                the Content ideas print the medical team line, as a send does
//                (a version-3 snapshot froze it already; never twice).
// --app          where the links point (https://app.verbatimintel.com).
// --share        the share link "Read this week in full" leads to (default
//                <app>/r/preview).
// --page-out     also write the share page (the full read) as HTML.
// --print-out    also write the A4 paper (the full read as /render prints it).
// --data-out     also write the snapshot data the files were drawn from.
//
// The mark is inlined, so the files read the same opened from disk. Nothing
// is written but the files named; a stored read must be one the send path
// would send (a thin, failed or empty one is refused here as there).

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createElement } from 'react'

import { WeeklyReadPage } from '../components/email/weekly-read'
import { renderStaticHtml } from '../lib/email/render-html'
import { renderWeeklyReadEmail } from '../lib/email/weekly-read'
import { printsMedicalLine } from '../lib/post-ideas/medical'
import { resolveQuotes } from '../lib/renderables/quotes-freeze'
import { weekReadSendState } from '../lib/reports/weekly-read'
import { isWeeklyReadData, WEEKLY_READ_LEVEL_ONE_VERSION, WEEKLY_READ_REPORT_VERSION, weeklyReadSnapshotData, type WeeklyReadSnapshotData } from '../lib/reports/weekly-read-build'
import type { WeeklyReadLine } from '../lib/reports/weekly-read-lines'
import type { WeeklyMonthClose, WeeklyPages, WeeklySubjectRead } from '../lib/reports/weekly-read-v3'
import { monthEndSnapshot, ossurSnapshot, sealandV3Snapshot } from '../lib/test/weekly-read-v3-fixture'
import type { WeekReadData } from '../lib/written/types'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const json = <T>(path: string): T => JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T

/** The words of each quote in a dry run's rendering: `> "words"` then
 *  `> <sub>e:<id> · …`. */
export function quotesFromRendering(md: string): Map<string, string> {
  const out = new Map<string, string>()
  const lines = md.split('\n')
  for (let i = 0; i + 1 < lines.length; i++) {
    const words = /^>\s+"(.*)"\s*$/.exec(lines[i])
    const ref = /^>\s+<sub>([a-z]:[^\s·<]+)/.exec(lines[i + 1])
    if (words && ref && !out.has(ref[1])) out.set(ref[1], words[1])
  }
  return out
}

/** The H7 boards' three issues (lib/test/weekly-read-v3-fixture.ts). */
export const FIXTURES: Record<string, () => WeeklyReadSnapshotData> = {
  ossur: () => ossurSnapshot(),
  sealand: () => sealandV3Snapshot(),
  'month-end': () => monthEndSnapshot(),
}

/** The quotes' words, from --quotes and --quotes-from. */
function quoteWords(): Map<string, string> {
  const words = new Map<string, string>()
  const from = flag('quotes-from')
  if (from) for (const [k, v] of quotesFromRendering(readFileSync(resolve(process.cwd(), from), 'utf8'))) words.set(k, v)
  const map = flag('quotes')
  if (map) for (const [k, v] of Object.entries(json<Record<string, string>>(map))) words.set(k, v)
  return words
}

function snapshotFromRead(words: Map<string, string>): WeeklyReadSnapshotData {
  const raw = json<{ status?: string; data?: WeekReadData } & Partial<WeekReadData>>(flag('read'))
  const stored = raw.data && typeof raw.data === 'object' ? { status: raw.status ?? 'ready', data: raw.data } : { status: 'ready', data: raw as WeekReadData }
  const state = weekReadSendState({ status: stored.status as 'ready' | 'thin' | 'failed', data: stored.data })
  if (!state.ok) {
    console.error(`Not sendable: ${state.message}`)
    process.exit(1)
  }
  const read = resolveQuotes(stored.data, words)
  const parts = flag('parts') ? json<{ subjects?: WeeklySubjectRead[]; pages?: WeeklyPages; monthClose?: WeeklyMonthClose | null }>(flag('parts')) : undefined
  const built = weeklyReadSnapshotData({ company: flag('company', 'Sealand'), runId: flag('run', 'preview'), read, writtenAt: new Date().toISOString(), parts })
  if (args.includes('--report') || args.includes('--level-one')) {
    const { subjects: _s, pages: _p, monthClose: _m, ...rest } = built
    if (args.includes('--report')) return { ...rest, version: WEEKLY_READ_REPORT_VERSION }
    const lines = flag('lines') ? json<WeeklyReadLine[]>(flag('lines')) : []
    return { ...rest, version: WEEKLY_READ_LEVEL_ONE_VERSION, lines }
  }
  return built
}

function main(): void {
  const outPath = flag('out')
  const fixture = flag('fixture')
  if (!outPath || (!fixture && !flag('snapshot') && !flag('read'))) {
    console.error('Usage: scripts/weekly-read-email.ts (--fixture ossur|sealand|month-end | --snapshot <data.json> | --read <read.json>) --out <email.html> [--page-out <page.html>] [--print-out <print.html>]')
    process.exit(2)
  }
  const words = quoteWords()
  let data: WeeklyReadSnapshotData
  if (fixture) {
    const make = FIXTURES[fixture]
    if (!make) {
      console.error(`No fixture "${fixture}": ${Object.keys(FIXTURES).join(', ')}`)
      process.exit(2)
    }
    data = make()
  } else if (flag('snapshot')) {
    const raw = json<unknown>(flag('snapshot'))
    // A dump of the row ({ data: … }) or the data alone.
    const inner = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : null
    const d = isWeeklyReadData(inner) ? inner : raw
    if (!isWeeklyReadData(d)) {
      console.error('Not a weekly read snapshot (data.kind is not "weekly_read").')
      process.exit(1)
    }
    data = words.size > 0 ? resolveQuotes(d, words) : d
  } else {
    data = snapshotFromRead(words)
  }
  const mark = `data:image/png;base64,${readFileSync(resolve(process.cwd(), 'public/brand/verbatim-mark-ink.png')).toString('base64')}`
  const markOnInk = `data:image/png;base64,${readFileSync(resolve(process.cwd(), 'public/brand/verbatim-mark-yellow.png')).toString('base64')}`
  const app = flag('app', 'https://app.verbatimintel.com')
  const medical = printsMedicalLine(flag('client'))
  const email = renderWeeklyReadEmail({ data, appUrl: app, markSrc: mark, markOnInkSrc: markOnInk, shareUrl: flag('share', `${app}/r/preview`), medical })
  writeFileSync(resolve(process.cwd(), outPath), email.html)
  const fonts = '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">'
  const page = (print: boolean) => {
    const body = renderStaticHtml(createElement(WeeklyReadPage, { data, appUrl: app, markSrc: mark, fill: !print, print, medical }))
    return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${data.title}</title>${fonts}</head><body style="margin:0">${body}</body></html>`
  }
  const pageOut = flag('page-out')
  if (pageOut) {
    writeFileSync(resolve(process.cwd(), pageOut), page(false))
    console.log(`Wrote ${pageOut} (the share page)`)
  }
  const printOut = flag('print-out')
  if (printOut) {
    writeFileSync(resolve(process.cwd(), printOut), page(true))
    console.log(`Wrote ${printOut} (the A4 paper)`)
  }
  const dataOut = flag('data-out')
  if (dataOut) writeFileSync(resolve(process.cwd(), dataOut), `${JSON.stringify(data, null, 2)}\n`)
  console.log(`Version ${data.version} · Subject: ${email.subject}`)
  console.log(`Quotes resolved for reading: ${words.size}`)
  console.log(`Wrote ${outPath} (${email.html.length} bytes)`)
}

main()
