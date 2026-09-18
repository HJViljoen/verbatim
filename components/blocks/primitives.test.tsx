import { describe, expect, it } from 'vitest'
import { BlockEmpty, BlockFrame, FigureCell } from './frame'
import { BlockStat } from './stat'
import { BlockCount, BlockMovement } from './movement'
import { BlockProportion, BlockRanked } from './bars'
import { BlockQuote, BlockQuotes } from './quote'
import { BlockCalendar } from './calendar'
import { render, renderText, markupText } from '@/lib/test/render'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { monthAxis } from '@/lib/reading/series'
import type { CalendarSeries } from '@/lib/charts/calendar'
import type { Verdict } from '@/lib/reading/verdicts'

const MODES: readonly RenderMode[] = ['app', 'print', 'email']
const CTX = blockContext('https://app.verbatimintel.com', EMAIL)

/** An email arm is table markup with inline styles: no classes, no CSS
 *  variables, no flex, no grid. Outlook lays out with Word. */
function assertEmailSafe(markup: string): void {
  expect(markup).not.toMatch(/class="/)
  expect(markup).not.toContain('var(--')
  expect(markup).not.toMatch(/display:\s*flex/)
  expect(markup).not.toMatch(/display:\s*grid/)
}

const moved: Verdict = {
  objectKind: 'theme', objectId: 'r1', objectLabel: 'Durability', audience: 'client',
  window: { kind: 'month', from: '2026-08-01', to: '2026-09-01' },
  value: { k: 26, n: 84 }, baseline: { k: 19, n: 79 },
  changePts: 6.9, bandPts: 2.4, state: 'moved', flags: [],
}

const refused: Verdict = { ...moved, changePts: null, bandPts: null, state: 'refused', refusedReason: 'rename' }

describe('BlockFrame', () => {
  it('renders its title, question and footer in all three modes', () => {
    for (const mode of MODES) {
      const words = renderText(
        <BlockFrame mode={mode} title="Your subjects" question="What are people saying about the things you decided to be known for?" meta="September 2026" footer="Open Subjects">
          <p>body</p>
        </BlockFrame>,
      )
      expect(words).toContain('Your subjects')
      expect(words).toContain('What are people saying')
      expect(words).toContain('September 2026')
      expect(words).toContain('Open Subjects')
    }
  })

  it('renders an email-safe frame', () => {
    assertEmailSafe(render(<BlockFrame mode="email" title="Rivals"><span>x</span></BlockFrame>))
  })

  // P0 item 1: the footer is a LINE with two ends — a link deeper on the left,
  // the basis in mono on the right. Before this slot a block with a basis to
  // state either dropped it or put it in the body, where a method note reads
  // as a finding.
  it('prints a right-hand footer note beside the link, in all three modes', () => {
    for (const mode of MODES) {
      const markup = render(
        <BlockFrame mode={mode} title="Your subjects" footer="Open Subjects" footerNote="of 1,388 videos">
          <p>body</p>
        </BlockFrame>,
      )
      const words = markupText(markup)
      expect(words).toContain('Open Subjects')
      expect(words).toContain('of 1,388 videos')
      // The link leads; the note follows. A note read first is a heading.
      expect(words.indexOf('Open Subjects')).toBeLessThan(words.indexOf('of 1,388 videos'))
    }
  })

  it('draws the footer for a note with no link, rather than dropping it', () => {
    for (const mode of MODES) {
      expect(markupText(render(<BlockFrame mode={mode} title="Rivals" footerNote="all-time"><p>body</p></BlockFrame>))).toContain('all-time')
    }
  })

  it('keeps the email footer a table — two ends of a line, no flex', () => {
    assertEmailSafe(render(<BlockFrame mode="email" title="Rivals" footer="Open" footerNote="all-time"><span>x</span></BlockFrame>))
  })

  it('sets the printed block heading and its question below the app, not above', () => {
    const paper = render(<BlockFrame mode="print" title="Rivals" question="Who holds the conversation?"><span>x</span></BlockFrame>)
    const screen = render(<BlockFrame mode="app" title="Rivals" question="Who holds the conversation?"><span>x</span></BlockFrame>)
    // A slide already carries a 15px section heading and a green-ruled
    // eyebrow above this one, at .902 zoom. It used to be 12px against the
    // app's 10.5px.
    expect(paper).toContain('text-[11px]')
    expect(paper).toContain('text-[11.5px]')
    expect(paper).not.toContain('text-[12px]')
    expect(screen).toContain('text-[10.5px]')
    expect(screen).toContain('text-[12.5px]')
  })

  it('prints the empty state as a line rather than leaving a hole', () => {
    for (const mode of MODES) {
      expect(renderText(<BlockEmpty mode={mode}>Counted with the first update.</BlockEmpty>))
        .toBe('Counted with the first update.')
    }
  })
})

describe('BlockStat', () => {
  it('marks its figure, in all three modes', () => {
    for (const mode of MODES) {
      const markup = render(<BlockStat mode={mode} value="412" unit="videos" base="since last update" />)
      expect(markup).toContain('data-copy="figure"')
      expect(markupText(markup)).toContain('412')
      assertCopyContract(markup)
    }
  })

  it('cannot print a calibrated level without its denominator', () => {
    for (const mode of MODES) {
      const markup = render(<BlockStat mode={mode} value="21" level={{ word: 'Dominant', of: '21 of 36 videos' }} />)
      expect(copyViolations(markup)).toEqual([])
      expect(markupText(markup)).toContain('Dominant · 21 of 36 videos')
    }
  })

  it('keeps code figures out of a block prose node', () => {
    const markup = render(
      <p data-copy="prose">
        Repairability is what your buyers keep asking about — <BlockStat value="26" unit="videos" /> carried it.
      </p>,
    )
    assertCopyContract(markup)
  })

  it('renders an email-safe stat', () => {
    assertEmailSafe(render(<BlockStat mode="email" value="412" unit="videos" level={{ word: 'Dominant', of: '21 of 36' }} base="since last update" />))
  })

  it('drops the aside in an email, where two things cannot sit side by side', () => {
    const markup = render(<BlockStat mode="email" value="412" aside={<span>SPARKLINE</span>} />)
    expect(markup).not.toContain('SPARKLINE')
    expect(render(<BlockStat mode="app" value="412" aside={<span>SPARKLINE</span>} />)).toContain('SPARKLINE')
  })
})

describe('FigureCell', () => {
  it('stacks the figure over its "of N" and marks both, in all three modes', () => {
    for (const mode of MODES) {
      const markup = render(<FigureCell mode={mode} value="31%" of="26 of 84" />)
      expect(markup).toContain('data-copy="figure"')
      expect(markup).toContain('data-copy="level"')
      const words = markupText(markup)
      expect(words).toContain('31%')
      expect(words).toContain('26 of 84')
      expect(words.indexOf('31%')).toBeLessThan(words.indexOf('26 of 84'))
      expect(copyViolations(markup)).toEqual([])
    }
  })

  // The whole reason the cell stamps its own markers: a block cannot put the
  // level somewhere rule (b) will not find it.
  it('cannot be given a denominator that is not one', () => {
    const bad = render(<FigureCell value="31%" of="of the category" />)
    expect(copyViolations(bad).map((v) => v.rule)).toContain('level-denominator')
  })

  it('is a bare figure, and no level at all, when there is no denominator', () => {
    for (const mode of MODES) {
      const markup = render(<FigureCell mode={mode} value="6" />)
      expect(markup).toContain('data-copy="figure"')
      expect(markup).not.toContain('data-copy="level"')
      expect(copyViolations(markup)).toEqual([])
    }
  })

  // 79 of the artboards' 101 "N of M" cells sit left; the 22 that are set
  // text-align:right are Competitive's standings.
  it('right-aligns on request and sits left by default', () => {
    expect(render(<FigureCell value="31%" of="26 of 84" align="right" />)).toContain('text-right')
    expect(render(<FigureCell value="31%" of="26 of 84" />)).not.toContain('text-right')
    expect(render(<FigureCell mode="email" value="31%" of="26 of 84" align="right" />)).toContain('right')
  })

  it('renders an email-safe cell', () => {
    assertEmailSafe(render(<FigureCell mode="email" value="31%" of="26 of 84" />))
  })

  it('keeps its number out of a block prose node', () => {
    assertCopyContract(render(
      <p data-copy="prose">
        Repairability is what your buyers keep asking about — <FigureCell value="26" of="26 of 84" /> carried it.
      </p>,
    ))
  })
})

describe('BlockMovement', () => {
  it('marks itself as the verdict node, in all three modes', () => {
    for (const mode of MODES) {
      const markup = render(<BlockMovement mode={mode} verdict={moved} unit="pts" />)
      expect(markup).toContain('data-copy="verdict"')
      assertCopyContract(markup)
    }
  })

  it('says the same thing in an email as on the screen', () => {
    expect(markupText(render(<BlockMovement mode="app" verdict={refused} />))).toBe('comparison refused')
    expect(markupText(render(<BlockMovement mode="email" verdict={refused} />))).toBe('comparison refused')
  })

  it('carries the sign as a tone and a glyph-free sign in an email', () => {
    const markup = render(<BlockMovement mode="email" verdict={moved} unit="pts" />)
    assertEmailSafe(markup)
    expect(markup).not.toContain('▲')
    // The band rides in the email arm too — it used to be dropped entirely here.
    expect(markupText(markup)).toBe('+6.9 pts · band 2.4')
    expect(markup).toContain(EMAIL.greenTint)
  })

  it('renders nothing at all without a verdict', () => {
    for (const mode of MODES) expect(BlockMovement({ verdict: null, mode })).toBeNull()
  })

  it('counts have no band and still say "unchanged" at zero', () => {
    for (const mode of MODES) {
      expect(markupText(render(<BlockCount mode={mode} delta={0} />))).toBe('unchanged')
      expect(markupText(render(<BlockCount mode={mode} delta={-6} unit="themes" />))).toContain('6 themes')
    }
  })
})

describe('BlockProportion', () => {
  const segments = [
    { label: 'Positive', count: 261, pct: 62, color: 'var(--positive)' },
    { label: 'Mixed', count: 59, pct: 14, color: 'var(--mixed)' },
    { label: 'Neutral', count: 67, pct: 16, color: 'var(--neutral-seg)' },
    { label: 'Negative', count: 34, pct: 8, color: 'var(--negative)' },
  ]

  it('always draws its legend — identity is never colour-alone', () => {
    for (const mode of MODES) {
      const words = markupText(render(<BlockProportion mode={mode} segments={segments} of="videos" />))
      for (const s of segments) expect(words).toContain(`${s.label} ${s.pct}%`)
    }
  })

  it('resolves its colours to hex for the email', () => {
    const markup = render(<BlockProportion mode="email" segments={segments} of="videos" />)
    assertEmailSafe(markup)
    expect(markup).toContain(EMAIL.green)
    expect(markup).toContain(EMAIL.down)
  })

  it('keeps the copy contract in all three modes', () => {
    for (const mode of MODES) assertCopyContract(render(<BlockProportion mode={mode} segments={segments} of="videos" />))
  })

  it('renders nothing when every segment is zero', () => {
    for (const mode of MODES) {
      expect(BlockProportion({ mode, of: 'videos', segments: [{ label: 'Positive', count: 0, pct: 0, color: 'var(--positive)' }] })).toBeNull()
    }
  })
})

describe('BlockRanked', () => {
  const rows = [
    { label: 'TikTok', pct: 100, color: 'var(--you)', count: 412 },
    { label: 'YouTube', pct: 62, color: 'var(--cat)', count: 255 },
  ]

  it('prints label, bar and count in all three modes', () => {
    for (const mode of MODES) {
      const words = markupText(render(<BlockRanked mode={mode} rows={rows} />))
      expect(words).toContain('TikTok')
      expect(words).toContain('412')
    }
  })

  it('renders an email-safe ranked list with hex colours', () => {
    const markup = render(<BlockRanked mode="email" rows={rows} />)
    assertEmailSafe(markup)
    expect(markup).toContain(EMAIL.green)
  })

  it('renders nothing for an empty list', () => {
    for (const mode of MODES) expect(BlockRanked({ mode, rows: [] })).toBeNull()
  })
})

describe('BlockQuote', () => {
  const quote = { text: 'Hij gaat vier jaar mee en ziet er nog nieuw uit.', lang: 'nl', english: 'It has lasted four years and still looks new.' }

  it('puts the original above the English in all three modes', () => {
    for (const mode of MODES) {
      const words = markupText(render(<BlockQuote mode={mode} quote={quote} />))
      expect(words.indexOf('Hij gaat vier jaar')).toBeLessThan(words.indexOf('It has lasted four years'))
      expect(words).toContain('machine translation')
    }
  })

  it('says a voice is gone rather than printing empty quotation marks', () => {
    for (const mode of MODES) {
      expect(markupText(render(<BlockQuote mode={mode} quote={{ text: '' }} />))).toContain('counted, not quotable')
    }
  })

  it('stacks several quotes', () => {
    const words = markupText(render(<BlockQuotes quotes={[{ quote: { text: 'one' } }, { quote: { text: 'two' } }]} />))
    expect(words).toContain('one')
    expect(words).toContain('two')
  })

  it('renders nothing for no quotes', () => {
    expect(BlockQuotes({ quotes: [] })).toBeNull()
  })
})

describe('BlockCalendar', () => {
  const axis = monthAxis('2026-04-01', '2026-09-01')
  const series: CalendarSeries[] = [{
    label: 'Sealand',
    color: 'var(--you)',
    points: [
      { month: '2026-04-01', value: null, state: 'below_floor', n: 22 },
      { month: '2026-05-01', value: 19, state: 'read', k: 12, n: 63 },
      { month: '2026-06-01', value: 22, state: 'read', k: 17, n: 77 },
      { month: '2026-07-01', value: null, state: 'hollow' },
      { month: '2026-08-01', value: 28, state: 'read', k: 23, n: 82 },
      { month: '2026-09-01', value: 31, state: 'filling', k: 26, n: 84, atLastMonth: 27 },
    ],
  }]
  const chart = (mode: RenderMode, ctx = CTX) => (
    <BlockCalendar mode={mode} ctx={ctx} blockKey="subjects.line" axis={axis} series={series} format={(v) => `${v}%`} caption="April is below the floor for your audience." />
  )

  it('draws the SVG on screen and on paper', () => {
    for (const mode of ['app', 'print'] as const) expect(render(chart(mode))).toContain('<svg')
  })

  it('gives two calendars under ONE block key two pattern ids', () => {
    // WP12 draws one line per audience inside one block, and the block key is
    // stripped of punctuation, so it cannot be the identity by itself.
    const other = [{ ...series[0], label: 'The category' }]
    const idOf = (m: string) => /<pattern id="([^"]+)"/.exec(m)?.[1]
    const bands = [{ months: axis, label: 'Read back at setup' }]
    const a = render(<BlockCalendar blockKey="overview.line" axis={axis} series={series} bands={bands} />)
    const b = render(<BlockCalendar blockKey="overview.line" axis={axis} series={other} bands={bands} />)
    const c = render(<BlockCalendar blockKey="overview-line" axis={axis} series={series} bands={bands} />)
    expect(idOf(a)).toBeTruthy()
    expect(new Set([idOf(a), idOf(b), idOf(c)]).size).toBe(3)
  })

  it('never puts inline SVG in an email', () => {
    const markup = render(chart('email'))
    expect(markup).not.toContain('<svg')
    assertEmailSafe(markup)
  })

  it('uses the attached picture when the runner rendered one', () => {
    const withImage = blockContext('https://app.verbatimintel.com', EMAIL)
    const markup = render(
      <BlockCalendar mode="email" ctx={{ ...withImage, image: (k) => (k === 'subjects.line' ? 'cid:chart-0' : null) }} blockKey="subjects.line" axis={axis} series={series} />,
    )
    expect(markup).toContain('src="cid:chart-0"')
    expect(markup).toContain('alt="Sealand, month by month"')
  })

  it('prints the same numbers as a table when no picture was rendered', () => {
    const words = markupText(render(chart('email')))
    expect(words).toContain('Sealand')
    for (const v of ['19%', '22%', '28%', '31%']) expect(words).toContain(v)
  })

  it('marks the still-filling month in the email instead of printing it like a frozen one', () => {
    const markup = render(chart('email'))
    expect(markupText(markup)).toContain('filling')
    // The frozen months are the bold ones; September is not.
    expect((markup.match(/font-weight:600/g) ?? []).length).toBeGreaterThan(0)
  })

  it('says what a non-reading month is instead of leaving an empty cell', () => {
    const words = markupText(render(chart('email')))
    expect(words).toContain('too few')
    expect(words).toContain('—')
  })

  it('keeps the copy contract in all three modes', () => {
    for (const mode of MODES) assertCopyContract(render(chart(mode)))
  })

  it('renders nothing with no axis or no series', () => {
    expect(BlockCalendar({ blockKey: 'k', axis: [], series })).toBeNull()
    expect(BlockCalendar({ blockKey: 'k', axis, series: [] })).toBeNull()
  })

})
