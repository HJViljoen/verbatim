import { afterEach, describe, expect, it, vi } from 'vitest'
import { rows, row } from './read'

afterEach(() => vi.restoreAllMocks())

const spy = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('rows / row', () => {
  it('passes the data through when the query worked', () => {
    const log = spy()
    expect(rows<{ id: string }>({ data: [{ id: 'a' }], error: null }, 'dashboard.recommendations')).toEqual([{ id: 'a' }])
    expect(row<{ id: string }>({ data: { id: 'a' }, error: null }, 'market.summary')).toEqual({ id: 'a' })
    expect(log).not.toHaveBeenCalled()
  })

  it('reads an empty result as empty, silently — nothing failed', () => {
    const log = spy()
    expect(rows({ data: [], error: null }, 'market.news')).toEqual([])
    expect(rows({ data: null, error: null }, 'market.news')).toEqual([])
    expect(row({ data: null, error: null }, 'market.summary')).toBeNull()
    expect(log).not.toHaveBeenCalled()
  })

  it('says which read failed, and still degrades to empty', () => {
    // The whole point: a broken week must not render as a quiet one.
    const log = spy()
    expect(rows({ data: null, error: { message: 'fetch failed' } }, 'voice.samples')).toEqual([])
    expect(row({ data: null, error: { message: 'fetch failed' } }, 'dashboard.latestRun')).toBeNull()
    expect(log).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledWith('[pages] voice.samples: fetch failed')
    expect(log).toHaveBeenCalledWith('[pages] dashboard.latestRun: fetch failed')
  })

  it('refuses a single row sent through rows(), instead of failing at render', () => {
    const log = spy()
    expect(rows({ data: { id: 'a' }, error: null }, 'market.summary')).toEqual([])
    expect(log).toHaveBeenCalledWith('[pages] market.summary: expected rows, got object — use row() for a single read')
  })

  it('trusts the error over the data, when a driver sends both', () => {
    const log = spy()
    expect(rows({ data: [{ id: 'stale' }], error: { message: 'timeout' } }, 'competitive.insights')).toEqual([])
    expect(log).toHaveBeenCalledOnce()
  })
})
