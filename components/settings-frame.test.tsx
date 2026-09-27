import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { SettingsFrame, SettingsTable, SettingsRow, SettingsCard, FactRow } from '@/components/settings-frame'
import { ReadinessTable } from '@/components/ops/readiness-table'
import { SETTINGS_SUBPAGES } from '@/lib/settings/rail'
import type { ReadinessRow } from '@/lib/readiness/types'

describe('the settings tabs (the approved preview, market-first WP3.10)', () => {
  it('draws every sub-page as a tab over the page, in the preview\'s order', () => {
    const markup = render(<SettingsFrame active="record" title="Settings">x</SettingsFrame>)
    const text = renderText(<SettingsFrame active="record" title="Settings">x</SettingsFrame>)
    for (const s of SETTINGS_SUBPAGES) expect(text).toContain(s.label)
    // One row on a hairline, no rail beside the page.
    expect(markup).toMatch(/<nav aria-label="Settings" class="[^"]*flex items-end gap-8 overflow-x-auto border-b border-border/)
    expect(markup).not.toContain('min-[1100px]:w-[224px]')
    expect(markup).not.toContain('min-h-10')
  })

  it('lights exactly one tab, with the green rule under it, and none when the page is parked', () => {
    const lit = render(<SettingsFrame active="record" title="Settings">x</SettingsFrame>)
    expect(lit.match(/aria-current="page"/g)).toHaveLength(1)
    const tag = /<a[^>]*aria-current="page"[^>]*>/.exec(lit)?.[0] ?? ''
    expect(tag).toContain('href="/dashboard/settings/record"')
    expect(tag).toContain('font-semibold text-foreground')
    expect(lit.match(/bg-primary/g)).toHaveLength(1)
    const parked = render(<SettingsFrame active={null} title="Settings">x</SettingsFrame>)
    expect(parked.match(/aria-current="page"/g)).toBeNull()
    expect(parked).not.toContain('bg-primary')
  })

  it('gives every tab a focus ring and the 44px height', () => {
    const markup = render(<SettingsFrame active="record" title="Settings">x</SettingsFrame>)
    expect(markup.match(/focus-visible:ring-2/g)).toHaveLength(SETTINGS_SUBPAGES.length)
    expect(markup.match(/inline-flex h-11/g)).toHaveLength(SETTINGS_SUBPAGES.length)
  })

  it('keeps Billing under the Team tab rather than giving it its own', () => {
    const entry = SETTINGS_SUBPAGES.find((s) => s.key === 'team')!
    expect(entry.href).toBe('/dashboard/team')
    expect(entry.under).toEqual(['/dashboard/billing'])
  })
})

describe('the settings vocabulary', () => {
  it('draws no elevated card of its own: the sub-page decides its grounds', () => {
    const markup = render(
      <SettingsFrame active="guide" title="Settings" contentTitle="How to read" contentMeta="nine pages" contentRule="What each page tells you.">
        <FactRow label="Platforms">TikTok · YouTube</FactRow>
      </SettingsFrame>,
    )
    expect(markup).not.toContain('shadow-tile')
    // A sub-page the artboards do not draw keeps its own header.
    expect(markup).toContain('How to read')
    expect(markup).toContain('nine pages')
    expect(markup).toContain('What each page tells you.')
  })

  it('draws a sub-page that passes no rule: the other routes\' shape', () => {
    const markup = render(
      <SettingsFrame
        active="readiness"
        title="Settings"
        context="Sealand · read-only"
        contentTitle="Readiness"
        contentMeta="13 inputs · 6 missing"
      >
        <SettingsCard title="What we still need">…</SettingsCard>
      </SettingsFrame>,
    )
    expect(markup).toContain('Readiness')
    expect(markup).toContain('13 inputs · 6 missing')
    expect(markup).toContain('What we still need')
    expect(markup).toContain('aria-current="page"')
    expect(markup.match(/<p class="text-\[12\.5px\] text-muted-foreground">/g)).toBeNull()
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

describe('the one-line bar (the 25 Sep rulings, market-first WP3.10)', () => {
  it('prints the brand, the reading month and "as at … · next update …" under the title, with no menu', async () => {
    const { sealandReading } = await import('@/lib/test/reading-fixture')
    const { oneLineBar } = await import('@/lib/shell/bar')
    const markup = render(<SettingsFrame active="tracking" title="Settings" bar={oneLineBar('Sealand', sealandReading('2026-10-01T00:00:00.000Z'))}>x</SettingsFrame>)
    const text = renderText(<SettingsFrame active="tracking" title="Settings" bar={oneLineBar('Sealand', sealandReading('2026-10-01T00:00:00.000Z'))}>x</SettingsFrame>)
    expect(text).toContain('Sealand · September 2026')
    expect(text).toContain('as at the 27 Sep update')
    expect(text).toContain('next update Sun 4 Oct')
    expect(markup).not.toContain('aria-haspopup')
  })
  it('is the title alone without a reading month', () => {
    const text = renderText(<SettingsFrame active="tracking" title="Settings" context="Sealand · first update on record 6 Apr" bar={null}>x</SettingsFrame>)
    expect(text).not.toContain('as at the')
    expect(text).not.toContain('first update on record')
  })
})
