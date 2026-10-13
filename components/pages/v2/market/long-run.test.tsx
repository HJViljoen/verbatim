import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes, copyViolations } from '@/lib/test/copy-contract'
import { fixtureLongRun, marketFixture } from '@/lib/pages/v2/market-fixture'
import { marketLongRunOf } from '@/lib/pages/v2/market'
import { MarketPage } from './index'
import { LONG_RUN_ID, LongRunSection, longRunSub } from './long-run'

// THE MONTH'S LONG-RUN READ ON MARKET › THIS MONTH (Heinrich, 13 Oct): below
// the month's data, never at the top, never on This week or Over time; no read
// for the month, no section. Stored `week_read` prose, code's counts, no
// comment's words.

const FULL = marketFixture({ period: 'month', closed: true, longRun: 'full' })
const PARTIAL = marketFixture({ period: 'month', longRun: 'partial' })
const NONE = marketFixture({ period: 'month', closed: true })

const section = (data = FULL) => <LongRunSection read={data.longRun!} data={data} />

describe('the month\'s long-run read, as a section', () => {
  it('prints its title, lead, headlines and sentences as stored week_read prose, and keeps the copy contract', () => {
    const text = renderText(section())
    expect(text).toMatch(/^What holds across September and October Our read of what has held across these months, written once October had closed\./)
    expect(text).toContain('People want to move freely with less fuss')
    const stored = copyNodes(render(section())).filter((n) => n.kind === 'stored')
    // The lead, three headlines and four sentences, each under the slot the
    // read was written and scrubbed under.
    expect(stored.map((n) => n.slot)).toEqual(Array(8).fill('week_read'))
    expect(stored.map((n) => n.text)).toEqual([
      'People want to move freely with less fuss, and what stands in their way is mostly access and everyday comfort rather than the devices themselves.',
      'Access, not the device, stands between interest and a fitting',
      'People who already want a powered knee talk about refusals, appeals and paperwork long before they talk about the knee itself.',
      'Whoever explains the route to being paid for is listened to first.',
      'Liners are where daily comfort is won or lost',
      'Sweat, a loose fit and sore skin are the everyday problems people bring up, and they ask how long a liner should last before it is replaced.',
      'First steps and finish lines draw the warmest talk',
      'Under videos of people walking or running again, the comments are encouragement and shared experience rather than questions about a product.',
    ])
    assertCopyContract(section())
  })

  it('states each idea\'s months and videos as code\'s figures, and who they are about only where the brands are counted', () => {
    const text = renderText(section())
    expect(text).toContain('Heard in September and October · 64 videos')
    expect(copyNodes(render(section())).filter((n) => n.kind === 'figure').map((n) => n.text)).toEqual(expect.arrayContaining(['64', '52', '41']))
    expect(render(section())).toContain('data-who-chip')
    expect(text).toContain('Ottobock')
    // Össur before its brand back-read: no split, as everywhere on the page.
    const notCounted = { ...FULL, brands: 'not_counted' as const }
    expect(render(section(notCounted))).not.toContain('data-who-chip')
    expect(renderText(section(notCounted))).not.toContain('Ottobock')
  })

  it('holds no comment\'s words and no quote: the read stores none', () => {
    expect(copyNodes(render(section())).filter((n) => n.kind === 'quote')).toEqual([])
  })

  it('a read written before its month closed (partialThrough) prints as the month\'s read for now, and says the day it reads to', () => {
    expect(PARTIAL.longRun?.partialThrough).toBe('2026-10-11')
    const text = renderText(section(PARTIAL))
    expect(text).toContain('Our read of what has held across these months, written before October closed, on the comments to 11 Oct.')
    expect(render(section(PARTIAL))).toContain('data-long-run="partial"')
    assertCopyContract(section(PARTIAL))
    expect(longRunSub({ month: '2026-09-01', partialThrough: null })).toBe('Our read of what has held across these months, written once September had closed.')
  })
})

describe('where it sits: Market › This month, below the month\'s data', () => {
  it('is the last thing on the page, after every conversation, and keeps the page\'s copy contract', () => {
    const html = render(<MarketPage data={FULL} />)
    const at = html.indexOf(`id="${LONG_RUN_ID}"`)
    expect(at).toBeGreaterThan(0)
    // Below the top row, the subject board, the rail and the table.
    for (const id of ['top-row', 'subjects', 'kinds', 'conversations']) {
      const block = html.indexOf(`id="${id}"`)
      expect(block, id).toBeGreaterThanOrEqual(0)
      expect(block, id).toBeLessThan(at)
    }
    expect(copyViolations(<MarketPage data={FULL} />)).toEqual([])
    expect(copyViolations(<MarketPage data={PARTIAL} />)).toEqual([])
  })

  it('no read for the month: no section and no placeholder', () => {
    const html = render(<MarketPage data={NONE} />)
    expect(html).not.toContain(`id="${LONG_RUN_ID}"`)
    expect(renderText(<MarketPage data={NONE} />)).not.toMatch(/What holds across|long-run|Our read of what has held/)
  })

  it('never on This week or Over time, even where a read is handed in', () => {
    const read = FULL.longRun
    for (const period of ['week', 'time'] as const) {
      const data = { ...marketFixture({ period }), longRun: read }
      expect(render(<MarketPage data={data} />), period).not.toContain(`id="${LONG_RUN_ID}"`)
    }
  })

  it('no quote at level 1 on the month either: the section adds none', () => {
    const html = render(<MarketPage data={FULL} />)
    expect((html.match(/data-copy="quote"/g) ?? []).length).toBe(0)
  })
})

describe('marketLongRunOf: the read for exactly the month the view reads', () => {
  const stored = (month: string, over: Partial<ReturnType<typeof fixtureLongRun>> = {}) =>
    ({ month, data: { ...fixtureLongRun(), month, ...over }, created_at: '2026-11-01T05:00:00.000Z' })

  it('takes the view\'s month only, and a read with something to print', () => {
    expect(marketLongRunOf(stored('2026-10-01'), '2026-10-01')?.title).toBe('What holds across September and October')
    expect(marketLongRunOf(stored('2026-10-01'), '2026-10-01T00:00:00.000Z')).not.toBeNull()
    expect(marketLongRunOf(stored('2026-09-01'), '2026-10-01')).toBeNull()
    expect(marketLongRunOf(null, '2026-10-01')).toBeNull()
    expect(marketLongRunOf(stored('2026-10-01', { ideas: [] }), '2026-10-01')).toBeNull()
  })

  it('leaves out an idea with no headline and a blank sentence, and keeps the months it was heard in', () => {
    const base = fixtureLongRun()
    const read = marketLongRunOf(stored('2026-10-01', {
      inShort: '  ',
      ideas: [{ ...base.ideas[0], body: ['A sentence.', ' '], months: [{ month: '2026-09-01', videos: 0 }, { month: '2026-10-01', videos: 3 }] }, { ...base.ideas[1], headline: ' ' }],
    }), '2026-10-01')!
    expect(read.inShort).toBeNull()
    expect(read.ideas).toHaveLength(1)
    expect(read.ideas[0]).toMatchObject({ body: ['A sentence.'], heard: ['2026-10-01'] })
    expect(read.partialThrough).toBeNull()
  })
})
