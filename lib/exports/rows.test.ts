import { describe, it, expect } from 'vitest'
import { exportedRows, exportedLine, type ExportSnapshot } from './rows'

const snap = (over: Partial<ExportSnapshot> = {}): ExportSnapshot => ({
  id: 's1',
  title: 'Dashboard · Sealand · 11 Sep',
  kind: 'page',
  created_at: '2026-09-11T09:00:00Z',
  artifacts: [{ id: 'a1', format: 'pdf', bytes: 240_000, stale: false }],
  ...over,
})

describe('exportedRows', () => {
  it('says what was exported in the reader’s words', () => {
    const [page] = exportedRows([snap()])
    expect(page.what).toBe('a whole page')
    expect(exportedRows([snap({ kind: 'tile' })])[0].what).toBe('one tile')
    expect(exportedRows([snap({ kind: 'agent_thread' })])[0].what).toBe('a question')
  })

  it('drops a snapshot with no stored file — there is nothing to download', () => {
    expect(exportedRows([snap({ artifacts: [] }), snap({ id: 's2', artifacts: null })])).toEqual([])
  })

  it('is stale when any of its files is', () => {
    const row = exportedRows([snap({ artifacts: [
      { id: 'a1', format: 'pdf', bytes: 1, stale: false },
      { id: 'a2', format: 'png', bytes: 1, stale: true },
    ] })])[0]
    expect(row.stale).toBe(true)
  })

  it('keeps the order it was given (the read is newest first)', () => {
    const rows = exportedRows([snap({ id: 'newer' }), snap({ id: 'older' })])
    expect(rows.map((r) => r.id)).toEqual(['newer', 'older'])
  })
})

describe('exportedLine', () => {
  it('names each format once', () => {
    const row = exportedRows([snap({ artifacts: [
      { id: 'a1', format: 'pdf', bytes: 1, stale: false },
      { id: 'a2', format: 'pdf', bytes: 1, stale: false },
    ] })])[0]
    expect(exportedLine(row, '11 Sep, 09:00')).toBe('a whole page · PDF · 11 Sep, 09:00')
  })

  it('warns that a swept file is built again on the way down', () => {
    const row = exportedRows([snap({ artifacts: [{ id: 'a1', format: 'png', bytes: 1, stale: true }] })])[0]
    expect(exportedLine(row, '11 Sep, 09:00')).toBe('a whole page · PNG · 11 Sep, 09:00 · rebuilt on download')
  })
})
