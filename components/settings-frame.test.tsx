import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { SettingsFrame, SettingsTable, SettingsRow, SettingsCard } from '@/components/settings-frame'
import { ReadinessTable } from '@/components/ops/readiness-table'
import type { ReadinessRow } from '@/lib/readiness/types'

describe('the settings tabs (the Page-Settings artboard, pages build 1 Oct; E8 in Design v2)', () => {
  it('draws the client\'s five tabs in the white segmented control, in the board\'s order, and no operator tab', () => {
    const markup = render(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)
    const text = renderText(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)
    expect(text).toMatch(/What you track Your products Your subjects Team Billing/)
    for (const hidden of ['Readiness', 'The record', 'How to read', 'Reports and recipients']) expect(text).not.toContain(hidden)
    // The row wraps rather than scrolling sideways: at a phone's width five
    // tabs do not fit, and a scrolling row cut one and hid two (E8, T10b).
    // Since the audit design (Settings.dc.html) the row is one white group
    // on a hairline, radius 10, as wide as its tabs.
    const nav = /<nav aria-label="Settings" class="([^"]*)">/.exec(markup)?.[1] ?? ''
    for (const c of ['flex-wrap', 'rounded-[10px]', 'border', 'border-border', 'bg-card', 'p-1', 'self-start']) expect(nav.split(' ')).toContain(c)
    expect(markup).not.toContain('overflow-x-auto')
    // No hairline under the row and no green rule: the lit tab is the pale yellow.
    expect(markup).not.toContain('border-b border-border')
    expect(markup).not.toContain('bg-primary')
  })

  it('gives the operator Readiness, The record and How to read after them', () => {
    const text = renderText(<SettingsFrame active="record" operator title="Settings">x</SettingsFrame>)
    expect(text).toMatch(/What you track Your products Your subjects Team Billing Readiness The record How to read/)
  })

  it('lights exactly one tab, as a pale-yellow pill (a selected state) in weight 600, and none when the page is parked', () => {
    const lit = render(<SettingsFrame active="billing" title="Settings">x</SettingsFrame>)
    expect(lit.match(/aria-current="page"/g)).toHaveLength(1)
    const tag = /<a[^>]*aria-current="page"[^>]*>/.exec(lit)?.[0] ?? ''
    expect(tag).toContain('href="/dashboard/billing"')
    expect(tag).toContain('bg-accent font-semibold')
    const parked = render(<SettingsFrame active={null} title="Settings">x</SettingsFrame>)
    expect(parked.match(/aria-current="page"/g)).toBeNull()
  })

  it('gives every tab a focus outline, the board\'s 36px height and 44px to tap on a phone', () => {
    const markup = render(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)
    expect(markup.match(/focus-visible:outline-2/g)?.length).toBeGreaterThanOrEqual(5)
    const tabs = [...markup.matchAll(/<a [^>]*href="\/dashboard\/[^"]*"[^>]*>/g)].map((m) => m[0])
    expect(tabs).toHaveLength(5)
    for (const t of tabs) {
      expect(t).toContain('inline-flex h-9')
      expect(t).toContain('max-sm:h-11')
    }
  })

  it('puts Log out in the page\'s own bar, as a form', () => {
    const markup = render(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)
    expect(renderText(<SettingsFrame active="tracking" title="Settings">x</SettingsFrame>)).toMatch(/^Settings Log out/)
    expect(markup).toMatch(/<form[^>]*>[\s\S]*<button type="submit"[^>]*>[\s\S]*Log out<\/button><\/form>/)
    // The white secondary button (the audit design), never the yellow: the
    // tab's own content has the page's one primary.
    const button = /<button type="submit" class="([^"]*)"/.exec(markup)?.[1] ?? ''
    expect(button).toContain('border-control')
    expect(button).not.toContain('bg-brand')
  })
})

describe('the settings vocabulary', () => {
  it('draws no elevated card of its own: the sub-page decides its grounds', () => {
    const markup = render(
      <SettingsFrame active="guide" title="Settings" contentTitle="How to read" contentMeta="nine pages" contentRule="What each page tells you.">
        <p>TikTok, YouTube</p>
      </SettingsFrame>,
    )
    expect(markup).not.toContain('shadow-tile')
    // A sub-page the artboards do not draw keeps its own header, less a
    // title that only repeats the lit tab.
    expect(markup).toContain('nine pages')
    expect(markup).toContain('What each page tells you.')
    expect(markup).not.toMatch(/<h2[^>]*>How to read<\/h2>/)
  })

  it('keeps a title the lit tab does not say (Plan & billing, under Billing)', () => {
    const markup = render(<SettingsFrame active="billing" title="Settings" contentTitle="Plan & billing">x</SettingsFrame>)
    expect(markup).toContain('<h2 class="m-0 shrink-0 text-[21px] font-semibold leading-[1.3]">Plan &amp; billing</h2>')
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
    expect(markup.match(/<p class="m-0 text-\[14px\] leading-\[1\.5\] text-muted-foreground">/g)).toBeNull()
    // The meta is sans (the audit design: no mono on a screen).
    expect(markup).toContain('<span class="min-w-0 text-[14px] text-muted-foreground">13 inputs · 6 missing</span>')
    expect(markup).not.toContain('font-mono')
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
