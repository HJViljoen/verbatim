import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { archivePresets, presetLine } from '@/lib/reports/page-context'
import { ArchiveTile, COLUMN_ROWS, type ArchiveColumn } from './archive-lists'
import { StudioCard } from './studio-card'
import { AUDIENCES } from '@/lib/reports/types'
import type { UpdateInput } from '@/lib/readiness/types'

// The render tier for the archive and the Studio card (Block D wave 2,
// package E-reports). What the tiles PRINT, which is what the contract is
// written at.

const run = (day: string): UpdateInput => ({ id: day, status: 'completed', startedAt: `${day}T06:00:00Z`, completedAt: null })
const PRESETS = archivePresets([run('2026-09-06'), run('2026-09-13')], '2026-09-01')

const column = (over: Partial<ArchiveColumn> = {}): ArchiveColumn => ({
  key: 'sent',
  label: 'Sent',
  meta: 'to your inbox',
  items: [
    { id: 's1', title: 'Weekly report', meta: 'Sunday update · sent 27 Sep, 09:04 to 4 people', stamp: '27 Sep', href: '/dashboard/reports?item=s1', icon: 'mail' },
    { id: 's2', title: 'Weekly report', meta: null, stamp: '20 Sep', href: '/dashboard/reports?item=s2', icon: 'mail' },
  ],
  total: 2,
  empty: 'Nothing sent yet.',
  ...over,
})

const tile = (columns: ArchiveColumn[], over: Record<string, unknown> = {}) => (
  <ArchiveTile
    columns={columns}
    meta="23 updates since 6 Apr 2026 · longest gap 9 days · last on 27 Sep 2026"
    presets={PRESETS}
    activePresetKey="2026-09-01"
    presetHref={(p) => `/dashboard/reports?from=${p.from ?? ''}`}
    presetNote={presetLine(PRESETS[0])}
    {...over}
  />
)

describe('the archive', () => {
  it('keeps the copy contract', () => {
    assertCopyContract(tile([column(), column({ key: 'built', label: 'Built', meta: 'documents' })]))
  })

  // The structural change: three lists, visible at once, not three tabs of a
  // master-detail.
  it('draws every group at once', () => {
    const text = renderText(tile([
      column(),
      column({ key: 'built', label: 'Built', meta: 'documents' }),
      column({ key: 'exported', label: 'Exported', meta: 'pages and tiles', items: [], total: 0, empty: 'Nothing exported yet.' }),
    ]))
    expect(text).toContain('Sent')
    expect(text).toContain('Built')
    expect(text).toContain('Exported')
  })

  // An empty group is a sentence, never a hole — and the sentence is the
  // group's own, which is the one that knows whether a filter is on.
  it('prints the group’s own empty sentence', () => {
    expect(renderText(tile([column({ items: [], total: 0, empty: 'Nothing was exported in those dates.' })])))
      .toContain('Nothing was exported in those dates.')
  })

  // A SILENT TRUNCATION IS THE DEFECT `listCap` EXISTS TO STOP, one level up.
  // A column holding more than it draws says what it is showing and points at
  // the control that narrows it.
  it('says what it is holding back', () => {
    const many = column({
      items: Array.from({ length: 9 }, (_, i) => ({
        id: `s${i}`, title: `Update ${i}`, stamp: '1 Sep', href: '#', icon: 'mail' as const,
      })),
      total: 23,
    })
    const text = renderText(tile([many]))
    expect(text).toContain(`showing ${COLUMN_ROWS} of 23`)
    expect(text).toContain('narrow the dates')
  })

  // The chips count UPDATES; the filter line under them counts archive rows.
  // Two questions, two lines, and neither borrowing the other's number.
  it('counts updates in the chip line', () => {
    expect(renderText(tile([column()]))).toContain('2 updates in September · 6, 13 Sep')
  })

  it('carries the delivery record in its meta', () => {
    expect(renderText(tile([column()]))).toContain('23 updates since 6 Apr 2026')
  })

  it('marks the selected row rather than moving it', () => {
    const html = render(tile([column({ items: [{ id: 's1', title: 'Weekly report', stamp: '27 Sep', href: '#', active: true, icon: 'mail' }] })]))
    expect(html).toContain('aria-current="true"')
  })
})

describe('the Studio card', () => {
  it('keeps the copy contract', () => {
    assertCopyContract(<StudioCard pages={['Overview', 'Subjects', 'Market']} />)
  })

  // THE CHIPS PRINT WHAT IS TRUE. The mock's five persona labels (Digital
  // director · Sales lead · …) are not options — the Studio's control stores
  // one of these five keys, and a chip naming a choice that is not there is a
  // promise the next screen breaks.
  it('names the audiences the Studio actually offers', () => {
    const text = renderText(<StudioCard pages={['Overview']} />)
    for (const a of AUDIENCES) expect(text).toContain(a.label)
    expect(text).not.toContain('Digital director')
    expect(text).not.toContain('Founder')
  })

  it('names the pages it is handed, and no others', () => {
    const text = renderText(<StudioCard pages={['Overview', 'Subjects']} />)
    expect(text).toContain('Overview')
    expect(text).toContain('Subjects')
    expect(text).not.toContain('Head to head')
  })
})
