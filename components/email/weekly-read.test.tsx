import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { renderWeeklyReadEmail } from '@/lib/email/weekly-read'
import { DIRECTION_WORDS, assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { frozen, levelOneRead, olderRead, sealandFlag, sealandLines, sealandRead, sealandSnapshot, sealandUnusual, storedReportSnapshot } from '@/lib/test/weekly-read-fixture'
import { bannedHits } from '@/lib/written/scrub'
import { WeeklyReadEmail, WeeklyReadPage, WeeklyReadReport, WEEKLY_READ_PALETTE } from './weekly-read'

// "This week in your market" (artefact `weekly_read`) in the render tier: the
// email and the share page over Sealand's 27 Sep read, held to the copy
// contract, Heinrich's §0a rules and the two design bans. Two shapes: the
// report (snapshot version 1, every snapshot stored before 13 Oct, which must
// render byte for byte as it did) and level 1 (version 2, depth v2 T11b,
// board E7), below.

const APP = 'https://app.verbatimintel.com'
const SHARE = `${APP}/r/tok`
const email = (data = storedReportSnapshot(), fullUrl: string | null = SHARE) => render(<WeeklyReadEmail data={data} appUrl={APP} fullUrl={fullUrl} preheader={data.subject} />)
const page = (data = storedReportSnapshot()) => render(<WeeklyReadPage data={data} appUrl={APP} fill />)
/** The reader's text of the card alone (the document's <title> and the hidden
 *  preheader are not something a reader reads in order). */
const cardText = (data = storedReportSnapshot()) => markupText(render(<WeeklyReadReport data={data} appUrl={APP} fullUrl={SHARE} />))

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
    const withNew = cardText(storedReportSnapshot(read))
    expect(withNew).toContain('New this week')
    expect(withNew).toContain('3 videos this week · 3 in September so far')
    // Between the watch panel and the findings, as the task orders them.
    expect(withNew.indexOf('Worth watching next week')).toBeLessThan(withNew.indexOf('New this week'))
    expect(withNew.indexOf('New this week')).toBeLessThan(withNew.indexOf('This week’s findings'))
  })

  it('the month\'s two numbers: "September so far" for a week inside September, "September in total" for a week that carried into October (M2)', () => {
    expect(cardText()).toContain('September so far')
    expect(cardText()).not.toContain('September in total')
    const crossing = cardText(storedReportSnapshot(sealandRead({
      window: { from: '2026-09-27T04:03:42.768Z', to: '2026-10-04T04:02:10.000Z' },
      monthComplete: true,
      findings: sealandRead().findings.map((f, i) => ({ ...f, evidence: `[[f${i + 1}_week]] videos this week · [[f${i + 1}_month]] in September` })),
    })))
    expect(crossing).toContain('28 September to 4 October')
    expect(crossing).toContain('September in total')
    expect(crossing).not.toContain('so far')
    expect(crossing).toContain('7 videos this week · 16 in September')
  })

  it('a read with no watch line, no implications and no numbers prints none of those headings', () => {
    const bare = cardText(storedReportSnapshot(sealandRead({ watch: [], implications: [], market: null })))
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
    expect(html).toContain(`href="${APP}/dashboard/settings/reports"`)
  })

  it('"Read this week in full" leads to the report\'s own web page, and is not printed where there is none', () => {
    expect(email()).toContain(`href="${SHARE}"`)
    expect(email()).not.toContain('/dashboard/week')
    const bare = email(storedReportSnapshot(), null)
    expect(markupText(bare)).not.toContain('Read this week in full')
    // The email keeps its findings compact: no "saw" paragraph, no finding quote.
    expect(markupText(email())).not.toContain('People ask for specific backpack brands and models')
    expect(markupText(email())).not.toContain('Osprey Farpoint')
  })

  it('a withdrawn quote leaves no empty panel and no orphaned cite', () => {
    const read = sealandRead()
    read.story[0].quote = null
    const t = cardText(storedReportSnapshot(read))
    expect(t).not.toContain('Columbia tiger brook')
    expect(t).not.toContain('Reddit · 26 Sep')
    expect(t).toContain('YouTube · 24 Sep')
  })

  it("a sentence naming a figure the read's table does not hold is not printed", () => {
    const read = sealandRead()
    read.implications = [{ body: 'Sealand is heard in [[nowhere]] of these. The shade is part of the product.', basedOn: [] }]
    const t = cardText(storedReportSnapshot(read))
    expect(t).not.toContain('[[')
    expect(t).not.toContain('Sealand is heard in')
    expect(t).toContain('The shade is part of the product.')
  })
})

