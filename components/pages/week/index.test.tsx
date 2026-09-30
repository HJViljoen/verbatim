import { isValidElement } from 'react'
import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { surface } from '@/lib/nav'
import { BlockFrame } from '@/components/blocks/frame'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import { FIRST_SCREEN_BUDGET, type WeekData } from '@/lib/pages/week'
import { unreadWords } from '@/lib/subjects/read-in'
import { FIRST_SCREEN, WEEK_BLOCKS, WEEK_RETIRED_BLOCKS, WeekPage, weekContext, weekFigureCount } from '.'
import { weekSubjects } from './subjects'
import { weekRising } from './rising'
import { weekCameIn } from './came-in'
import { heardLead, weekHeard } from './heard'
import { brandsPostedOrder, topOwnPost, weekRivalPosts } from './rival-posts'
import { repliesSection, replyRowsFor, weekReply } from './reply'
import { weekFlagged } from './flagged'
import { weekSales } from './sales'
import { weekWorked, workedOrder, WORKED_FLOOR } from './worked'
import { weekCoverage } from './coverage'
import { baselineMeter, unusualLine, weekChecks } from './checks'
import { weekPage } from './module'
import { absentReadingFixture, marketWeekFixture, ossurWeeksFixture, regroupedFixture, thinFixture, weekFixture } from './fixture'
import { weekWeeks } from './weeks'

const MODES: RenderMode[] = ['app', 'print', 'email']
/** `renderText` puts a space at every element edge; a reader sees none before
 *  a comma or a closing mark, or after an opening one. */
