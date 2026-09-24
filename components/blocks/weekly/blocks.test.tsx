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

  // THE CLIENT-FACING LANGUAGE BAN LIST, on the artefact that reaches a client
  // without them opening anything (design-system/verbatim/MASTER.md:311,
  // Redesign Spec §1: "no run, pass, gather, scraped, pipeline, corpus,
  // run id"). `gathered` was the label of a 21px figure in WR3 and led WR6's
  // record line, three prints on one email, while the page reading the SAME
  // loader said "newly found" / "Found" / "videos this update found"
  // (components/pages/week/came-in.tsx). One reading, two vocabularies.
  //
  // FOUR OF THE SEVEN, AND THE OMISSIONS ARE DELIBERATE. *run* and *pass* have
  // innocent English on exactly this artefact — the hero sentence is
  // "'Zips failing after a year' RAN at 3.1× its usual rate" — so a flat
  // matcher on them would fail correct copy, which is how a guard stops being
  // read. These four have no innocent use in a reading surface's words.
  const BANNED = [/\bgather(s|ed|ing)?\b/i, /\bscraped\b/i, /\bpipelines?\b/i, /\bcorpus\b/i]

  it('prints no word from the client-facing language ban list', () => {
    for (const data of STATES) {
      for (const block of weeklyBlocksFor()) {
        for (const mode of MODES) {
          const text = renderText(block.render(data, mode, ctx))
          for (const re of BANNED) expect(text, `${block.key} · ${mode}`).not.toMatch(re)
        }
        const empty = block.emptyState(data)
        if (empty) for (const re of BANNED) expect(empty, block.key).not.toMatch(re)
      }
    }
  })

  // NO PRINTED QUESTION, ON ANY BLOCK, IN ANY MODE. `BlockFrame` prints
  // `Block.question` under the heading on a docblock claim that "every
  // artboard prints one" — and every PRINTED artboard prints zero
  // (WeeklyReport included). Six extra lines of narrator over six eyebrows is
  // what mock-gap §7 calls "the single most repeated extra", against
  // design-system.md §0 rule 8, "no explanatory micro-copy inside a tile".
  // Declared nowhere rather than suppressed per mode, because the share page
  // renders these same six in 'app' mode and IS this artefact.
  //
  // The six sentences by name rather than a bare `/\?/`: a commenter's own
  // words may be a question ("Does the strap come off?") and rule (c)'s
  // `quote` exemption exists because this artefact prints them.
  const FORMER_QUESTIONS = [
    'What is the state of the week, and does anything need me?',
    'What is the state of this update, and does anything need me?',
    'How are we seen on the things we chose to be known for?',
    'What did this update actually read?',
    'What are customers pushing back on, and what are they buying on?',
    'Who should we answer, and what should we make?',
    'How sound is this reading?',
  ]

  it('declares no question, so none is printed in any of the three modes', () => {
    for (const block of weeklyBlocksFor()) {
      expect(block.question, block.key).toBeUndefined()
      for (const data of STATES) {
        for (const mode of MODES) {
          const text = renderText(block.render(data, mode, ctx))
          for (const q of FORMER_QUESTIONS) expect(text, `${block.key} · ${mode}`).not.toContain(q)
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

  // IBM PLEX MONO GIVES EVERY GLYPH ONE ADVANCE, so at the hero's 17.5px the
  // decimal point and the thousands comma each open a full character space and
  // the page's one sentence reads "9 . 4% of 1 , 388". The artboard bolds its
  // hero figure in sans for exactly this reason; body copy at 13.5px keeps
  // mono.
  it('sets the hero sentence’s figures in sans, not mono', () => {
    const email = render(block.render(quietFixture(), 'email', ctx))
    const at = email.indexOf('9.4%')
    expect(at).toBeGreaterThan(-1)
    expect(email.slice(email.lastIndexOf('<span', at), at)).toContain('IBM Plex Sans')
    const app = render(block.render(quietFixture(), 'app', ctx))
    const appAt = app.indexOf('9.4%')
    expect(app.slice(app.lastIndexOf('<span', appAt), appAt)).not.toContain('font-mono')
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
      // Ruling I: on screen the band sits in the badge's hover title; print
      // and email carry it inline.
      if (mode === 'app') expect(text, mode).toMatch(/10\.7 pts/)
      else expect(text, mode).toMatch(/10\.7 pts · band ±5 pts/)
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
    expect(text).toContain('baseline forming: 1 of 3 months')
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
    // The bare state (ruling L8), never the explanatory sentence after it.
    expect(text.split('Arrivals since the last update: not recorded').length - 1).toBe(1)
    expect(text).not.toContain('How much of each subject arrived')
    expect(text).not.toContain('+0 videos')
  })

  it('prints every side as a level with its count', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('31.0% 26 of 84')
      expect(text, mode).toContain('22.0% 305 of 1,388')
    }
  })

  // THE ARTBOARD'S ROW (block D wave 2): the month share leads, in its own
  // right-hand column with its "of N" under it, and the bar is drawn from it.
  it('leads with the month share and says whose the bar is', () => {
    const markup = render(block.render(weeklyFixture(), 'app', ctx))
    expect(markup).toContain('data-copy="level"')
    expect(markupText(markup)).toContain('the bar is the category’s')
  })

  // The mock draws a tick at "a typical week"; nothing on this artefact
  // computes one, and an unmeasured mark is the one thing a chart may not draw.
  it('draws no typical-week mark and says nothing about a typical week', () => {
    for (const mode of MODES) {
      expect(renderText(block.render(weeklyFixture(), mode, ctx))).not.toMatch(/typical/i)
    }
  })

  // THE BRIEF NAMED BOTH OF THESE AND NEITHER LANDED IN WAVE 2:
  // `weekly.s2.header` is the artboard's own heading, and `weekly.s2.lead` is
  // the sentence that tells a reader what the rows add up to before they read
  // one. The mock's lead counts subjects "above a typical week"; nothing
  // computes a typical week, so the count is of subjects whose month reading
  // cleared its band (the brief's own instruction under D6).
  it('heads the block the way the artboard does, in the window’s own word', () => {
    expect(renderText(block.render(weeklyFixture(), 'app', ctx))).toContain('Your subjects this week')
    const week = weeklyFixture()
    const update = weeklyFixture({ section1: { ...week.section1, check: { ...week.section1.check, noun: 'update' } } })
    expect(renderText(block.render(update, 'app', ctx))).toContain('Your subjects in this update')
  })

  it('leads with how many subjects cleared their band, and names them', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('2 of 2 subjects moved beyond their band this month — durability and price.')
      // Not the mock's "ran above a typical week", which nothing computes, and
      // not a direction word in a lead no row below has earned (rule (c)).
      expect(text, mode).not.toMatch(/typical/i)
    }
    expect(copyViolations(render(block.render(weeklyFixture(), 'app', ctx)))).toEqual([])
  })

  // ONE LEGEND, AND A CORRECT ONE (D56/D57): "mentions in your audience" in
  // the footer contradicted a bar legend saying the bar was the category's.
  it('names what the shares are of in one footer legend', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('share of videos where the subject came up · the bar is the category’s')
    expect(text).not.toContain('mentions in your audience')
    expect(text).not.toContain('against the largest of them')
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
    expect(markup).toContain('growing, 3rd month')
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })
})

