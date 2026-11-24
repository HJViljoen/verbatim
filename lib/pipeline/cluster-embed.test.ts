import { beforeEach, describe, expect, it, vi } from 'vitest'

// embedTexts' `parallel` (18 Nov): the clustering keeps CLUSTER_EMBED_PARALLEL
// embeddings requests in flight instead of one. The bar is that nothing the
// caller can see moves: the same requests, the vectors in input order however
// the answers arrive, and no new request after one fails. The SDK is a stub
// that answers each request after a delay of its own choosing.

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../openai', async (orig) => {
  const real = await orig<typeof import('../openai')>()
  return { ...real, openai: { embeddings: { create: h.create } } }
})

import { CLUSTER_EMBED_PARALLEL, EMBED_BATCH, embedTexts } from './cluster'

/** A vector that names its text, so order is checkable. */
const vecOf = (text: string) => [Number(text.slice(1))]

/** Answers each request after `delay(input)` ms, its items shuffled (the API
 *  only promises `index`), and records how many were in flight at once. */
function stub(delay: (input: string[]) => number) {
  let inFlight = 0
  const seen = { maxInFlight: 0, inputs: [] as string[][] }
  h.create.mockImplementation(async ({ input }: { input: string[] }) => {
    inFlight++
    seen.maxInFlight = Math.max(seen.maxInFlight, inFlight)
    seen.inputs.push(input)
    await new Promise((r) => setTimeout(r, delay(input)))
    inFlight--
    const data = input.map((t, index) => ({ index, embedding: vecOf(t) })).reverse()
    return { data }
  })
  return seen
}

const texts = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`)

beforeEach(() => {
  h.create.mockReset()
})

describe('embedTexts in parallel', () => {
  it('returns the vectors in input order when later chunks answer first', async () => {
    const n = EMBED_BATCH * 5 + 7
    // The first chunk is the slowest, the last the quickest.
    const seen = stub((input) => 40 - Number(input[0].slice(1)) / EMBED_BATCH * 7)
    const out = await embedTexts(texts(n), undefined, CLUSTER_EMBED_PARALLEL)
    expect(out).toEqual(texts(n).map(vecOf))
    expect(seen.maxInFlight).toBe(CLUSTER_EMBED_PARALLEL)
  })

  it('sends exactly the requests the sequential path sends', async () => {
    const n = EMBED_BATCH * 3 + 1
    const one = stub(() => 1)
    const seq = await embedTexts(texts(n))
    h.create.mockReset()
    const four = stub(() => 1)
    const par = await embedTexts(texts(n), undefined, 4)
    expect(par).toEqual(seq)
    expect(one.maxInFlight).toBe(1)
    expect([...four.inputs].sort((a, b) => a[0].localeCompare(b[0]))).toEqual([...one.inputs].sort((a, b) => a[0].localeCompare(b[0])))
  })

  it('throws on a failed chunk and starts no chunk after it', async () => {
    const n = EMBED_BATCH * 10
    let failedYet = false
    let startedAfter = 0
    h.create.mockImplementation(async ({ input }: { input: string[] }) => {
      if (failedYet) startedAfter++
      await new Promise((r) => setTimeout(r, input[0] === `t${EMBED_BATCH}` ? 1 : 10))
      if (input[0] === `t${EMBED_BATCH}`) {
        failedYet = true
        throw new Error('429 slow down')
      }
      return { data: input.map((t, index) => ({ index, embedding: vecOf(t) })) }
    })
    await expect(embedTexts(texts(n), undefined, 4)).rejects.toThrow('429 slow down')
    await new Promise((r) => setTimeout(r, 40)) // let anything still in flight land
    // The first four started together; the second fails first, the other
    // three land, and nothing new begins.
    expect(startedAfter).toBe(0)
    expect(h.create.mock.calls.length).toBe(4)
  })

  it('never keeps more in flight than there are chunks, and one is sequential', async () => {
    const seen = stub(() => 1)
    await embedTexts(texts(10), undefined, 8)
    expect(seen.maxInFlight).toBe(1)
    expect(await embedTexts([], undefined, 4)).toEqual([])
  })
})
