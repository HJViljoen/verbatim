// The weekly read's email from a stored read, OFFLINE: what Sunday's send
// would put in an inbox, rendered to an HTML file to read and compare with the
// design (Weekly-v3), with no database and no network.
//
//   node --import tsx scripts/weekly-read-email.ts --read <read.json> --out <email.html> \
//     [--quotes-from <dry-run.md>] [--company Sealand] [--run <uuid>] [--app <url>]
//
// --read       a stored read: scripts/week-read.ts's JSON ({ status, data, … }),
//              or a `week_reads.data` value on its own. Quotes are refs there.
// --quotes-from  the same dry run's rendering (scripts/week-read.ts --out's
//              .md), whose quotes are the comments' words resolved for
//              reading: each `> "words"` line followed by its `> <sub>e:… ·`
//              line. Without it a quote has no words and prints no panel, as a
//              withdrawn one would.
// --company    the name the masthead and "What it means for" print (Sealand).
// --app        where the email's links point (https://app.verbatimintel.com).
// --share      the share link "Read this week in full" leads to, as a send
//              mints one (default <app>/r/preview).
// --page-out   also write the share page (the web version, findings in full)
//              as a standalone HTML file.
//
// The mark is inlined, so the file reads the same opened from disk. Nothing
// is written but --out; the read must be `ready` (a thin, failed or empty one
// is the case the send path refuses, and this says so instead).

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createElement } from 'react'

import { WeeklyReadPage } from '../components/email/weekly-read'
import { renderStaticHtml } from '../lib/email/render-html'
import { renderWeeklyReadEmail } from '../lib/email/weekly-read'
import { resolveQuotes } from '../lib/renderables/quotes-freeze'
import { weekReadSendState } from '../lib/reports/weekly-read'
import { weeklyReadSnapshotData } from '../lib/reports/weekly-read-build'
import type { WeekReadData } from '../lib/written/types'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

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

function main(): void {
  const readPath = flag('read')
  const outPath = flag('out')
  if (!readPath || !outPath) {
    console.error('Usage: scripts/weekly-read-email.ts --read <read.json> --out <email.html> [--quotes-from <dry-run.md>] [--company <name>] [--run <uuid>] [--app <url>]')
    process.exit(2)
  }
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), readPath), 'utf8')) as { status?: string; data?: WeekReadData } & Partial<WeekReadData>
  const stored = raw.data && typeof raw.data === 'object' ? { status: raw.status ?? 'ready', data: raw.data } : { status: 'ready', data: raw as WeekReadData }
  const state = weekReadSendState({ status: stored.status as 'ready' | 'thin' | 'failed', data: stored.data })
  if (!state.ok) {
    console.error(`Not sendable: ${state.message}`)
    process.exit(1)
  }
  const quotesFrom = flag('quotes-from')
  const words = quotesFrom ? quotesFromRendering(readFileSync(resolve(process.cwd(), quotesFrom), 'utf8')) : new Map<string, string>()
  const read = resolveQuotes(stored.data, words)
  const data = weeklyReadSnapshotData({ company: flag('company', 'Sealand'), runId: flag('run', 'preview'), read, writtenAt: new Date().toISOString() })
  const mark = `data:image/png;base64,${readFileSync(resolve(process.cwd(), 'public/brand/verbatim-mark-ink.png')).toString('base64')}`
  const app = flag('app', 'https://app.verbatimintel.com')
  const email = renderWeeklyReadEmail({ data, appUrl: app, markSrc: mark, shareUrl: flag('share', `${app}/r/preview`) })
  writeFileSync(resolve(process.cwd(), outPath), email.html)
  const pageOut = flag('page-out')
  if (pageOut) {
    const body = renderStaticHtml(createElement(WeeklyReadPage, { data, appUrl: app, markSrc: mark, fill: true }))
    const doc = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${data.title}</title><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,500;1,400&display=swap" rel="stylesheet"></head><body style="margin:0">${body}</body></html>`
    writeFileSync(resolve(process.cwd(), pageOut), doc)
    console.log(`Wrote ${pageOut} (the share page)`)
  }
  console.log(`Subject: ${email.subject}`)
  console.log(`Quotes resolved for reading: ${words.size}`)
  console.log(`Wrote ${outPath} (${email.html.length} bytes)`)
}

main()
