import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { SettingsFrame, SettingsTable, SettingsRow, FactRow } from '@/components/settings-frame'
import { ReadinessTable } from '@/components/ops/readiness-table'
import { SETTINGS_SUBPAGES } from '@/lib/settings/rail'
import type { ReadinessRow } from '@/lib/readiness/types'

describe('the settings rail', () => {
  it('draws the seven sub-pages, in the mock’s order', () => {
    const text = renderText(
      <SettingsFrame active="record" title="Settings" contentTitle="The record">x</SettingsFrame>,
    )
    for (const s of SETTINGS_SUBPAGES) expect(text).toContain(s.label)
    expect(SETTINGS_SUBPAGES.map((s) => s.label)).toEqual([
      'Tracking', 'Subjects', 'Readiness', 'The record',
      'Reports and recipients', 'Team and billing', 'How to read',
    ])
  })

  it('marks exactly one entry as the page, and none when the page is parked', () => {
    const lit = render(<SettingsFrame active="record" title="Settings">x</SettingsFrame>)
    expect(lit.match(/aria-current="page"/g)).toHaveLength(1)
    expect(lit).toContain('href="/dashboard/settings/record"')
    const parked = render(<SettingsFrame active={null} title="Settings">x</SettingsFrame>)
    expect(parked.match(/aria-current="page"/g)).toBeNull()
  })

  it('prints a rail count only where one was supplied', () => {
    const markup = render(
      <SettingsFrame active="tracking" title="Settings" counts={{ tracking: '21 terms' }}>x</SettingsFrame>,
    )
    expect(markup).toContain('21 terms')
    // Nothing invented for the six with no count — a count nobody loaded must
    // not become a zero.
    expect(markup).not.toContain('>0<')
  })

  it('keeps Billing under the Team and billing entry rather than giving it its own', () => {
    const entry = SETTINGS_SUBPAGES.find((s) => s.key === 'team')!
    expect(entry.href).toBe('/dashboard/team')
    expect(entry.under).toEqual(['/dashboard/billing'])
  })
})

describe('the settings vocabulary', () => {
  it('is forms, not tiles: no elevated card ground inside a sub-page', () => {
    const markup = render(
      <SettingsFrame active="tracking" title="Settings">
        <FactRow label="Platforms">TikTok · YouTube</FactRow>
      </SettingsFrame>,
    )
    // The two tile grounds belong to the frame's own two panes and to nothing
    // a sub-page draws.
    expect(markup.match(/bg-tile shadow-tile/g)).toHaveLength(2)
  })

  it('says a table is empty in words rather than drawing an empty table', () => {
    const empty = renderText(
      <SettingsTable head={['Community', 'Posts']} empty="Nothing is watched yet.">{[]}</SettingsTable>,
    )
    expect(empty).toBe('Nothing is watched yet.')
    const full = renderText(
      <SettingsTable head={['Community', 'Posts']} empty="Nothing is watched yet.">
        <SettingsRow cells={['r/amputee', '23']} />
      </SettingsTable>,
    )
    expect(full).toContain('r/amputee')
    expect(full).not.toContain('Nothing is watched yet')
  })
})

const row = (over: Partial<ReadinessRow> = {}): ReadinessRow => ({
  id: 'retention', block: 'Everything', input: 'Comments read again',
  status: 'exists', detail: '768 comments fall due on 17 September 2026.',
  owner: 'ops', unlocks: 'Nothing to do.', notes: [], ...over,
})

describe('the readiness table, read by a client', () => {
  it('prints the owner in the client’s words when the view supplies them', () => {
    const text = renderText(
      <ReadinessTable rows={[{ ...row(), ownerWords: 'We do this' }]} title="t" description="d" />,
    )
    expect(text).toContain('We do this')
    expect(text).not.toContain('Verbatim ops')
  })

  it('prints a "by when" only when there is one, and the operator page is untouched', () => {
    expect(renderText(<ReadinessTable rows={[{ ...row(), by: '17 Sep 2026' }]} title="t" description="d" />))
      .toContain('By 17 Sep 2026.')
    const operator = renderText(<ReadinessTable rows={[row()]} title="t" description="d" />)
    expect(operator).toContain('Verbatim ops')
    expect(operator).not.toContain('By ')
  })
})
