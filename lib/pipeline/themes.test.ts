import { describe, it, expect } from 'vitest'
import { insertThemesChunked, THEMES_INSERT_CHUNK } from './themes'

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
