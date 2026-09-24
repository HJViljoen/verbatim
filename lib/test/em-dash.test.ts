import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { scanRepo, scanSource } from './em-dash'

const ROOT = join(__dirname, '..', '..')

describe('the em-dash guard', () => {
  it('finds a dash in JSX text and in a string, and nowhere a reader cannot see', () => {
    const src = [
      "const a = 'one — two'",
      "const b = '—'",
      "const c = s.replace(/ — x/, '')",
      "const d = s.replace(' — x', '')",
      "// a comment — never copy",
      "const e = <p>three — four</p>",
      "// em-dash-ok: model prompt",
      "const f = 'prompt — words'",
    ].join('\n')
    const hits = scanSource('x.tsx', src).map((h) => h.line)
    expect(hits).toEqual([1, 6])
  })

  it('finds no em dash in client-visible copy', () => {
    const hits = scanRepo(ROOT)
    expect(hits.map((h) => `${h.file}:${h.line} ${h.text}`)).toEqual([])
  })
})