describe('older and unreadable reads', () => {
  it('an older read (v1) renders its In short and its findings, and nothing it does not have', () => {
    const t = cardText(storedReportSnapshot(olderRead()))
    expect(t).toContain('In short')
    expect(t).toContain('Buyers compared named bags')
    expect(t).toContain('Buyers ask for named alternatives')
    expect(t).not.toContain('What happened')
    expect(t).not.toContain('Worth watching next week')
    // The v1 team lines belong to the monthly briefs now; the weekly prints none.
    expect(t).not.toContain('Buyers name rivals before they buy')
    assertCopyContract(email(storedReportSnapshot(olderRead())))
  })
  it('a snapshot this build cannot draw is a sentence, not a crash', () => {
    const t = markupText(render(<WeeklyReadReport data={{ ...storedReportSnapshot(), version: 9 }} appUrl={APP} />))
    expect(t).toContain('This week in your market')
    expect(t).not.toContain('What happened')
  })
})

describe('the share page and the paper are the same report', () => {
  it('the share page prints the whole report, its findings in full with their quotes, under the same contract', () => {
    const t = markupText(page())
    for (const m of ['This week in your market', 'The week in one line', 'What happened', 'What it means for Sealand', 'Worth watching next week', 'This week’s findings', 'Open Verbatim']) {
      expect(t).toContain(m)
    }
    // The story's quotes, and each finding in full: what was seen, what it
    // means, its quote, its evidence, in that order.
    expect(t).toContain('“I recommend looking at Columbia tiger brook series.”')
    const order = ['Buyers ask for named alternatives', 'People ask for specific backpack brands and models', 'Choice is made inside a comparison set', 'Osprey Farpoint', '7 videos this week · 16 in September so far']
    const at = order.map((m) => t.indexOf(m))
    at.forEach((x, i) => expect(x, order[i]).toBeGreaterThan(-1))
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1])
    // It is the full read, so it does not link to itself.
    expect(t).not.toContain('Read this week in full')
    assertCopyContract(page())
    for (const n of copyNodes(page()).filter((x) => x.kind === 'prose')) expect(n.ownText, n.text).not.toMatch(/\d/)
    expect(copyNodes(page()).filter((n) => n.kind === 'quote')).toHaveLength(3)
    expect(page()).toContain('src="/brand/verbatim-mark-ink.png"')
    expect(page()).not.toMatch(/border-left|borderLeft/i)
  })
  it('the paper is A4 portrait and paginates as a document', () => {
    const html = render(<WeeklyReadPage data={storedReportSnapshot()} appUrl={APP} print />)
    expect(html).toContain('@page { size: 210mm 297mm')
  })
})

describe('renderWeeklyReadEmail', () => {
  it('goes out under "Sealand: {the week in one line}", with a plain-text mirror', () => {
    const out = renderWeeklyReadEmail({ data: storedReportSnapshot(), appUrl: APP, shareUrl: `${APP}/r/tok`, attached: false })
    expect(out.subject).toBe('Sealand: Buyers treated bag choice as a practical match, comparing named models by trip fit, proof of quality and the colour they wanted')
    expect(out.subject).not.toMatch(/\d/)
    expect(out.html.startsWith('<!doctype html>')).toBe(true)
    expect(out.text).toContain('What it means for Sealand')
    expect(out.text).toContain('Open Verbatim')
    // The share link is "Read this week in full"; there is no share button
    // and no attachment line (the design ends on "Open Verbatim").
    expect(out.html).toContain(`href="${APP}/r/tok"`)
    expect(out.html.match(/\/r\/tok/g)).toHaveLength(1)
  })
})

// ---- The stored report, byte for byte -------------------------------------------------
//
// lib/test/weekly-read-golden/ holds what the code before level 1 rendered
// (commit 939c48f5): the email, the share page, the paper, the viewer and the
// stale card. A snapshot stored before 13 Oct is version 1, and it must keep
// rendering exactly as it was sent.

const GOLDEN = join(process.cwd(), 'lib/test/weekly-read-golden')
const golden = (name: string) => readFileSync(join(GOLDEN, name), 'utf8')

