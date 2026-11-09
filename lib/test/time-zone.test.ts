import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'

// No date or time printed on the server's clock (9 Nov, the live-data bugs).
// Vercel runs in UTC and the clients are in South Africa, so a formatter that
// names no zone printed the Studio's clock two hours behind a laptop in Cape
// Town, and a UTC helper fed an instant dated a build after 22:00 UTC the day
// before. A client-facing day or time goes through lib/format.ts: UTC for a
// period dated by the comment (`shortDate`, `fullDate`, the months), the
// clients' clock for anything someone did (`appWhen`, `appDay`, `appShort`,
// `appWeekday`, `appDayLong`, `appDayMonth`).
//
// WHAT IS FLAGGED, outside comments, in app/, components/, lib/, inngest/ and
// scripts/ (tests and fixtures left out):
//   - every `toLocaleDateString(` and `toLocaleTimeString(` call, whatever its
//     arguments: none, a locale alone, options in a variable, or options
//     naming a zone (those are listed in ALLOWED with a reason);
//   - every `Intl.DateTimeFormat(` call, with or without `new`;
//   - a `toLocaleString(` that formats a date: its options name a date or
//     time field, its options are not an object literal we can read, or what
//     it is called on is a Date (`new Date(…)`, a name ending in Date, At,
//     `_at`, `date` or `time`), so a number's `toLocaleString()` passes;
//   - `dateStyle` or `timeStyle` anywhere;
//   - a UTC helper (`fullDate`, `shortDate`, `weekdayDate`) fed what its name
//     says is an instant (`…At`, `…_at`, `.at`, `now`, `new Date(`,
//     `.toISOString()`).
//
// THE LAST RULE IS A NAMING HEURISTIC, NOT A PROOF. TypeScript types a day
// string and an instant alike (`string`), so the guard reads the argument's
// NAME, which is the repo's convention for a timestamptz (`created_at`,
// `builtAt`). An instant under another name (`lastSent`, `runDate`) passes it;
// those were found by hand on 9 Nov and moved, and this rule stops the common
// shape coming back.
//
// ALLOWED: each entry names a file, a piece of the flagged line and why it is
// safe. An entry that no longer matches a hit fails too, so the list cannot
// go stale.

const ROOT = join(__dirname, '..', '..')
const ROOTS = ['app', 'components', 'lib', 'inngest', 'scripts']
const SKIP = /(\.test\.tsx?$|\/test\/|fixture)/

export const ALLOWED: readonly { file: string; has: string; why: string }[] = [
  { file: 'lib/pipeline/schedule-due.ts', has: 'const parts = new Intl.DateTimeFormat', why: 'tzOffsetMs: scheduling arithmetic, options name timeZone (the schedule\'s own zone), prints nothing' },
  { file: 'lib/pipeline/schedule-due.ts', has: 'const parts = new Intl.DateTimeFormat', why: 'localDate: the same, the schedule\'s calendar day in its zone' },
  { file: 'lib/schedules/due.ts', has: "new Intl.DateTimeFormat('en-CA', { timeZone: tz", why: 'monthKey: a YYYY-MM key in the schedule\'s zone, never printed' },
  { file: 'lib/reports/quarterly.ts', has: "new Intl.DateTimeFormat('en-CA', { timeZone: tz", why: 'dayIn: a YYYY-MM-DD key in the review\'s zone, never printed' },
  { file: 'lib/pages/studio.ts', has: "new Intl.DateTimeFormat('en-GB', { timeZone: STUDIO_TZ", why: 'dayParts: the Studio\'s days, named on Africa/Johannesburg, server-only' },
  { file: 'scripts/backfill-platform.ts', has: "new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg'", why: 'an operator script\'s weekday and hour check, zone named, prints to the console only' },
  { file: 'lib/shell/bar.ts', has: 'const first = shortDate(new Date(a).toISOString())', why: 'windowDays: the days of a run\'s comment-dated window, read in UTC as the period rule dates every comment' },
  { file: 'lib/shell/bar.ts', has: 'const last = shortDate(new Date(b).toISOString())', why: 'windowDays: the window\'s last day, the same rule' },
  { file: 'lib/reading/lens.ts', has: "toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })", why: 'a month key\'s name (YYYY-MM-01 at UTC midnight), zone named: the comment-dated month' },
  { file: 'lib/provenance/measure.ts', has: "toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })", why: 'an operator measure\'s month name from a month key, zone named' },
  { file: 'scripts/new-subjects-check.ts', has: "toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })", why: 'an operator script\'s month name from a month key, zone named, console only' },
  { file: 'lib/settings/search-set.ts', has: 'shortDate(d.toISOString())', why: 'd is a calendar day built at UTC midnight from QUEUE_FLOOR (YYYY-MM-DD), not an instant: UTC is its day' },
]

