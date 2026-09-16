import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureCount, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { FIRST_SCREEN_BUDGET, NOTHING_UNUSUAL, WEEKLY_BLOCK_KEYS, WEEKLY_RULE, firstScreenCount } from '@/lib/reports/weekly'
import { WEEKLY_BLOCKS, forSales, weeklyBlocksFor } from './index'
import { formingFixture, quietFixture, thinFixture, weeklyFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [weeklyFixture(), quietFixture(), formingFixture(), thinFixture()]

describe('the six blocks', () => {
  it('render in all three modes on every state and keep the copy contract', () => {
    for (const data of STATES) {
      for (const block of weeklyBlocksFor()) {
        for (const mode of MODES) {
          assertCopyContract(render(block.render(data, mode, ctx)))
        }
      }
    }
  })

  // The status note pins `forSales` as `Block<{ sales: ForSalesBlock }>` for
  // WP15 to import without building a whole weekly reading. It declared
  // `Block<WeeklyData>`, so This week could not have handed it `{ sales }` at
  // all. This is the pinned shape, exercised.
  it('lets For sales be handed the loader’s rows alone', () => {
    const { sales } = weeklyFixture()
    const markup = render(forSales.render({ sales }, 'app', ctx))
    expect(markup).toContain('More in their own words')
    expect(forSales.emptyState({ sales })).toBeNull()
    expect(blockAnswers(forSales, { sales }).quotes).toEqual(sales.rows.map((r) => r.quote.ref))
  })

  it('is one block per stored key, in the design’s order', () => {
    expect(weeklyBlocksFor().map((b) => b.key)).toEqual([...WEEKLY_BLOCK_KEYS])
    for (const key of WEEKLY_BLOCK_KEYS) expect(WEEKLY_BLOCKS[key].key).toBe(key)
  })

  it('drops a key this build no longer knows rather than breaking the artefact', () => {
    expect(weeklyBlocksFor(['weekly.week', 'weekly.gone', 'weekly.coverage']).map((b) => b.key))
      .toEqual(['weekly.week', 'weekly.coverage'])
  })

  it('prints no [[token]] in any mode on any state', () => {
    for (const data of STATES) {
      for (const block of weeklyBlocksFor()) {
        for (const mode of MODES) expect(render(block.render(data, mode, ctx))).not.toContain('[[')
      }
    }
  })

  it('renders email-safe markup: no classes, no CSS variables, no flex, no grid', () => {
    for (const data of STATES) {
      for (const block of weeklyBlocksFor()) {
        const markup = render(block.render(data, 'email', ctx))
        expect(markup).not.toContain('class=')
        expect(markup).not.toContain('var(--')
        expect(markup).not.toMatch(/display:\s*(flex|grid)/)
      }
    }
  })

  // EVERY MODE, not just email. The contract is `ctx.appUrl` — "print goes into
  // a PDF and email into a client that has no idea what host it came from" —
  // and the share page is read outside the app too. Only the email arm obeyed
  // it, so the PDF's one-link-per-section were dead hrefs.
  it('links out absolutely in every mode, so a link works outside the app', () => {
    for (const data of STATES) {
      for (const block of weeklyBlocksFor()) {
        for (const mode of MODES) {
          const markup = render(block.render(data, mode, ctx))
          for (const href of markup.match(/href="([^"]+)"/g) ?? []) {
            expect(href).toMatch(/href="https?:\/\//)
          }
        }
      }
    }
  })
})

describe('WR1 · the week in one sentence', () => {
  const block = WEEKLY_BLOCKS['weekly.week']

  it('states the month so far against the same point last month', () => {
    const text = renderText(block.render(quietFixture(), 'app', ctx))
    expect(text).toContain('September, 18 days in')
    expect(text).toContain('9.4% of 1,388 videos read for the category')
    expect(text).toContain('at this point in August')
  })

  it('prints "Nothing unusual this week." in full', () => {
    expect(renderText(block.render(quietFixture(), 'app', ctx))).toContain(NOTHING_UNUSUAL)
  })

  it('prints the flag with its week, its baseline, its change and its band', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('Objections')
    expect(text).toContain('14.1% · 29 of 205 this week')
    expect(text).toContain('3.5% · 38 of 1,089 across the three months behind it')
    expect(text).toContain('+10.7 pts on a band of 5.0')
    expect(text).toContain('every audience together')
  })

  it('labels the model’s paragraph as interpretation and keeps its evidence', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('Interpretation')
    expect(text).toContain('Zip gave out after eleven months.')
  })

  it('names the thin update and says the check was suppressed for it', () => {
    const text = renderText(block.render(thinFixture(), 'app', ctx))
    expect(text).toContain('read well under its usual number of videos')
    expect(text).toContain('not compared with the months behind it')
    expect(text).not.toContain(NOTHING_UNUSUAL)
  })

  it('says the baseline is forming rather than that nothing was unusual', () => {
    const text = renderText(block.render(formingFixture(), 'app', ctx))
    expect(text).toContain('baseline forming — 1 of 3 months')
    expect(text).not.toContain(NOTHING_UNUSUAL)
  })

  it('never spends more than the budget, on any state', () => {
    for (const data of STATES) {
      expect(figureCount([blockAnswers(WEEKLY_BLOCKS['weekly.week'], data).figures])).toBeLessThanOrEqual(FIRST_SCREEN_BUDGET)
      expect(firstScreenCount(data.section1)).toBeLessThanOrEqual(FIRST_SCREEN_BUDGET)
    }
  })

  it('declares the flag’s quotes as refs so a snapshot freezes them', () => {
    expect(blockAnswers(block, weeklyFixture()).quotes).toEqual(['e:1'])
  })
})

