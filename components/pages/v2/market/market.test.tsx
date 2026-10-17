import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes, copyViolations } from '@/lib/test/copy-contract'
import { fixtureSubjectId, marketFixture, marketLongRowsFixture, marketThinFixture, FIXTURE_WEEKS, OSSUR_WEEK } from '@/lib/pages/v2/market-fixture'
import { OSSUR_SUBJECT_READS } from '@/lib/pages/v2/market-reads-fixture'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { MarketPage, MARKET_FIRST_RUN } from './index'
import { AlsoThisWeek, ALSO_TALKED, MOST_TALKED, NOTHING_ELSE_NEW, NOTHING_NEW, SubjectCardsView, WeekCardView, WEEK_THIN, WEEK_UNREAD } from './analysis'
import { KindsCard, KindsFrame, NumbersRow, PlatformsCard, PlatformsFrame, WeeksCard, weeksLine, WEEKS_UNREAD } from './rail'
import { WEEKS_FAILED } from '@/lib/pages/home'
import { ConversationTable } from './table'
import { TopRowView } from './top'
import { MarketSkeleton } from './skeleton'

// MARKET'S TOP LAYER, RENDERED (analysis first, as pages, 17 Oct; boards
// F2-Market, F2-Market-Phone and F2-Market-States): every block from the
// fixture, against the copy contract (every number a figure or level, every
// level "of N", no direction word outside a verdict node, stored prose with
// its slot, quotes as quote nodes), plus Heinrich's rules for the layer: the
// week's read and each subject's read lead as stored prose, NO FIGURE on a
// subject card in any state, no quote on the top page, "Also this week" with
// the flag's chip alone, and the numbers one layer down.

const WEEK = marketFixture()
const QUIET = marketFixture({ flagged: false })
const MONTH = marketFixture({ period: 'month' })
const TIME = marketFixture({ period: 'time' })
const STATES = marketFixture({ subjects: 'states' })

/** The board words decision 1 retired. */
const RETIRED = /Rising|\busual\b|3×|▲ up\b|busy week|normal range|Against usual/

/** The subject cards' section of a page's markup. */
const subjectsOf = (html: string): string => html.slice(html.indexOf('id="subjects"'), html.indexOf('</section>', html.indexOf('id="subjects"')))

describe('MarketPage', () => {
  it.each([
    ['week, flagged', WEEK], ['week, quiet', QUIET], ['the month', MONTH], ['over time', TIME], ['every card state', STATES],
    ['the thin state', marketThinFixture()], ['reads stored before headlines', marketFixture({ subjectReads: 'v2' })],
    ['Sealand\'s reads', marketFixture({ subjectReads: 'sealand' })], ['no reads yet', marketFixture({ subjectReads: 'none' })],
    ['a thin week', marketFixture({ week: 'thin' })], ['a week that could not be read', marketFixture({ week: 'failed' })],
    ['a read stored before v3', marketFixture({ v1Read: true })], ['the tracked four', marketFixture({ subjects: 'tracked' })],
  ])('%s keeps the copy contract', (_label, data) => {
    expect(copyViolations(<MarketPage data={data} />)).toEqual([])
  })

  it.each([['week', WEEK], ['quiet', QUIET], ['month', MONTH], ['time', TIME], ['states', STATES]])('%s prints none of the board\'s weekly direction words', (_l, data) => {
    expect(renderText(<MarketPage data={data} />)).not.toMatch(RETIRED)
  })

  it('opens on the week: the bar, then the week\'s read, the subjects, what else stood out, then the numbers', () => {
    const html = render(<MarketPage data={WEEK} />)
    const text = renderText(<MarketPage data={WEEK} />)
    expect(text).toMatch(/^Market This week This month Over time 5 to 11 October · 241 videos · 3,912 comments · 318 videos in October so far/)
    expect(html).toMatch(/<a (?=[^>]*href="\/dashboard\/market")(?=[^>]*aria-current="page")[^>]*>This week</)
    const at = (s: string) => html.indexOf(s)
    expect(at('data-week-card="ready"')).toBeGreaterThan(at('data-bar-meta'))
    expect(at('id="subjects"')).toBeGreaterThan(at('data-week-card'))
    expect(at('id="top-row"')).toBeGreaterThan(at('id="subjects"'))
    expect(at('id="numbers"')).toBeGreaterThan(at('id="top-row"'))
    expect(at('id="conversations"')).toBeGreaterThan(at('id="numbers"'))
    expect(text).toContain('What the market is talking about Your six subjects, biggest first')
    expect(text).toContain('Also this week What stood out in this week’s conversations')
    expect(text).toContain('The numbers behind the week Your market’s 241 videos and 3,912 comments this week · 318 in October so far')
  })

  it('leads with written analysis and no number above it: the first figure is in the numbers layer, and no quote anywhere', () => {
    const html = render(<MarketPage data={WEEK} />)
    const meta = html.indexOf('data-bar-meta')
    const firstFigure = html.indexOf('data-copy="figure"', html.indexOf('</p>', meta))
    expect(firstFigure).toBeGreaterThan(html.indexOf('id="numbers"') - 2000)
    expect(firstFigure).toBeGreaterThan(html.indexOf('id="top-row"'))
    expect(html).not.toContain('data-copy="quote"')
    // About 600 words of analysis above the first number (ruling 3).
    const words = renderText(<WeekCardView card={WEEK.weekCard!} />).split(' ').length + renderText(<SubjectCardsView cards={WEEK.subjectCards!} />).split(' ').length
    expect(words).toBeGreaterThan(300)
    expect(words).toBeLessThan(800)
  })

  it('draws the first run as one calm line', () => {
    expect(renderText(<MarketPage data={null} />)).toBe(`Market ${MARKET_FIRST_RUN}`)
  })

  it('says why the month shows when the week has no read yet', () => {
    expect(renderText(<MarketPage data={{ ...MONTH, weekUnavailable: true }} />)).toContain('This week’s read is not ready yet · October so far')
  })
})