describe('the artefact on a phone', () => {
  // A PHONE, AND design-system.md §4 ALLOWS NO MEDIA QUERY TO FIX IT WITH
  // ("Tables and inline styles only — no classes, no CSS variables, no
  // flex/grid"), so the only responsive mechanism this artefact has is a
  // proportional column. Measured at 390 on the populated fixture: the bar
  // track goes 48px → 108px and at 320 22px → 58px, with the desktop card
  // unchanged at 600 and the label column at 152 where it was 150.
  it('sizes WR2’s label column by share of the row, not in fixed pixels', () => {
    const markup = render(WEEKLY_BLOCKS['weekly.subjects'].render(weeklyFixture(), 'email', ctx))
    expect(markup).toContain('width="28%"')
    expect(markup).not.toContain('width:150px')
  })

  // AND NOTHING SETS A FLOOR UNDER THE CARD. `MoverRows` put `nowrap` on the
  // whole right-hand cell, which held the card at ~356px — a horizontally
  // scrolling email on a 320px screen. A share and its denominator still may
  // not be split (`movers.tsx:291-305`); the badge may drop below them.
  it('keeps a reading unbreakable and lets its badge wrap', () => {
    const markup = render(WEEKLY_BLOCKS['weekly.content'].render(weeklyFixture(), 'email', ctx))
    expect(markup).toContain('white-space:nowrap">5.1% · 71 of 1,388')
    expect(markup).not.toContain('white-space:nowrap;padding-left:14px"><span data-copy="figure" style="white-space:nowrap">5.1%')
  })
})