const flat = (t: string): string => t.replace(/\s+([,.)”:])/g, '$1').replace(/([(“])\s+/g, '$1')
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
// THREE, and the third is what production renders today: M3 is not applied on
// either tenant, so every figure off the windowed read is absent. A port
// designed against the first two alone builds columns that render nothing on
// both paying accounts.
// And a fourth since market-first WP1.9: an update that opened a new
// clustering regime, whose minted identities are counted as re-grouped.
// And a fifth since market-first WP2.7: Sealand's 20 Sep update with its
// subjects read on the market.
const FIXTURES: (() => WeekData)[] = [weekFixture, thinFixture, absentReadingFixture, regroupedFixture, marketWeekFixture, ossurWeeksFixture]

describe('every block on This week', () => {
  it('renders in all three modes on both tenants and keeps the copy contract', () => {
    for (const fixture of FIXTURES) {
      for (const block of WEEK_BLOCKS) {
        for (const mode of MODES) {
          assertCopyContract(render(block.render(fixture(), mode, ctx)))
        }
      }
    }
  })

  it('is email-safe: tables, no classes, no CSS variables', () => {
    for (const block of WEEK_BLOCKS) {
      const markup = render(block.render(weekFixture(), 'email', ctx))
      expect(markup, block.key).toContain('<table')
      expect(markup, block.key).not.toContain('class=')
      expect(markup, block.key).not.toContain('var(--')
    }
  })

  it('answers with a sentence wherever it has nothing, and never with a hole', () => {
    // Every empty state is a STRING computed without rendering, so a page, a
    // slide and an email word one emptiness one way.
    for (const block of WEEK_BLOCKS) {
      for (const fixture of FIXTURES) {
        const empty = block.emptyState(fixture())
        expect(empty === null || (typeof empty === 'string' && empty.length > 20), `${block.key}`).toBe(true)
      }
    }
  })

  it('never says one number two different ways', () => {
    for (const fixture of FIXTURES) {
      const data = fixture()
      expect(figureConflicts(WEEK_BLOCKS.map((b) => b.figures?.(data) ?? {}))).toEqual([])
    }
  })

  it('keeps the first screen inside its twelve-number budget', () => {
    // The preview's first screen is the page bar and "With this update".
    // Counted over figure tables, not rendered digits: the same figure named
    // twice is one number to a reader.
    for (const fixture of FIXTURES) {
      expect(weekFigureCount(fixture(), FIRST_SCREEN)).toBeLessThanOrEqual(FIRST_SCREEN_BUDGET)
    }
    // Seven on Sealand's 20 Sep update: the market's videos and comments, each
    // part's two, and the month's videos.
    expect(weekFigureCount(marketWeekFixture(), FIRST_SCREEN)).toBe(7)
  })
})

/** HYPOTHETICAL: Sealand's weeks with no change on the axis and every video
 *  checked. On its own rows the bars would span our search changes and the
 *  relevance check, and the weeks gathered hold videos let in before the
 *  check, so no week is left and Week by week is omitted (T0a, mechanism 3). */
function cleanWeekFixture(): WeekData {
  const d = marketWeekFixture()
  return { ...d, weeks: { ...d.weeks!, rules: [], weeks: d.weeks!.weeks.map((w) => ({ ...w, unchecked: 0 })) } }
}

describe('week by week (market-first WP2.9, week.weeks)', () => {
  it('is omitted where no week is left one way since our latest change (T0a, mechanism 3)', () => {
    for (const mode of MODES) expect(weekWeeks.render(marketWeekFixture(), mode, ctx), mode).toBeNull()
    expect(weekWeeks.figures!(marketWeekFixture())).toEqual({})
  })

  it('draws the market’s videos and comments for each week, as counts, with its facts panel', () => {
    for (const mode of MODES) {
      const t = renderText(weekWeeks.render(cleanWeekFixture(), mode, ctx))
      for (const n of ['244', '226', '187', '229', '404', '318', '5,809', '7,851', '5,462']) expect(t).toContain(n)
      expect(t).not.toMatch(/%|▲|▼/)
    }
    const app = renderText(weekWeeks.render(cleanWeekFixture(), 'app', ctx))
    // The preview's panel: the latest week no longer so far.
    expect(app).toContain('Week of 7 Sep')
    expect(app).toContain('of them 389 in the category and 15 filed under a brand you track')
    expect(app).toContain('all dated in September')
    expect(app).toContain('filling')
    expect(app).toContain('so far')
    // T0a: no "Our changes" row, and no week with nothing gathered.
    expect(app).not.toContain('Our changes')
    expect(app).not.toContain('none gathered')
  })

  it('is headed by its title alone and footed by links alone, one of them to the same-age reading', () => {
    const el = weekWeeks.render(cleanWeekFixture(), 'app', ctx) as { props: { title: string; meta?: unknown; footerNote?: unknown } }
    expect(el.props.title).toBe('Week by week')
    expect(el.props.meta).toBeUndefined()
    expect(el.props.footerNote).toBeUndefined()
    const t = renderText(weekWeeks.render(cleanWeekFixture(), 'app', ctx))
    expect(t).toContain('How to read: Week by week →')
    expect(t).toContain('Read at the same age, on Your market →')
    // No same-age reading to link to where the tenant keeps none (Össur).
    expect(renderText(weekWeeks.render(ossurWeeksFixture(), 'app', ctx))).not.toContain('Read at the same age')
  })

  it('says so, rather than drawing an empty chart, where nothing is counted', () => {
    expect(weekWeeks.emptyState(weekFixture())).toBe('Week by week is not counted for this update yet.')
    const d = marketWeekFixture()
    const none = { ...d, weeks: { ...d.weeks!, weeks: d.weeks!.weeks.map((w) => ({ ...w, state: 'none_gathered' as const, videos: 0, comments: 0 })) } }
    expect(weekWeeks.emptyState(none)).toBe('No week has comments yet.')
    expect(renderText(weekWeeks.render(none, 'app', ctx))).toContain('No week has comments yet.')
  })

  it('declares the counts it draws, one token a week and a row', () => {
    const f = weekWeeks.figures!(cleanWeekFixture())
    expect(f.week_2026_09_07_videos.value).toBe(404)
    expect(f.week_2026_09_07_comments.value).toBe(7851)
    expect(f.week_2026_07_27_videos).toBeUndefined()
  })
})

describe('WK §2 · your market’s subjects (market-first WP2.7)', () => {
  it('prints each subject on the market, with what this update put in, and never "0 of 0"', () => {
    for (const mode of MODES) {
      const text = renderText(weekSubjects.render(marketWeekFixture(), mode, ctx))
      // Staging, 20 Sep update: Looks & style 103 of the market's 654 (102 in
      // the category, 1 filed under Freitag), 73 of them carried by this
      // update's days; Comfort 43 and 28.
      expect(text).toContain('Looks & style')
      expect(text).toContain('103')
      expect(text).toContain('16%')
      expect(text).toContain('+73')
      expect(text).toContain('+28')
      expect(text).toContain('of 654')
      expect(text).not.toMatch(/0 of 0/)
      expect(text).not.toContain('this update added')
    }
  })

  // T0a (WK-26; ruling U6): a subject that is not ready is its name alone.
  it('names a failed subject and a provisional one the month was not read for, with no figure and no word', () => {
    for (const mode of MODES) {
      const text = renderText(weekSubjects.render(marketWeekFixture(), mode, ctx))
      expect(text).toMatch(/Repair & warranty\s*Community & purpose/)
      expect(text).not.toContain('being re-described')
      expect(text).not.toContain('no reading yet')
      // Repair & warranty's 36 market videos and Community & purpose's window
      // rows print nowhere.
      expect(text).not.toContain('36')
      expect(text).not.toContain('+8')
    }
  })

  it('is headed by its title alone and footed by a link alone (25 Sep rulings)', () => {
    const el = weekSubjects.render(marketWeekFixture(), 'app', ctx) as { props: { title: string; meta?: unknown; footerNote?: unknown; question?: unknown } }
    expect(el.props.title).toBe('Your market’s subjects')
    expect(el.props.meta).toBeUndefined()
    expect(el.props.footerNote).toBeUndefined()
    expect(el.props.question).toBeUndefined()
    expect(renderText(weekSubjects.render(marketWeekFixture(), 'app', ctx))).toContain('Open Subjects →')
  })

  it('ranks by the market’s videos, largest first', () => {
    const text = renderText(weekSubjects.render(marketWeekFixture(), 'app', ctx))
    const order = ['Looks & style', 'Comfort', 'Durability', 'Waterproofing', 'Price'].map((l) => text.indexOf(l))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('declares the market’s counts as its figures, one per number it prints', () => {
    const figures = weekSubjects.figures!(marketWeekFixture())
    const looks = Object.entries(figures).filter(([k]) => k.startsWith('subject_723d1389'))
    expect(looks.map(([, f]) => f.value).sort((a, b) => a - b)).toEqual([73, 103])
    expect(Object.values(figures).some((f) => f.value === 36)).toBe(false)
  })
})

describe('WK §2 · this week in your subjects', () => {
  it('prints a level with its denominator and this update’s own contribution', () => {
    const text = renderText(weekSubjects.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Comfort')
    expect(text).toContain('31 of 96 videos')
    expect(text).toContain('+8 this update')
    expect(text).toContain('September so far')
  })

  it('leads with how many subjects ran above typical, k of n, with the basis', () => {
    for (const mode of MODES) {
      const text = renderText(weekSubjects.render(weekFixture(), mode, ctx))
      // The mock says "Three of the six ran above a typical week". "A typical
      // week" is refused — there is no weekly series to be typical of — and
      // what survives is the count, its denominator, the names and the basis.
      expect(text, mode).toContain('2 of your 3 subjects ran above typical in this update')
      expect(text, mode).toContain('Comfort and Price and cover')
      expect(text, mode).toContain('ran above typical in this update:')
      expect(text, mode).not.toContain('typical week')
    }
  })

  it('leads with nothing where no subject could be compared', () => {
    // "0 of 0 ran above typical" would be a sentence counting comparisons
    // nobody drew.
    const text = renderText(weekSubjects.render(thinFixture(), 'app', ctx))
    expect(text).not.toContain('ran above typical')
    expect(text).toContain('No subjects are recorded for this workspace yet')
  })

  it('draws the mock’s strip with the typical bar it can actually measure', () => {
    // The artboard's column is `31 this week` over a bar pair against "typical
    // week 22". D6 refuses the leading week figure and there is no per-week
    // history to be typical of, so the column leads with the MONTH and its
    // "of N", and the pair beneath is this update's contribution against
    // `typicalContribution` — both sides counted, neither modelled.
    const text = renderText(weekSubjects.render(weekFixture(), 'app', ctx))
    expect(text).toContain('31 this month')
    expect(text).toContain('31 of 96 videos')
    expect(text).toContain('+8 this update · usually 5')
    expect(text).toContain('above typical')
    expect(text).not.toContain('typical week')
    // And the legend says what the second bar IS, rather than naming a week.
    expect(text).toContain('what an update of its size usually adds')
  })

  it('claims no verdict exemption for the typical tag or the contribution', () => {
    // Code review C7. Both were `data-copy="verdict"` — the contract's node
    // for words a `Verdict` computed, and the one node rule (c) never checks —
    // and neither is one: `typicalTag` is three fixed words against a level,
    // the contribution is a count. Unmarked they are CHECKED, and they pass.
    for (const mode of MODES) {
      const markup = render(weekSubjects.render(weekFixture(), mode, ctx))
      expect(markupText(markup), mode).toContain('above typical')
      expect(markup, mode).not.toContain('data-copy="verdict"')
      assertCopyContract(markup)
    }
  })

  it('names when the subjects were named, and calls it naming', () => {
    // D14: `named_at` is the day somebody typed the subject into Settings —
    // not the day the conversation about it began, which is what "tracking
    // since" would claim.
    const text = renderText(weekSubjects.render(weekFixture(), 'app', ctx))
    expect(text).toContain('3 subjects named 19 Aug')
    expect(text).not.toContain('since 19 Aug')
  })

  it('draws every subject bar on ONE scale across the strip', () => {
    // REVIEW W2. `top` was per column, so six bars of one unit under one
    // shared legend sat on six scales: 8 added and 2.77 "usually" drew the
    // same length, and 1 added drew longer than half of 4.5. The denominator
    // is the strip's own tallest bar, over both series.
    const d = weekFixture()
    const rows = d.subjects.rows.map((r, i) => ({ ...r, addedVideos: i === 0 ? 8 : 1, typical: i === 0 ? 4 : 2 }))
    const markup = render(weekSubjects.render({ ...d, subjects: { ...d.subjects, rows } }, 'app', ctx))
    const widths = [...markup.matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]))
    // The tallest bar is the first column's 8; every other length is its own
    // value over that same 8 — 50%, 12.5%, 25% — and never over its own column.
    expect(widths).toContain(100)
    expect(widths).toContain(50)
    expect(widths).toContain(12.5)
    expect(widths).toContain(25)
    expect(markupText(markup)).not.toContain('every bar on one scale')
  })

  it('says subjects are not recorded rather than drawing an empty table', () => {
    const text = renderText(weekSubjects.render(thinFixture(), 'app', ctx))
    expect(text).toContain('No subjects are recorded for this workspace yet')
    expect(text).not.toContain('0 of 0')
  })
})

describe('WK §3 · moving now', () => {
  it('prints the month-to-date level with the trailing baseline beside it', () => {
    const text = renderText(weekRising.render(weekFixture(), 'app', ctx))
    // The label leads the column and the level sits under the figure, which
    // is the artboard's own column order; both are still on the row.
    expect(text).toContain('Socket comfort after a long day')
    expect(text).toContain('44 of 398 category videos in September')
    expect(text).toContain('against 5.0% across the three months behind it')
    expect(text).toContain('18 of them arrived with this update')
  })

  it('takes the whole tile with one riser, and the mock’s columns with three', () => {
    // Design review F12. `TileColumns of={3}` was unconditional, so the one
    // riser both paying tenants have today took a third of a full-width tile
    // with 700px of white beside it. The sibling block on this page already
    // picks its column count from its rows.
    const one = weekFixture()
    expect(one.rising.rows).toHaveLength(1)
    expect(render(weekRising.render(one, 'app', ctx))).not.toContain('xl:grid-cols-3')
    const three = { ...one, rising: { ...one.rising, rows: [0, 1, 2].map((i) => ({ ...one.rising.rows[0], id: `r${i}` })) } }
    expect(render(weekRising.render(three, 'app', ctx))).toContain('xl:grid-cols-3')
    const two = { ...one, rising: { ...one.rising, rows: [0, 1].map((i) => ({ ...one.rising.rows[0], id: `r${i}` })) } }
    expect(render(weekRising.render(two, 'app', ctx))).toContain('xl:grid-cols-2')
  })

  it('draws three across and leads each column with the month', () => {
    // The artboard's column leads "34 videos this week" and puts the month
    // second; D6 refuses a week alone, so the figure is the month's and the
    // update's contribution is stated under it.
    const text = renderText(weekRising.render(weekFixture(), 'app', ctx))
    expect(text).toContain('44 videos this month')
    expect(text).toContain('18 of them arrived with this update')
    expect(text).not.toContain('videos this week')
    // No "growing, 3rd month" chip: one banded comparison cannot earn one, and
    // `voice.movers` is false.
    expect(text).not.toContain('3rd month')
    expect(text).not.toContain('2nd month')
  })

  it('carries the quotes that make it a make-this prompt', () => {
    const text = renderText(weekRising.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Third socket this year and the first one I can wear all day')
    expect(blockAnswers(weekRising, weekFixture()).quotes).toHaveLength(1)
  })

  it('every direction word it prints comes from a verdict', () => {
    // The verdicts a block declares are the only place rule (c) allows one, and
    // this block declares exactly the comparisons it drew.
    const verdicts = blockAnswers(weekRising, weekFixture()).verdicts
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0].state).toBe('moved')
    assertCopyContract(render(weekRising.render(weekFixture(), 'app', ctx)))
  })

  it('claims nothing about a theme it never banded', () => {
    // The note is a statement about the themes NOT printed, so it names how
    // many were compared. With more movers than rows it says how many cleared.
    const text = renderText(weekRising.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Nothing else of the 30 themes moved clearly this month.')

    const d = weekFixture()
    const many = { ...d, rising: { ...d.rising, moved: 7 } }
    expect(renderText(weekRising.render(many, 'app', ctx)))
      // "with a larger share", because `moved` counts only the risers: a theme
      // that cleared its band downward did clear it and is not in this number.
      .toContain('1 of 7 with a larger share shown, the largest first')
  })

  it('says the pooled baseline counts a video once per month', () => {
    // One month against three summed: the baseline is video-months, not
    // distinct videos, and this is the shape anomaly.ts's own note says moves
    // the balance. Sealand's category reads 449 video-months against 446
    // distinct videos on production today.
    const text = renderText(weekRising.render(weekFixture(), 'app', ctx))
    // In the footer's own mono slot since the artboard port: it is a fact
    // about the comparison's arithmetic, not a finding.
    // Moved to Settings › How to read (copy de-clutter C40).
    expect(text).not.toContain('the three months behind are added together')

    // AND NOT PRINTED WHEN THE BASELINE IS A WINDOW. `QuarterChangeInput`
    // forbids summing month rows for a banded n; §3 does it only while M3's
    // window functions are unapplied, and the note is the disclosure of that.
    // Once the window read answers, the sentence is false of the reading.
    const windowed = weekFixture()
    windowed.rising.pooledBaseline = false
    expect(renderText(weekRising.render(windowed, 'app', ctx)))
      .not.toContain('added together')
  })

  it('refuses rather than printing "of 0 category videos"', () => {
    const d = weekFixture()
    const data = { ...d, rising: { ...d.rising, rows: [], monthOf: 0, moved: 0, pooled: 0, unread: 'This month’s category conversation has not been counted for this workspace yet, so there is nothing for a theme to be a share of.' } }
    const text = renderText(weekRising.render(data, 'app', ctx))
    expect(text).toContain('has not been counted for this workspace yet')
    expect(text).not.toContain('Nothing moved clearly')
  })

  it('says "nothing moved clearly", which is a reading and not a refusal', () => {
    const text = renderText(weekRising.render(thinFixture(), 'app', ctx))
    expect(text).toContain('Nothing moved clearly in September’s reading so far')
  })
})

// ---- market-first WP3.7: This week on the approved preview ---------------------

describe('With this update (market-first WP3.7, week.came-in)', () => {
  it('says what the update brought into the market’s month, and hands it back to the month', () => {
    for (const mode of MODES) {
      const text = renderText(weekCameIn.render(marketWeekFixture(), mode, ctx))
      expect(text, mode).toContain('The 20 Sep update brought 436 videos and 9,471 comments into your market’s September.')
      expect(text, mode).toContain('That is 436 of the 654 videos September holds so far, after 3 updates.')
      expect(text, mode).toContain('2 themes were heard for the first time with 10 or more videos this month, and 12 comments are worth a reply.')
    }
  })

  it('draws the came-in table by part of the market, your own posts left out (decision E)', () => {
    const text = renderText(weekCameIn.render(marketWeekFixture(), 'app', ctx))
    expect(text).toContain('Came in with it Videos Comments The category 421 9,271 Brands you track 15 200 Your market 436 9,471')
    expect(text).not.toContain('Your own brand')
  })

  it('carries its title alone, a link alone in its footer, and no footnote (25 Sep rulings)', () => {
    const el = weekCameIn.render(marketWeekFixture(), 'app', ctx) as { props: { title: string; meta?: unknown; footerNote?: unknown } }
    expect(el.props.title).toBe('With this update')
    expect(el.props.meta).toBeUndefined()
    expect(el.props.footerNote).toBeUndefined()
    expect(renderText(weekCameIn.render(marketWeekFixture(), 'app', ctx))).toContain('Open Your market →')
  })

  it('points at the tiles that hold what it counts, on screen only', () => {
    const markup = render(weekCameIn.render(cleanWeekFixture(), 'app', ctx))
    expect(markup).toContain('href="#week-by-week"')
    // No link to a tile that is omitted (T0a, mechanism 3).
    expect(render(weekCameIn.render(marketWeekFixture(), 'app', ctx))).not.toContain('href="#week-by-week"')
    expect(markup).toContain('href="#heard-for-the-first-time"')
    expect(markup).toContain('href="#worth-a-reply"')
    expect(render(weekCameIn.render(marketWeekFixture(), 'print', ctx))).not.toContain('href="#')
  })

  it('declares its counts once, and nothing it did not count', () => {
    const f = blockAnswers(weekCameIn, marketWeekFixture()).figures
    expect(f.came_in_market_videos.value).toBe(436)
    expect(f.came_in_market_comments.value).toBe(9471)
    expect(f.came_in_brands_videos.value).toBe(15)
    expect(f.came_in_month_videos.value).toBe(654)
  })

  it('says it is not counted where the window read is not there, and never prints a zero', () => {
    for (const mode of MODES) {
      const text = renderText(weekCameIn.render(weekFixture(), mode, ctx))
      expect(text).toContain('What this update brought into your market is not counted here yet.')
    }
    expect(weekCameIn.emptyState({ ...weekFixture(), cameIn: { ...weekFixture().cameIn, window: null } })).toContain('covered no window')
  })

  it('says "holds" once the month has ended, never "so far"', () => {
    const d = marketWeekFixture()
    const ended: WeekData = { ...d, readingAt: '2026-10-02T06:00:00.000Z', cameIn: { ...d.cameIn, market: { ...d.cameIn.market!, ended: true } } }
    const text = renderText(weekCameIn.render(ended, 'app', ctx))
    expect(text).toContain('September holds, after 3 updates.')
    expect(text).toContain('in September')
    expect(text).not.toContain('so far')
  })

  it('an update that re-grouped the themes counts them as re-grouped, never as heard for the first time (WP1.9)', () => {
    const d = marketWeekFixture()
    const regrouped: WeekData = { ...d, heard: { ...d.heard!, seen: 0, rows: [], regrouped: { update: '2026-09-10T07:17:02.291Z', themes: 592 } } }
    const text = renderText(weekCameIn.render(regrouped, 'app', ctx))
    expect(text).toContain('Re-grouped with the 10 Sep update: 592 themes.')
    expect(text).not.toMatch(/\d+ heard for the first time/)
  })
})

describe('Your market’s subjects carry their maker share (market-first WP3.7)', () => {
  it('tags a subject a fifth or more makers’, as the front page and the Subjects rail do', () => {
    for (const mode of MODES) {
      const text = renderText(weekSubjects.render(marketWeekFixture(), mode, ctx))
      expect(text).toContain('Looks & style about a third makers')
      expect(text).toContain('Durability about a quarter makers')
      expect(text).toContain('Comfort 43')
    }
  })
})

describe('Heard for the first time (market-first WP3.7, week.heard)', () => {
  it('leads with how many of the themes first heard reached the floor, one denominator', () => {
    for (const mode of MODES) {
      expect(renderText(weekHeard.render(marketWeekFixture(), mode, ctx)), mode).toContain('2 themes first heard with this update reached 10 videos this month.')
    }
  })

  it('lists each with its videos, New, "·" for the month before, where its videos came from and its maker share', () => {
    const text = renderText(weekHeard.render(marketWeekFixture(), 'app', ctx))
    expect(text).toContain('Laundry planning for travel 10 · New 8')
    expect(text).toContain('Preference for secondhand fashion 10 · New 8 a fifth makers')
    expect(text).toContain('From searches added in Sep')
    expect(text).not.toContain('0%')
    expect(text).toContain('All themes on Conversation →')
  })

  it('groups the ones led by makers (decision F) and names the lead ones', () => {
    const d = marketWeekFixture()
    const h = d.heard!
    const maker = { ...h.rows[1], registryId: 'r-maker', label: 'Admiration for handmade craftsmanship', k: 65, makerShare: 0.6 }
    const data: WeekData = { ...d, heard: { ...h, makers: { count: 1, lead: [maker] } } }
    const text = flat(renderText(weekHeard.render(data, 'app', ctx)))
    expect(text).toContain('Makers and DIY, grouped: 1 theme, led by Admiration for handmade craftsmanship (65)')
  })

  it('prints no makers column for a tenant with no maker rule (Össur)', () => {
    const text = renderText(weekHeard.render(ossurWeeksFixture(), 'app', ctx))
    expect(text).toContain('Brand boycott over politics 16 · New ·')
    expect(text).not.toContain('Makers')
  })

  it('says so where nothing reached the floor, or the update re-grouped', () => {
    const d = marketWeekFixture()
    expect(weekHeard.emptyState({ ...d, heard: { ...d.heard!, rows: [] } })).toBe('No theme first heard with this update reached 10 videos this month.')
    expect(weekHeard.emptyState({ ...d, heard: { ...d.heard!, rows: [], seen: 0, regrouped: { update: '2026-09-10T07:17:02.291Z', themes: 592 } } })).toBe('Re-grouped with the 10 Sep update: 592 themes.')
    expect(weekHeard.emptyState(weekFixture())).toContain('not counted here yet')
  })
})

describe('For sales (market-first WP3.7, week.sales and the weekly’s WR4)', () => {
  it('counts the update’s objections in videos, two of their own voices, and the complaints about brands you track', () => {
    const text = renderText(weekSales.render(marketWeekFixture(), 'app', ctx))
    // One-video objections are not printed (finish-list item 9's floor).
    expect(text).toContain('Objection Videos Price concern 2 Price too high 2 “')
    expect(text).not.toContain('Aesthetic and materials')
    expect(text).toContain('Man, I’ve really been underwhelmed with mine')
    expect(text).toContain('It does look decent')
    expect(text).toContain('What they complain about in a rival videos Patagonia 4 The North Face 1')
    expect(text).toContain('Open the sales brief →')
  })

  it('says too few, and prints no table and no voice, where no objection reached two videos (the 27 Sep update)', () => {
    const d = marketWeekFixture()
    const ones = d.sales.objections.map((g) => ({ ...g, videos: 1 }))
    const sales = { ...d.sales, objections: ones, objectionsTotal: 9 }
    for (const mode of MODES) {
      const text = renderText(weekSales.render({ ...d, sales }, mode, ctx))
      expect(text, mode).toContain('Too few this update to group: 9 objections, none heard in more than one video.')
      expect(text, mode).not.toContain('Price concern')
      expect(text, mode).not.toContain('Man, I’ve really been underwhelmed with mine')
    }
    // With no rival complaint either, the line is the whole block.
    const alone = { ...sales, rivalComplaints: [] }
    expect(renderText(weekSales.render({ ...d, sales: alone }, 'app', ctx))).toContain('Too few this update to group: 9 objections')
  })

  it('prints no switching count while off-topic talk is still in it, and no praise', () => {
    for (const mode of MODES) {
      const text = renderText(weekSales.render(marketWeekFixture(), mode, ctx))
      expect(text).not.toContain('47')
      expect(text).not.toMatch(/moving between brands/i)
    }
  })

  it('in an inbox names the complaints in one sentence', () => {
    expect(flat(renderText(weekSales.render(marketWeekFixture(), 'email', ctx)))).toContain('About brands you track: complaints came up under 4 videos about Patagonia and 1 about The North Face.')
  })
})

describe('Worth a reply (market-first WP3.7, week.reply)', () => {
  it('draws the kinds as tabs and three rows, each with its kind, why it surfaced and a reply', () => {
    const text = renderText(weekReply.render(marketWeekFixture(), 'app', ctx))
    expect(text).toContain('All 12 Buying signals 6 Questions 3 Objections 3')
    expect(text).toContain('Buying signal Wedding bag interest')
    expect(text).toContain('YouTube · 16 Sep · under @melania beadedbag’s post · 622 likes a maker’s own post')
    expect(text).toContain('Reddit · 15 Sep · r/heronebag · filed under a brand you track · 3 likes Read in full')
    expect((text.match(/Reply →/g) ?? []).length).toBe(3)
    expect(text).toContain('Open all 12 →')
  })

  it('a tab shows only its kind', () => {
    const tabbed = blockContext('', EMAIL, { reply: 'question' })
    const d = marketWeekFixture()
    const q: WeekData = { ...d, replies: { ...d.replies, rows: [...d.replies.rows, { ...d.replies.rows[0], id: 'q1', intent: 'question', reason: 'Where to buy' }] } }
    const text = renderText(weekReply.render(q, 'app', tabbed))
    expect(text).toContain('Where to buy')
    expect(text).not.toContain('Wedding bag interest')
  })

  it('in an inbox counts the kinds in one sentence and opens This week', () => {
    const weekly = repliesSection<WeekData>('weekly.content', (x) => x.replies, 'weekly')
    const text = flat(renderText(weekly.render(marketWeekFixture(), 'email', ctx)))
    expect(text).toContain('12 comments are worth a reply: 6 buying signals, 3 questions and 3 objections.')
    expect(text).toContain('Open all 12 on This week →')
  })
})

describe('What worked (market-first WP3.7, week.worked)', () => {
  it('lists formats and hooks by their multiple of the median, the ones under the floor as counts only', () => {
    const text = renderText(weekWorked.render(marketWeekFixture(), 'app', ctx))
    // "count only" is drawn twice, one of them hidden at each width (the bar
    // column's on a wide table, the multiple's on a narrow one).
    expect(text).toContain('Story 2.6× 118 Entertainment 2.4× 20 Promotional 2.3× 92 Challenge count only · count only 5')
    expect(text).toContain('Personal story 2.1× 266 Demonstration 1.5× 61 Controversy count only · count only 5 Before and after count only · count only 5')
    expect(text).toContain('Open the content brief →')
  })

  it('prints your own hooks in the month on one line', () => {
    const text = renderText(weekWorked.render(weekFixture(), 'app', ctx))
    expect(text).toMatch(/Your own hooks in September: .+, of \d+ posts with a hook/)
  })
})

describe('What brands you track posted (market-first WP3.7, week.rival-posts)', () => {
  it('lists each brand by the comments under its own most-commented post, the brand not counted last', () => {
    const text = flat(renderText(weekRivalPosts.render(marketWeekFixture(), 'app', ctx)))
    const order = ['The North Face', 'Patagonia', 'Freedom of Movement', 'Old School', 'Cotopaxi', 'Freitag', 'Rareform'].map((n) => text.indexOf(`${n}tracked since`) >= 0 ? text.indexOf(`${n}tracked since`) : text.indexOf(`${n} tracked since`))
    expect(order.every((x) => x >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(text).toContain('The North Face tracked since 20 Sep 23 33 “Aimé Leon Dore / The North Face 2026. @aimeleondore @thenorthface” Instagram · 14 Sep 98')
  })

  it('prints an unmeasured name’s count plainly, with no note (the lead’s R2)', () => {
    const text = renderText(weekRivalPosts.render(marketWeekFixture(), 'app', ctx))
    expect(text).toContain('Freitag tracked since 28 Jun 6 149')
    expect(text).not.toContain('German')
  })

  it('does not count a name production measured as mostly another word, says why, and lists it last', () => {
    const d = marketWeekFixture()
    const rivals = d.cameIn.rivals.map((r) => (r.label === 'Freitag' ? { ...r, nameNote: 'mostly the German word for Friday · not counted' } : r))
    const text = renderText(weekRivalPosts.render({ ...d, cameIn: { ...d.cameIn, rivals } }, 'app', ctx))
    expect(text).toContain('Freitag tracked since 28 Jun 6 ·')
    expect(text).toContain('149 videos matched the name, mostly the German word for Friday · not counted')
    expect(text.indexOf('Freitag')).toBeGreaterThan(text.indexOf('Rareform'))
  })

  it('prints the videos naming each brand on the Brands page’s basis, against the month, and Settings’ tracked-since date (finish-list 7, 9)', () => {
    const d = marketWeekFixture()
    const rivals = d.cameIn.rivals.map((r) =>
      r.label === 'Freitag' ? { ...r, aboutThem: 2, aboutMonth: 7, foundByName: 149, aboutNote: null, since: 'by 28 Jun' }
        : r.label === 'The North Face' ? { ...r, aboutThem: 11, aboutMonth: 54, aboutNote: null, since: '17 Sep' }
          : r.label === 'Rareform' ? { ...r, aboutThem: 0, aboutMonth: null, aboutNote: 'not counted yet', since: '9 Sep' }
            : r)
    const text = flat(renderText(weekRivalPosts.render({ ...d, cameIn: { ...d.cameIn, rivals } }, 'app', ctx)))
    expect(text).toContain('Videos naming them')
    expect(text).not.toContain('about them')
    expect(text).toContain('Freitag tracked by 28 Jun 6 2 of 7 in Sep')
    expect(text).not.toContain('149')
    expect(text).toContain('The North Face tracked since 17 Sep 23 11 of 54 in Sep')
    expect(text).toContain('Videos naming them: not counted yet')
    // A month of none prints the 0 alone, never "of 0".
    const none = rivals.map((r) => (r.label === 'Old School' ? { ...r, aboutThem: 0, aboutMonth: 0, aboutNote: null } : r))
    expect(flat(renderText(weekRivalPosts.render({ ...d, cameIn: { ...d.cameIn, rivals: none } }, 'app', ctx)))).not.toContain('of 0 in Sep')
  })

  it('opens the brands’ page under its current sidebar label', () => {
    expect(renderText(weekRivalPosts.render(marketWeekFixture(), 'app', ctx))).toContain(`Open ${surface('competitive').label} →`)
  })
})

describe('Checks on this update (market-first WP3.7, week.checks)', () => {
  // T0a (the one condition): with the months refused, "Moving now" is not
  // drawn at all, and no chip says why.
  it('prints the checks side by side: no "Moving now" on a refused pair, the forming baseline, nothing flagged', () => {
    const text = renderText(weekChecks.render(marketWeekFixture(), 'app', ctx))
    expect(text).not.toContain('Moving now')
    expect(text).not.toContain('not read as a change')
    expect(render(weekChecks.render(marketWeekFixture(), 'app', ctx))).not.toContain('data-pair-chip')
    expect(text).toContain('Unusual this week Not checked with this update: the baseline is forming. 0 of 3 months flags from January')
    expect(text).toContain('Flagged for awareness Nothing in these days was flagged as a claim about this space that does not hold up.')
    expect(text).toContain('What we changed, and when →')
  })

  it('quotes a flagged claim, never with a reply link', () => {
    const markup = render(weekChecks.render(weekFixture(), 'app', ctx))
    expect(weekFixture().replies.flagged.length).toBeGreaterThan(0)
    expect(markup).not.toContain('Reply →')
  })

  it('names the baseline month from the check’s own reading where the comparable one was not read', () => {
    expect(baselineMeter({ ...weekFixture().unusual, comparable: undefined })).toEqual(
      weekFixture().unusual.baseline && !weekFixture().unusual.baseline!.ready
        ? { kept: weekFixture().unusual.baseline!.monthsClearing, required: weekFixture().unusual.baseline!.required, from: weekFixture().unusual.startsWith }
        : null,
    )
  })
})


describe('WK §8 · flagged for awareness', () => {
  it('carries no reply link, by construction rather than by rendering', () => {
    const d = weekFixture()
    for (const row of d.replies.flagged) expect(row.href).toBeNull()
    const markup = render(weekFlagged.render(d, 'app', ctx))
    expect(markupText(markup)).toContain('no reply link')
    expect(markup).not.toContain('Reply →')
  })

  it('never claims a claim has persisted, and never mixes comments with videos', () => {
    // D14: nothing records when a flagged claim was first heard. D10: one
    // comment over a count of videos is two units on one line.
    const text = renderText(weekFlagged.render(weekFixture(), 'app', ctx))
    expect(text).not.toContain('persisted')
    expect(text).not.toContain('of 205 videos')
    expect(text).toContain('1 claim · no reply link')
  })

  it('says nothing was flagged rather than drawing a hole', () => {
    expect(weekFlagged.emptyState(thinFixture())).toContain('flagged as a claim about this space')
  })
})

describe('the coverage line and the two sections Phase 1 does not build', () => {
  it('says who the reading is for, which update, and what it covered', () => {
    const text = renderText(weekCoverage.render(weekFixture(), 'app', ctx))
    // The page bar names the update on screen; paper keeps it (C61).
    expect(text).toContain('Prepared for Össur with Verbatim')
    expect(text).not.toContain('update of 13 Sep')
    expect(renderText(weekCoverage.render(weekFixture(), 'print', ctx))).toContain('Prepared for Össur with Verbatim · update of 13 Sep · previous 6 Sep')
    expect(text).toContain('205 videos · 5,134 comments')
  })

  it('carries no migration note about the Content page (copy de-clutter C62)', () => {
    for (const mode of MODES) {
      expect(renderText(weekCoverage.render(weekFixture(), mode, ctx)), mode).not.toContain('until that page retires')
    }
  })

  it('carries the privacy sentence', () => {
    expect(renderText(weekCoverage.render(weekFixture(), 'app', ctx)))
      .toContain('Commenters are never identified; quotes carry platform and date only.')
  })

  it('declares no figures — every number in it is already declared above', () => {
    expect(blockAnswers(weekCoverage, weekFixture()).figures).toEqual({})
  })
})

describe('the page', () => {
  it('draws the preview’s nine tiles in its order, and the bar’s one line', () => {
    const text = renderText(<WeekPage data={cleanWeekFixture()} />)
    expect(text).toContain('Sealand · The 20 Sep update comments written 10 to 20 Sep')
    const at = WEEK_BLOCKS.map((b) => text.indexOf(b.title.toUpperCase()) >= 0 ? text.indexOf(b.title.toUpperCase()) : text.indexOf(b.title))
    expect(at.every((x) => x >= 0)).toBe(true)
    expect(WEEK_BLOCKS.map((b) => b.title)).toEqual([
      'With this update', 'Week by week', 'Heard for the first time', 'Your market’s subjects', 'For sales',
      'Worth a reply', 'What worked', 'What brands you track posted', 'Checks on this update',
    ])
  })

  it('pairs your market’s subjects with For sales, half and half; every other tile is full width', () => {
    const markup = render(<WeekPage data={cleanWeekFixture()} />)
    const spans = [...markup.matchAll(/data-col="(\d+)" data-row="(\d+)"/g)].map((m) => m[1])
    expect(spans).toEqual(['12', '12', '12', '6', '6', '12', '12', '12', '12'])
    // T0a: on Sealand's own weeks Week by week is omitted, tile and all.
    const real = render(<WeekPage data={marketWeekFixture()} />)
    expect([...real.matchAll(/data-col="(\d+)" data-row="(\d+)"/g)].map((m) => m[1])).toEqual(['12', '12', '6', '6', '12', '12', '12', '12'])
    expect(renderText(<WeekPage data={marketWeekFixture()} />)).not.toContain('WEEK BY WEEK')
  })

  it('prints no footnote under a block or under the page (25 Sep rulings)', () => {
    const text = renderText(<WeekPage data={thinFixture()} />)
    expect(text).not.toContain('We did not record how themes were grouped')
    expect(text).not.toContain('Prepared for')
    expect(text).not.toContain('Commenters are never identified')
  })

  it('takes no horizon and no soundness band — it is dated by the update', () => {
    const markup = render(<WeekPage data={weekFixture()} />)
    expect(markup).not.toContain('How far back')
    expect(markup).not.toMatch(/how sound/i)
  })

  it('says what is missing when no update has ever been delivered', () => {
    expect(renderText(<WeekPage data={null} />)).toContain('No update has been delivered for this workspace yet')
  })

  it('keeps the whole page’s copy contract on both tenants', () => {
    for (const fixture of FIXTURES) assertCopyContract(render(<WeekPage data={fixture()} />))
  })

  it('binds its context to relative links, so the app navigates on the client', () => {
    expect(weekContext().appUrl).toBe('')
  })
})


describe('the page module an export addresses', () => {
  it('names every block the page draws, at the same keys', () => {
    // The page bar carries an Export control; `/api/export` resolves a tile by
    // `<page>.<tile>` through the registry, so the module's keys and the
    // page's blocks are the same list or a tile export 400s on a key the page
    // shows.
    // And the tiles WP3.7 retired stay addressable, so an export stored before
    // it still resolves its keys.
    expect(Object.keys(weekPage.renderables).sort()).toEqual([...WEEK_BLOCKS, ...WEEK_RETIRED_BLOCKS].map((b) => b.key).sort())
    expect(weekPage.key).toBe('week')
  })

  it('puts one block on one slide, in the page’s own order', () => {
    const slides = weekPage.slides(weekFixture(), 'default')
    expect(slides.map((s) => s.keys[0])).toEqual(WEEK_BLOCKS.map((b) => b.key))
    for (const slide of slides) expect(slide.layout).toBe('single')
  })

  it('renders every tile on paper without the app’s context', () => {
    for (const block of WEEK_BLOCKS) {
      const markup = render(weekPage.renderables[block.key].render(weekFixture(), 'print'))
      expect(markup.length, block.key).toBeGreaterThan(0)
      assertCopyContract(markup)
    }
  })

  it('titles a snapshot by the update it is a reading of', () => {
    expect(weekPage.snapshotTitle(weekFixture())).toContain('This week · Össur')
  })
})

// AN ENDED MONTH IS NOT "SO FAR" OR "THIS MONTH" (deploy 1 review): on 2 Oct
// This week's latest update is still September's, and September has ended.
describe('This week on a clock past the update’s month', () => {
  const ended = (): WeekData => ({ ...weekFixture(), readingAt: '2026-10-02T06:00:00.000Z' })

  it('dates the subjects block to the update, and names the month on each figure', () => {
    const text = renderText(weekSubjects.render(ended(), 'app', ctx))
    expect(text).toContain('September to the')
    expect(text).not.toContain('so far')
    expect(text).not.toContain('this month')
    expect(text).toContain('in September')
  })

  it('keeps "so far" and "this month" while the month is the clock’s', () => {
    const text = renderText(weekSubjects.render(weekFixture(), 'app', ctx))
    expect(text).toContain('September so far')
    expect(text).toContain('this month')
  })

  it('says the first-heard floor against the month by name', () => {
    const past: WeekData = { ...ossurWeeksFixture(), readingAt: '2026-10-02T06:00:00.000Z' }
    for (const mode of MODES) {
      const text = renderText(weekHeard.render(past, mode, ctx))
      expect(text).toContain('1 theme first heard with this update reached 10 videos in September.')
      expect(text).not.toMatch(/videos( or more)? this month/)
      assertCopyContract(render(weekHeard.render(past, mode, ctx)))
    }
  })
})

// DECISION C (WP1.1): This week's rows are your own side of each subject, which
// only a READY subject shows; the others are named, with their word.
describe('WK §2 under the three calibration states', () => {
  const base = weekFixture()
  const data: WeekData = {
    ...base,
    subjects: {
      ...base.subjects,
      withheld: [
        { id: 's-repair', label: 'Repair & warranty', calibration: 'failed' },
        { id: 's-community', label: 'Community & purpose', calibration: 'provisional' },
      ],
    },
  }

  // T0a (ruling U6): each by its name alone, no calibration word.
  it('names the withheld subjects with no word and no figure, in every mode', () => {
    for (const mode of MODES) {
      assertCopyContract(render(weekSubjects.render(data, mode, ctx)))
      const text = renderText(weekSubjects.render(data, mode, ctx))
      expect(text).toContain('Repair & warranty')
      expect(text).toContain('Community & purpose')
      expect(text).not.toContain('being re-described')
      expect(text).not.toContain('provisional')
    }
  })

  it('declares no figure for a withheld subject', () => {
    const figures = blockAnswers(weekSubjects, data).figures
    expect(Object.keys(figures).some((k) => k.includes('s-repair') || k.includes('s-community'))).toBe(false)
  })

  it("on screen the withheld subjects are the strip's next row, above the bar legend", () => {
    const markup = render(weekSubjects.render(data, 'app', ctx))
    const legend = markup.indexOf('what this update added')
    expect(markup.indexOf('Community &amp; purpose')).toBeGreaterThan(0)
    expect(markup.indexOf('Community &amp; purpose')).toBeLessThan(legend)
    // On the strip's own columns, with its gutter drawn transparent.
    expect(markup).toContain('border-transparent xl:border-l xl:pl-4')
  })

  it('a block with only withheld subjects is not "no subjects recorded"', () => {
    const only: WeekData = { ...data, subjects: { ...data.subjects, rows: [], unread: null, lead: null } }
    const text = renderText(weekSubjects.render(only, 'app', ctx))
    expect(text).toContain('Repair & warranty')
    expect(text).not.toContain('No subjects are recorded')
  })

  // Default M-a: Community & purpose was named 24 Sep, after the update wrote
  // September (staging), so the month was not read for it. It says "no
  // reading yet", as Your market and the Subjects rail do, and never
  // "provisional", which is the calibration word alone.
  // HYPOTHETICAL `ready` for Community & purpose: a provisional one is its
  // name alone (T0a), on a copy stored with its unread words too.
  it('a subject the month was not read for says "no reading yet", not its calibration word, in every mode', () => {
    const words = unreadWords({ month: '2026-09-01', filling: true, nextUpdate: '2026-10-04T04:00:00.000Z' })
    const withheld = (calibration: 'ready' | 'provisional'): WeekData => ({
      ...data,
      subjects: {
        ...data.subjects,
        withheld: [
          { id: 's-repair', label: 'Repair & warranty', calibration: 'failed' },
          { id: 's-community', label: 'Community & purpose', calibration, unread: words },
        ],
      },
    })
    for (const mode of MODES) {
      assertCopyContract(render(weekSubjects.render(withheld('ready'), mode, ctx)))
      const text = renderText(weekSubjects.render(withheld('ready'), mode, ctx))
      expect(text).toContain('Community & purpose no reading yet')
      expect(text).not.toContain('provisional')
      expect(text).not.toContain('being re-described')
      expect(renderText(weekSubjects.render(withheld('provisional'), mode, ctx))).not.toContain('no reading yet')
    }
  })
})


// ---- every block, every mode, both tenants on the market: one case each ------

const PAGE_CASES = [marketWeekFixture, ossurWeeksFixture].flatMap((fixture) =>
  WEEK_BLOCKS.flatMap((block) => MODES.map((mode) => ({ name: `${block.key} [${mode}] ${fixture.name}`, block, mode, fixture }))))

describe.each(PAGE_CASES)('$name', ({ block, mode, fixture }) => {
  it('keeps the copy contract, with its title alone in the header and links alone in the footer', () => {
    const el = block.render(fixture(), mode, ctx)
    // T0a (mechanism 3): Week by week is omitted where no week is left one
    // way since our latest change (Sealand's own weeks).
    if (el == null && block.key === 'week.weeks') return
    assertCopyContract(render(el))
    expect(isValidElement(el) && el.type === BlockFrame).toBe(true)
    const props = (el as { props: { meta?: unknown; footerNote?: unknown } }).props
    expect(props.meta).toBeUndefined()
    expect(props.footerNote).toBeUndefined()
  })
})

describe('This week’s pure helpers (WP3.7)', () => {
  const rows = marketWeekFixture().worked.formats

  it('workedOrder: the rows at the floor by multiple, then the counts', () => {
    expect(workedOrder(rows).map((o) => o.row.label)).toEqual(['Story', 'Entertainment', 'Promotional', 'Challenge'])
    expect(workedOrder(rows).map((o) => o.counted)).toEqual([false, false, false, true])
  })

  it('workedOrder: the floor is 10 videos', () => {
    expect(WORKED_FLOOR).toBe(10)
    expect(workedOrder([{ label: 'Nine', videos: 9, engagement: 1, multiple: 9 }])[0].counted).toBe(true)
    expect(workedOrder([{ label: 'Ten', videos: 10, engagement: 1, multiple: 1 }])[0].counted).toBe(false)
  })

  it('workedOrder: ties on the multiple go to the larger count', () => {
    const tied = workedOrder([{ label: 'A', videos: 12, engagement: 1, multiple: 2 }, { label: 'B', videos: 40, engagement: 1, multiple: 2 }])
    expect(tied.map((o) => o.row.label)).toEqual(['B', 'A'])
  })

  it('brandsPostedOrder: by the comments under their top post, the name not counted last', () => {
    const rivals = marketWeekFixture().cameIn.rivals
    expect(brandsPostedOrder(rivals).map((r) => r.label)).toEqual(['The North Face', 'Patagonia', 'Freedom of Movement', 'Old School', 'Cotopaxi', 'Freitag', 'Rareform'])
    const measured = rivals.map((r) => (r.label === 'Freitag' ? { ...r, nameNote: 'mostly the German word for Friday · not counted' } : r))
    expect(brandsPostedOrder(measured).map((r) => r.label)).toEqual(['The North Face', 'Patagonia', 'Freedom of Movement', 'Old School', 'Cotopaxi', 'Rareform', 'Freitag'])
  })

  it('topOwnPost: the brand’s own post, never one about it', () => {
    const r = marketWeekFixture().cameIn.rivals[0]
    expect(topOwnPost(r)?.own).toBe(true)
    expect(topOwnPost({ ...r, posts: [] })).toBeNull()
    expect(topOwnPost({ ...r, posts: [{ ...r.posts[0], own: false }] })).toBeNull()
  })

  it('replyRowsFor: every kind, three rows, where no tab is picked', () => {
    const r = marketWeekFixture().replies
    expect(replyRowsFor(r, undefined)).toEqual({ tab: 'all', rows: r.rows.slice(0, 3) })
  })

  it('replyRowsFor: only the picked kind', () => {
    const r = marketWeekFixture().replies
    expect(replyRowsFor(r, 'buying').rows.every((row) => row.intent === 'buying')).toBe(true)
    expect(replyRowsFor(r, 'buying').tab).toBe('buying')
  })

  it('replyRowsFor: a tab the queue has none of, or awareness, falls back to all', () => {
    const r = marketWeekFixture().replies
    expect(replyRowsFor({ ...r, counts: r.counts.filter((c) => c.intent !== 'objection') }, 'objection').tab).toBe('all')
    expect(replyRowsFor(r, 'misinformation').tab).toBe('all')
    expect(replyRowsFor(r, 'nonsense').tab).toBe('all')
  })

  it.each([
    ['baseline_forming', 'Not checked with this update: the baseline is forming.'],
    ['nothing_unusual', 'Nothing was unusual with this update.'],
  ] as const)('unusualLine: %s', (state, words) => {
    expect(unusualLine({ ...weekFixture().unusual, state })).toBe(words)
  })

  it('unusualLine: a flagged check counts its flags', () => {
    const u = weekFixture().unusual
    expect(unusualLine({ ...u, state: 'flagged', flags: u.flags.slice(0, 1) })).toBe('One thing was unusual with this update.')
  })

  it('unusualLine: a refused or unreadable check says its own note', () => {
    const u = weekFixture().unusual
    expect(unusualLine({ ...u, state: 'refused', note: 'A note.' })).toBe('A note.')
    expect(unusualLine({ ...u, state: 'unreadable', note: null })).toBe('The check could not be read with this update.')
  })

  it('baselineMeter: comparable months, with the month its flags start', () => {
    expect(baselineMeter(marketWeekFixture().unusual)).toEqual({ kept: 0, required: 3, from: '2027-01-01' })
  })

  it('baselineMeter: none once the baseline is ready, or for a check that answered', () => {
    const u = marketWeekFixture().unusual
    expect(baselineMeter({ ...u, comparable: { kept: 3, required: 3, flagsFrom: null } })).toBeNull()
    expect(baselineMeter({ ...u, state: 'nothing_unusual' })).toBeNull()
  })

  it('heardLead: the level and its base, then the floor', () => {
    const h = marketWeekFixture().heard!
    expect(heardLead(h, 'this month')).toEqual({ level: '2', rest: ' themes first heard with this update reached 10 videos this month.' })
  })

  it('heardLead: nothing first heard, or none at the floor', () => {
    const h = marketWeekFixture().heard!
    expect(heardLead({ ...h, seen: 0, rows: [] }, 'this month').rest).toBe('Nothing was heard for the first time with this update.')
    expect(heardLead({ ...h, seen: 1, rows: [] }, 'in September').rest).toBe('No theme first heard with this update reached 10 videos in September.')
  })
})