describe('a stored report (version 1) renders byte for byte as before level 1', () => {
  const withNew = () => {
    const read = sealandRead({ newThisWeek: [{ themeId: 't9', body: 'People asked whether the roll top survives a downpour.', videos: { week: 3, month: 3 }, evidence: '[[n1_week]] videos this week · [[n1_month]] in September so far' }] })
    read.figures.n1_week = { label: 'videos this week', value: '3', kind: 'count' }
    read.figures.n1_month = { label: 'videos in September so far', value: '3', kind: 'count' }
    return storedReportSnapshot(read)
  }
  it('the email, its text and its subject', () => {
    const e = renderWeeklyReadEmail({ data: storedReportSnapshot(), appUrl: APP, shareUrl: `${APP}/r/tok`, attached: false })
    expect(e.html).toBe(golden('email-sealand.html'))
    expect(e.text).toBe(golden('email-sealand.txt'))
    expect(e.subject).toBe(golden('email-sealand.subject.txt'))
    expect(renderWeeklyReadEmail({ data: storedReportSnapshot(olderRead()), appUrl: APP, shareUrl: null, attached: false }).html).toBe(golden('email-older.html'))
    expect(renderWeeklyReadEmail({ data: withNew(), appUrl: APP, shareUrl: `${APP}/r/tok`, attached: true }).html).toBe(golden('email-new.html'))
    expect(renderWeeklyReadEmail({ data: storedReportSnapshot(frozen(sealandRead())), appUrl: APP, shareUrl: `${APP}/r/tok`, attached: false }).html).toBe(golden('email-frozen.html'))
  })
  it('the share page, the paper and the viewer', () => {
    expect(render(<WeeklyReadPage data={storedReportSnapshot()} appUrl={APP} fill />)).toBe(golden('page-sealand.html'))
    expect(render(<WeeklyReadPage data={storedReportSnapshot()} appUrl={APP} print />)).toBe(golden('page-print.html'))
    expect(render(<WeeklyReadPage data={withNew()} appUrl="" />)).toBe(golden('page-viewer.html'))
  })
  it('a snapshot this build cannot draw is still the same sentence', () => {
    expect(render(<WeeklyReadReport data={{ ...storedReportSnapshot(), version: 9 }} appUrl={APP} />)).toBe(golden('report-stale.html'))
  })
  it('a stored report that carried a flag in its read still prints none of level 1', () => {
    // The flag is frozen into the READ (write-week-read); a version-1 snapshot
    // built over such a read is still the report.
    const t = markupText(renderWeeklyReadEmail({ data: storedReportSnapshot(levelOneRead()), appUrl: APP, shareUrl: null }).html)
    for (const m of ['Unusual this week', 'Also this week', 'Across your pages', 'Open this week in Verbatim']) expect(t).not.toContain(m)
    expect(t).toContain('What happened')
  })
})

// ---- Level 1 (version 2; board E7) -----------------------------------------------------

const levelOne = (read = levelOneRead(), lines = sealandLines()) => sealandSnapshot(read, lines)
/** Each mark is found after the one before it. */
function expectInOrder(text: string, marks: readonly string[]) {
  let from = 0
  for (const m of marks) {
    const at = text.indexOf(m, from)
    expect(at, `"${m}" after the marks before it`).toBeGreaterThanOrEqual(0)
    from = at + m.length
  }
}
const l1Email = (data = levelOne(), fullUrl: string | null = SHARE) => render(<WeeklyReadEmail data={data} appUrl={APP} fullUrl={fullUrl} preheader={data.subject} />)
const l1Text = (data = levelOne(), fullUrl: string | null = SHARE) => markupText(render(<WeeklyReadReport data={data} appUrl={APP} fullUrl={fullUrl} />))

