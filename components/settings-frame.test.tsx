import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { SettingsFrame, SettingsTable, SettingsRow, SettingsCard, FactRow } from '@/components/settings-frame'
import { ReadinessTable } from '@/components/ops/readiness-table'
import type { ReadinessRow } from '@/lib/readiness/types'

describe('the settings tabs (the Page-Settings artboard, pages build 1 Oct)', () => {
  it('draws the client\'s three tabs as pills, in the artboard\'s order, and no operator tab', () => {
    const markup = render(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)
    const text = renderText(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)
    expect(text).toMatch(/What you track Team Billing/)
    for (const hidden of ['Readiness', 'The record', 'How to read', 'Subjects', 'Reports and recipients']) expect(text).not.toContain(hidden)
    expect(markup).toMatch(/<nav aria-label="Settings" class="flex gap-1 overflow-x-auto">/)
    // No hairline under the row and no green rule: the lit tab is a pill.
    expect(markup).not.toContain('border-b border-border')
    expect(markup).not.toContain('bg-primary')
  })

  it('gives the operator Readiness, The record and How to read after them', () => {
    const text = renderText(<SettingsFrame active="record" operator title="Settings">x</SettingsFrame>)
    expect(text).toMatch(/What you track Team Billing Readiness The record How to read/)
  })

  it('lights exactly one tab, as a pill on ink at 7% in weight 600, and none when the page is parked', () => {
    const lit = render(<SettingsFrame active="billing" title="Settings">x</SettingsFrame>)
    expect(lit.match(/aria-current="page"/g)).toHaveLength(1)
    const tag = /<a[^>]*aria-current="page"[^>]*>/.exec(lit)?.[0] ?? ''
    expect(tag).toContain('href="/dashboard/billing"')
    expect(tag).toContain('bg-[rgba(38,41,44,0.07)] font-semibold')
    const parked = render(<SettingsFrame active={null} title="Settings">x</SettingsFrame>)
    expect(parked.match(/aria-current="page"/g)).toBeNull()
  })

  it('gives every tab a focus ring and the artboard\'s 38px height', () => {
    const markup = render(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)
    expect(markup.match(/focus-visible:ring-2/g)?.length).toBeGreaterThanOrEqual(3)
    expect(markup.match(/inline-flex h-\[38px\]/g)).toHaveLength(3)
  })

  it('puts Log out in the page\'s own bar, as a form', () => {
    const markup = render(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)
    expect(renderText(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)).toMatch(/^Settings Log out/)
    expect(markup).toMatch(/<form[^>]*>[\s\S]*<button type="submit"[^>]*>[\s\S]*Log out<\/button><\/form>/)
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
    // A sub-page the artboards do not draw keeps its own header, less a
    // title that only repeats the lit tab.
    expect(markup).toContain('nine pages')
    expect(markup).toContain('What each page tells you.')
    expect(markup).not.toContain('<h2 class="shrink-0 text-[15px] font-semibold">How to read</h2>')
  })

  it('keeps a title the lit tab does not say (Plan & billing, under Billing)', () => {
    const markup = render(<SettingsFrame active="billing" title="Settings" contentTitle="Plan & billing">x</SettingsFrame>)
    expect(markup).toContain('<h2 class="shrink-0 text-[15px] font-semibold">Plan &amp; billing</h2>')
  })

  it('draws a sub-page that passes no rule: the other routes\' shape', () => {
    const markup = render(
      <SettingsFrame
        active="readiness"
        operator
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

describe('no context line under the title (rule 1, pages build 1 Oct)', () => {
  it('prints neither the reading month nor "as at the update", whatever the caller passes', async () => {
    const { sealandReading } = await import('@/lib/test/reading-fixture')
    const { oneLineBar } = await import('@/lib/shell/bar')
    const text = renderText(<SettingsFrame active="tracking" title="Settings" context="Sealand · read-only" bar={oneLineBar('Sealand', sealandReading('2026-10-01T00:00:00.000Z'))}>x</SettingsFrame>)
    expect(text).not.toContain('September 2026')
    expect(text).not.toContain('as at the')
    expect(text).not.toContain('next update')
    expect(text).not.toContain('read-only')
  })
})
