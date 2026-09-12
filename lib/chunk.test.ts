import { describe, expect, it } from 'vitest'
import { chunk } from './chunk'

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
