import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { EmptyBox, GoLink, Label, SectionHead, StatStrip, Tag } from './ui'
import { BTN_PRIMARY, BTN_SECONDARY, CHIP, EMPTY, GO, LBL, ROW, TAG_TONE, TAP, toMax, toMaxAtLeast } from './look'
import * as barrel from './index'

// The audit design's building blocks (7 Nov): one render each, to the boards
// (Market-After.dc.html), each held to the copy contract.

describe('StatStrip', () => {
  const node = (
    <StatStrip
      items={[
        { term: 'Week', value: '26 Oct to 1 Nov' },
        { term: 'Your market this week', value: <span data-copy="figure">162 videos, 3,317 comments</span> },
        { term: 'October', value: <span data-copy="figure">766 videos</span> },
      ]}
    />
  )
  const m = render(node)

  it('is a <dl data-stat-strip>, one column below 900px and a column a cell from 900', () => {
    expect(m).toMatch(/^<dl data-stat-strip="" class="[^"]*grid-cols-1[^"]*min-\[900px\]:grid-cols-3[^"]*"/)
    expect(m).toContain('border-b border-border pb-5')
    expect(m).not.toContain('data-strip=')
    expect(m.match(/<dt /g)).toHaveLength(3)
    expect(m.match(/<dd /g)).toHaveLength(3)
  })

  it('prints each term over its value, the value 16px/600 in tabular figures', () => {
    expect(m).toMatch(/<dt class="[^"]*text-\[13px\][^"]*text-muted-foreground[^"]*">Week<\/dt>/)
    expect(m).toMatch(/<dd class="[^"]*text-\[16px\] font-semibold[^"]*tabular-nums[^"]*">26 Oct to 1 Nov<\/dd>/)
    expect(renderText(node)).toBe('Week 26 Oct to 1 Nov Your market this week 162 videos, 3,317 comments October 766 videos')
    assertCopyContract(node)
  })

  it('renders nothing for an empty list', () => {
    expect(render(<StatStrip items={[]} />)).toBe('')
  })

  it('keeps a wider grid than its cells where the board does, never a narrower one', () => {
    const two = [{ term: 'Written', value: '5 to 11 Oct' }, { term: 'Comments worth a reply', value: '12' }]
    expect(render(<StatStrip items={two} columns={4} />)).toContain('min-[900px]:grid-cols-4')
    expect(render(<StatStrip items={two} />)).toContain('min-[900px]:grid-cols-2')
    expect(render(<StatStrip items={two} columns={1} />)).toContain('min-[900px]:grid-cols-2')
  })

  it('draws no mono, no uppercase and no middle dot', () => {
    expect(m).not.toContain('font-mono')
    expect(m).not.toContain('uppercase')
    expect(m).not.toContain('·')
  })
})

describe('SectionHead', () => {
  it('is the boards\' heading row: a 21px/600 heading, a muted note at its right', () => {
    const node = <SectionHead title="What the market is talking about" note="Six subjects, biggest first" id="subjects" />
    const m = render(node)
    // The boards' 48px above and 18px under, inside PageFrame's 22px gap.
    expect(m).toContain('mt-[26px] -mb-1')
    expect(m).toMatch(/<h2 id="subjects" class="[^"]*text-\[21px\] font-semibold[^"]*">What the market is talking about<\/h2>/)
    expect(m).toMatch(/<p class="[^"]*text-\[14px\][^"]*text-muted-foreground">Six subjects, biggest first<\/p>/)
    assertCopyContract(node)
  })

  it('takes an action, and an h3 where it sits under another heading', () => {
    const m = render(<SectionHead as="h3" title="Each group in October" action={<GoLink href="/dashboard/voices">Open Voices</GoLink>} />)
    expect(m).toContain('<h3 class=')
    expect(m).toContain('href="/dashboard/voices"')
    expect(m).not.toContain('<p class=')
  })
})

describe('EmptyBox', () => {
  it('says a thin state in the dashed box, a short title over one sentence', () => {
    const node = (
      <EmptyBox title="Not drawn yet">
        Only weeks read the same way are drawn, and there aren&apos;t enough of them yet.
      </EmptyBox>
    )
    const m = render(node)
    expect(m).toMatch(/^<div data-empty-box="" class="[^"]*border-dashed border-control[^"]*rounded-\[10px\]|^<div data-empty-box="" class="[^"]*rounded-\[10px\][^"]*border-dashed border-control/)
    expect(m).toMatch(/<p class="[^"]*text-\[15px\] font-semibold[^"]*">Not drawn yet<\/p>/)
    expect(m).not.toContain('min-h-[180px]')
    expect(renderText(node)).toBe("Not drawn yet Only weeks read the same way are drawn, and there aren't enough of them yet.")
    assertCopyContract(node)
  })

  it('stands in a chart\'s place at 180px, its words centred', () => {
    const m = render(<EmptyBox chart title="Not drawn yet">No weeks to draw.</EmptyBox>)
    expect(m).toContain('min-h-[180px]')
    expect(m).toContain('justify-center')
  })

  it('holds a sentence alone', () => {
    const m = render(<EmptyBox>Nobody named a product this month.</EmptyBox>)
    expect(m).not.toContain('font-semibold')
    expect(m).toContain('Nobody named a product this month.')
  })
})

