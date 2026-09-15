import { describe, it, expect } from 'vitest'
import { firstMatch, insertThemesChunked, rereadShare, THEMES_INSERT_CHUNK } from './themes'

/** A stand-in for `admin.from('themes').insert(part)` that records batch sizes. */
function fakeInsert(failOn?: number) {
  const sizes: number[] = []
  const insert = async (part: Record<string, unknown>[]) => {
    sizes.push(part.length)
    return { error: sizes.length === failOn ? { message: 'canceling statement due to statement timeout' } : null }
  }
  return { insert, sizes }
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `t${i}` }))

describe('insertThemesChunked (run d346b0f7, 2026-09-13)', () => {
  it("splits the run's themes into chunks of 100 instead of one 10MB statement", async () => {
    // The live shape: 757 themes went out as ONE insert, Postgres spent 13.4s on
    // it and killed it — 57014. Only the Inngest retry landed the data.
    const f = fakeInsert()
    expect(await insertThemesChunked(f.insert, rows(757))).toBeNull()
    expect(f.sizes).toEqual([100, 100, 100, 100, 100, 100, 100, 57])
    expect(f.sizes.every((n) => n <= THEMES_INSERT_CHUNK)).toBe(true)
    expect(f.sizes.reduce((a, b) => a + b, 0)).toBe(757)
  })

  it('sends one statement when the run fits in a chunk', async () => {
    const f = fakeInsert()
    await insertThemesChunked(f.insert, rows(42))
    expect(f.sizes).toEqual([42])
  })

  it('writes nothing at all for an empty theme set', async () => {
    const f = fakeInsert()
    expect(await insertThemesChunked(f.insert, [])).toBeNull()
    expect(f.sizes).toEqual([])
  })

  it('returns the first error and stops, so the caller can still read it', async () => {
    // The caller needs the error object itself — it tests it with
    // isMissingColumnError before deciding to retry without a column.
    const f = fakeInsert(3)
    const err = await insertThemesChunked(f.insert, rows(757))
    expect(err).toEqual({ message: 'canceling statement due to statement timeout' })
    expect(f.sizes).toEqual([100, 100, 100])
  })
})

describe('rereadShare — how much of this theme the run re-analysed', () => {
  const reRead = new Set(['v1', 'v2'])

  it('is the share of the DISTINCT videos this run re-read', () => {
    expect(rereadShare(['v1', 'v2', 'v3', 'v4'], reRead)).toBe(0.5)
    expect(rereadShare(['v1', 'v1', 'v2'], reRead)).toBe(1)
    expect(rereadShare(['v9'], reRead)).toBe(0)
  })

  it('is null, not 0, for a theme with no videos at all', () => {
    // No denominator, so no share. 0 would claim nothing was re-analysed.
    expect(rereadShare([], reRead)).toBeNull()
  })

  it('reads 1.0 across a corpus-wide re-read — the break marker input', () => {
    expect(rereadShare(['v1', 'v2'], reRead)).toBe(1)
  })
})

describe('firstMatch — a retried step may not rewrite how a theme was matched', () => {
  it('keeps the stored kind and score when this run already observed the theme', () => {
    expect(firstMatch({ match_kind: 'new', match_score: 0 }, { kind: 'exact', score: 1 }))
      .toEqual({ match_kind: 'new', match_score: 0 })
  })

  it('takes this attempt match when there is no stored one', () => {
    expect(firstMatch(undefined, { kind: 'strong', score: 0.75 }))
      .toEqual({ match_kind: 'strong', match_score: 0.75 })
  })

  it('keeps a stored null score rather than replacing it with a fresh number', () => {
    expect(firstMatch({ match_kind: 'revived', match_score: null }, { kind: 'exact', score: 1 }))
      .toEqual({ match_kind: 'revived', match_score: null })
  })
})