describe('WR2 · where things stand', () => {
  const block = WEEKLY_BLOCKS['weekly.subjects']

  it('marks this week inside the row as a contribution, never as its own share', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('+7 videos since the last update')
    expect(text).not.toMatch(/\d+% this week/)
  })

  it('says once that the contribution is not recorded, never "+0 videos"', () => {
    const data = quietFixture({ contributions: null })
    const text = renderText(block.render(data, 'app', ctx))
    expect(text).toContain('not recorded for this workspace yet')
    expect(text).not.toContain('+0 videos')
  })

  it('prints every side as a level with its count', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('31% 26 of 84')
    expect(text).toContain('22% 305 of 1,388')
  })

  it('says the subjects are not recorded rather than drawing an empty table', () => {
    expect(renderText(block.render(formingFixture(), 'app', ctx))).toContain('not recorded for this workspace yet')
  })

  it('prints a direction word only inside a verdict node', () => {
    const markup = render(block.render(weeklyFixture(), 'app', ctx))
    expect(markup).toContain('growing, 3 months')
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })
})

describe('WR3 · what came in this week', () => {
  const block = WEEKLY_BLOCKS['weekly.incoming']

  it('states the update’s counts as a contribution to the month', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('271 videos gathered')
    expect(text).toContain('264 analysed')
    expect(text).toContain('the month so far holds 2,359 videos, dated by when people wrote')
  })

  it('draws no share over one update', () => {
    for (const mode of MODES) {
      expect(renderText(block.render(weeklyFixture(), mode, ctx))).not.toMatch(/\d+(\.\d+)?%/)
    }
  })

  it('names the new theme and the rival post with the comments read', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('heard for the first time in this update')
    expect(text).toContain('Freitag posted on Instagram')
    expect(text).toContain('310 comments read')
  })

  // The platform's own comments_count is not a count of what we read, and this
  // block's printed question is what the update actually read. A post whose
  // count could not be read says so rather than printing a zero.
  it('says the comments read are not recorded rather than printing a zero', () => {
    const data = weeklyFixture()
    const text = renderText(
      block.render(
        { ...data, incoming: { ...data.incoming, rivalPosts: data.incoming.rivalPosts.map((p) => ({ ...p, commentsRead: null })) } },
        'app',
        ctx,
      ),
    )
    expect(text).toContain('how many of its comments we read is not recorded')
    expect(text).not.toContain('comments read')
  })

  it('says nothing was heard rather than dropping the line', () => {
    const text = renderText(block.render(formingFixture(), 'app', ctx))
    expect(text).toContain('No theme was heard for the first time in this update')
    expect(text).toContain('No tracked rival posted')
    expect(text).toContain('how many were analysed is not recorded')
  })
})

describe('WR4 · for sales', () => {
  const block = WEEKLY_BLOCKS['weekly.sales']

  it('prints the words the customer used, original first, English under it', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('Beautiful, but I cannot justify that for a bag.')
    expect(text).toContain('Dit het twee winters gehou.')
    expect(text).toContain('It held through two winters.')
  })

  it('names the rival under whose post it was said', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx))).toContain('under Freitag’s post')
  })

  it('says it is the Sales brief’s short form', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx))).toContain('Sales brief’s short form')
  })

  it('prints its empty state rather than being dropped', () => {
    const markup = render(block.render(formingFixture(), 'app', ctx))
    expect(markup).toContain('For sales')
    expect(renderText(block.render(formingFixture(), 'app', ctx))).toContain('your subjects are not recorded')
  })

  it('declares no figures — it is quotation, not measurement', () => {
    expect(blockAnswers(block, weeklyFixture()).figures).toEqual({})
    expect(blockAnswers(block, weeklyFixture()).quotes).toEqual(['e:2', 'e:3'])
  })
})

describe('WR5 · for content', () => {
  const block = WEEKLY_BLOCKS['weekly.content']

  it('names what is worth a reply, what is rising and what worked, each with its n', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('Does the strap come off?')
    expect(text).toContain('What moved most · from this month’s reading')
    expect(text).toContain('9.4% · 130 of 1,388')
    // Run-indexed, unlike everything above it in this block, and the line has
    // to say so under a masthead that reads "this month so far".
    expect(text).toContain('2.4× the median video’s engagement, over 31 videos in this update')
  })

  it('keeps the inbox’s empty state verbatim rather than dropping the section', () => {
    const text = renderText(block.render(formingFixture(), 'app', ctx))
    expect(text).toContain('Nothing is waiting for a reply from this update.')
  })
})

describe('WR6 · coverage', () => {
  const block = WEEKLY_BLOCKS['weekly.coverage']

  it('prints the record’s own line and every refusal it already carries', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('2,359 videos')
    expect(text).toContain('comparisons were refused')
  })

  it('prints the rule that keeps the artefact honest', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx))).toContain(WEEKLY_RULE)
  })

  it('declares no figures — every number in the record is printed by the block it rests on', () => {
    expect(blockAnswers(block, weeklyFixture()).figures).toEqual({})
  })

  it('is never empty', () => {
    for (const data of STATES) expect(block.emptyState(data)).toBeNull()
  })
})