describe('the week card', () => {
  it('ready: the week in one line, what it means side by side, and the way into the week\'s page', () => {
    const node = <WeekCardView card={WEEK.weekCard!} />
    const html = render(node)
    expect(renderText(node)).toBe(`This week · 5 to 11 October ${OSSUR_WEEK.line} What it means ${OSSUR_WEEK.means.join(' ')} Read the whole week →`)
    expect(html).toMatch(/<h2 id="week-head" data-copy="stored" data-slot="week_read" class="[^"]*text-\[26px\]/)
    expect(html.match(/data-copy="stored" data-slot="week_read"/g)).toHaveLength(4)
    expect(html).toContain('href="/dashboard/market/week"')
    // Three across from 1180, stacked under it, a hairline between on a phone.
    expect(html).toMatch(/data-week-means="" class="[^"]*min-\[1180px\]:grid-cols-3/)
    // "Read the whole week" stands alone at the foot's left (F2-Market's lone
    // `.cardfoot` child), where a subject card's Open sits at the right.
    expect(html).toMatch(/<div data-card-foot="" class="[^"]*"><a [^>]*href="\/dashboard\/market\/week"/)
    assertCopyContract(node)
  })

  it('thin and failed each say so in one line and open nothing (F2-Market-States)', () => {
    for (const [d, words] of [[marketFixture({ week: 'thin' }), WEEK_THIN], [marketFixture({ week: 'failed' }), WEEK_UNREAD]] as const) {
      const node = <WeekCardView card={d.weekCard!} />
      expect(renderText(node)).toMatch(new RegExp(`^This week( · 5 to 11 October)? ${words}$`))
      expect(render(node)).not.toContain('href=')
      assertCopyContract(node)
    }
  })

  it('a read stored before v3 prints its In short as the line, with no "What it means"', () => {
    const d = marketFixture({ v1Read: true })
    expect(renderText(<WeekCardView card={d.weekCard!} />)).toBe('This week · 5 to 11 October Insurance refusals were the talk of the week, and liners came up all week. Read the whole week →')
  })

  it('is the week\'s alone: no week card on This month or Over time', () => {
    expect(MONTH.weekCard).toBeNull()
    expect(render(<MarketPage data={MONTH} />)).not.toContain('data-week-card')
    expect(render(<MarketPage data={TIME} />)).not.toContain('data-week-card')
  })
})

