import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { surface } from '@/lib/nav'
import { layoutFor, SubjectsPage, SUBJECT_BLOCKS } from './index'
import { NO_SUBJECTS_LINE, subjectsList } from './list'
import { subjectsOwnPosts } from './own-posts'
import { subjectsSayHear } from './say-hear'
import { MARKET_PANE_TITLE, subjectsSubject } from './subject'
import { LINE_FROM, monthsLead, subjectsLine } from './line'
import { subjectsKinds } from './kinds'
import { subjectsVoices } from './voices'
import { QUESTIONS_TITLE, subjectsUnanswered } from './unanswered'
import { marketLineFixture, marketSubjectsFixture, ossurMarketFixture, subjectsFixture, waterproofingFixture } from './fixture'

// Subjects on the market (market-first WP2.2, plan §2.3 S1-S7), on staging's
// Sealand September: the page the loader builds since WP2.2. The Phase 1
// pages stored before it render as sent (blocks.test.tsx keeps those arms).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const text = (node: React.ReactNode) => renderText(node).replace(/\s+/g, ' ')

describe('Subjects on the market: every block, every mode', () => {
  it('renders in all three modes on Looks & style, Waterproofing and Össur, and keeps the copy contract', () => {
    for (const data of [marketSubjectsFixture(), waterproofingFixture(), ossurMarketFixture()]) {
      for (const block of SUBJECT_BLOCKS) {
        for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
      }
    }
  })

  it('states no figure twice with two different values', () => {
    const data = marketSubjectsFixture()
    expect(figureConflicts(SUBJECT_BLOCKS.map((b) => blockAnswers(b, data).figures))).toEqual([])
  })

  it('prints no "how sound", no em dash, no gap and no brand cell anywhere on the page (§5.12, WP2.2)', () => {
    for (const data of [marketSubjectsFixture(), waterproofingFixture()]) {
      for (const mode of MODES) {
        const all = text(<>{SUBJECT_BLOCKS.map((b) => <div key={b.key}>{b.render(data, mode, ctx)}</div>)}</>)
        expect(all.toLowerCase()).not.toContain('how sound')
        expect(all).not.toContain('—')
        expect(all).not.toContain('too few to compare')
        for (const brand of ['Cotopaxi', 'Patagonia', 'The North Face', 'Category · no brand', 'of your videos']) expect(all).not.toContain(brand)
      }
    }
  })

  it('carries a title alone in every header and links alone in every footer: no meta, no note (25 Sep rulings)', () => {
    const data = marketSubjectsFixture()
    const all = text(<>{SUBJECT_BLOCKS.map((b) => <div key={b.key}>{b.render(data, 'app', ctx)}</div>)}</>)
    for (const meta of ['7 named', 'n = ', 'your claims', 'latest update', 'monthly ·', '4 of 4', 'dated by the day you posted', 'Over the period shown', 'not readable yet']) {
      expect(all).not.toContain(meta)
    }
  })

  it('names each footer link by the page\'s current sidebar label', () => {
    const data = marketSubjectsFixture()
    const voice = surface('voice').label
    const moves = surface('market').label
    expect(text(subjectsList.render(data, 'app', ctx))).toContain(`The rest is on ${voice} →`)
    expect(text(subjectsKinds.render(data, 'app', ctx))).toContain(`Open ${voice} →`)
    expect(text(subjectsVoices.render(data, 'app', ctx))).toContain(`Hear these voices in ${voice} →`)
    expect(text(subjectsOwnPosts.render(data, 'app', ctx))).toContain(`Open ${moves} →`)
    expect(text(subjectsSayHear.render(data, 'app', ctx))).toContain(`Open ${moves} →`)
  })
})

