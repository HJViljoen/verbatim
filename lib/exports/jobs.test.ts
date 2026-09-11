import { describe, it, expect } from 'vitest'
import { pageSections, tileSections, jobKey, exportErrorLine } from './jobs'
import { EXPORT_DAILY_LIMIT } from '../config'

describe('pageSections', () => {
  const tiles = [{ key: 'dashboard.hero', title: 'Where you stand' }, { key: 'dashboard.themes', title: 'Themes' }]

  it('offers the page twice — as it is and with everything — always as a PDF', () => {
    const [first] = pageSections(tiles)
    expect(first.label).toBeUndefined()
    expect(first.jobs.map((j) => [j.kind, j.variant, j.format])).toEqual([
      ['page', 'default', 'pdf'],
      ['page', 'full', 'pdf'],
    ])
  })

  it('lists every tile on the page as an image, in the page’s own order', () => {
    const [, tileSection] = pageSections(tiles)
    expect(tileSection.label).toBe('A tile as an image')
    expect(tileSection.jobs).toEqual([
      { kind: 'tile', tileKey: 'dashboard.hero', format: 'png', label: 'Where you stand' },
      { kind: 'tile', tileKey: 'dashboard.themes', format: 'png', label: 'Themes' },
    ])
  })

  it('drops the tile section on a page with no tiles', () => {
    expect(pageSections([])).toHaveLength(1)
  })
})

describe('tileSections', () => {
  it('offers one tile both ways and names no format twice', () => {
    const [only] = tileSections('voice.map')
    expect(only.jobs).toEqual([
      { kind: 'tile', tileKey: 'voice.map', format: 'png', label: 'Image' },
      { kind: 'tile', tileKey: 'voice.map', format: 'pdf', label: 'One-page PDF' },
    ])
  })
})

describe('jobKey', () => {
  it('separates the two page jobs, which differ only by variant', () => {
    const [{ jobs }] = pageSections([])
    expect(jobKey(jobs[0])).not.toBe(jobKey(jobs[1]))
  })

  it('separates a tile’s two formats', () => {
    const [{ jobs }] = tileSections('voice.map')
    expect(jobKey(jobs[0])).not.toBe(jobKey(jobs[1]))
  })
})

describe('exportErrorLine', () => {
  it('says the cap is the cap, whatever the server phrased it as', () => {
    expect(exportErrorLine(429, 'That is 50 exports today, which is the daily limit.'))
      .toBe(`Today's export limit is reached (${EXPORT_DAILY_LIMIT}). Tomorrow it resets.`)
  })

  it('passes the server’s own sentence through', () => {
    expect(exportErrorLine(409, 'Nothing to export yet — your first update has not landed.'))
      .toBe('Nothing to export yet — your first update has not landed.')
  })

  it('falls back when the server said nothing useful', () => {
    expect(exportErrorLine(500, '   ')).toBe('Couldn’t make that file — try again.')
    expect(exportErrorLine(500, null)).toBe('Couldn’t make that file — try again.')
  })
})