describe('Label, GoLink and Tag', () => {
  it('labels in sentence case, 13px/600 in the secondary ink, never uppercase', () => {
    const node = <Label as="h3" id="lbl">Brand named most</Label>
    expect(render(node)).toBe(`<h3 id="lbl" class="m-0 ${LBL}">Brand named most</h3>`)
    expect(LBL).not.toContain('uppercase')
    expect(LBL).not.toContain('tracking')
    expect(LBL).not.toContain('orange')
    assertCopyContract(node)
  })

  it('links in words that say where they go, underlined in the control grey, with no arrow', () => {
    const node = <GoLink href="/dashboard/market">Open Market</GoLink>
    const m = render(node)
    expect(m).toBe(`<a class="${GO}" href="/dashboard/market">Open Market</a>`)
    expect(GO).toContain('decoration-control underline-offset-4')
    expect(GO).toContain('hover:decoration-foreground')
    expect(GO).toContain('focus-visible:outline-2')
    // 44px to tap on a phone, the line unmoved: an invisible box centred on
    // the link below 640 (the real-data pass, 8 Nov, measured 20px), the
    // same box a list row's title gets.
    for (const c of TAP.split(' ')) {
      expect(GO.split(' ')).toContain(c)
      expect(ROW.split(' ')).toContain(c)
    }
    expect(TAP).toContain('max-sm:before:h-11')
    expect(TAP.split(' ').every((c) => c.startsWith('max-sm:'))).toBe(true)
    expect(m).not.toMatch(/[→↗↓]/)
    assertCopyContract(node)
  })

  it('opens an outside address in a new tab, without the opener', () => {
    const m = render(<GoLink href="https://www.tiktok.com/@a/video/1" external>Watch the video</GoLink>)
    expect(m).toContain('target="_blank"')
    expect(m).toContain('rel="noopener noreferrer"')
  })

  it('tags on three tones, the pale yellow by default', () => {
    expect(render(<Tag>Unusual this week</Tag>)).toContain(TAG_TONE.tint)
    expect(render(<Tag tone="hi">High priority</Tag>)).toContain('bg-caution-soft text-caution')
    expect(render(<Tag tone="mid">Medium priority</Tag>)).toContain('bg-track text-secondary-foreground')
    expect(render(<Tag>New</Tag>)).toMatch(/<span data-tag="tint" class="[^"]*rounded-\[6px\][^"]*text-\[13px\] font-semibold[^"]*">New<\/span>/)
    assertCopyContract(<Tag tone="hi">High priority</Tag>)
  })
})

describe('the look', () => {
  it('paints the primary button yellow with ink words, the secondary white with the control edge', () => {
    expect(BTN_PRIMARY).toContain('bg-brand')
    expect(BTN_PRIMARY).toContain('text-brand-foreground')
    expect(BTN_PRIMARY).not.toContain('bg-primary')
    expect(BTN_SECONDARY).toContain('border-control bg-card')
    expect(EMPTY).toContain('border-dashed border-control')
    // 40px on the desk, at least 44px to tap on a phone (the real-data pass,
    // 8 Nov); a chip 34px, then 44. A page's own height still holds from 640.
    for (const c of [BTN_PRIMARY, BTN_SECONDARY]) expect(c.split(' ')).toEqual(expect.arrayContaining(['h-10', 'max-sm:min-h-11']))
    expect(CHIP.split(' ')).toEqual(expect.arrayContaining(['h-[34px]', 'max-sm:min-h-11']))
  })

  it('is import-free, so a client component may take its styles from it', () => {
    const src = readFileSync(join(__dirname, 'look.ts'), 'utf8')
    expect(src).not.toMatch(/^import /m)
  })

  it('draws no mono, no uppercase, no letter-spaced capitals, no orange and nothing under 12px', () => {
    const src = readFileSync(join(__dirname, 'look.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, '')
    expect(src).not.toMatch(/font-mono|uppercase|tracking-\[|orange|text-\[(9|10|11)(\.5)?px\]/)
  })

  it('is exported through the barrel with the components', () => {
    for (const name of ['LBL', 'GO', 'ROW', 'CHIP', 'BTN_PRIMARY', 'TAG_TONE', 'toMax', 'StatStrip', 'SectionHead', 'EmptyBox', 'GoLink', 'Tag', 'commaCite']) {
      expect(barrel, name).toHaveProperty(name)
    }
  })
})

describe('how long a bar is (decision 5)', () => {
  it('draws the largest row full and the rest against it', () => {
    const at = toMax([121, 60, 30])
    expect(at(121)).toBe(100)
    expect(at(60)).toBeCloseTo(49.59, 2)
    expect(at(0)).toBe(0)
  })

  it('draws every bar at 0 for an empty list or one with nothing above zero', () => {
    expect(toMax([])(5)).toBe(0)
    expect(toMax([0, 0])(0)).toBe(0)
  })

  it('never draws past full, nor a negative or unreadable value', () => {
    const at = toMax([10])
    expect(at(20)).toBe(100)
    expect(at(-3)).toBe(0)
    expect(at(Number.NaN)).toBe(0)
  })

  it('keeps What works\' scale at 1× or more, so the typical tick stays on the bar', () => {
    const below = toMaxAtLeast([0.6, 0.8], 1)
    expect(below(0.8)).toBeCloseTo(80, 5)
    expect(below(1)).toBe(100)
    const above = toMaxAtLeast([2.4, 1.2], 1)
    expect(above(2.4)).toBe(100)
    expect(above(1)).toBeCloseTo(100 / 2.4, 5)
  })
})
