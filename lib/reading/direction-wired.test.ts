import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// `directionWord`'s `comparable` IS WIRED EVERYWHERE (market-first WP3.4,
// decision D). The field is required, so tsc lists every caller; what tsc
// cannot see is a caller that satisfies it with a rule that passes every step,
// which would earn a word across our own search change. Every live caller
// takes the page's month-pair judge (`comparableFor` from `pairTools`, or
// `comparableOn`), which fails closed when its inputs cannot be read
// (`refuseEveryPair`). The one open rule is the fixtures'
// (`DIRECTION_OPEN`, lib/test/pair-fixture.ts, and `pairTools(null)` for a
// fixture's "no month pair applies here"), and no live file may reach it.

const ROOT = join(__dirname, '..', '..')
const LIVE_DIRS = ['lib', 'components', 'app']

/** Live sources: every .ts and .tsx under lib, components and app except
 *  tests, fixtures and lib/test. */
function liveSources(): { path: string; code: string }[] {
  const out: { path: string; code: string }[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name) || /fixture/i.test(name)) continue
      const path = relative(ROOT, full)
      if (path.startsWith(join('lib', 'test'))) continue
      out.push({ path, code: withoutComments(readFileSync(full, 'utf8')) })
    }
  }
  for (const dir of LIVE_DIRS) walk(join(ROOT, dir))
  return out
}

/** Block and line comments out, so a comment that quotes a call is not one.
 *  A `//` inside a string (a URL) cuts the rest of that line, which can only
 *  hide text from these checks, never invent it. */
const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('directionWord: every live caller reads its steps off a judge', () => {
  const sources = liveSources()

  it('finds the live callers it is guarding', () => {
    const callers = sources.filter((s) => /\bdirectionWord\s*\(/.test(s.code)).map((s) => s.path)
    expect(callers).toContain(join('lib', 'pages', 'overview.ts'))
    expect(callers).toContain(join('lib', 'pages', 'subjects.ts'))
    expect(callers).toContain(join('lib', 'agent', 'movement.ts'))
  })

  it('no live file hands a direction word a rule that passes every step', () => {
    const open = /\bcomparable\s*:\s*(?:\([^)]*\)\s*(?::\s*boolean\s*)?=>\s*true\b|\(\)\s*=>\s*true\b)/
    expect(sources.filter((s) => open.test(s.code)).map((s) => s.path)).toEqual([])
  })

  it('no live file reaches the fixtures\' open rule', () => {
    expect(sources.filter((s) => /\bDIRECTION_OPEN\b|test\/pair-fixture/.test(s.code)).map((s) => s.path)).toEqual([])
  })

  it('every live direction word takes its `comparable` from the judge', () => {
    // Each call's own arguments, up to its closing parenthesis.
    const argsOf = (code: string, at: number): string => {
      let depth = 0
      for (let i = at; i < code.length; i++) {
        if (code[i] === '(') depth++
        else if (code[i] === ')' && --depth === 0) return code.slice(at, i + 1)
      }
      return code.slice(at)
    }
    const unjudged: string[] = []
    for (const s of sources) {
      for (const m of s.code.matchAll(/\b(directionWord|movementDirection)\s*\(/g)) {
        const before = s.code.slice(Math.max(0, (m.index ?? 0) - 16), m.index)
        if (/function\s+$/.test(before)) continue
        const args = argsOf(s.code, (m.index ?? 0) + m[0].length - 1)
        // `movementDirection` hands its caller's rule straight through: its
        // own callers are checked here as calls of it.
        if (s.path === join('lib', 'agent', 'movement.ts') && /^\(\s*points\s*,\s*rule\s*\)$/.test(args)) continue
        if (!/\bcomparable\s*:\s*comparable(?:For|On)\s*\(/.test(args)) unjudged.push(`${s.path}: ${m[1]}${args.slice(0, 80)}`)
      }
    }
    expect(unjudged).toEqual([])
  })
})
