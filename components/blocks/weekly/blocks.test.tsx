import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureCount, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
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

  // The status note pins `forSales` as a block over the SECTION alone, so This
  // week's own loader can hand it `{ sales }` without building a whole weekly
  // reading. Since block D wave 2 that section is `ForSalesData` — the counted
  // shape, produced once by `buildSales` for both artefacts.
  it('lets For sales be handed the loader’s section alone', () => {
    const { sales } = weeklyFixture()
    const markup = render(forSales.render({ sales }, 'app', ctx))
    expect(markupText(markup)).toContain('They object to price against longevity')
    expect(forSales.emptyState({ sales })).toBeNull()
    expect(blockAnswers(forSales, { sales }).quotes).toEqual(['e:3', 'e:2', 'e:9'])
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

  // THE ARTBOARD'S CARD (block D wave 2): both sides as a share over the count
  // it rests on, the bar drawn from those two shares, and the movement in the
  // badge the product's vocabulary allows — never the mock's "▲ 3.1× usual",
  // which is a ratio with no denominator on either side of it.
  it('prints the flag with its week, its baseline, its change and its band', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('Unusual this week · Objections')
      expect(text, mode).toContain('This week 14.1% 29 of 205')
      expect(text, mode).toContain('Three months behind 3.5% 38 of 1,089')
      expect(text, mode).toMatch(/10\.7 pts · band 5/)
      expect(text, mode).toContain('counted against every audience together')
      expect(text, mode).not.toMatch(/×\s*usual/)
    }
  })

  // GREEN IS "YOU, GAINING, SUPPORTED CLAIMS" (DESIGN.md). The badge coloured
  // strictly by sign, so a RISE IN OBJECTIONS came out green on mint inside a
  // card headed "Unusual this week · Objections"; the artboard's own pill is
  // amber because amber is valence-free.
  it('never paints the flag’s movement as good news', () => {
    const markup = render(block.render(weeklyFixture(), 'email', ctx))
    expect(markup).toContain(EMAIL.mixedTint)
    expect(markup).not.toContain(EMAIL.greenTint)
    // And on the screen arm the same axis prints muted, never positive.
    expect(render(block.render(weeklyFixture(), 'app', ctx))).not.toContain('text-positive')
  })

  it('carries the "of N" on both sides of the comparison, in a level node', () => {
    const markup = render(block.render(weeklyFixture(), 'app', ctx))
    expect(copyViolations(markup)).toEqual([])
    expect(markup).toContain('data-copy="level"')
  })

  it('says the flag was the only one rather than leaving the reader to wonder', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx))).toContain('Nothing else unusual this week.')
  })

  it('counts the flags it could not print instead of the coda', () => {
    const data = weeklyFixture()
    const more = { ...data, section1: { ...data.section1, check: { ...data.section1.check, moreFlags: 2 } } }
    const text = renderText(block.render(more, 'app', ctx))
    expect(text).toContain('2 more cleared the band and are on This week.')
    expect(text).not.toContain('Nothing else unusual')
  })

  it('states this update’s videos and the month they contribute to, not a week-only n', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx)))
      .toContain('271 videos this update · 2,359 in September so far')
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

  // Sealand's frozen window is thirty days long, and the headings said "this
  // week" over it while the masthead beside them printed the real dates.
  it('names the window in the word the window supports', () => {
    const week = weeklyFixture()
    const update = weeklyFixture({ section1: { ...week.section1, check: { ...week.section1.check, noun: 'update' } } })
    expect(renderText(block.render(week, 'app', ctx))).toContain('The week in one sentence')
    const text = renderText(block.render(update, 'app', ctx))
    expect(text).toContain('The update in one sentence')
    expect(text).not.toContain('The week in one sentence')
    expect(text).toContain('This update 14.1% 29 of 205')
    expect(renderText(WEEKLY_BLOCKS['weekly.incoming'].render(update, 'app', ctx))).toContain('What came in this update')
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
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('31% 26 of 84')
      expect(text, mode).toContain('22% 305 of 1,388')
    }
  })

  // THE ARTBOARD'S ROW (block D wave 2): the month share leads, in its own
  // right-hand column with its "of N" under it, and the bar is drawn from it.
  it('leads with the month share and says what the bar is', () => {
    const markup = render(block.render(weeklyFixture(), 'app', ctx))
    expect(markup).toContain('data-copy="level"')
    expect(markupText(markup)).toContain('the bar is each subject’s share of the category this month')
  })

  // The mock draws a tick at "a typical week"; nothing on this artefact
  // computes one, and an unmeasured mark is the one thing a chart may not draw.
  it('draws no typical-week mark and says nothing about a typical week', () => {
    for (const mode of MODES) {
      expect(renderText(block.render(weeklyFixture(), mode, ctx))).not.toMatch(/typical/i)
    }
  })

  it('names what these are mentions in, in the frame’s footer note', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx))).toContain('mentions in your audience')
  })

  it('says the subjects are not recorded rather than drawing an empty table', () => {
    expect(renderText(block.render(formingFixture(), 'app', ctx))).toContain('not recorded for this workspace yet')
  })

  // IN AN EMAIL NOTHING INHERITS PAST AN EXPLICIT RULE. "you" and the rival's
  // name were bare text nodes inside a `<td>` that declared no font, so both
  // fell to the client's default — 16px in most webmail, 11pt Calibri in
  // Outlook — beside 11px mono figures.
  it('declares a font for every word of the row in the email arm', () => {
    const markup = render(block.render(weeklyFixture(), 'email', ctx))
    expect(markup).toMatch(/font-size:11px;color:#6E7378">you /)
    // And the rival's name is still INSIDE that wrapper: more spans have been
    // opened than closed between the two words, so nothing has fallen back to
    // the client's own default between them.
    const you = markup.indexOf('>you ')
    const rival = markup.indexOf('· Freitag', you)
    expect(rival).toBeGreaterThan(you)
    const between = markup.slice(markup.lastIndexOf('<span', you), rival)
    expect(between.split('<span').length).toBeGreaterThan(between.split('</span>').length)
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

  // THE ARTBOARD'S BIG-NUMBER TIER (weekly.s3.counts). `text.figure` had been
  // defined since Stage 3 and used by nothing on this artefact, so four counts
  // collapsed into one 12.5px clause.
  it('prints the four counts as stat rows, at the artboard’s scale', () => {
    const markup = render(block.render(weeklyFixture(), 'app', ctx))
    expect(markup).toContain('text-[21px]')
    const text = markupText(markup)
    expect(text).toContain('5 themes heard for the first time')
    expect(text).toContain('41 new comments on your subjects')
    // The mock's fourth stat is "2,960 comments" this week. No field on this
    // artefact holds one, and a number nobody counted is not printed — the
    // stat tier carries four counts that were measured, not three and a guess.
    expect(text).not.toMatch(/comments this week/)
    expect(render(block.render(weeklyFixture(), 'email', ctx))).toContain('font-size:21px')
  })

  it('carries the reason instead of a count where nobody counted', () => {
    const text = renderText(block.render(formingFixture(), 'app', ctx))
    expect(text).toContain('Quotes are counted against your subjects once subjects are recorded')
    expect(text).not.toContain('0 new comments on your subjects')
  })

  // THE COUNT IS COUNTED, THE CARDS ARE CAPPED. `newThemes` is the shown few
  // (`NEW_THEMES_SHOWN` = 3) and the stat row prints `newThemesTotal`, so a
  // workspace that heard fourteen does not print 3 at mono 21/600.
  it('prints how many themes were heard, not how many it drew a card for', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('5 themes heard for the first time')
      expect(text, mode).toContain('the 3 largest are below')
    }
  })

  it('draws the new theme in the artboard’s pilled inner block', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('New')
      expect(text, mode).toContain('Zips failing after a year — heard for the first time in this update, in 12 videos.')
      // Not the mock's "26 of 1,388 category videos": a month denominator on a
      // count of one update is two units in one sentence.
      expect(text, mode).not.toContain('category videos')
    }
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

  it('prints the new quotes on your subjects, with how many there were', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('41 comments on your subjects were written in these days')
      expect(text, mode).toContain('Third winter on mine and the strap has not given at all')
      // The original leads and the English rendering follows — the order
      // QuoteBlock keeps, and the cite names the subject it was counted under.
      expect(text, mode).toContain('Durability · YouTube · 9 Sep')
    }
  })

  it('hands back the quote REFS and never the words', () => {
    const refs = block.quotes?.(weeklyFixture()) ?? []
    expect(refs).toEqual(['e:ev-w1', 'e:ev-w2', 'e:ev-w3'])
    // A snapshot freezes ids and resolves the text at render (decision H), so
    // nothing under lib/reports/ holds a comment's words.
    for (const ref of refs) expect(ref).not.toContain(' ')
  })

  it('says why there are no quotes rather than showing none', () => {
    const text = renderText(block.render(formingFixture(), 'app', ctx))
    expect(text).toContain('Quotes are counted against your subjects once subjects are recorded')
    expect(block.quotes?.(formingFixture())).toEqual([])
  })
})

