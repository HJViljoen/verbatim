import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'

// No date or time printed in the server's zone (9 Nov, the live-data bugs).
// Vercel runs in UTC and the clients are in South Africa, so a formatter that
// names no zone printed the Studio's clock two hours behind a laptop in Cape
// Town, and a build after 22:00 UTC was dated the day before. A client-facing
// day or time goes through lib/format.ts: UTC for a period dated by the
// comment, the clients' clock (`appWhen`, `appDay`, …) for something we did.
// Intl may still be used where it names its zone (`timeZone`).

const ROOT = join(__dirname, '..', '..')
const ROOTS = ['app', 'components', 'lib']
const SKIP = /(\.test\.tsx?$|\/test\/|\/fixture)/

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.tsx?$/.test(name) && !SKIP.test(relative(ROOT, p))) out.push(p)
  }
  return out
}

/** Each call that formats a day or a time with no zone named in its options. */
export function zonelessDates(src: string): number[] {
  const hits: number[] = []
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    const call = /\.(toLocaleString|toLocaleDateString|toLocaleTimeString)\(\s*['"][a-z-]+['"]\s*,\s*\{|new Intl\.DateTimeFormat\(/i.exec(line)
    if (!call) return
    // The call's options, to the brace that closes them (an object may run
    // over a few lines, `schedule-due.ts`'s does).
    const rest = lines.slice(i, i + 6).join(' ').slice(call.index)
    const close = rest.indexOf('}')
    const opts = close >= 0 ? rest.slice(0, close + 1) : rest
    if (/toLocaleString/.test(call[0]) && !/\b(day|month|year|hour|minute|weekday)\b/.test(opts)) return
    if (!/timeZone/.test(opts)) hits.push(i + 1)
  })
  return hits
}

describe('dates and times say whose clock they are on', () => {
  it('finds a zoneless date formatter, and passes one that names its zone or prints a number', () => {
    const src = [
      "const a = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })",
      "const b = d.toLocaleString('en-GB', { day: 'numeric', hour: '2-digit', timeZone: 'Africa/Johannesburg' })",
      "const c = n.toLocaleString('en-US', { maximumFractionDigits: 0 })",
      "const e = new Intl.DateTimeFormat('en-US', {",
      "  timeZone: tz,",
      "})",
      "// d.toLocaleDateString('en-GB', { day: 'numeric' }) in a comment",
    ].join('\n')
    expect(zonelessDates(src)).toEqual([1])
  })

  it('finds none in what the app, its emails and its PDFs print', () => {
    const hits = ROOTS.flatMap((r) => files(join(ROOT, r)).flatMap((f) => zonelessDates(readFileSync(f, 'utf8')).map((l) => `${relative(ROOT, f)}:${l}`)))
    expect(hits).toEqual([])
  }, 30_000)
})