describe('the subject cards', () => {
  const html = render(<SubjectCardsView cards={WEEK.subjectCards!} />)
  const text = renderText(<SubjectCardsView cards={WEEK.subjectCards!} />)

  it('one card per tracked subject, biggest first by its videos in the month, the thin card in its place', () => {
    expect(WEEK.subjectCards!.map((c) => [c.name, c.state])).toEqual([
      ['Fit & comfort', 'read'], ['Function & movement', 'read'], ['Cost & access', 'read'],
      ['Community & encouragement', 'read'], ['Choosing the right device', 'thin'], ['Look & style', 'read'],
    ])
    expect(html.match(/data-subject-card=/g)).toHaveLength(6)
    // Two to a row from 1180, one below; a row's cards share a height.
    expect(html.match(/data-subject-card="[a-z_]+" class="[^"]*col-span-12[^"]*min-\[1180px\]:col-span-6/g)).toHaveLength(6)
  })

  it('a written card is its name, its headline and what it means, the month words and Open: the real v3 words', () => {
    const fit = OSSUR_SUBJECT_READS.find((r) => r.name === 'Fit & comfort')!
    expect(text).toContain(`Fit & comfort ${fit.headline} ${fit.means} October so far Open →`)
    expect(html).toMatch(/<h3 data-copy="stored" data-slot="week_read" class="[^"]*text-\[20px\]/)
    expect(html).toContain(`href="/dashboard/market/subjects/${fixtureSubjectId('fit')}"`)
    const thin = OSSUR_SUBJECT_READS.find((r) => r.status === 'thin')!
    expect(text).toContain(`Choosing the right device ${thin.saying[0]} October so far Open →`)
    assertCopyContract(<SubjectCardsView cards={WEEK.subjectCards!} />)
  })

  it('prints no figure on any card, in any state', () => {
    for (const d of [WEEK, STATES, marketThinFixture(), marketFixture({ subjects: 'tracked' }), marketFixture({ subjectReads: 'sealand' })]) {
      const cards = subjectsOf(render(<MarketPage data={d} />))
      expect(cards).not.toMatch(/data-copy="(figure|level|verdict)"/)
      expect(renderText(<SubjectCardsView cards={d.subjectCards!} />).replace(/^What the market is talking about Your [a-z]+ subjects(, biggest first)? /, '')).not.toMatch(/\d/)
    }
  })

  it('every state as F2-Market-States draws it, each keeping its frame and its foot', () => {
    const s = renderText(<SubjectCardsView cards={STATES.subjectCards!} />)
    const fit = OSSUR_SUBJECT_READS.find((r) => r.name === 'Fit & comfort')!
    const cost = OSSUR_SUBJECT_READS.find((r) => r.name === 'Cost & access')!
    // (a) ready, with a headline.
    expect(s).toContain(`Fit & comfort ${fit.headline} ${fit.means} October so far Open →`)
    // (b) ready, a read stored before headlines: the name, then what it means.
    expect(s).toContain(`Cost & access ${cost.means} October so far Open →`)
    // (c) thin: code's one line.
    expect(s).toContain('Choosing the right device In October so far, talk about Choosing the right device sat in “Value of a skilled prosthetist”. October so far Open →')
    // (f) ready, no read for the month yet.
    expect(s).toContain('Look & style No read of Look & style in October yet. October so far Open →')
    // (d) not measured yet: its conversations, no read and no figure.
    expect(s).toContain(`Function & movement ${SUBJECT_NOT_MEASURED} Inside it Stairs and slopes Powered knees in daily life Waterproof knees October so far Open →`)
    // (e) failed: why, once a page, then Inside it as an open one (14 Oct).
    expect(s).toContain(`Community & encouragement ${FAILED_EXPLAINED} Inside it Running-blade stories First steps after amputation Support from other amputees October so far Open →`)
    expect(renderText(<MarketPage data={STATES} />).split(FAILED_EXPLAINED).length - 1).toBe(1)
    // The unready after the ready, unranked (U6).
    expect(STATES.subjectCards!.map((c) => c.state)).toEqual(['read', 'read', 'thin', 'no_read', 'failed', 'provisional'])
    assertCopyContract(<SubjectCardsView cards={STATES.subjectCards!} />)
  })

  it('a tenant whose reads are switched off has the no-read line on every ready card', () => {
    const off = marketFixture({ subjectReadsOff: true })
    expect(off.subjectCards!.every((c) => c.state === 'no_read')).toBe(true)
  })

  it('names the subjects in words and says "biggest first" only where some are ranked', () => {
    // Össur's thin state: every check open (and one failed), so none ranked.
    expect(renderText(<SubjectCardsView cards={marketThinFixture().subjectCards!} />)).toMatch(/^What the market is talking about Your seven subjects Choosing the right device/)
    // Every ready one ranked by its videos in the month.
    expect(WEEK.subjectCards!.every((c) => c.ranked)).toBe(true)
    // F2-Market-States: the four with a level lead, ranked (the no-read card
    // too: its words are missing, not its level); the unready follow, unranked.
    expect(STATES.subjectCards!.map((c) => [c.state, c.ranked])).toEqual([['read', true], ['read', true], ['thin', true], ['no_read', true], ['failed', false], ['provisional', false]])
    expect(renderText(<SubjectCardsView cards={STATES.subjectCards!} />)).toMatch(/^What the market is talking about Your six subjects, biggest first Fit & comfort/)
    expect(renderText(<SubjectCardsView cards={[]} />)).toBe('What the market is talking about Your subjects will appear here once they are named in Settings.')
  })
})

describe('Össur on 17 Oct: six written reads, no subject read in October yet', () => {
  // The cards' words are written (a card's state is about its words) but no
  // row has a level, so nothing is ranked: the cards stand in name order and
  // the head claims no order. Until 17 Oct it said "biggest first" off the
  // cards' states, which was false.
  const d = marketFixture({ subjects: 'unread' })

  it('six cards with their reads, none ranked, in name order; "Your six subjects", never "biggest first"', () => {
    expect(d.subjects!.rows.every((r) => r.level == null && r.pending?.state === 'unread')).toBe(true)
    expect(d.subjectCards!.map((c) => [c.name, c.state, c.ranked])).toEqual([
      ['Choosing the right device', 'thin', false], ['Community & encouragement', 'read', false], ['Cost & access', 'read', false],
      ['Fit & comfort', 'read', false], ['Function & movement', 'read', false], ['Look & style', 'read', false],
    ])
    const text = renderText(<SubjectCardsView cards={d.subjectCards!} />)
    expect(text).toMatch(/^What the market is talking about Your six subjects Choosing the right device /)
    expect(text).not.toContain('biggest first')
    assertCopyContract(<SubjectCardsView cards={d.subjectCards!} />)
  })
})

describe('also this week', () => {
  const node = <AlsoThisWeek data={WEEK} />
  const html = render(node)

  it('three small cards: the flag, the week\'s biggest, the new; each an eyebrow, a title and Open to its page', () => {
    expect(renderText(node)).toBe(`Also this week What stood out in this week’s conversations Unusual this week Insurance refusals for powered knees Open → ${MOST_TALKED} How long a liner lasts Open → New this week Waterproof knees Open →`)
    expect(html.match(/data-also=/g)).toHaveLength(3)
    expect(html.match(/href="\/dashboard\/market\/conversations\/[^"]+"/g)).toHaveLength(3)
    expect(html.match(/data-also="[a-z]+" class="[^"]*min-\[1180px\]:col-span-4/g)).toHaveLength(3)
    assertCopyContract(node)
  })

  it('carries the flag\'s chip alone: no "Rising" and no "New" chip (ruling 1)', () => {
    expect(html.match(/data-flag="/g)).toEqual(['data-flag="'])
    expect(html).toContain('data-flag="unusual"')
    expect(html).not.toContain('data-flag="new"')
  })

  it('with no flag, the biggest new conversation leads, then the week\'s biggest, then the rest of the new', () => {
    expect(renderText(<AlsoThisWeek data={QUIET} />)).toBe(`Also this week What stood out in this week’s conversations New this week Waterproof knees Open → ${MOST_TALKED} How long a liner lasts Open → New this week Liner smell and cleaning Open →`)
  })

  it('with nothing new: the week\'s next biggest, "Also talked about", or an earlier week\'s newest', () => {
    const thin = marketThinFixture()
    expect(renderText(<AlsoThisWeek data={thin} />)).toBe(`Also this week What stood out in this week’s conversations ${MOST_TALKED} How long a liner lasts Open → ${ALSO_TALKED} Sweat under the liner Open → ${NOTHING_NEW} Insurance refusals for powered knees ${ALSO_TALKED} Open →`)
    expect(renderText(<AlsoThisWeek data={marketThinFixture({ earlierNew: true })} />)).toContain(`${NOTHING_NEW} Showing it or hiding it First heard the week of 21 Sep Open →`)
    expect(renderText(<AlsoThisWeek data={marketFixture({ flagged: false, noNew: true, flagNew: true })} />)).toContain(NOTHING_ELSE_NEW)
    assertCopyContract(<AlsoThisWeek data={thin} />)
  })

  it('a flag on a kind of comment names the kind and opens nothing (there is no page for a kind)', () => {
    const d = marketFixture({ flagKind: true })
    const t = renderText(<AlsoThisWeek data={d} />)
    expect(t).toMatch(/^Also this week What stood out in this week’s conversations Unusual this week Complained about something Most talked about this week/)
    expect(render(<AlsoThisWeek data={d} />).match(/href=/g)).toHaveLength(2)
  })

  it('is the week\'s alone', () => {
    expect(render(<MarketPage data={MONTH} />)).not.toContain('Also this week')
    expect(render(<MarketPage data={TIME} />)).not.toContain('Also this week')
  })
})

describe('the numbers behind the week', () => {
  it('a row of three side cards above the full-width table, never a rail beside it (ruling 2)', () => {
    const html = render(<NumbersRow data={WEEK} />)
    expect(html.match(/class="col-span-12 flex min-w-0 min-\[1180px\]:col-span-4 \[&amp;&gt;article\]:flex-1"/g)).toHaveLength(3)
    expect(renderText(<NumbersRow data={WEEK} />)).toMatch(/^What people do in the comments .* Videos, week by week .* Where it’s said /)
    assertCopyContract(<NumbersRow data={WEEK} />)
  })

  it('keeps its cards in the thin state: the kinds\' frame, the weekly chart\'s eight empty slots', () => {
    const thin = marketThinFixture()
    const html = render(<NumbersRow data={thin} />)
    expect(html.slice(html.indexOf('id="weeks"'), html.indexOf('id="where"')).match(/data-slot-empty=""/g)).toHaveLength(8)
  })
  it('this week, each platform\'s week sits beside its month', () => {
    const block = { ...WEEK.rail.platforms!, month: { counts: { tiktok: 170, instagram: 98, youtube: 50 }, n: 318, text: 'in October so far' } }
    expect(renderText(<PlatformsCard block={block} data={WEEK} />)).toContain('This week October so far TikTok 128 170 of 318 Instagram 76 98 of 318 YouTube 37 50 of 318')
    assertCopyContract(<PlatformsCard block={block} data={WEEK} />)
  })

  it('kinds: the month so far against last month, a badge only where it moved', () => {
    const block = WEEK.rail.kinds!
    expect(renderText(<KindsCard block={block} />)).toMatch(/^What people do in the comments Share of October so far’s 318 videos where at least one comment did it Asked a question 45%/)
    expect(renderText(<KindsCard block={block} />)).toMatch(/October so far September$/)
    assertCopyContract(<KindsCard block={block} />)
  })

  it('weeks: the Dashboard\'s chart, or "Insufficient data" for too few clean weeks, or the failure where the read failed', () => {
    expect(renderText(<WeeksCard weeks={FIXTURE_WEEKS} />)).toContain('198 205 214 188 230 226 219 241')
    expect(renderText(<WeeksCard weeks={null} />)).toContain('Insufficient data')
    expect(renderText(<WeeksCard weeks={null} />)).not.toContain(WEEKS_UNREAD)
    // Phase 4 fix round: a read that threw is a failure, never an absence.
    expect(renderText(<WeeksCard weeks={WEEKS_FAILED} />)).toContain(WEEKS_UNREAD)
    expect(renderText(<WeeksCard weeks={WEEKS_FAILED} />)).not.toContain('Insufficient data')
    assertCopyContract(<WeeksCard weeks={FIXTURE_WEEKS} />)
    assertCopyContract(<WeeksCard weeks={WEEKS_FAILED} />)
  })

  it('platforms: the week\'s, or the month\'s', () => {
    expect(renderText(<PlatformsCard block={{ ...WEEK.rail.platforms!, month: null }} data={WEEK} />)).toBe('Where it’s said This week’s 241 videos, by platform TikTok 128 Instagram 76 YouTube 37')
    expect(renderText(<PlatformsCard block={MONTH.rail.platforms!} data={MONTH} />)).toContain('The 318 videos in October so far, by platform')
    assertCopyContract(<PlatformsCard block={WEEK.rail.platforms!} data={WEEK} />)
  })

  it('weeks: one set of words for the chart\'s line', () => {
    const c = (videos: number | null, settled = true) => ({ videos, settled })
    expect(weeksLine(null)).toBe('Insufficient data: only weeks read the same way are drawn.')
    expect(weeksLine([c(null), c(null)])).toBe('Insufficient data: only weeks read the same way are drawn.')
    expect(weeksLine([c(null), c(5)])).toBe('Only weeks read the same way are drawn.')
    expect(weeksLine([c(null), c(5, false)])).toBe('Only weeks read the same way are drawn; the newest are still filling.')
    expect(weeksLine([c(4), c(5, false)])).toBe('The newest weeks are still filling.')
    expect(weeksLine([c(4), c(5)])).toBeNull()
    expect(weeksLine(null, true)).toBe(WEEKS_UNREAD)
  })

  it('weeks: with no week to draw, the eight weeks\' axis with empty slots and one line', () => {
    const axis = FIXTURE_WEEKS.columns.map((c) => c.label)
    for (const weeks of [null, WEEKS_FAILED] as const) {
      const html = render(<WeeksCard weeks={weeks} axis={axis} />)
      expect(html.match(/data-slot-empty=""/g)).toHaveLength(8)
      expect(renderText(<WeeksCard weeks={weeks} axis={axis} />)).toMatch(/17 Aug 7 Sep 5 Oct/)
      assertCopyContract(<WeeksCard weeks={weeks} axis={axis} />)
    }
    // A drawn chart with a week our rules leave out: its slot, and why.
    const gap = { ...FIXTURE_WEEKS, columns: FIXTURE_WEEKS.columns.map((c, i) => (i < 2 ? { ...c, videos: null, comments: null } : c)) }
    expect(render(<WeeksCard weeks={gap} />).match(/data-slot-empty=""/g)).toHaveLength(2)
    expect(renderText(<WeeksCard weeks={gap} />)).toContain('Only weeks read the same way are drawn; the newest are still filling.')
  })

  it('kinds and platforms keep their cards with nothing read', () => {
    expect(renderText(<KindsFrame noun={null} monthText="October so far" />)).toBe('What people do in the comments Share of October so far’s videos where at least one comment did it Asked a question Praised it Complained about something Wished for something Said they want to buy Pushed back Not read for October so far yet.')
    expect(renderText(<PlatformsFrame data={WEEK} />)).toContain('Where it’s said This week’s videos, by platform No video counted by platform yet.')
    assertCopyContract(<KindsFrame noun="bags" monthText="October so far" />)
    assertCopyContract(<PlatformsFrame data={WEEK} />)
  })
})


describe('this month and over time (not drawn by a board)', () => {
  it('this month: the subject cards lead under the bar, then the month\'s numbers: its three biggest, the side cards, the table', () => {
    const html = render(<MarketPage data={MONTH} />)
    const text = renderText(<MarketPage data={MONTH} />)
    expect(text).toMatch(/^Market This week This month Over time October so far · 318 videos · 5,840 comments This week This month Over time What the market is talking about Your six subjects, biggest first Fit & comfort/)
    expect(text).toContain('The numbers behind the month Your market’s 318 videos and 5,840 comments in October so far Most talked about in October so far')
    expect(html.indexOf('id="top-row"')).toBeGreaterThan(html.indexOf('id="subjects"'))
    expect(html.indexOf('id="numbers"')).toBeGreaterThan(html.indexOf('id="top-row"'))
    expect(html).toContain(`href="/dashboard/market/subjects/${fixtureSubjectId('fit')}?period=month"`)
  })

  it('the month ends with its long-run read, below everything', () => {
    const d = marketFixture({ period: 'month', closed: true, longRun: 'full' })
    const html = render(<MarketPage data={d} />)
    expect(html.indexOf('id="long-run"')).toBeGreaterThan(html.indexOf('id="conversations"'))
  })

  it('over time: the subject cards, then the market\'s months, the side cards and the table', () => {
    const text = renderText(<MarketPage data={TIME} />)
    expect(text).toContain('The numbers over time Month by month, to October so far Your market, month by month')
  })
})

describe('TopRowView (the month\'s numbers)', () => {
  it('the month leads with its three biggest and their month bars, each "k of n"', () => {
    const text = renderText(<TopRowView data={MONTH} />)
    expect(text).toMatch(/^Most talked about in October so far How long a liner lasts 35 of 300 category videos in October so far/)
    assertCopyContract(<TopRowView data={MONTH} />)
  })

  it('over time draws the market\'s months', () => {
    expect(renderText(<TopRowView data={TIME} />)).toContain('Your market, month by month')
  })

  it('draws nothing with nothing to lead with', () => {
    expect(render(<TopRowView data={{ ...MONTH, top: { hero: null, sides: [], months: null } }} />)).toBe('')
  })
})

describe('ConversationTable', () => {
  it('this week: the week and the month, who it is about, subject filters, show all', () => {
    const text = renderText(<ConversationTable table={WEEK.table!} data={WEEK} />)
    expect(text).toMatch(/^Every conversation this week 17 conversations, biggest first, each counted in the category’s videos \( 226 this week\) All 17 Fit & comfort 4/)
    // The table from 640; the phone's two-line list beside it (each shown at
    // its width only).
    expect(text).toContain('Conversation Subject About This week October so far How long a liner lasts Fit & comfort Össur 4 · others 19 23 35')
    expect(text).toContain('Insurance refusals for powered knees Cost & access Össur 3 · Ottobock 5 · others 11 19 31')
    expect(text).toContain('How long a liner lasts 23 Fit & comfort 35 in October so far')
    expect(text).toMatch(/Show all 17$/)
    expect(render(<ConversationTable table={WEEK.table!} data={WEEK} />)).toContain('href="/dashboard/market?all=1#conversations"')
    assertCopyContract(<ConversationTable table={WEEK.table!} data={WEEK} />)
  })

  // The fresh check (17 Oct): "Össur 4others 19" on every About cell. A flex
  // row drops the spaces between its items, so the row carries the boards'
  // 6px itself, on the table, a subject's page and a conversation's alike.
  it('About keeps the boards\' gap between its chips and before "others"', () => {
    const html = render(<ConversationTable table={WEEK.table!} data={WEEK} />)
    const abouts = html.match(/<span data-about="" class="[^"]*"/g) ?? []
    expect(abouts.length).toBeGreaterThan(0)
    for (const a of abouts) expect(a).toMatch(/\binline-flex\b[^"]*\bgap-x-1\.5\b/)
  })

  it('U6: filtered to a subject whose check is open, the table prints no total and Show all no number', () => {
    const held = { ...WEEK.table!, totalHeld: true }
    const text = renderText(<ConversationTable table={held} data={WEEK} />)
    expect(text).toMatch(/^Every conversation this week Conversations, biggest first/)
    expect(text).toMatch(/Show all$/)
    assertCopyContract(<ConversationTable table={held} data={WEEK} />)
  })

  // F2-Market-Phone (ruling 4): on a phone the table is a two-line list, the
  // name and its videos, then its subject and the month beside the week; no
  // About chips. Checked at 390 on the long-label fixture by
  // scripts/pages-shots.ts (measure-390.json).
  it('on a phone, a two-line list: name and videos, then subject and the month, with long labels and three-digit figures', () => {
    const d = marketLongRowsFixture()
    const html = render(<ConversationTable table={d.table!} data={d} />)
    expect(html).toMatch(/<div class="max-sm:hidden"><table/)
    expect(html).toMatch(/<div class="flex flex-col sm:hidden"><div data-phone-row=""/)
    const phone = html.slice(html.indexOf('data-phone-row'))
    expect(phone).toMatch(/>123<\/span><\/span><span class="col-span-2 flex[^"]*"><span class="min-w-0">[^<]*<\/span><span class="shrink-0 whitespace-nowrap"><span data-copy="figure" class="font-mono">456<\/span> in October so far/)
    expect(phone.slice(0, phone.indexOf('</div>'))).not.toContain('Össur')
    expect(renderText(<ConversationTable table={d.table!} data={d} />)).toContain('Whether the forty litre travel backpack really fits under the seat on budget airlines across Europe')
    assertCopyContract(<ConversationTable table={d.table!} data={d} />)
  })

  it('marks a conversation set apart (makers\' own posts), which stays in the list', () => {
    const rows = WEEK.table!.rows.map((r, i) => (i === 0 ? { ...r, conv: { ...r.conv, setApart: 'makers' as const } } : r))
    const text = renderText(<ConversationTable table={{ ...WEEK.table!, rows }} data={WEEK} />)
    expect(text).toContain('How long a liner lasts mostly makers’ own posts Fit & comfort')
  })

  it('this month: the month against the month before, through the badge', () => {
    const text = renderText(<ConversationTable table={MONTH.table!} data={MONTH} />)
    expect(text).toContain('Videos Against September')
    assertCopyContract(<ConversationTable table={MONTH.table!} data={MONTH} />)
  })

  it('over time: the months as columns, each with its n', () => {
    const text = renderText(<ConversationTable table={TIME.table!} data={TIME} />)
    expect(text).toContain('Conversation Subject Jul of 455 Aug of 612 Sep of 780 Oct so far of 300 How long a liner lasts Fit & comfort 16 21 32 35')
    assertCopyContract(<ConversationTable table={TIME.table!} data={TIME} />)
  })
})


describe('brands not counted yet (Össur before its back-read)', () => {
  const NC = marketFixture({ brands: 'not_counted' })
  it('prints no "about" split anywhere, and says once why, in the table\'s About header', () => {
    const text = renderText(<MarketPage data={NC} />)
    expect(text).not.toContain('no brand named')
    expect(text).not.toMatch(/About Össur/)
    expect(renderText(<ConversationTable table={NC.table!} data={NC} />)).toContain('Conversation Subject About · brands not counted yet This week October so far')
    assertCopyContract(<MarketPage data={NC} />)
  })
})

describe('a tracked subject is never hidden (14 Oct)', () => {
  const TRACKED = marketFixture({ subjects: 'tracked' })

  it('a card for every subject: the ready, the thin, the open and the failed, the unready after the ready', () => {
    expect(TRACKED.subjectCards!.map((c) => [c.name, c.state])).toEqual([
      ['Fit & comfort', 'read'], ['Look & style', 'read'], ['Community & encouragement', 'failed'], ['Cost & access', 'provisional'],
    ])
  })

  it('the table names the failed subject on its conversations and gives its chip no count, as an open one\'s', () => {
    const node = <ConversationTable table={TRACKED.table!} data={TRACKED} />
    expect(TRACKED.table!.filters.map((f) => [f.name, f.count])).toEqual([
      ['All', 17], ['Fit & comfort', 4], ['Look & style', 2], ['Community & encouragement', null], ['Cost & access', null],
    ])
    expect(renderText(node)).toContain('Running-blade stories Community & encouragement')
    assertCopyContract(node)
  })
})

describe('MarketSkeleton', () => {
  it('says it is loading, in the page\'s new shape', () => {
    const html = render(<MarketSkeleton />)
    expect(html).toMatch(/role="status"/)
    expect(html.match(/min-\[1180px\]:col-span-6/g)).toHaveLength(4)
  })
})

// The level-1 rule as it now stands (16 Oct): stored prose leads, no quote,
// no figure inside a written node.
describe('the top layer\'s nodes', () => {
  it('every written node is stored prose with the week_read slot, and none holds a digit', () => {
    const nodes = copyNodes(render(<MarketPage data={WEEK} />)).filter((n) => n.kind === 'stored')
    expect(nodes.length).toBe(4 + 12 - 1)
    for (const n of nodes) {
      expect(n.slot).toBe('week_read')
      expect(n.text).not.toMatch(/\d/)
    }
  })
})
