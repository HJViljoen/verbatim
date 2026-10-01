import { describe, expect, it } from 'vitest'

import { renderWeeklyReadEmail } from '@/lib/email/weekly-read'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { olderRead, sealandRead, sealandSnapshot } from '@/lib/test/weekly-read-fixture'
import { bannedHits } from '@/lib/written/scrub'
import { WeeklyReadEmail, WeeklyReadPage, WeeklyReadReport, WEEKLY_READ_PALETTE } from './weekly-read'

// "This week in your market" (artefact `weekly_read`) in the render tier: the
// email and the share page over Sealand's 27 Sep read, held to the copy
// contract, Heinrich's §0a rules and the two design bans.

const APP = 'https://app.verbatimintel.com'
const email = (data = sealandSnapshot()) => render(<WeeklyReadEmail data={data} appUrl={APP} preheader={data.subject} />)
const page = (data = sealandSnapshot()) => render(<WeeklyReadPage data={data} appUrl={APP} fill />)
/** The reader's text of the card alone (the document's <title> and the hidden
 *  preheader are not something a reader reads in order). */
const cardText = (data = sealandSnapshot()) => markupText(render(<WeeklyReadReport data={data} appUrl={APP} />))

/** Where each of the design's sections starts in the reader's text. */
function order(text: string, marks: string[]): number[] {
  return marks.map((m) => text.indexOf(m))
}

describe('the weekly read email: the approved design, top to bottom', () => {
  const text = cardText()

  it('prints the nine parts in the design order', () => {
    const marks = [
      'Verbatim', 'Sealand', 'This week in your market', '21 to 27 September',
      'Your market this week', '274', '4,777', 'September so far', '852', '21,468',
      'The week in one line', 'Buyers treated bag choice as a practical match',
      'What happened', 'The week was about active bag shopping', '“I recommend looking at Columbia tiger brook series.”', 'Reddit · 26 Sep',
      'Colour sat inside that same purchase decision', '“Thanks for calling them out on the Empire, we need MORE COLORS!!!”', 'YouTube · 24 Sep',
      'What it means for Sealand', '01', 'Sealand sells travel gear', '02', '03',
      'Worth watching next week', 'Whether colour requests keep naming exact shades when people say they want the bag.',
      'This week’s findings', 'Buyers ask for named alternatives that match exact bag needs', 'Choice is made inside a comparison set', '7 videos this week · 16 in September so far',
      'Colour choice can decide whether buyers want the bag', '6 videos this week · 22 in September so far',
      'A high price is accepted when quality looks built to last', '5 videos this week · 9 in September so far',
      'Read this week in full', 'Open Verbatim', 'Sealand · made with Verbatim', 'Who gets this',
    ]
    const at = order(text, marks)
    marks.forEach((m, i) => expect(at[i], m).toBeGreaterThanOrEqual(0))
    for (let i = 1; i < at.length; i++) expect(at[i], `${marks[i - 1]} before ${marks[i]}`).toBeGreaterThan(at[i - 1])
  })

  it('prints no section that has nothing to say: New this week only when something was first heard this week', () => {
    expect(text).not.toContain('New this week')
    const read = sealandRead({ newThisWeek: [{ themeId: 't9', body: 'People asked whether the roll top survives a downpour.', videos: { week: 3, month: 3 }, evidence: '[[n1_week]] videos this week · [[n1_month]] in September so far' }] })
    read.figures.n1_week = { label: 'videos this week', value: '3', kind: 'count' }
    read.figures.n1_month = { label: 'videos in September so far', value: '3', kind: 'count' }
    const withNew = cardText(sealandSnapshot(read))
    expect(withNew).toContain('New this week')
    expect(withNew).toContain('3 videos this week · 3 in September so far')
    // Between the watch panel and the findings, as the task orders them.
    expect(withNew.indexOf('Worth watching next week')).toBeLessThan(withNew.indexOf('New this week'))
    expect(withNew.indexOf('New this week')).toBeLessThan(withNew.indexOf('This week’s findings'))
  })

  it('a read with no watch line, no implications and no numbers prints none of those headings', () => {
    const bare = cardText(sealandSnapshot(sealandRead({ watch: [], implications: [], market: null })))
    for (const heading of ['Worth watching next week', 'What it means for Sealand', 'Your market this week', '4,777', '21,468']) expect(bare).not.toContain(heading)
    expect(bare).toContain('What happened')
  })

  it('keeps the copy contract: no digit in model prose, every figure code\'s, quotes marked', () => {
    assertCopyContract(email())
    const nodes = copyNodes(email())
    const prose = nodes.filter((n) => n.kind === 'prose')
    // The line, three paragraphs, three implications, the watch line, and
    // each finding's headline and short line.
    expect(prose).toHaveLength(1 + 3 + 3 + 1 + 3 + 3)
    for (const n of prose) expect(n.ownText, n.text).not.toMatch(/\d/)
    expect(nodes.filter((n) => n.kind === 'quote').map((n) => n.text)).toHaveLength(2)
    expect(nodes.filter((n) => n.kind === 'figure').map((n) => n.text)).toEqual(expect.arrayContaining(['274', '4,777', '852', '21,468', '7 videos this week · 16 in September so far']))
  })

  it('says nothing about how it was made: no process or product talk anywhere', () => {
    const prose = copyNodes(email()).filter((n) => n.kind === 'prose').map((n) => n.text).join(' ')
    expect(bannedHits(prose)).toEqual([])
    // The whole reader's text, the brand's own name aside (the mark and "Open
    // Verbatim" are the product's signature, not a sentence about the method).
    expect(bannedHits(text.replace(/\bVerbatim\b/g, ''))).toEqual([])
  })

  it('has no em dash, no left-stripe block and no highlighted phrase', () => {
    const html = email()
    expect(html).not.toContain('—')
    expect(text).not.toContain('—')
    expect(html).not.toMatch(/border-left|borderLeft/i)
    expect(html).not.toMatch(/<mark\b/i)
    // A highlight is a coloured background behind words inside a line.
    expect(html).not.toMatch(/<span[^>]*background/i)
  })

  it('is palette A on the email-safe spine: the yellow masthead, ink, the ground, a 600 card', () => {
    const html = email()
    expect(html).toContain(`background:${WEEKLY_READ_PALETTE.yellow}`)
    expect(html).toContain(`background:${WEEKLY_READ_PALETTE.ground}`)
    expect(html).toContain('max-width:600px')
    expect(html).not.toMatch(/display:\s*(flex|grid)/i)
    expect(html).toContain(`${APP}/brand/verbatim-mark-ink.png`)
    expect(html).toContain(`href="${APP}/dashboard"`)
    expect(html).toContain(`href="${APP}/dashboard/week"`)
    expect(html).toContain(`href="${APP}/dashboard/settings/reports"`)
  })

  it('a withdrawn quote leaves no empty panel and no orphaned cite', () => {
    const read = sealandRead()
    read.story[0].quote = null
    const t = cardText(sealandSnapshot(read))
    expect(t).not.toContain('Columbia tiger brook')
    expect(t).not.toContain('Reddit · 26 Sep')
    expect(t).toContain('YouTube · 24 Sep')
  })

  it("a sentence naming a figure the read's table does not hold is not printed", () => {
    const read = sealandRead()
    read.implications = [{ body: 'Sealand is heard in [[nowhere]] of these. The shade is part of the product.', basedOn: [] }]
    const t = cardText(sealandSnapshot(read))
    expect(t).not.toContain('[[')
    expect(t).not.toContain('Sealand is heard in')
    expect(t).toContain('The shade is part of the product.')
  })
})

