import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { FIRST_SCREEN_BUDGET, LATER_LINE, type WeekData } from '@/lib/pages/week'
import { FIRST_SCREEN, WEEK_BLOCKS, WeekPage, weekContext, weekFigureCount } from '.'
import { weekSubjects } from './subjects'
import { weekRising } from './rising'
import { weekCameIn } from './came-in'
import { weekSales } from './sales'
import { weekWorked } from './worked'
import { weekCoverage } from './coverage'
import { thinFixture, weekFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const FIXTURES: (() => WeekData)[] = [weekFixture, thinFixture]

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
    // The mock's first 900px is the page bar and §1. Counted over figure
    // tables, not rendered digits: the same figure named twice is one number to
    // a reader, and a table is countable before anything is drawn.
    for (const fixture of FIXTURES) {
      expect(weekFigureCount(fixture(), FIRST_SCREEN)).toBeLessThanOrEqual(FIRST_SCREEN_BUDGET)
    }
    // Nine on the flagged fixture: a flag's six numbers, the two shares its
    // interpretation cites, and the update's own n.
    expect(weekFigureCount(weekFixture(), FIRST_SCREEN)).toBe(9)
  })
})

describe('WK §2 · this week in your subjects', () => {
  it('prints a level with its denominator and this update’s own contribution', () => {
    const text = renderText(weekSubjects.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Comfort')
    expect(text).toContain('31 of 96 videos')
    expect(text).toContain('+14 this update')
    expect(text).toContain('September so far')
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
    expect(text).toContain('Socket comfort after a long day · of 398 category videos in September')
    expect(text).toContain('against 5% across the three months behind it')
    expect(text).toContain('18 of them arrived with this update')
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

  it('says "nothing moved clearly", which is a reading and not a refusal', () => {
    const text = renderText(weekRising.render(thinFixture(), 'app', ctx))
    expect(text).toContain('Nothing moved clearly in September’s reading so far')
    expect(text).toContain('a theme that has not cleared its band has not moved')
  })
})

describe('WK §4 · what came in', () => {
  it('keeps analysed and newly found apart, and never says one is "of" the other', () => {
    const text = renderText(weekCameIn.render(weekFixture(), 'app', ctx))
    expect(text).toContain('508')
    expect(text).toContain('618 newly found')
    expect(text).toContain('5,134 comments written in these days')
    // They are two sets. Production reads "Ottobock — 96 analysed · 137 newly
    // found" on one row and "52 analysed · 52 newly found" on another; an "of"
    // between them is arithmetic that does not hold.
    expect(text).not.toMatch(/analysed of \d/)
  })

  it('hands the window’s count back to the month it fell in', () => {
    expect(renderText(weekCameIn.render(weekFixture(), 'app', ctx)))
      .toContain('this update’s contribution to September so far: 205 of 449')
    expect(renderText(weekCameIn.render(thinFixture(), 'app', ctx)))
      .toContain('this update’s contribution to September so far: 394 of 475')
  })

  it('says when the window reached back into an earlier month', () => {
    const text = renderText(weekCameIn.render(thinFixture(), 'app', ctx))
    expect(text).toContain('also covered days of August')
    // And Össur's seven-day window sits inside September, so it says nothing.
    expect(renderText(weekCameIn.render(weekFixture(), 'app', ctx))).not.toContain('also covered days of')
  })

  it('prints only the new themes that clear the floor, and names the rest', () => {
    const text = renderText(weekCameIn.render(weekFixture(), 'app', ctx))
    expect(text).toContain('2 of the 303 themes first heard in this update carried 10 videos or more')
    expect(text).toContain('Liner cost after the first year')
    const thin = renderText(weekCameIn.render(thinFixture(), 'app', ctx))
    expect(thin).toContain('592 themes were heard for the first time')
    expect(thin).toContain('the same conversation under a new label')
  })

  it('states the by/about distinction, and why a zero is a zero', () => {
    // Össur has never captured a post of Ottobock's in six months of
    // gathering, handle configured or not: "0 posts of their own" would read
    // as "Ottobock went quiet this week".
    const text = renderText(weekCameIn.render(weekFixture(), 'app', ctx))
    expect(text).toContain('92 posts about them')
    expect(text).toContain('their own posts are not read yet — Verbatim engineering')
    // Sealand does capture rival-owned posts, so both counts are real.
    const thin = renderText(weekCameIn.render(thinFixture(), 'app', ctx))
    expect(thin).toContain('94 posts about them, 44 posts of their own')
    // And one is a post, not "1 posts" — production has a rival with exactly
    // one (Sealand's Rareform).
    const one = thinFixture()
    one.cameIn.rivals = [{ audience: 'competitor:Rareform', label: 'Rareform', byThem: 1, aboutThem: 1, comments: 0, ownPostsUnread: false }]
    expect(renderText(weekCameIn.render(one, 'app', ctx))).toContain('1 post about them, 1 post of their own')
  })

  it('says why there are no subject quotes, rather than showing none', () => {
    const text = renderText(weekCameIn.render(thinFixture(), 'app', ctx))
    expect(text).toContain('Quotes are counted against your subjects once subjects are recorded')
  })
})

describe('WK §5 · for sales', () => {
  it('counts objections in videos, with the n on the block', () => {
    const text = renderText(weekSales.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Price and cover')
    expect(text).toContain('96')
    expect(text).toContain('205 videos this update')
    expect(text).toContain('Grounded answers to these sit in the sales brief.')
  })

  it('says whose grouping the headings are', () => {
    expect(renderText(weekSales.render(weekFixture(), 'app', ctx)))
      .toContain('Grouped by the subjects you named.')
  })

  it('counts a rival’s complaints under that rival’s videos and says so', () => {
    const text = renderText(weekSales.render(weekFixture(), 'app', ctx))
    expect(text).toContain('What they complain about in a rival')
    expect(text).toContain('Counted under videos about that rival, never under yours.')
  })

  it('is honest when the week held nothing a salesperson can use', () => {
    const text = renderText(weekSales.render(thinFixture(), 'app', ctx))
    expect(text).toContain('Nothing this update read was an objection, a switch or a piece of praise')
  })

  it('shows no score anywhere', () => {
    for (const mode of MODES) {
      const text = renderText(weekSales.render(weekFixture(), mode, ctx))
      expect(text, mode).not.toMatch(/\b(pressure|score|index|rating)\b/i)
    }
  })
})

describe('WK §6 · what worked', () => {
  it('puts an n on every row, beside the multiple', () => {
    const text = renderText(weekWorked.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Talking head')
    expect(text).toContain('1.8× the median · 128 of 331 videos')
  })

  it('prints the engagement figure as the column stores it, a percentage', () => {
    // `engagement_rate` is already a percentage; a ×100 read "Promotional
    // 998%" against a 3.3× multiple on production.
    const text = renderText(weekWorked.render(weekFixture(), 'app', ctx))
    expect(text).toContain('3.8%')
    expect(text).not.toContain('380%')
  })

  it('names what it left out of the median', () => {
    expect(renderText(weekWorked.render(weekFixture(), 'app', ctx)))
      .toContain('Reddit carries no engagement figure this product can read')
  })

  it('refuses to read a format off too few rated videos', () => {
    expect(renderText(weekWorked.render(thinFixture(), 'app', ctx)))
      .toContain('Too few of this update’s videos carry an engagement figure')
  })
})

describe('the coverage line and the two sections Phase 1 does not build', () => {
  it('says who the reading is for, which update, and what it covered', () => {
    const text = renderText(weekCoverage.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Prepared for Össur with Verbatim · update of 13 Sep · previous 6 Sep')
    expect(text).toContain('205 videos · 5,134 comments')
  })

  it('names the two sections that stay on Content, rather than leaving a silence', () => {
    for (const mode of MODES) {
      expect(renderText(weekCoverage.render(weekFixture(), mode, ctx)), mode).toContain(LATER_LINE)
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
  it('draws the seven blocks, the two updates and the update’s own size', () => {
    const text = renderText(<WeekPage data={weekFixture()} />)
    expect(text).toContain('This week')
    expect(text).toContain('update of 13 Sep · previous 6 Sep')
    expect(text).toContain('Össur · 205 videos this update')
    for (const block of WEEK_BLOCKS) expect(text).toContain(block.title)
  })

  it('takes no horizon and no soundness band — it is dated by the update', () => {
    const markup = render(<WeekPage data={weekFixture()} />)
    expect(markup).not.toContain('How far back')
    expect(markup).not.toContain('How sound is this')
  })

  it('says what is missing when no update has ever been delivered', () => {
    const text = renderText(<WeekPage data={null} />)
    expect(text).toContain('No update has been delivered for this workspace yet')
  })

  it('keeps the whole page’s copy contract on both tenants', () => {
    for (const fixture of FIXTURES) {
      assertCopyContract(render(<WeekPage data={fixture()} />))
    }
  })

  it('binds its context to relative links, so the app navigates on the client', () => {
    expect(weekContext().appUrl).toBe('')
  })
})