describe('WR3 · what came in this week', () => {
  const block = WEEKLY_BLOCKS['weekly.incoming']

  it('states the update’s counts as a contribution to the month', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('271 videos found')
    expect(text).toContain('264 analysed')
    // Not restated here (D54): §1's meta prints the month so far.
    expect(text).not.toContain('the month so far holds')
  })

  // THE COUNTS OPEN TO THEIR EVIDENCE (weekly.s3.counts). `StatRow` rendered a
  // plain `<span data-copy="figure">`, so the four biggest numbers on the
  // artefact went nowhere and the only clickable thing in §3 was the block's
  // own footer. The artboard makes each figure that HAS a destination an `<a>`
  // with a dotted evidence underline (312, 2,960, 41) and leaves "3 new
  // themes" — which has no such page — a plain span.
  it('opens its counts to This week, and only the counts something lists', () => {
    const data = weeklyFixture()
    for (const mode of ['app', 'email'] as RenderMode[]) {
      const markup = render(WEEKLY_BLOCKS['weekly.incoming'].render(data, mode, ctx))
      // 271, 264 and 41 each open; the theme count does not; plus the block's
      // own footer link — four, not five and not one.
      expect(markup.split('dashboard/week').length - 1, mode).toBe(4)
      for (const v of ['271', '264', '41']) {
        expect(markup, `${v} · ${mode}`).toMatch(
          new RegExp(`<a[^>]*dashboard/week[^>]*>(<span[^>]*>)?${v}<`),
        )
      }
      // The theme count is a plain figure — nothing lists the themes.
      expect(markup, mode).toMatch(/<span data-copy="figure"[^>]*>5</)
    }
  })

  // NO DOOR ON A DASH, and none on paper. Where a count is not recorded there
  // is nothing behind the figure to open; and a dotted underline in a PDF is
  // decoration on something a reader cannot click, which is the rule
  // `claim-popover.tsx` states and `market`'s figures gave theirs up for.
  it('draws no evidence affordance in print, and none on an unrecorded count', () => {
    expect(render(WEEKLY_BLOCKS['weekly.incoming'].render(weeklyFixture(), 'print', ctx)))
      .not.toContain('decoration-dotted')
    const forming = render(WEEKLY_BLOCKS['weekly.incoming'].render(formingFixture(), 'app', ctx))
    // Its `analysed` and `quotesTotal` are both null, so the only count that
    // opens is "videos found" — that link plus the footer's.
    expect(forming.split('dashboard/week').length - 1).toBe(2)
  })

  // ONE TINTED BAND, NOT ONE PER THEME, AND THE PILL IS THE 20% TINT.
  // `NewBlock` was rendered per theme, so three new themes drew three
  // identical full-width bands each with its own "New" pill where the artboard
  // draws exactly one; and the pill painted `EMAIL.mixed` (#E6B03C), a data
  // hue from design-system §2 spent on a label chip, where the artboard's is
  // `rgba(230,176,60,.20)` — `EMAIL.mixedTint`, the same constant
  // `BlockMovement`'s chips on this page already use.
  it('draws one New block for however many themes are in it, in the tint', () => {
    const data = weeklyFixture()
    expect(data.incoming.newThemes.length).toBeGreaterThan(1)
    const email = render(WEEKLY_BLOCKS['weekly.incoming'].render(data, 'email', ctx))
    expect(email.split(EMAIL.mixedTint).length - 1).toBe(1)
    expect(email).not.toContain(EMAIL.mixed.toLowerCase())
    expect(email.split('>New<').length - 1).toBe(1)
    const app = render(WEEKLY_BLOCKS['weekly.incoming'].render(data, 'app', ctx))
    // COUNT THE BAND, NOT THE TOKEN. This read `app.split('bg-inner')`, which
    // was one node when it was written and is two now: `subjects`' SB8 sets the
    // translation label as a `rounded-full bg-inner` pill inside `QuoteBlock`,
    // and this block renders quotes. `bg-inner` is a ground half the product
    // uses; the thing under test is that there is ONE New band, so match the
    // band's own shape and its "New" pill, the way the email arm above does.
    expect(app.split('rounded-md bg-inner').length - 1).toBe(1)
    expect(app.split('>New<').length - 1).toBe(1)
    expect(app.split('bg-mixed/20').length - 1).toBe(1)
    // Every theme is still in it.
    for (const t of data.incoming.newThemes) expect(markupText(app)).toContain(t.label)
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

  it('carries the reason instead of a count where nobody counted, ONCE', () => {
    const text = renderText(block.render(formingFixture(), 'app', ctx))
    expect(text).toContain('Quotes are counted against your subjects once subjects are recorded')
    expect(text).not.toContain('0 new comments on your subjects')
    // The stat row's note and the trailing paragraph both fired whenever
    // subjects are not recorded, so the forming state printed the same thirty
    // words twice, eight lines apart.
    expect(text.split('Quotes are counted against your subjects').length - 1).toBe(1)
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
      expect(text, mode).toContain('Zips failing after a year · first heard in this update, in 12 videos.')
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
    expect(text).toContain('first heard in this update')
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
      // The count is the stat row's; the sentence restating it is gone (D65).
      expect(text, mode).not.toContain('41 comments on your subjects were written in these days')
      expect(text, mode).toContain('Third winter on mine and the strap has not given at all')
      // The original and its English rendering are DIFFERENT sentences; the
      // fixture used to carry the English twice and read as a render bug.
      expect(text, mode).toContain('Een uur door de regen gereden')
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
  it('counts the rival’s complaints under the rival’s own content', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('They complain about Freitag')
    expect(text).toContain('under their content')
    expect(text).not.toContain('never under yours')
  })

  // D14: the mock says "both toward Sealand · 7 toward, 5 away", and nothing
  // on this branch records which way a switch points.
  it('prints the switching count and refuses the direction of the switch', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('Someone said they were moving between brands')
    expect(text).toContain('12')
    expect(text).toContain('direction: not recorded')
    expect(text).not.toContain('which way they point')
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

  // THE SECTION'S DENOMINATOR, ONCE. Every counted row called `denominatorOf`,
  // the frame's meta said "205 videos in the window" over them, and the rival
  // row's basis is a sentence of its own — the same n three times in a section
  // eight lines tall, at 11px mono, where a wrapped three-line mono paragraph
  // reads as a fault. The artboard repeats it nowhere. It is now on the
  // leading row alone, which is also the row whose sub-line is the level node,
  // so rule (b) is satisfied where the level actually is.
  it('states the section’s denominator once, on the row that leads it', () => {
    for (const mode of MODES) {
      const markup = render(block.render(weeklyFixture(), mode, ctx))
      const text = markupText(markup)
      expect(text.split('of 205 videos').length - 1, mode).toBe(1)
      expect(text, mode).not.toContain('205 videos in the window')
      // And the level still carries its evidence.
      expect(copyViolations(markup).filter((v) => v.rule === 'level-denominator'), mode).toEqual([])
    }
  })

  // EACH QUOTE SAYS WHICH ROW IT IS FROM. The card pooled praise, the top
  // objection and a switch under one fixed heading, so "Beautiful, but I
  // cannot justify that for a bag" printed three lines under "IN THE
  // CUSTOMERS' WORDS" and read as an endorsement — while the switching row
  // above promised "· 1 below" and pointed into a box of three.
  it('names the row each quote in the words card came from', () => {
    for (const mode of MODES) {
      const text = renderText(WEEKLY_BLOCKS['weekly.sales'].render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('Praise ·')
      expect(text, mode).toContain('Objection ·')
      expect(text, mode).toContain('Moving between brands ·')
    }
  })
})

describe('WR5 · for content', () => {
  const block = WEEKLY_BLOCKS['weekly.content']

  it('names what is worth a reply, what is rising and what worked, each with its n', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('Does the strap come off?')
    expect(text).toContain('What moved most')
    // `t2`, not `t1`: §1's hero leads with "Will it survive a wet commute" and
    // §5 no longer repeats it (`risingMovers`).
    expect(text).toContain('5.1% · 71 of 1,388')
    // Run-indexed, unlike everything above it in this block, and the line has
    // to say so under a masthead that reads "this month so far".
    // THE LABEL IS THE READER'S WORD AND THE MULTIPLE PRINTS ITS n. The block
    // printed the stored slug (`promotional`, and one day `trend-riding`) and a
    // multiple over an unstated population.
    expect(text).toContain('Talking head outperformed Commute POV')
  })

  // THREE ROWS OF ONE SHAPE, AND ONE ALL-CAPS EYEBROW IN THE SECTION. §5 drew
  // a counted row, then a `Rail` with a mono uppercase eyebrow over sentence
  // rows carrying amber verdict pills mid-line, then a second counted row —
  // three shapes where the artboard draws three of one, and a fourth and
  // fifth all-caps eyebrow on an artefact that has one per section. The
  // rename to "What moved most" is rule (c) and is not the issue.
  it('draws its three rows in one shape and spends no extra eyebrow', () => {
    for (const mode of MODES) {
      const markup = render(block.render(weeklyFixture(), mode, ctx))
      // ONE uppercase node in the section, and it is the section's own
      // heading — the artboard's rule, one eyebrow per section.
      expect(markup.split('uppercase').length - 1, mode).toBe(1)
      // The intent label is on the cite now, in the row's own rhythm.
      expect(markupText(markup), mode).toContain('Question · under your post')
    }
  })

  // §5 NEVER REPEATS §1's OBJECT. `headlineObject`'s third arm is literally
  // `category.growing`, and §5's rows are `category.growing`'s top few — so
  // whenever the lead object was a category mover, which is the common case,
  // the artefact stated it twice: the 17.5px hero line at the top and a
  // supporting row near the foot, same object, same share, same denominator.
  // The artboard's §5 names three themes §1 does not.
  it('does not name in “what moved most” the object the hero sentence led with', () => {
    const data = weeklyFixture()
    const hero = markupText(render(WEEKLY_BLOCKS['weekly.week'].render(data, 'app', ctx)))
    expect(hero).toContain('Will it survive a wet commute')
    for (const m of data.content.rising) expect(hero).not.toContain(m.label)
    // And the row it would have taken is replaced, not left as a gap.
    expect(data.content.rising.map((m) => m.id)).toEqual(['t2'])
  })

  // THE ARTBOARD'S COUNTED ROWS (block D wave 2). Three quote rails and no
  // count anywhere left a content person unable to tell three from thirty.
  // AND IT SAYS "SURFACED", NOT "WORTH A REPLY". `inbox.total` is the length
  // of a ranked, capped list — bounded at fifteen for every tenant forever by
  // `rankEngageCandidates` — so the row prints the queue's own verb and states
  // the cap, rather than printing a cap as a count of the week.
  it('counts what the queue surfaced, and never the shown three', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text, mode).toContain('Surfaced for a reply this week')
      expect(text, mode).not.toContain('Worth a reply this week')
      expect(text, mode).toContain('question 7 · objection 3 · buying signal 2')
      expect(text, mode).toContain('1 below in full')
      // The cap disclaimer is gone (D63); the counts and "N below in full" say it.
      expect(text, mode).not.toContain('the queue ranks and caps what it shows')
      // D14: nothing records whether a comment was answered. ("answering" in
      // the cap clause is about the reader's own work, not a record of one.)
      expect(text, mode).not.toMatch(/answered|ignored/i)
    }
  })

  // The mock's head-to-head, with an n on EACH side, and D9's label: the
  // median is this UPDATE'S, not the month's.
  // AND IN THE ORDER THE TITLE READS: the winner's own n first, then the
  // runner-up's, then the basis both are against. The winner's n used to
  // arrive last, after the runner-up's, with the median clause between two n's
  // it belongs to neither of alone.
  it('prints the format head-to-head with an n on each side, winner first', () => {
    const text = renderText(block.render(weeklyFixture(), 'app', ctx))
    expect(text).toContain('31 of 402 videos carry it · Commute POV 1.8× over 24 of 402 videos · both against this update’s median video')
  })

  it('says "against" rather than "both against" where there is no runner-up', () => {
    const data = weeklyFixture()
    const alone = { ...data, content: { ...data.content, runnerUp: null } }
    const text = renderText(block.render(alone, 'app', ctx))
    expect(text).toContain('31 of 402 videos carry it · against this update’s median video')
    expect(text).not.toContain('both against')
  })

  // The heading over these rows is deliberately direction-free, and a theme's
  // share going up is not good news for having gone up.
  it('paints what moved most as movement, not as good news', () => {
    const markup = render(block.render(weeklyFixture(), 'email', ctx))
    expect(markup).not.toContain(EMAIL.greenTint)
  })

  it('keeps the inbox’s empty state verbatim rather than dropping the section', () => {
    const text = renderText(block.render(formingFixture(), 'app', ctx))
    expect(text).toContain('Nothing is waiting for a reply from this update.')
  })
})