describe('older and unreadable reads', () => {
  it('an older read (v1) renders its In short and its findings, and nothing it does not have', () => {
    const t = cardText(sealandSnapshot(olderRead()))
    expect(t).toContain('In short')
    expect(t).toContain('Buyers compared named bags')
    expect(t).toContain('Buyers ask for named alternatives')
    expect(t).not.toContain('What happened')
    expect(t).not.toContain('Worth watching next week')
    // The v1 team lines belong to the monthly briefs now; the weekly prints none.
    expect(t).not.toContain('Buyers name rivals before they buy')
    assertCopyContract(email(sealandSnapshot(olderRead())))
  })
  it('a snapshot this build cannot draw is a sentence, not a crash', () => {
    const t = markupText(render(<WeeklyReadReport data={{ ...sealandSnapshot(), version: 9 }} appUrl={APP} />))
    expect(t).toContain('This week in your market')
    expect(t).not.toContain('What happened')
  })
})

describe('the share page and the paper are the same report', () => {
  it('the share page prints the email body, in the same order, under the same contract', () => {
    const t = markupText(page())
    for (const m of ['This week in your market', 'The week in one line', 'What happened', 'What it means for Sealand', 'Worth watching next week', 'This week’s findings', 'Open Verbatim']) {
      expect(t).toContain(m)
    }
    assertCopyContract(page())
    expect(page()).toContain('src="/brand/verbatim-mark-ink.png"')
    expect(page()).not.toMatch(/border-left|borderLeft/i)
  })
  it('the paper is A4 portrait and paginates as a document', () => {
    const html = render(<WeeklyReadPage data={sealandSnapshot()} appUrl={APP} print />)
    expect(html).toContain('@page { size: 210mm 297mm')
  })
})

describe('renderWeeklyReadEmail', () => {
  it('goes out under "Sealand: {the week in one line}", with a plain-text mirror', () => {
    const out = renderWeeklyReadEmail({ data: sealandSnapshot(), appUrl: APP, shareUrl: `${APP}/r/tok`, attached: false })
    expect(out.subject).toBe('Sealand: Buyers treated bag choice as a practical match, comparing named models by trip fit, proof of quality and the colour they wanted')
    expect(out.subject).not.toMatch(/\d/)
    expect(out.html.startsWith('<!doctype html>')).toBe(true)
    expect(out.text).toContain('What it means for Sealand')
    expect(out.text).toContain('Open Verbatim')
    // The design ends on "Open Verbatim": no share button, no attachment line.
    expect(out.html).not.toContain('/r/tok')
  })
})