describe('WR4 · for sales', () => {
  const block = WEEKLY_BLOCKS['weekly.sales']

  // THE ARTBOARD'S COUNTED ROWS (block D wave 2). The artefact printed four
  // quotes and no count anywhere; This week printed counts off the same
  // window. One loader now, and this is its row.
  it('counts the objection in videos, with the n it is a count against', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('They object to price against longevity')
      expect(text, mode).toContain('96')
      // "DATED IN THE WINDOW", never "this update": `ForSalesData.videos` is
      // `window_denominators` over the window, dated by the comment, while
      // WR3's "271 videos gathered" is dated by when we looked. Both said
      // "this update" and a reader could not tell the two measures apart.
      expect(text, mode).toContain('videos carrying it · of 205 videos dated in the window')
      expect(text, mode).not.toContain('271 videos this update')
    }
  })

  // THE LINK COUNTS `objectionsTotal`, NEVER THE SLICE. `objections` arrives
  // capped at three, so counting `slice(1)` said "2 more objections" on every
  // tenant with three or more groups, whatever the real number was.
  it('names the objections it did not give a row to, and counts them all', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx)))
      .toContain('6 more objections, including — is it really recycled and zips')
  })

  it('says how many objections there were, not how many it could name', () => {
    const { sales } = weeklyFixture()
    const three = { sales: { ...sales, objectionsTotal: 3 } }
    expect(renderText(forSales.render(three, 'app', ctx))).toContain('2 more objections — is it really recycled and zips')
    expect(renderText(forSales.render(three, 'app', ctx))).not.toContain('including')
  })

  // THE FOUR COUNTS CARRY THE MARKERS THE COMMENT PROMISED. The block printed
  // four figures at 16px and declared no `figure` or `level` node anywhere, so
  // `assertCopyContract` passed vacuously over the one block that is nothing
  // but counts.
  it('marks its figures, and marks the denominator a level where there is one', () => {
    const markup = render(block.render(weeklyFixture(), 'app', ctx))
    expect(copyViolations(markup)).toEqual([])
    expect(markup).toContain('data-copy="figure"')
    expect(markup).toContain('data-copy="level"')
    // No denominator, no level node — a count with nothing to be a share of is
    // a bare figure and `NO_DENOMINATOR` explains it.
    const bare = render(forSales.render({ sales: { ...weeklyFixture().sales, videos: null } }, 'app', ctx))
    expect(copyViolations(bare)).toEqual([])
    expect(bare).not.toContain('data-copy="level"')
    expect(markupText(bare)).toContain('nothing to be a share of')
  })

  // The row promised "· N below" and the card was handed praise and the top
  // objection only, so the clause pointed at nothing.
  it('draws the switching words the row says are below it', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('1 below')
    expect(text).toContain('Moving off Freitag after the strap went')
  })

  // `rivalComplaints` is the objection citations whose audience is a rival —
  // drawn from the same pool as the row above, so two adjacent counts over one
  // n invited a reader to add them.
  it('says the rival row is inside the objections above, not beside them', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx)))
      .toContain('already inside the objections above')
  })

  it('counts the rival’s complaints under the rival’s own content', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('They complain about Freitag')
    expect(text).toContain('counted under that rival’s content, never under yours')
  })

  // D14: the mock says "both toward Sealand · 7 toward, 5 away", and nothing
  // on this branch records which way a switch points.
  it('prints the switching count and refuses the direction of the switch', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('Someone said they were moving between brands')
    expect(text).toContain('12')
    expect(text).toContain('which way they point is not recorded')
    expect(text).not.toMatch(/toward/i)
  })

  it('prints the words the customer used, original first, English under it', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('In the customers’ words')
    expect(text).toContain('Dit het twee winters gehou.')
    expect(text).toContain('It held through two winters.')
    expect(text).toContain('Beautiful, but I cannot justify that for a bag.')
  })

  it('prints its empty state rather than being dropped', () => {
    const markup = render(block.render(formingFixture(), 'app', ctx))
    expect(markup).toContain('For sales')
    expect(renderText(block.render(formingFixture(), 'app', ctx)))
      .toContain('The number of videos it covered is not recorded for this workspace yet')
  })

  it('declares the counts it prints, under the keys This week already froze', () => {
    const figures = blockAnswers(block, weeklyFixture()).figures
    expect(Object.keys(figures)).toEqual(['sales_videos', 'objection_1_videos', 'objection_2_videos', 'objection_3_videos', 'switching_comments'])
    expect(blockAnswers(block, weeklyFixture()).quotes).toEqual(['e:3', 'e:2', 'e:9'])
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
    // THE LABEL IS THE READER'S WORD AND THE MULTIPLE PRINTS ITS n. The block
    // printed the stored slug (`promotional`, and one day `trend-riding`) and a
    // multiple over an unstated population.
    expect(text).toContain('Talking head outperformed Commute POV')
  })

  // THE ARTBOARD'S COUNTED ROWS (block D wave 2). Three quote rails and no
  // count anywhere left a content person unable to tell three from thirty.
  // AND IT SAYS "SURFACED", NOT "WORTH A REPLY". `inbox.total` is the length
  // of a ranked, capped list — bounded at fifteen for every tenant forever by
  // `rankEngageCandidates` — so the row prints the queue's own verb and states
  // the cap, rather than printing a cap as a count of the week.
  it('counts what the queue surfaced, says it is capped, and never the shown three', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('Surfaced for a reply this week')
      expect(text, mode).not.toContain('Worth a reply this week')
      expect(text, mode).toContain('question 7 · objection 3 · buying signal 2')
      expect(text, mode).toContain('1 below in full')
      expect(text, mode).toContain('the queue ranks and caps what it shows')
      // D14: nothing records whether a comment was answered. ("answering" in
      // the cap clause is about the reader's own work, not a record of one.)
      expect(text, mode).not.toMatch(/answered|ignored/i)
    }
  })

  // The mock's head-to-head, with an n on EACH side, and D9's label: the
  // median is this UPDATE'S, not the month's.
  it('prints the format head-to-head with an n on each side', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('Commute POV 1.8× over 24 of 402 videos')
    expect(text).toContain('against this update’s median video · 31 of 402 videos carry it')
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

  // THE ARTBOARD'S §6 (block D wave 2): the update's own videos lead the line,
  // "the record →" sits in the header opposite the label, and the Reddit cap —
  // the one `methodLines` line no reading surface has ever printed — is here.
  it('leads with this update’s videos, on the clock they are on', () => {
    for (const mode of MODES) {
      expect(renderText(block.render(weeklyFixture(), mode, ctx))).toContain('271 videos gathered this week ·')
    }
  })

  it('prints the Reddit cap, which no reading surface printed before', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx)))
      .toContain('Reddit comments are capped at')
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