type Hit = { file: string; line: number; text: string; rule: string }

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.tsx?$/.test(name) && !SKIP.test(relative(ROOT, p))) out.push(p)
  }
  return out
}

const DATE_FIELDS = /\b(day|month|year|hour|minute|second|weekday|era|dayPeriod|hourCycle|hour12|timeZoneName|dateStyle|timeStyle)\s*:/
const DATE_RECEIVER = /(new Date\([^()]*(?:\([^()]*\))?[^()]*\)|\b\w*(?:Date|At|_at|date|time|Time))\)?\s*\.toLocaleString\(/
const INSTANT_ARG = /(_at\b|[a-z]At\b|\.at\b|\bnow\b|new Date\(|\.toISOString\(\))/

/** The text of a call's arguments, from its open paren to the one that closes it. */
function argsOf(text: string, open: number): string {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i)
  }
  return text.slice(open + 1)
}

/** Every date formatter on the server's clock in one file's source. */
export function zonelessDates(file: string, src: string): Hit[] {
  const hits: Hit[] = []
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    const code = line.replace(/\/\/.*$/, '')
    const rest = lines.slice(i, i + 8).join('\n')
    const hit = (rule: string) => hits.push({ file, line: i + 1, text: line.trim(), rule })
    if (/\.toLocale(Date|Time)String\(/.test(code)) hit('toLocaleDateString / toLocaleTimeString')
    if (/\bIntl\s*\.\s*DateTimeFormat\s*\(/.test(code)) hit('Intl.DateTimeFormat')
    if (/\b(dateStyle|timeStyle)\b/.test(code)) hit('dateStyle / timeStyle')
    for (const m of code.matchAll(/\.toLocaleString\(/g)) {
      const at = rest.indexOf('.toLocaleString(', m.index ?? 0)
      const args = argsOf(rest, at + '.toLocaleString'.length).trim()
      const opts = args.replace(/^\s*(['"][^'"]*['"]|[\w.]+|undefined)\s*,?/, '').trim()
      const optsUnread = opts !== '' && !opts.startsWith('{')
      if (DATE_FIELDS.test(opts) || optsUnread || DATE_RECEIVER.test(code)) hit('toLocaleString on a date')
    }
    for (const m of code.matchAll(/\b(fullDate|shortDate|weekdayDate)\(/g)) {
      const arg = argsOf(code, (m.index ?? 0) + m[1].length)
      if (INSTANT_ARG.test(arg)) hit(`${m[1]} fed an instant`)
    }
  })
  return hits
}

const allowedFor = (h: Hit) => ALLOWED.filter((a) => a.file === h.file && h.text.includes(a.has))

describe('dates and times say whose clock they are on', () => {
  it('flags every shape of a zoneless formatter, and a number\'s toLocaleString passes', () => {
    const src = [
      "const a = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })",
      'const b = d.toLocaleDateString()',
      "const c = d.toLocaleTimeString('en-GB')",
      "const e = d.toLocaleDateString(LOCALE, OPTS)",
      "const f = n.toLocaleString('en-US', { maximumFractionDigits: 0 })",
      'const g = s.count.toLocaleString()',
      "const h = new Date(iso).toLocaleString('en-GB', { hour: '2-digit' })",
      'const i = builtAt.toLocaleString()',
      "const j = x.toLocaleString('en-GB', FORMAT)",
      "const k = Intl.DateTimeFormat('en-GB').format(d)",
      "const l = new Intl.DateTimeFormat('en-GB', {",
      '  timeZone: tz,',
      '})',
      "const m = fmt({ dateStyle: 'medium' })",
      'const o = fullDate(row.created_at)',
      'const p = shortDate(builtAt)',
      'const q = weekdayDate(new Date().toISOString())',
      'const r = shortDate(comment.comment_date)',
      'const s = fullDate(`${month}-01T00:00:00.000Z`)',
      "// d.toLocaleDateString('en-GB') in a comment",
    ].join('\n')
    expect(zonelessDates('x.ts', src).map((h) => h.line)).toEqual([1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17])
  })

  it('finds none in what the app, its emails, its PDFs and its scripts print, but the allowed', () => {
    const hits = ROOTS.flatMap((r) => files(join(ROOT, r)).flatMap((f) => zonelessDates(relative(ROOT, f), readFileSync(f, 'utf8'))))
    expect(hits.filter((h) => allowedFor(h).length === 0).map((h) => `${h.file}:${h.line} ${h.rule}: ${h.text}`)).toEqual([])
    // Every allowed entry still names a hit, and as many hits as entries.
    for (const a of ALLOWED) {
      const n = hits.filter((h) => h.file === a.file && h.text.includes(a.has)).length
      const listed = ALLOWED.filter((b) => b.file === a.file && b.has === a.has).length
      expect(n, `${a.file}: ${a.has}`).toBe(listed)
    }
  }, 30_000)
})