describe('S1 · the rail reads the market', () => {
  it('ranks the subjects by the market\'s share, a subject with no figure after every one with a figure', () => {
    const t = text(subjectsList.render(marketSubjectsFixture(), 'app', ctx))
    const order = ['Looks & style', 'Comfort', 'Durability', 'Waterproofing', 'Price', 'Community & purpose', 'Repair & warranty']
    const at = order.map((name) => t.indexOf(name))
    expect(at.every((x) => x >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('heads its columns with the base: this month and the month before, on the market', () => {
    const t = text(subjectsList.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toContain('ranked by September')
    expect(t).toContain('Sep of 654')
    expect(t).toContain('Aug of 377')
  })

  it('prints each row\'s videos, share and the month before; a month under 10 as its count', () => {
    const t = text(subjectsList.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toMatch(/Looks & style 103 16% 10%/)
    expect(t).toMatch(/Comfort 43 7% 7%/)
    // Price's August 5 is under 10: a count, never a share (§2.12).
    expect(t).toMatch(/Price 25 4% 5/)
  })

  it('tags a row with its maker share at a fifth or more, and nothing under it (decision F)', () => {
    const t = text(subjectsList.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toContain('about a third makers') // 35 of 103
    expect(t).toContain('about a quarter makers') // 9 of 39
    expect((t.match(/makers/g) ?? []).length).toBe(2)
  })

  it('prints "being re-described" and no figure for a failed subject, and "no reading yet" for one not read', () => {
    const t = text(subjectsList.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toMatch(/Repair & warranty being re-described/)
    expect(t).not.toMatch(/Repair & warranty 36/)
    expect(t).toMatch(/Community & purpose no reading yet/)
  })

  it('draws no editing control (a rename or a stop is Settings\')', () => {
    const t = text(subjectsList.render(marketSubjectsFixture(), 'app', ctx))
    for (const control of ['Rename', 'Stop', 'Add a subject']) expect(t).not.toContain(control)
  })

  it('links each row with a pane, and marks the one open', () => {
    const html = render(subjectsList.render(marketSubjectsFixture(), 'app', ctx))
    expect(html).toContain('href="/dashboard/subjects?item=s-looks"')
    expect(html).toContain('aria-current="true"')
    expect(html).not.toContain('item=s-repair')
  })

  it('Össur prints one line: "No subjects named yet." (§2.13), and the page draws no pane', () => {
    const data = ossurMarketFixture()
    expect(text(subjectsList.render(data, 'app', ctx))).toContain(NO_SUBJECTS_LINE)
    // Inside a drawn block, as the front page draws a waiting line (decision B 2).
    expect(render(subjectsList.render(data, 'app', ctx))).toMatch(/<p class="[^"]*bg-inner[^"]*"><span[^>]*>No subjects named yet\.<\/span><\/p>/)
    expect(layoutFor(data).map((l) => l.block.key)).toEqual(['subjects.list', 'subjects.ownposts', 'subjects.sayhear'])
    const page = text(<SubjectsPage data={data} />)
    expect(page).toContain(NO_SUBJECTS_LINE)
    expect(page.toUpperCase()).not.toContain(MARKET_PANE_TITLE.toUpperCase())
    expect(page).not.toContain('Name a subject')
  })
})

describe('S2 · the subject in your market', () => {
  it('leads with the market\'s level on the rail\'s base (default M-b), then the months read as levels', () => {
    const t = text(subjectsSubject.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toContain(MARKET_PANE_TITLE)
    expect(t).toMatch(/Looks & style came up in 103 of 654 September videos in your market \( ?16% ?\)\./)
    expect(t).toContain('Aug 10% of 377 · Sep 16% of 654')
  })

  it('prints the pair\'s one chip, "who posted them" and the months read, and no gap and no side', () => {
    const t = text(subjectsSubject.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toContain('not read as a change: we changed our searches in September')
    expect(t).toContain('Its 103 September videos')
    expect(t).toContain('34% makers’ videos')
    expect(t).toContain('66% everyone else')
    expect(t).toContain('2 months read')
    for (const gone of ['Track this', 'apart', 'too few to compare', 'You ·', 'rival']) expect(t).not.toContain(gone)
  })

  it('prints makers and everyone else as counts where the subject is under 100 videos', () => {
    const t = text(subjectsSubject.render(waterproofingFixture(), 'app', ctx))
    expect(t).toContain('2 makers’ videos')
    expect(t).toContain('27 everyone else')
    expect(t).not.toMatch(/\d+% makers/)
  })

  it('carries the calibration word in its trail: provisional, never a verdict', () => {
    const data = marketSubjectsFixture()
    const t = text(subjectsSubject.render({ ...data, selected: { ...data.selected!, calibration: 'provisional' } }, 'app', ctx))
    expect(t).toContain('provisional · Aug 10% of 377 · Sep 16% of 654')
    expect(blockAnswers(subjectsSubject, data).verdicts).toEqual([])
  })

  it('sends the subject to Ask as a question about the market', () => {
    const html = render(subjectsSubject.render(marketSubjectsFixture(), 'app', ctx))
    expect(html).toContain(`ask=${encodeURIComponent('What does my market say about Looks & style?')}`)
    expect(render(subjectsSubject.render(marketSubjectsFixture(), 'print', ctx))).not.toContain('Ask about this')
  })
})

describe('S3 · what people say about it', () => {
  it('reads the subject\'s own kinds, with its one-line answer', () => {
    const t = text(subjectsKinds.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toContain('What people say about Looks & style')
    expect(t).toContain('Almost all of it is praise: 93 of its 103 videos.')
    expect(t).toMatch(/Praising it 93 90%/)
    expect(t).toContain('Share of 103')
  })

  it('prints a kind under 10 as its count, and the six big kinds even at 0', () => {
    const t = text(subjectsKinds.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toMatch(/Ready to buy 4 ·/)
    expect(t).toMatch(/Hitting a problem no video 0 ·/)
  })

  it('under 100 videos names the most frequent kind as a count', () => {
    const t = text(subjectsKinds.render(waterproofingFixture(), 'app', ctx))
    expect(t).toContain('Most often, hitting a problem: 11 of its 29 videos.')
    expect(t).not.toMatch(/\d+%/)
  })

  it('says what is missing where the kinds were not read, never a kind table of zeros', () => {
    const data = marketSubjectsFixture()
    const t = text(subjectsKinds.render({ ...data, selected: { ...data.selected!, kindsIn: null } }, 'app', ctx))
    expect(t).toContain('What is said about Looks & style in September has not been read yet.')
  })
})

describe('S4 · questions people ask on it', () => {
  it('always prints the count line, never a hidden card (decision B)', () => {
    const t = text(subjectsUnanswered.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toContain(QUESTIONS_TITLE)
    expect(t).toContain('2 videos asked about Looks & style in September.')
  })

  it('under the list\'s floor, points at the subjects asked about most over the last 3 months (staging: 16, 12, 7)', () => {
    const t = text(subjectsUnanswered.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toMatch(/Asked most, last 3 months videos Waterproofing 16 Price 12 Comfort 7/)
    expect(render(subjectsUnanswered.render(marketSubjectsFixture(), 'app', ctx))).toContain('/dashboard/subjects?item=s-water&amp;horizon=last_3"')
    // Where the subject's own list opens, it is the list.
    expect(text(subjectsUnanswered.render(waterproofingFixture(), 'app', ctx))).not.toContain('Asked most, last 3 months')
  })

  it('over the last 3 months lists Waterproofing\'s 16 question videos, and says none of your 56 posts shared two of its words', () => {
    const t = text(subjectsUnanswered.render(waterproofingFixture(), 'app', ctx))
    expect(t).toContain('16 videos asked about Waterproofing in the last 3 months.')
    expect(t).toMatch(/Demand for real waterproofing 3/)
    expect(t).toMatch(/Worries about zippers in rain 2/)
    expect(t).toContain('None of your 56 posts shared two or more of its words.')
  })

  it('the page draws the questions tile whatever its count (the gate from 5bb877d6 is gone)', () => {
    const page = text(<SubjectsPage data={marketSubjectsFixture()} />)
    expect(page.toUpperCase()).toContain(QUESTIONS_TITLE.toUpperCase())
  })
})

describe('S5 · voices from the reading month', () => {
  it('names the subject, and cites each voice\'s day, likes and whose video', () => {
    const t = text(subjectsVoices.render(marketSubjectsFixture(), 'app', ctx))
    expect(t).toContain('Voices on Looks & style')
    expect(t).toContain('8 Sep · 6 likes · under a category video')
    expect(t).toContain('17 Sep · under a Freitag video')
  })

  it('marks a voice under a maker\'s video (decision F)', () => {
    const data = marketSubjectsFixture()
    const voices = data.selected!.voices.map((v, i) => (i === 3 ? { ...v, maker: true } : v))
    const t = text(subjectsVoices.render({ ...data, selected: { ...data.selected!, voices } }, 'app', ctx))
    expect((t.match(/a maker’s video/g) ?? []).length).toBe(1)
  })

  it('names the platform in words on paper and in an email', () => {
    expect(text(subjectsVoices.render(marketSubjectsFixture(), 'email', ctx))).toContain('Reddit · 8 Sep')
  })

  it('declares its refs, so a snapshot freezes ids and resolves words at render', () => {
    expect(blockAnswers(subjectsVoices, marketSubjectsFixture()).quotes).toHaveLength(4)
  })
})

describe('S6 · month by month on the market', () => {
  it('under three months, prints each month read as a card, and the months to the next pair as cards to come', () => {
    const data = marketSubjectsFixture()
    const t = text(subjectsLine.render(data, 'app', ctx))
    expect(monthsLead(data.selected!.marketLine)).toBe('Two months read, not yet a line.')
    expect(t).toContain('Two months read, not yet a line.')
    expect(t).toContain('ended · still filling until the 1 Nov update')
    expect(t).toContain('38 of 377')
    expect(t).toContain('103 of 654')
    expect(t).toContain('so far from 16 Oct · ended from 1 Nov')
    expect(t).toContain('settles with the 3 Jan update')
    expect(t).toContain('the first step joined as a line')
    expect(t).toContain('once November has filled, about the 3 Jan update')
    expect(t).toContain('not read as a change: we changed our searches in September')
  })

  it('never says "complete", "so far, N days" or "still filling" in a lead', () => {
    const lead = monthsLead(marketSubjectsFixture().selected!.marketLine)!
    for (const w of ['complete', 'so far', 'still filling']) expect(lead).not.toContain(w)
  })

  it(`from the ${LINE_FROM}rd month read draws one line, a refused step broken`, () => {
    const data = marketSubjectsFixture()
    const line = marketLineFixture('s-looks', 'Looks & style', [
      { ...data.selected!.marketLine!.points[0], month: '2026-07-01', k: 30, videos: 300, pct: 10 },
      ...data.selected!.marketLine!.points,
    ], data.selected!.marketLine!.refusedSteps)
    const html = render(subjectsLine.render({ ...data, chartAxis: ['2026-07-01', '2026-08-01', '2026-09-01'], selected: { ...data.selected!, marketLine: line } }, 'app', ctx))
    expect(html).toContain('<svg')
    expect(html).not.toContain('not yet a line')
  })

  it('draws no weekly strip at deploy 3 (§2.3 S6)', () => {
    const t = text(subjectsLine.render(marketSubjectsFixture(), 'app', ctx))
    for (const w of ['Week by week', 'Read at the same age', 'week of']) expect(t).not.toContain(w)
  })
})

describe('the market page, as a page', () => {
  it('puts only Export in the bar: no How to read pill and no "Market or us?" (§2.3 S8, D5)', () => {
    const page = text(<SubjectsPage data={marketSubjectsFixture()} />)
    expect(page).toContain('Export')
    expect(page).not.toContain('How to read this page')
    expect(page).not.toContain('Market or us?')
  })

  it('draws every block once, in the preview\'s order', () => {
    const page = text(<SubjectsPage data={marketSubjectsFixture()} />)
    const titles = ['YOUR SUBJECTS', 'THIS SUBJECT IN YOUR MARKET', 'WHAT PEOPLE SAY ABOUT LOOKS & STYLE', 'QUESTIONS PEOPLE ASK ON IT', 'VOICES ON LOOKS & STYLE', 'MONTH BY MONTH', 'YOUR OWN POSTS', 'SAY VS HEAR']
    const at = titles.map((t) => page.toUpperCase().indexOf(t))
    expect(at.every((x) => x >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('a page stored before WP2.2 (no market base) still renders its Phase 1 blocks, as sent', () => {
    const t = text(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(t).not.toContain(MARKET_PANE_TITLE)
    expect(t).toContain('Durability')
  })
})
