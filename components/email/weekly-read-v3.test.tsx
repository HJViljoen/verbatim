import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ALSO_TALKED as MARKET_ALSO, MOST_TALKED as MARKET_MOST, NOTHING_NEW as MARKET_NOTHING } from '@/components/pages/v2/market/analysis'
import { MovementBadge } from '@/components/delta-badge'
import { renderWeeklyReadEmail } from '@/lib/email/weekly-read'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { WEEKLY_READ_SNAPSHOT_VERSION } from '@/lib/reports/weekly-read-build'
import { ALSO_TALKED, MOST_TALKED, NOTHING_NEW } from '@/lib/reports/weekly-read-v3'
import { DIRECTION_WORDS, assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { levelOneRead, olderRead, sealandLines, sealandSnapshot, storedReportSnapshot } from '@/lib/test/weekly-read-fixture'
import {
  knee, monthEndSnapshot, movedMoves, ossurContent, ossurPages, ossurProducts, ossurRead, ossurSnapshot, ossurSubjects, ossurVoices, sealandPages, sealandV3Snapshot,
} from '@/lib/test/weekly-read-v3-fixture'
import { bannedHits } from '@/lib/written/scrub'
import { WeeklyReadEmail, WeeklyReadPage, WeeklyReadReport } from './weekly-read'
import { cssString, moveVerdictWords, ownMonth, WEEKLY_V3_EMAIL_CSS } from './weekly-read-v3'

// The weekly read, version 3 (the H7 boards, 18 Oct), in the render tier:
// the email grouped by question (H7-Email-Weekly-Alt, -Phone, -Sealand,
// -MonthEnd) and the full read as one visual system (H7-Weekly-Full,
// -Print), held to the copy contract, decision 1, ruling U6, Content's
// medical rule and the email-safe markup. Versions 1 and 2 keep rendering
// byte for byte (components/email/weekly-read.test.tsx).

const APP = 'https://app.verbatimintel.com'
const SHARE = `${APP}/r/tok`
const emailOf = (data = ossurSnapshot(), medical = false) => renderWeeklyReadEmail({ data, appUrl: APP, shareUrl: SHARE, attached: false, medical })
/** What a reader reads: no stylesheet, and a stop or a comma next to a
 *  marked node read as it prints, against the word before it. */
const textOf = (html: string) => markupText(html.replace(/<style[\s\S]*?<\/style>/g, '')).replace(/ ([,.;:])/g, '$1')
const cardText = (data = ossurSnapshot()) => textOf(render(<WeeklyReadReport data={data} appUrl={APP} fullUrl={SHARE} />))
const pageOf = (data = ossurSnapshot(), opts: { print?: boolean; medical?: boolean; app?: string; fill?: boolean } = {}) =>
  render(<WeeklyReadPage data={data} appUrl={opts.app ?? APP} fill={opts.fill ?? !opts.print} print={opts.print} medical={opts.medical} />)

/** Each mark is found after the one before it. */
function expectInOrder(text: string, marks: readonly string[]) {
  let from = 0
  for (const m of marks) {
    const at = text.indexOf(m, from)
    expect(at, `"${m}" after the marks before it`).toBeGreaterThanOrEqual(0)
    from = at + m.length
  }
}
const count = (text: string, s: string) => text.split(s).length - 1

/** The reader's text with every verdict node's words taken out: where a
 *  direction word may not stand (decision 1). */
function outsideVerdicts(html: string): string {
  let t = markupText(html.replace(/<style[\s\S]*?<\/style>/g, ''))
  for (const v of copyNodes(html).filter((n) => n.kind === 'verdict' || n.kind === 'quote')) t = t.split(v.text).join(' ')
  return t
}

describe('a new snapshot is version 3', () => {
  it('names itself so, and the three issues build through the one builder', () => {
    expect(WEEKLY_READ_SNAPSHOT_VERSION).toBe(3)
    for (const d of [ossurSnapshot(), sealandV3Snapshot(), monthEndSnapshot()]) expect(d.version).toBe(3)
  })
  it('Market\'s eyebrows are Market\'s own words', () => {
    expect([MOST_TALKED, ALSO_TALKED, NOTHING_NEW]).toEqual([MARKET_MOST, MARKET_ALSO, MARKET_NOTHING])
  })
})

describe('the email, Össur (H7-Email-Weekly-Alt): grouped by question, top to bottom', () => {
  const text = cardText()
  it('this week, the month so far, what to do next, the way in', () => {
    expectInOrder(text, [
      'Verbatim', 'Össur',
      'This week in your market · 12 to 18 October',
      'Interest in prosthetics turns quickly into practical tests of fit, function and where to get one.',
      'What it means', '01', 'The residual limb is where wearers place the risk of a prosthetic leg.',
      '02', 'Insurance and replacement timing sit inside the buying question for knees, feet and full sets.',
      '03', 'For upper limb devices, finger movement and grip strength are the named proof points.',
      'This week, 12 to 18 October', 'Beside October so far',
      'This week', '146', 'videos', '4,180', 'comments', 'October so far', '434', 'videos', '11,178', 'comments',
      'What stood out',
      'Most talked about this week', 'Praise for resilience and courage', '19 videos this week · 54 in October so far',
      'Also talked about', 'How the prosthesis works', '14 videos this week · 36 in October so far',
      'Also talked about', 'Insurance barriers and delays', '9 videos this week · 14 in October so far',
      'October so far', 'Each a reading of the whole month',
      'What the market is talking about',
      'Cost & access', 'Insurance cover decides whether a socket or knee joint feels obtainable',
      'Function & movement', 'Choosing the right device', 'Look & style', 'Fit & comfort',
      'Community & encouragement', 'Visible independence earns the encouragement around a prosthetic leg',
      'Voices', 'In the most videos', 'Caretaker', '47 of 434 videos',
      'Your products', '5 of your 65 products came up · 72 videos about them or their categories',
      'Direct Socket', 'Sockets & Locks', '4 videos', 'Pro-Flex LP Align', 'Feet', 'Came up for the first time', '3 videos',
      'Pro-Flex XC', 'Pro-Flex Terra', 'Power Knee', 'Knees', '1 video',
      'What to do next', 'Ideas, replies and advice',
      'Content', 'What to post next, from questions asked 21 Sep to 18 Oct',
      '1', 'Why can a prosthetic feel heavy or hard to wear all day?', '2', 'What happened that led to the amputation?', '3', 'Why did they do the surgery that way?',
      MEDICAL_LINE,
      'Worth a reply →', 'Comments written 12 to 18 Oct worth an answer from you',
      'Your moves', 'Advice waiting for a decision', 'Create an Össur Access Navigator for new amputees and caregivers', '1 update, first raised 12 Oct', '4 waiting',
      'Open Market', 'Read this week in full',
      'Össur · made with Verbatim', 'Who gets this',
    ])
  })
  it('what it means is each implication\'s first sentence; the rest is the full read\'s', () => {
    expect(text).not.toContain('Bruising, swelling')
    expect(text).not.toContain('Whether questions about socket comfort')
  })
  it('no quote, no story and no finding at level 1', () => {
    const html = emailOf().html
    expect(copyNodes(html).filter((n) => n.kind === 'quote')).toHaveLength(0)
    for (const m of ['What happened The', 'The week’s talk treated', 'This week’s findings', 'My socket is fine', 'Fit is judged across a whole day']) expect(textOf(html)).not.toContain(m)
  })
  it('the medical team line once, under the ideas, from the frozen part or the workspace, never twice', () => {
    for (const medical of [false, true]) {
      const e = emailOf(ossurSnapshot(), medical)
      expect(count(textOf(e.html), MEDICAL_LINE)).toBe(1)
      expect(count(e.text, MEDICAL_LINE)).toBe(1)
    }
    // A part frozen without it gets it from the workspace's market, once.
    const unfrozen = ossurSnapshot({ pages: ossurPages({ content: ossurContent({ medical: false }) }) })
    expect(count(textOf(emailOf(unfrozen, true).html), MEDICAL_LINE)).toBe(1)
    expect(count(textOf(emailOf(unfrozen, false).html), MEDICAL_LINE)).toBe(0)
  })
  it('every part opens its level page, the way in is Market, who gets this is the Studio', () => {
    const html = emailOf().html
    for (const href of [
      `${APP}/dashboard/market/conversations/o1`, `${APP}/dashboard/market/conversations/o2`, `${APP}/dashboard/market/conversations/o3`,
      `${APP}/dashboard/market/subjects/s-cost?period=month&amp;month=2026-10`,
      `${APP}/dashboard/voices/groups/caretaker`,
      `${APP}/dashboard/products/g-sock/p-ds`, `${APP}/dashboard/products/g-feet/p-lp`,
      `${APP}/dashboard/content/ideas/i1`, `${APP}/dashboard/content/ideas/i3`, `${APP}/dashboard/content/replies`,
      `${APP}/dashboard/moves/advice/l1`,
      `${APP}/dashboard/market`, SHARE, `${APP}/dashboard/studio`,
    ]) expect(html, href).toContain(`href="${href}"`)
    expect(html).not.toContain('/dashboard/settings/reports')
    expect(textOf(renderWeeklyReadEmail({ data: ossurSnapshot(), appUrl: APP, shareUrl: null }).html)).not.toContain('Read this week in full')
  })
  it('keeps the copy contract: every number a figure, the model\'s words marked with their slot, no digit in prose', () => {
    const html = emailOf().html
    assertCopyContract(html)
    const nodes = copyNodes(html)
    for (const n of nodes.filter((x) => x.kind === 'prose')) expect(n.ownText, n.text).not.toMatch(/\d/)
    expect(nodes.filter((n) => n.kind === 'stored' && n.slot === 'week_read').map((n) => n.text)).toHaveLength(6)
    expect(nodes.filter((n) => n.kind === 'stored' && n.slot === 'pass_d_b_recommendation')).toHaveLength(1)
    expect(nodes.filter((n) => n.kind === 'subject').map((n) => n.slot)).toEqual(expect.arrayContaining(['pass_b_theme', 'pass_e_persona']))
    // Every digit the card prints is code's: a figure, a date, or "01".
    const card = render(<WeeklyReadReport data={ossurSnapshot()} appUrl={APP} fullUrl={null} />)
    const bare = markupText(card.replace(/<(span|div|p) data-copy="figure"[^>]*>[\s\S]*?<\/\1>/g, ''))
      .replace(/\b\d{1,2} (to \d{1,2} )?(Sep|Oct|October)\b/g, '')
      .replace(/\b0[1-3]\b/g, '')
    expect(bare).not.toMatch(/\d/)
  })
  it('decision 1: no direction word outside a verdict, nothing about how it was made', () => {
    const html = emailOf().html
    const t = outsideVerdicts(html)
    expect(t).not.toMatch(new RegExp(`\\b(${DIRECTION_WORDS.join('|')})\\b`, 'i'))
    expect(bannedHits(t.replace(/\bVerbatim\b/g, ''))).toEqual([])
    // Every week figure sits beside its month.
    for (const m of t.matchAll(/videos this week(?! ·)/g)) expect(m, 'a week figure with no month beside it').toBeNull()
  })
  it('email-safe: tables and inline styles, no flex or grid, no em or en dash, no left stripe; the head\'s one stylesheet only re-lays it for a phone', () => {
    const html = emailOf().html
    expect(html).not.toMatch(/display:\s*(flex|grid)/i)
    expect(html).not.toMatch(/[—–]/)
    expect(html).not.toMatch(/border-left:\s*[2-9]/i)
    expect(html).not.toMatch(/<span[^>]*background[^>]*>[^<]*<\/span>\s*[a-z]/i)
    // Only the phone's classes, and each element they touch is laid out inline.
    for (const m of html.matchAll(/class="([^"]+)"/g)) expect(m[1]).toMatch(/^wr3-[a-z0-9-]+$/)
    expect(html).toContain('<style>@media only screen and (max-width:480px){')
    expect(html).toContain('max-width:640px')
    expect(WEEKLY_V3_EMAIL_CSS).not.toMatch(/[<>&]/)
    expect(html).toContain(`${APP}/brand/verbatim-mark-yellow.png`)
  })
  it('goes out under "Össur: {the week in one line}", with a plain-text mirror grouped the same way', () => {
    const e = emailOf()
    expect(e.subject).toBe('Össur: Interest in prosthetics turns quickly into practical tests of fit, function and where to get one')
    expect(e.html.startsWith('<!doctype html>')).toBe(true)
    expectInOrder(e.text.replace(/\n/g, ' '), ['What it means', 'This week, 12 to 18 October', 'What stood out', 'October so far', 'What the market is talking about', 'Voices', 'Your products', 'What to do next', 'Content', 'Your moves', 'Open Market', 'Read this week in full', 'Who gets this'])
    expect(e.text).toContain(`Open Market (${APP}/dashboard/market)`)
  })
  it('its plain text reads line by line: each note once, a row\'s eyebrow, name and figure each a line, each address once', () => {
    const t = emailOf().text
    for (const note of ['Beside October so far', 'Each a reading of the whole month', 'Ideas, replies and advice']) expect(count(t, note), note).toBe(1)
    expect(t).toContain(`Most talked about this week\nPraise for resilience and courage\n19 videos this week · 54 in October so far (${APP}/dashboard/market/conversations/o1)`)
    expect(t).toContain(`Cost & access\nInsurance cover decides whether a socket or knee joint feels obtainable (${APP}/dashboard/market/subjects/s-cost?period=month&month=2026-10)`)
    expect(t).toContain('This week\n146 videos\n4,180 comments\nOctober so far\n434 videos\n11,178 comments')
    expect(t).toContain('01 The residual limb is where wearers place the risk of a prosthetic leg.')
    expect(t).toContain(`(${APP}/dashboard/moves/advice/l1)\n1 update, first raised 12 Oct`)
    expect(count(t, `${APP}/dashboard/market/conversations/o1`)).toBe(1)
    // No arrow link repeating its row's address ("Worth a reply →" is words).
    expect(t.replace('Worth a reply → (', '')).not.toContain('→ (')
    // The month-closing line reads as one, its arrow not doubled.
    const m = emailOf(monthEndSnapshot()).text
    expect(m).toContain(`The month’s long-run read\nOctober’s read, “What holds across September and October”, is on Market › This month (${APP}/dashboard/market?period=month&month=2026-10#long-run)`)
    expect(count(m, '#long-run')).toBe(1)
  })
})

describe('the email, Sealand (H7-Email-Weekly-Sealand, regrouped by question)', () => {
  const html = emailOf(sealandV3Snapshot()).html
  const t = textOf(html)
  it('no Your products at all: switched off, no section, no placeholder', () => {
    expect(t).not.toContain('Your products')
    expect(t).not.toMatch(/products came up/)
  })
  it('a thin subject carries its stored line where a headline goes; the brands named most where they are counted', () => {
    expectInOrder(t, [
      'What the market is talking about', 'Buying & delivery', 'Stock status decides if a chosen bag gets bought',
      'Durability', 'Zips under compression make long life believable',
      'Price', 'In October so far, talk about Price sat in “Price questions before buying”.',
      'Voices', 'In the most videos', 'Bag lover', '148 of 446 videos', 'Named most, unprompted', 'The North Face', '4 of 364 videos', 'Cotopaxi', '3 of 364 videos',
    ])
  })
  it('no post idea: the Dashboard tile\'s stand-in, the question asked most, its week beside its month, and no medical line', () => {
    expectInOrder(t, ['What to do next', 'Questions, replies and advice', 'Content', 'Asked most, and not yet in your posts', 'Questions about product details', '6 videos this week · 8 in October so far', 'Worth a reply →', 'Comments written 5 to 11 Oct worth an answer from you', 'Your moves', '1 update raised it', '4 waiting'])
    expect(t).not.toContain(MEDICAL_LINE)
    expect(t).not.toContain('What to post next')
    expect(html).toContain(`href="${APP}/dashboard/content#idea-slot-1"`)
    expect(html).toContain(`href="${APP}/dashboard/voices/brands/The%20North%20Face"`)
    assertCopyContract(html)
  })
})

describe('the email, the issue that closes a month (H7-Email-Weekly-MonthEnd)', () => {
  const html = emailOf(monthEndSnapshot()).html
  const t = textOf(html)
  it('the month-closing line after the week\'s numbers, the week restated against the closed month in full', () => {
    expectInOrder(t, [
      'This week in your market · 26 October to 1 November',
      'This week, 26 October to 1 November', 'Beside October in total', 'This week', '151', 'October in total', '902',
      'The month’s long-run read', 'October’s read, “What holds across September and October”, is on Market › This month',
      'What stood out', 'October', 'Each a reading of the whole month',
    ])
    expect(html).toContain(`href="${APP}/dashboard/market?period=month&amp;month=2026-10#long-run"`)
    expect(t).not.toContain('so far in October')
  })
  it('a flag leads with the check\'s own chip and no band sentence', () => {
    expectInOrder(t, ['What stood out', 'Unusual this week', knee().label, '19 of 241 videos this week · usually 38 of 1,089 over June, July and August', 'Most talked about this week'])
    expect(t).not.toMatch(/A difference of|on a band of|\d points/)
    expect(copyNodes(html).filter((n) => n.kind === 'verdict').map((n) => n.text)).toEqual(expect.arrayContaining(['Unusual this week']))
  })
  it('a dated move prints its one comparison, its verdict in a verdict node', () => {
    expectInOrder(t, ['Your moves', 'After your move', 'Price transparency page, dated 2 Sep', 'Cost & access: 92 of 612 videos in August, the month before, against 134 of 839 in September, the month of the move', 'no clear change · +0.9 pts · band ±3.2 pts'])
    expect(copyNodes(html).filter((n) => n.kind === 'verdict').map((n) => n.text)).toContain('no clear change · +0.9 pts · band ±3.2 pts')
    assertCopyContract(html)
    expect(outsideVerdicts(html)).not.toMatch(new RegExp(`\\b(${DIRECTION_WORDS.join('|')})\\b`, 'i'))
  })
  it('the badge\'s words as Your moves\' move card prints them, the band inline (ruling I); a refused comparison prints nothing', () => {
    const v = movedMoves().move!.verdict
    expect(moveVerdictWords({ ...v, state: 'moved', changePts: 4.2, bandPts: 1.9 })).toBe('▲ 4.2 pts · band ±1.9 pts')
    expect(moveVerdictWords({ ...v, state: 'moved', changePts: -2, bandPts: 1 })).toBe('▼ 2 pts · band ±1 pts')
    // A non-answer prints the change it refused and its band (SH18), as the
    // move card's badge does with no tooltip to hold them.
    expect(moveVerdictWords(v)).toBe('no clear change · +0.9 pts · band ±3.2 pts')
    expect(moveVerdictWords({ ...v, changePts: -0.4 })).toBe('no clear change · −0.4 pts · band ±3.2 pts')
    expect(moveVerdictWords({ ...v, changePts: null, bandPts: null })).toBe('no clear change')
    // Too thin to compare withholds both, as the badge does.
    expect(moveVerdictWords({ ...v, state: 'too_little_data' })).toBe('too few to compare')
    expect(moveVerdictWords({ ...v, state: 'refused' })).toBeNull()
    // The same words the badge prints on Your moves (no tooltip), one source.
    for (const x of [v, { ...v, state: 'too_little_data' as const }, { ...v, state: 'moved' as const, changePts: 4.2, bandPts: 1.9 }]) {
      expect(markupText(render(<MovementBadge verdict={x} unit="pts" />)).replace(/\s+/g, ' ').trim()).toBe(moveVerdictWords(x))
    }
  })
})

describe('the email\'s states: a part that is not there prints nothing (§0a.2)', () => {
  it('the stand-in question never prints a week\'s figure without its month (decision 1); the month alone stands', () => {
    const base = sealandV3Snapshot()
    const content = base.pages!.content!
    const asked = content.asked!
    const monthOnly = { ...base, pages: { ...base.pages, content: { ...content, asked: { ...asked, week: null } } } }
    for (const html of [emailOf(monthOnly).html, pageOf(monthOnly)]) {
      const t = textOf(html)
      expect(t).toContain('Questions about product details')
      expect(t).toContain('8 videos in October so far')
      expect(t).not.toMatch(/videos this week(?! ·)/)
    }
    const neither = { ...base, pages: { ...base.pages, content: { ...content, asked: { ...asked, week: 6, month: null } } } }
    for (const html of [emailOf(neither).html, pageOf(neither)]) {
      const t = textOf(html)
      const card = t.slice(t.indexOf('Questions about product details'), t.indexOf('Worth a reply'))
      expect(card).toContain('Questions about product details')
      expect(card).not.toMatch(/\d/)
    }
  })
  it('no ready subject: no "What the market is talking about"; the group heads with Voices', () => {
    const t = cardText(ossurSnapshot({ subjects: [] }))
    expect(t).not.toContain('What the market is talking about')
    expectInOrder(t, ['October so far', 'Each a reading of the whole month', 'Voices', 'Caretaker', 'Your products'])
  })
  it('no ideas and no question: Content is Worth a reply alone', () => {
    const t = cardText(ossurSnapshot({ pages: ossurPages({ content: ossurContent({ ideas: [], read: null, asked: null }) }) }))
    expectInOrder(t, ['What to do next', 'Replies and advice', 'Content', 'Worth a reply →', 'Your moves'])
    expect(t).not.toContain(MEDICAL_LINE)
    expect(t).not.toContain('What to post next')
  })
  it('products off, no voices, no moves: none of them, and no empty heading', () => {
    const t = cardText(ossurSnapshot({ subjects: [], pages: { content: ossurContent() } }))
    for (const m of ['Your products', 'Voices', 'Your moves', 'Each a reading of the whole month']) expect(t).not.toContain(m)
    expectInOrder(t, ['What stood out', 'What to do next', 'Ideas and replies', 'Content'])
  })
  it('a snapshot with no parts at all (built from the read alone) renders the week and the way in', () => {
    const bare = ossurSnapshot({ subjects: [], pages: {}, monthClose: null })
    const t = cardText(bare)
    for (const m of ['What to do next', 'Each a reading', 'What the market is talking about', 'The month’s long-run read']) expect(t).not.toContain(m)
    expectInOrder(t, ['Interest in prosthetics', 'What it means', 'What stood out', 'Open Market'])
    assertCopyContract(emailOf(bare).html)
  })
  it('no market numbers: no band and no "Beside", what stood out still heads with the week', () => {
    const t = cardText(ossurSnapshot({ read: ossurRead({ market: null }) }))
    expect(t).not.toContain('Beside October')
    expectInOrder(t, ['This week, 12 to 18 October', 'What stood out', 'Praise for resilience'])
  })
  it('a whole-month reading of another month says its month and label at its head (decision 3)', () => {
    const pages = ossurPages({ voices: { ...ossurPages().voices!, month: '2026-09-01', monthWords: 'September', monthLabel: 'the last full month' } })
    const t = cardText(ossurSnapshot({ pages }))
    expectInOrder(t, ['October so far', 'Voices', 'September · the last full month', 'Caretaker', 'Your products'])
    expect(t).not.toMatch(/Your products\s+October so far/)
  })
  it('the issue that closes a month: its section is that month, and Voices and Your products still say it is the last full month (decision 3)', () => {
    // Built on 1 November: the reading month is October, which is the
    // section's own month, and no longer the calendar's.
    const last = { month: '2026-10-01', monthWords: 'October', monthLabel: 'the last full month' }
    const data = { ...monthEndSnapshot(), pages: ossurPages({ voices: ossurVoices(last), products: ossurProducts(last), moves: movedMoves() }) }
    const t = cardText(data)
    expectInOrder(t, ['October', 'Each a reading of the whole month', 'Voices', 'October · the last full month', 'Caretaker', 'Your products', 'October · the last full month', 'Direct Socket'])
    const page = textOf(pageOf(data))
    expectInOrder(page, ['The groups in your market, October · the last full month', 'Your products', 'October · the last full month · 5 of your 65 products came up'])
    const paper = textOf(pageOf(data, { print: true }))
    expectInOrder(paper, ['October · the last full month · in the most videos', 'Videos about each category', 'A product named or not, October · the last full month'])
    // The month's own words where the reading month is the current one.
    expect(ownMonth('2026-10-01', 'October so far', null, '2026-10-01')).toBeNull()
    expect(ownMonth('2026-10-01', 'October', 'the last full month', '2026-10-01')).toBe('October · the last full month')
    expect(ownMonth('2026-09-01', 'September', 'the last full month', '2026-10-01')).toBe('September · the last full month')
    expect(ownMonth('2026-09-01', '', 'the last full month', '2026-10-01')).toBeNull()
  })
  it('an older read (v1) built into version 3 still renders: its In short as the line', () => {
    const data = ossurSnapshot({ read: olderRead() as never, subjects: [], pages: {} })
    const t = cardText(data)
    expect(t).toContain('Buyers compared named bags')
    assertCopyContract(emailOf(data).html)
  })
})

describe('the full read: the share page and the viewer (H7-Weekly-Full)', () => {
  const html = pageOf()
  const t = textOf(html)
  it('one visual system: the week card with each quote under its paragraph, also this week, the subjects in full, the pages', () => {
    expectInOrder(t, [
      'Verbatim', 'Össur', 'Read 18 Oct · shared from Verbatim',
      'This week in your market', '12 to 18 October · 146 videos · 4,180 comments this week · 434 videos and 11,178 comments in October so far',
      'This week · 12 to 18 October', 'Interest in prosthetics turns quickly',
      'What happened', 'The week’s talk treated a prosthetic leg', '“My socket is fine in the morning', 'TikTok · 14 Oct',
      'Once the fit was settled', '“Insurance approved the knee', 'Instagram · 15 Oct',
      'For hands, the proof was in plain tasks', '“Watching her pick up a grape', 'YouTube · 16 Oct',
      'What it means', 'The residual limb is where wearers place the risk of a prosthetic leg. Bruising, swelling',
      'New this week', 'Nothing new this week.',
      'Worth watching', 'Whether questions about socket comfort keep naming the residual limb, or start naming the liner and socks instead.',
      'Also this week', 'What stood out in this week’s conversations',
      'Most talked about this week', 'Praise for resilience and courage', 'Open →',
      'Also talked about', 'How the prosthesis works',
      'Nothing new this week', 'Insurance barriers and delays', 'Also talked about',
      'What the market is talking about', 'October so far · your six subjects',
      'Cost & access', 'Insurance cover decides whether a socket or knee joint feels obtainable', 'For buyers, the socket, knee joint and hand are where access becomes concrete',
      'Community & encouragement',
      'Across your pages', 'Each opens its page in Verbatim',
      'Voices', 'The groups in your market, October so far', 'In the most videos', 'Caretaker', '47 of 434 videos', 'This person is supporting someone', 'The other groups', 'First-time buyer', 'Open Voices →',
      'Your products', 'October so far · 5 of your 65 products came up · 72 videos about them or their categories', 'Product', 'Category', 'Videos', 'Direct Socket', 'Sockets & Locks',
      'Videos about each category, a product named or not', 'Sockets & Locks', '24', 'Open Your products →',
      'What to post next', 'From questions asked 21 Sep to 18 Oct', 'Why can a prosthetic feel heavy', MEDICAL_LINE, 'Worth a reply', 'Comments written 12 to 18 Oct worth an answer from you', 'Open the replies →', 'Open Content →',
      'Advice to decide on', '4 pieces of advice waiting for a decision', 'Create an Össur Access Navigator', 'first raised 12 Oct', 'The advice record →', 'Open Your moves →',
      'Open Market', 'Who gets this', 'Össur · made with Verbatim',
    ])
  })
  it('"This week\'s findings" is gone from version 3, and every quote is a ref resolved at render', () => {
    expect(t).not.toContain('This week’s findings')
    expect(t).not.toContain('Fit is judged across a whole day')
    expect(copyNodes(html).filter((n) => n.kind === 'quote')).toHaveLength(3)
    // A quote whose words did not come back prints no panel and no cite.
    const read = ossurRead()
    read.story[1].quote = null
    expect(textOf(pageOf(ossurSnapshot({ read })))).not.toContain('Instagram · 15 Oct')
  })
  it('keeps the copy contract and decision 1; the medical line once; no em or en dash', () => {
    assertCopyContract(html)
    for (const n of copyNodes(html).filter((x) => x.kind === 'prose')) expect(n.ownText, n.text).not.toMatch(/\d/)
    expect(outsideVerdicts(html)).not.toMatch(new RegExp(`\\b(${DIRECTION_WORDS.join('|')})\\b`, 'i'))
    expect(count(t, MEDICAL_LINE)).toBe(1)
    expect(count(textOf(pageOf(ossurSnapshot(), { medical: true })), MEDICAL_LINE)).toBe(1)
    expect(html).not.toMatch(/[—–]/)
  })
  it('the viewer is the same body, on the app\'s own origin, and says nothing about sharing', () => {
    const v = pageOf(ossurSnapshot(), { app: '', fill: false })
    expect(textOf(v)).toContain('Read 18 Oct')
    expect(textOf(v)).not.toContain('shared from Verbatim')
    expect(v).toContain('href="/dashboard/market"')
  })
  it('Sealand: no products card, the stand-in question, the brands named most; the month-closing line as a card', () => {
    const s = textOf(pageOf(sealandV3Snapshot()))
    expect(s).not.toContain('Your products')
    expectInOrder(s, ['Asked most, and not yet in your posts', 'Questions about product details', '6 videos this week · 8 in October so far', 'Worth a reply'])
    expectInOrder(s, ['Named most, unprompted', 'The North Face', '4 of 364 videos'])
    expect(s).not.toContain(MEDICAL_LINE)
    const m = textOf(pageOf(monthEndSnapshot()))
    expectInOrder(m, ['Worth watching', 'The month’s long-run read', 'October’s read, “What holds across September and October”, is on Market › This month', 'Also this week', 'Unusual this week'])
    expectInOrder(m, ['After your move', 'Price transparency page, dated 2 Sep', 'no clear change'])
    assertCopyContract(pageOf(monthEndSnapshot()))
  })
})

describe('the full read on A4 (H7-Weekly-Full-Print)', () => {
  const html = pageOf(ossurSnapshot(), { print: true })
  const t = textOf(html)
  it('A4 portrait, flat, each section group on a new page, every page footed with the issue and its page', () => {
    expect(html).toContain('@page{size:210mm 297mm;')
    expect(html).toContain('counter(page) &quot; of &quot; counter(pages)'.replace(/&quot;/g, '"'))
    expect(html).toContain(`@bottom-left{content:${cssString('Össur · This week in your market · 12 to 18 October')}`)
    expect(html).toContain('.w3-print .w3-group{break-before:page}')
    expect(count(html, 'class="w3-group')).toBe(3)
  })
  it('the share page\'s parts, in its order: the week and its story; what it means, new, watching and also; the subjects; the pages', () => {
    expectInOrder(t, [
      'This week in your market', '12 to 18 October', 'The week in one line', 'Interest in prosthetics',
      'This week · 12 to 18 Oct', '146', 'October so far', '434',
      'What happened', '“My socket is fine',
      'What it means', 'New this week', 'Nothing new this week.', 'Worth watching',
      'Also this week', 'Most talked about this week', 'Nothing new this week · Also talked about', 'Insurance barriers and delays',
      'What the market is talking about', 'Cost & access',
      'Across your pages', 'Voices', 'Caretaker', 'What to post next', MEDICAL_LINE, 'Worth a reply', 'Your products', 'Videos about each category', 'Advice to decide on',
      'Open this week in Verbatim: app.verbatimintel.com/dashboard/market',
    ])
    expect(count(t, MEDICAL_LINE)).toBe(1)
    assertCopyContract(html)
  })
  it('a workspace name cannot end the stylesheet', () => {
    const quoted = cssString('A</style><b>"x"')
    expect(quoted.startsWith('"') && quoted.endsWith('"')).toBe(true)
    expect(quoted.slice(1, -1)).not.toMatch(/[<>"&]/)
    expect(cssString('Össur · x')).toBe('"\\0000d6 ssur \\0000b7  x"')
  })
})

describe('version routing: 1 and 2 render exactly as they did, 3 renders the H7 issue', () => {
  const GOLDEN = join(process.cwd(), 'lib/test/weekly-read-golden')
  const golden = (name: string) => readFileSync(join(GOLDEN, name), 'utf8')
  it('a version-1 snapshot is the report, byte for byte', () => {
    expect(renderWeeklyReadEmail({ data: storedReportSnapshot(), appUrl: APP, shareUrl: SHARE, attached: false }).html).toBe(golden('email-sealand.html'))
    expect(pageOf(storedReportSnapshot())).toBe(golden('page-sealand.html'))
  })
  it('a version-2 snapshot is level 1, byte for byte', () => {
    expect(renderWeeklyReadEmail({ data: sealandSnapshot(levelOneRead(), sealandLines()), appUrl: APP, shareUrl: SHARE, attached: false }).html).toBe(golden('l1-email.html'))
    expect(render(<WeeklyReadPage data={sealandSnapshot(levelOneRead(), sealandLines())} appUrl={APP} fill />)).toBe(golden('l1-page.html'))
  })
  it('only version 3 carries the phone stylesheet', () => {
    expect(renderWeeklyReadEmail({ data: sealandSnapshot(levelOneRead(), sealandLines()), appUrl: APP, shareUrl: SHARE }).html).not.toContain('@media')
    expect(emailOf().html).toContain('@media only screen')
  })
  it('a version-3 snapshot whose read is missing is the stale sentence, not a crash', () => {
    const t = textOf(render(<WeeklyReadEmail data={{ ...ossurSnapshot(), read: null as never }} appUrl={APP} />))
    expect(t).toContain('This week in your market')
    expect(t).not.toContain('What stood out')
  })
})

describe('ruling U6 in the issue', () => {
  it('prints exactly the subjects the build froze, which are the ready ones', () => {
    const ready = ossurSubjects().slice(0, 2)
    const t = cardText(ossurSnapshot({ subjects: ready }))
    expect(t).toContain('Cost & access')
    expect(t).toContain('Function & movement')
    expect(t).not.toContain('Look & style')
  })
  it('the Sealand pages fixture names no products (switched off)', () => {
    expect(sealandPages().products).toBeNull()
  })
})