describe('the level-1 email: the board, top to bottom', () => {
  it('prints the masthead, the week in one line beside its month, the flag, also this week, one line per page and the way in, in that order', () => {
    const marks = [
      'Verbatim', 'Sealand',
      'This week in your market · 21 to 27 September',
      'Buyers treated bag choice as a practical match',
      '274 videos and 4,777 comments in your market this week · 852 videos and 21,468 comments in September so far.',
      'Unusual this week', 'Asking for the bag in more colours', '19', 'of 241 videos this week', 'usually about 13 of 363 a month',
      'This week 7.9%', 'Usually 3.5%', 'A difference of 4.4 points, on a band of 2.1',
      'Also this week', 'Laptop sleeves that fit a 16-inch machine', '9 videos this week · 21 in September so far',
      'Straps that dig in on a long walk', '6 videos this week · 11 in September so far',
      'Across your pages',
      'Voices', 'In the most videos in September: Daily commuters', '41 videos',
      'Your products', 'Named most in September: Kirby backpack', '9 videos',
      'Content', 'Post next: Which bag fits a carry-on rule, and how to check', '7 videos this week · 16 in September so far',
      'Your moves', 'Advice waiting: Publish a colour roadmap for the core bags', 'raised in 4 updates',
      'Open this week in Verbatim', 'Read this week in full', 'Sealand · made with Verbatim', 'Who gets this',
    ]
    const t = l1Text()
    expectInOrder(t, marks)
  })

  it('prints no quote at level 1, and none of the report\'s long sections', () => {
    const html = l1Email()
    expect(copyNodes(html).filter((n) => n.kind === 'quote')).toHaveLength(0)
    const t = markupText(html)
    for (const m of ['What happened', 'What it means for Sealand', 'Worth watching next week', 'This week’s findings', 'Columbia tiger brook', 'MORE COLORS']) expect(t).not.toContain(m)
  })

  it('keeps the copy contract: every number a figure node, the model\'s words marked, the flag words a verdict\'s', () => {
    const html = l1Email()
    assertCopyContract(html)
    const nodes = copyNodes(html)
    for (const n of nodes.filter((x) => x.kind === 'prose')) expect(n.ownText, n.text).not.toMatch(/\d/)
    // Every digit the card prints sits inside a figure (or a verdict's figure).
    const card = render(<WeeklyReadReport data={levelOne()} appUrl={APP} fullUrl={null} />)
    const bare = markupText(card.replace(/<span data-copy="figure"[^>]*>[\s\S]*?<\/span>|<div data-copy="figure"[^>]*>[\s\S]*?<\/div>/g, ''))
      .replace(/21 to 27 September/, '') // the days the read covers, the masthead's
      .replace(/16-inch/, '') // a conversation's own name (Pass B's words)
    expect(bare).not.toMatch(/\d/)
    expect(nodes.filter((n) => n.kind === 'verdict').map((n) => n.text.replace(/\s+\./g, '.'))).toEqual(expect.arrayContaining(['Unusual this week', 'A difference of 4.4 points, on a band of 2.1.']))
    expect(nodes.filter((n) => n.kind === 'subject').map((n) => n.slot)).toEqual(expect.arrayContaining(['pass_b_theme', 'pass_e_persona']))
    expect(nodes.filter((n) => n.kind === 'stored').map((n) => n.slot)).toEqual(['pass_d_b_recommendation'])
  })

  it('says no weekly direction word anywhere outside a verdict, and nothing about how it was made', () => {
    const nodes = copyNodes(l1Email())
    const verdicts = nodes.filter((n) => n.kind === 'verdict').map((n) => n.text)
    let t = l1Text()
    for (const v of verdicts) t = t.split(v).join(' ')
    const re = new RegExp(`\\b(${DIRECTION_WORDS.join('|')})\\b`, 'i')
    expect(t).not.toMatch(re)
    expect(t).not.toMatch(/\b(Rising|tripled|usual level)\b|×|▲|→/)
    expect(bannedHits(t.replace(/\bVerbatim\b/g, ''))).toEqual([])
  })

  it('has no em dash, no left stripe, no highlighted phrase, no flex or grid, and a 600 card', () => {
    const html = l1Email()
    expect(html).not.toContain('—')
    expect(html).not.toMatch(/border-left|borderLeft/i)
    expect(html).not.toMatch(/<mark\b/i)
    expect(html).not.toMatch(/<span[^>]*background/i)
    expect(html).not.toMatch(/display:\s*(flex|grid)/i)
    expect(html).not.toMatch(/class=/)
    expect(html).toContain('max-width:640px')
    expect(html).toContain(`background:${WEEKLY_READ_PALETTE.yellow}`)
    expect(html).toContain(`${APP}/brand/verbatim-mark-yellow.png`)
  })

  it('every line opens where it is: Market\'s conversation, each page\'s panel, the Dashboard, who gets this', () => {
    const html = l1Email()
    for (const href of [
      `${APP}/dashboard/market?conv=t3`, `${APP}/dashboard/market?conv=t7`, `${APP}/dashboard/market?conv=t8`,
      `${APP}/dashboard/voices?group=commuters`, `${APP}/dashboard/products?product=p1`, `${APP}/dashboard/content?idea=1`,
      `${APP}/dashboard/moves?advice=lin-1`, `${APP}/dashboard`, `${APP}/dashboard/settings/reports`, SHARE,
    ]) expect(html, href).toContain(`href="${href}"`)
    expect(html).not.toContain('/dashboard/week')
    expect(markupText(l1Email(levelOne(), null))).not.toContain('Read this week in full')
  })

  it('with no flag, the lead is the week\'s biggest new conversation, its week beside its month', () => {
    const read = levelOneRead({
      unusual: sealandUnusual([]),
      newThisWeek: [
        { themeId: 't9', label: 'Roll-top bags in heavy rain', body: 'People asked whether the roll top keeps a laptop dry in a downpour.', videos: { week: 5, month: 5 }, evidence: '' },
        { themeId: 't10', label: 'Bags for a pram', body: 'Parents asked which bag hangs from a pram.', videos: { week: 3, month: 4 }, evidence: '' },
      ],
    })
    const t = l1Text(levelOne(read))
    expect(t).not.toContain('Unusual this week')
    const marks = ['New this week', 'Roll-top bags in heavy rain', 'videos this week', '5 in September so far', 'People asked whether the roll top keeps a laptop dry', 'Also this week', 'Bags for a pram', 'New', '3 videos this week · 4 in September so far']
    expectInOrder(t, marks)
    assertCopyContract(l1Email(levelOne(read)))
  })

  it('the other flags are also this week, each with its chip and its months; a kind is named in code\'s words', () => {
    const second = sealandFlag({ objectKind: 'kind', objectId: 'question', label: 'Questions', week: { k: 40, n: 241 }, baseline: { k: 120, n: 1089 }, rank: 2 })
    const t = l1Text(levelOne(levelOneRead({ unusual: sealandUnusual([sealandFlag(), second]) })))
    expect(t).toContain('Questions')
    expect(t).toContain('40 of 241 videos this week · usually about 40 of 363 a month')
    expect(t.indexOf('Questions')).toBeLessThan(t.indexOf('Laptop sleeves'))
    const nodes = copyNodes(l1Email(levelOne(levelOneRead({ unusual: sealandUnusual([sealandFlag(), second]) }))))
    expect(nodes.filter((n) => n.kind === 'verdict' && n.text === 'Unusual this week')).toHaveLength(2)
  })

  it('prints no section that has nothing to say: no flag and nothing new, no lines, no market', () => {
    const t = l1Text(sealandSnapshot(sealandRead({ market: null }), []))
    for (const m of ['Unusual this week', 'New this week', 'Also this week', 'Across your pages', 'in your market this week']) expect(t).not.toContain(m)
    expect(t).toContain('Buyers treated bag choice as a practical match')
    expect(t).toContain('Open this week in Verbatim')
  })

  it('goes out under the same frozen subject, with a plain-text mirror', () => {
    const out = renderWeeklyReadEmail({ data: levelOne(), appUrl: APP, shareUrl: SHARE, attached: false })
    expect(out.subject).toBe('Sealand: Buyers treated bag choice as a practical match, comparing named models by trip fit, proof of quality and the colour they wanted')
    expect(out.html.startsWith('<!doctype html>')).toBe(true)
    expect(out.text).toContain('Unusual this week')
    expect(out.text).toContain('Open this week in Verbatim')
  })
})

