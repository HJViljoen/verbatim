import { describe, expect, it } from 'vitest'

import { clearMemo, idsKey, memoRead, memoSize } from './memo'

describe('memoRead', () => {
  it('runs a read once per key per client', async () => {
    const client = {}
    let calls = 0
    const read = async () => { calls += 1; return calls }
    const [a, b, c] = await Promise.all([
      memoRead(client, 'k', read),
      memoRead(client, 'k', read),
      memoRead(client, 'k', read),
    ])
    expect([a, b, c]).toEqual([1, 1, 1])
    expect(calls).toBe(1)
  })

  it('keeps two clients apart — the tenant boundary is the client object', async () => {
    const one = {}
    const two = {}
    let calls = 0
    const read = async () => { calls += 1; return calls }
    expect(await memoRead(one, 'k', read)).toBe(1)
    expect(await memoRead(two, 'k', read)).toBe(2)
    expect(calls).toBe(2)
  })

  it('keeps two keys apart', async () => {
    const client = {}
    let calls = 0
    const read = async () => { calls += 1; return calls }
    expect(await memoRead(client, 'a', read)).toBe(1)
    expect(await memoRead(client, 'b', read)).toBe(2)
  })

  it('does not remember a rejection: the next caller asks again', async () => {
    const client = {}
    let calls = 0
    const read = async () => {
      calls += 1
      if (calls === 1) throw new Error('transient')
      return 'ok'
    }
    await expect(memoRead(client, 'k', read)).rejects.toThrow('transient')
    expect(memoSize(client)).toBe(0)
    expect(await memoRead(client, 'k', read)).toBe('ok')
    expect(calls).toBe(2)
  })

  it('runs the read when there is no scope to keep it in', async () => {
    let calls = 0
    const read = async () => { calls += 1; return calls }
    expect(await memoRead(null, 'k', read)).toBe(1)
    expect(await memoRead(null, 'k', read)).toBe(2)
  })

  it('clearMemo forgets what one client remembers', async () => {
    const client = {}
    let calls = 0
    const read = async () => { calls += 1; return calls }
    expect(await memoRead(client, 'k', read)).toBe(1)
    clearMemo(client)
    expect(memoSize(client)).toBe(0)
    expect(await memoRead(client, 'k', read)).toBe(2)
  })
})

describe('idsKey', () => {
  it('is stable under order and duplicates', () => {
    expect(idsKey(['b', 'a', 'b'])).toBe(idsKey(['a', 'b']))
  })

  it('tells different sets apart, short and long', () => {
    expect(idsKey(['a', 'b'])).not.toBe(idsKey(['a', 'c']))
    const long = Array.from({ length: 200 }, (_, i) => `id-${i}`)
    const other = [...long.slice(0, 199), 'id-999']
    expect(idsKey(long)).not.toBe(idsKey(other))
    expect(idsKey(long)).toBe(idsKey([...long].reverse()))
  })

  it('does not carry a whole long list in the key', () => {
    const long = Array.from({ length: 3000 }, (_, i) => `id-${i}`)
    expect(idsKey(long).length).toBeLessThan(120)
  })

  it('names an empty set', () => {
    expect(idsKey([])).toBe('')
  })
})
