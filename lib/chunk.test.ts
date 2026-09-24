import { describe, expect, it } from 'vitest'
import { chunk, mapWithLimit } from './chunk'

describe('chunk', () => {
  it('splits into runs of at most size, order preserved', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns one chunk when the list fits', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]])
    expect(chunk([1, 2], 2)).toEqual([[1, 2]])
  })

  it('is empty for an empty list — a caller’s loop must not run once on nothing', () => {
    expect(chunk([], 100)).toEqual([])
  })

  it('covers every item exactly once', () => {
    // The 705-uuid `.in()` that got a 400 on a real run (2026-08-30) chunked at 100.
    const ids = Array.from({ length: 705 }, (_, i) => i)
    const chunks = chunk(ids, 100)
    expect(chunks).toHaveLength(8)
    expect(chunks[7]).toHaveLength(5)
    expect(chunks.flat()).toEqual(ids)
  })

  it('does not alias the input — a caller may push into a chunk', () => {
    const src = [1, 2, 3]
    const chunks = chunk(src, 2)
    chunks[0].push(99)
    expect(src).toEqual([1, 2, 3])
  })

  it('throws on a size that would loop forever or split nothing', () => {
    expect(() => chunk([1, 2], 0)).toThrow(/positive integer/)
    expect(() => chunk([1, 2], -1)).toThrow(/positive integer/)
    expect(() => chunk([1, 2], 1.5)).toThrow(/positive integer/)
  })
})

describe('mapWithLimit', () => {
  it('keeps the results in the order the items were given', async () => {
    const out = await mapWithLimit([5, 1, 3, 2, 4], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n))
      return n * 10
    })
    expect(out).toEqual([50, 10, 30, 20, 40])
  })

  it('never runs more than `limit` at once', async () => {
    let running = 0
    let peak = 0
    await mapWithLimit(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 1))
      running -= 1
      return null
    })
    expect(peak).toBe(4)
  })

  it('runs everything at once when the limit is not binding', async () => {
    let running = 0
    let peak = 0
    await mapWithLimit([1, 2, 3], 10, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 1))
      running -= 1
      return null
    })
    expect(peak).toBe(3)
  })

  it('rejects like Promise.all, and stops taking new work', async () => {
    const started: number[] = []
    await expect(
      mapWithLimit(Array.from({ length: 12 }, (_, i) => i), 2, async (i) => {
        started.push(i)
        await new Promise((r) => setTimeout(r, 1))
        if (i === 1) throw new Error('nope')
        return i
      }),
    ).rejects.toThrow('nope')
    expect(started.length).toBeLessThan(12)
  })

  it('is a no-op shape for an empty list', async () => {
    expect(await mapWithLimit([], 6, async () => 1)).toEqual([])
  })
})