describe('level 1 on the page, the viewer and the paper', () => {
  const l1Page = (data = levelOne()) => render(<WeeklyReadPage data={data} appUrl={APP} fill />)
  it('the share page is the full read with level 1\'s flag, rows and page lines under the week\'s one line', () => {
    const t = markupText(l1Page())
    const marks = ['This week in your market', 'Your market this week', 'The week in one line', 'Unusual this week', 'Asking for the bag in more colours', 'Also this week', 'Across your pages', 'Advice waiting', 'What happened', 'What it means for Sealand', 'This week’s findings', 'Open Verbatim']
    expectInOrder(t, marks)
    // The full read keeps its quotes (level 2), and the contract.
    expect(copyNodes(l1Page()).filter((n) => n.kind === 'quote')).toHaveLength(3)
    assertCopyContract(l1Page())
  })
  it('a new conversation is not printed twice on the page: it is in "New this week" already', () => {
    const read = levelOneRead({
      unusual: sealandUnusual([]),
      newThisWeek: [{ themeId: 't9', label: 'Roll-top bags in heavy rain', body: 'People asked whether the roll top keeps a laptop dry in a downpour.', videos: { week: 5, month: 5 }, evidence: '[[n1_week]] videos this week · [[n1_month]] in September so far' }],
    })
    read.figures.n1_week = { label: 'x', value: '5', kind: 'count' }
    read.figures.n1_month = { label: 'x', value: '5', kind: 'count' }
    const t = markupText(l1Page(levelOne(read)))
    expect(t.split('People asked whether the roll top').length - 1).toBe(1)
    expect(t).toContain('Also this week')
    assertCopyContract(l1Page(levelOne(read)))
  })
  it('the paper is still A4 portrait', () => {
    expect(render(<WeeklyReadPage data={levelOne()} appUrl={APP} print />)).toContain('@page { size: 210mm 297mm')
  })
})