describe('WR6 · coverage', () => {
  const block = WEEKLY_BLOCKS['weekly.coverage']

  // ONE LINE, AND THE LINE IS THE WHOLE SECTION. The header says "Coverage, in
  // one line" and the block printed `c.line`, then every sentence of
  // `recordLines` (six on this fixture), then the Reddit cap — eight blocks of
  // text under a heading that promises one. The artboard's §6 is the mono line
  // and the link grid. The sentences are one click away, behind the "the
  // record →" link in this block's own header.
  it('prints the record in one line, and nothing under it', () => {
    const markup = render(block.render(weeklyFixture(), 'app', ctx))
    const text = markupText(markup)
    expect(text).toContain('2,359 videos')
    // The record's own prose, which OV6 and the monthly §8 print and this
    // artefact must not: any one of these sentences means `lines` is back.
    expect(text).not.toContain('carried conversation in this window')
    expect(text).not.toContain('Of everything we have ever read for you')
    expect(text).not.toContain('Reading as at')
    expect(text).not.toContain('Reddit comments are capped at')
  })

  // THE REFUSALS STAY PRINTED, ON THE LINE, where the artboard ends it
  // ("· 2 comparisons refused"). A refusal is a real answer (AGENTS.md); what
  // moved is that the REASONS are behind the record link rather than in a
  // sentence of their own among four others.
  it('ends the line with the comparisons this artefact refused', () => {
    for (const mode of MODES) {
      expect(renderText(block.render(weeklyFixture(), mode, ctx)), mode).toContain('2 comparisons refused')
    }
  })

  // NULL IS NOT ZERO, and zero is not a sentence. A `report_snapshots` row
  // frozen before the field existed cannot say the number and says nothing
  // rather than claiming none were refused.
  it('says nothing about refusals where it cannot count them, and where there are none', () => {
    const data = weeklyFixture()
    for (const refused of [null, 0]) {
      const text = renderText(block.render({ ...data, coverage: { ...data.coverage, refused } }, 'app', ctx))
      expect(text, String(refused)).not.toContain('refused')
    }
  })

  // THE ARTBOARD'S §6 (block D wave 2): the update's own videos lead the line,
  // "the record →" sits in the header opposite the label, and the Reddit cap —
  // the one `methodLines` line no reading surface has ever printed — is here.
  // AND NO LONGER WITH THE UPDATE'S VIDEOS (D73): §1's meta and §3's stat row
  // both print them; the line opens on the record's own figures.
  it('does not restate this update’s videos, which §1 and §3 print', () => {
    for (const mode of MODES) {
      const text = renderText(block.render(weeklyFixture(), mode, ctx))
      expect(text).not.toContain('videos found this week')
      expect(text).toContain('3 updates')
    }
  })

  // AND IT DOES NOT REPRINT THE RULE. The same 26 italic words were drawn
  // under the masthead and again here, twice in one 640px email; the artboard
  // has them in neither position, and DESIGN.md says italic is semantic.
  it('leaves the rule to the masthead rather than printing it twice', () => {
    for (const mode of MODES) {
      expect(renderText(block.render(weeklyFixture(), mode, ctx)), mode).not.toContain(WEEKLY_RULE)
    }
  })

  it('declares no figures — every number in the record is printed by the block it rests on', () => {
    expect(blockAnswers(block, weeklyFixture()).figures).toEqual({})
  })

  it('is never empty', () => {
    for (const data of STATES) expect(block.emptyState(data)).toBeNull()
  })
})
