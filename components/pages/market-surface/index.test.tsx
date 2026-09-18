import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, figureCount, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText as markupOf, render, renderText } from '@/lib/test/render'
import { ADVICE_REQUESTED_GONE } from '@/lib/pages/market-surface'
import { MOVES_UNLOCK } from '@/lib/pages/overview'
import { pageModule } from '@/components/pages/registry'
import type { AdviceRow } from '@/lib/pages/market-surface'
import { MARKET_BLOCKS, tileRows } from './index'
import { marketConclusions } from './conclusions'
import { marketAdvice } from './advice'
import { marketCard } from './card'
import { marketMoves } from './moves'
import { marketPlans } from './plans'
import { marketSayHear } from './sayhear'
import { marketWays } from './ways'
import { marketUnlocks } from './unlocks'
import { deepLinkFixture, firstUpdateFixture, marketFixture, unrecordedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [marketFixture(), unrecordedFixture(), firstUpdateFixture(), deepLinkFixture()]

describe('Market · every block, every mode, every state', () => {
  it('keeps the copy contract', () => {
    for (const block of MARKET_BLOCKS) {
      for (const data of STATES) {
        for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
      }
    }
  })

  it('is email-safe: tables, no classes, no CSS variables', () => {
    for (const block of MARKET_BLOCKS) {
      const markup = render(block.render(marketFixture(), 'email', ctx))
      expect(markup).toContain('<table')
      expect(markup).not.toContain('class=')
      expect(markup).not.toContain('var(--')
    }
  })

  it('prints no direction word of its own anywhere on the page', () => {
    // Of its OWN. A recommendation's title is Pass D-b's imperative
    // ("Increase Content Volume…") and is rendered as `stored` under that
    // slot's policy; what this asserts is that nothing CODE writes claims a
    // direction. So the stored nodes are cut before the sweep, exactly as the
    // copy contract cuts them.
    for (const block of MARKET_BLOCKS) {
      for (const data of STATES) {
        const markup = render(block.render(data, 'app', ctx))
        const text = renderText(markup.replace(/<([a-z]+)[^>]*data-copy="stored"[^>]*>[\s\S]*?<\/\1>/g, ' '))
        expect(text).not.toMatch(/\b(gaining|fading|rising|climbing|slipping|growing|increase|improve)\b/i)
      }
    }
  })

  it('renders the model\u2019s own words as stored, naming the call that wrote them', () => {
    // The fixtures carry production strings on purpose: a recommendation title
    // with a direction word and a conclusion with a product name that has a
    // digit in it. Sanitised fixtures made these blocks pass a contract they
    // broke on every real tenant.
    const markup = render(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(markup).toContain('Increase Content Volume to Improve Share of Voice')
    expect(markup).toContain('data-slot="pass_d_b_recommendation"')
    const conclusions = render(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(conclusions).toContain('Showcase Innovations in 3D Printed Prosthetics')
    expect(conclusions).toContain('data-slot="pass_d_a_insight"')
  })

  it('mounts no export control, because no page module owns these block keys', () => {
    // THE TRIPWIRE FOR THE EXPORT CONTROL. The port mounted `ExportScope
    // page="market"`, and the page KEY `market` resolves to the LEGACY module:
    // every tile export answered "Unknown tile." and the page export handed
    // back a PDF of Market Intelligence. The control is off until a block
    // surface has an export path of its own — and the day these keys resolve,
    // this test fails and `components/pages/market-surface/index.tsx` says
    // what to re-mount.
    const legacy = pageModule('market')
    expect(legacy).not.toBeNull()
    for (const block of MARKET_BLOCKS) {
      expect(Object.hasOwn(legacy!.renderables, block.key)).toBe(false)
    }
  })

  it('declares no figures — nothing on this surface is a reading of a month', () => {
    expect(figureCount(MARKET_BLOCKS.map((b) => blockAnswers(b, marketFixture()).figures))).toBe(0)
  })

  it('declares every movement claim and every quote it prints', () => {
    // `market.advice` is a named brief section (lib/reports/documents/
    // sections.ts), and a brief folds a page through `blockAnswers` →
    // `blockReading`. A block that DRAWS a `MovementBadge` or a `BlockQuote`
    // and declares neither hands the brief a reading that cannot see its own
    // page's claims — which is what all four of these blocks did.
    const data = marketFixture()
    const answers = Object.fromEntries(MARKET_BLOCKS.map((b) => [b.key, blockAnswers(b, data)]))

    // Every Verdict the page renders a badge for is declared, and each carries
    // both sides and its band, as a Verdict always does.
    expect(answers['market.advice'].verdicts).toHaveLength(1)
    expect(answers['market.card'].verdicts.length).toBeGreaterThan(0)
    expect(answers['market.moves'].verdicts.length).toBeGreaterThan(0)
    // A declared verdict is a whole one: both sides, the state, and the band
    // beside the change or neither (D2).
    for (const key of ['market.advice', 'market.card', 'market.moves']) {
      for (const v of answers[key].verdicts) {
        expect(v.value).toBeDefined()
        expect(v.state).toBeTruthy()
        expect(v.changePts == null).toBe(v.bandPts == null)
      }
    }

    // Every quote the page shows is declared BY REF — the words never travel
    // in an answer, so a freeze keeps the ref and resolves them at render.
    expect(answers['market.advice'].quotes).toEqual(['e:ev-1'])
    expect(answers['market.plans'].quotes).toEqual(['e:ev-9'])

    // And the declaration matches what is DRAWN, not merely what is held: the
    // ledger holds one quote and draws it on the row `expandedLineage` opens,
    // and the plan card draws the lead claim's comment. Both are asserted by
    // the words that reach the page.
    const ledger = renderText(marketAdvice.render(data, 'app', ctx))
    expect(ledger).toContain('Wat gebeur as')
    const plans = renderText(marketPlans.render(data, 'app', ctx))
    expect(plans).toContain('Ek kyk eers of dit hou')
  })

  it('declares no verdict and no quote where the state has none', () => {
    const data = firstUpdateFixture()
    for (const block of MARKET_BLOCKS) {
      const a = blockAnswers(block, data)
      expect(a.verdicts.every((v) => v != null)).toBe(true)
      expect(a.quotes.every((q) => typeof q === 'string' && q.length > 0)).toBe(true)
    }
  })
})

describe('the tiles are as tall as what they draw', () => {
  // A tile is `overflow-hidden` over a fixed N × 116px grid area at >= xl, so a
  // block taller than its span is CUT with no scrollbar and no affordance, and
  // a block shorter than it shows empty ground. The port set one table of
  // constants from a fixture thinner than the page: the ledger draws three rows
  // in the fixture and twelve in production, where it wanted 1,435px of a 644px
  // box — rows 5 to 12, the acted line and the grounding note all gone.
  //
  // These are the RULES the estimate has to keep. The pixel constants behind it
  // were measured in a browser at 1280 (the low end of the primary range, where
  // these tiles are tallest); this asserts the arithmetic and the shape.
  const twelveRowLedger = () => {
    const base = marketFixture()
    const rows: AdviceRow[] = Array.from({ length: 12 }, (_, i) => ({
      ...base.advice.rows[i % base.advice.rows.length],
      lineageId: `L-${i}`,
      recommendationId: `r-${i}`,
      number: i + 1,
    }))
    return { ...base, advice: { ...base.advice, rows } }
  }

  it('grows the ledger with its rows, up to the twelve production draws', () => {
    const three = tileRows(marketFixture())['market.advice']
    const twelve = tileRows(twelveRowLedger())['market.advice']
    expect(three).toBe(5)
    // 11 row units is 1,436px, which is what twelve rows measured.
    expect(twelve).toBe(11)
    expect(twelve).toBeGreaterThan(three)
  })

  it('shrinks the arm every new workspace starts in', () => {
    // The gather fills up over time, so this is the first weeks of every
    // account rather than an edge case: half a page of white inside shadowed
    // boxes is what a client met.
    const full = tileRows(marketFixture())
    const thin = tileRows(firstUpdateFixture())
    const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
    expect(total(thin)).toBeLessThan(total(full))
    expect(thin['market.advice']).toBe(2)
  })

  it('gives the tiles that sit beside each other one height', () => {
    // A per-tile span inside one grid line lets CSS grid flow the next tile up
    // into the gap beside a short one, which reorders the page.
    for (const data of STATES) {
      const rows = tileRows(data)
      expect(rows['market.card']).toBe(rows['market.moves'])
      expect(rows['market.sayhear']).toBe(rows['market.plans'])
      expect(rows['market.plans']).toBe(rows['market.unlocks'])
    }
  })

  it('never asks for a span the grid cannot draw', () => {
    for (const data of [...STATES, twelveRowLedger()]) {
      for (const [key, span] of Object.entries(tileRows(data))) {
        expect(span, key).toBeGreaterThanOrEqual(2)
        expect(span, key).toBeLessThanOrEqual(12)
        expect(Number.isInteger(span)).toBe(true)
      }
    }
  })

  it('answers for every block on the page', () => {
    const rows = tileRows(marketFixture())
    for (const block of MARKET_BLOCKS) expect(rows[block.key]).toBeGreaterThan(0)
  })
})

describe('MK1 · what we concluded', () => {
  it('labels a conclusion below the evidence bar rather than hiding it', () => {
    // CHANGED BY THE ARTBOARD PORT (wave 2). The below-bar rows moved behind
    // the artboard's footer control in `app` — counted by name in the summary,
    // one press away — and are drawn INLINE in print and email, where there is
    // nothing to press. Both arms are asserted, because "labelled, not hidden"
    // is a rule about every mode and a disclosure only satisfies it where a
    // reader can open it. The meta line is the mock's: one number above the bar
    // against the total concluded, where this restated the three tier counts
    // the chips beneath it already spell out.
    const app = renderText(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(app).toContain('Strong evidence')
    expect(app).toContain('Early signal')
    expect(app).toContain('Below the evidence bar')
    expect(app).toContain('1 below the bar this update')
    expect(app).toContain('2 above the bar · of 9 concluded')
    expect(app).not.toMatch(/\bconfirmed\b/)
    const print = renderText(marketConclusions.render(marketFixture(), 'print', ctx))
    expect(print).toContain('Below the evidence bar')
    expect(print).toContain('Showcase Innovations in 3D Printed Prosthetics')
  })

  it('flags a conclusion as New only where it holds an earlier month to compare, and says what New means', () => {
    // `recurrence` is `recurrenceOf` over the leading theme registry id: the
    // first row has three months behind it, the third has one and is new, and
    // the second has no month reading at all — which is NOT new and carries no
    // chip, because an absent record is not a new theme.
    const markup = render(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(markup.match(/>New</g) ?? []).toHaveLength(1)
    // The sentence says what the query asks for: mentioned, in the client's
    // audience or the category — never the wider "read" it used to promise
    // (`recurrenceForTarget` counts `k > 0` over `MARKET_AUDIENCES`).
    expect(renderText(markup)).toContain('New means no earlier month in which the theme behind it was mentioned, in your audience or in the category')
  })

  it('says a conclusion has nothing behind it in words, and drops the chip’s tint rather than its label', () => {
    // The second fixture row is an early signal with `videos: 0`: the chip
    // promised evidence while the count beside it said there was none, and
    // "0 of 1,699" is a share whose numerator says the record is empty.
    const markup = render(marketConclusions.render(marketFixture(), 'app', ctx))
    const text = renderText(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(text).toContain('no videos we can still count behind it')
    expect(text).not.toContain('0 of 1,699')
    // The tier is still labelled — MK1's gate is that a row is labelled, never
    // hidden — and the amber is spent only where there is evidence.
    expect(text).toContain('Early signal')
    expect(markup).toContain('bg-inner text-muted-foreground')
  })

  it('counts every row below the bar, not only the ones it drew', () => {
    // `rows` is capped at CONCLUSIONS_SHOWN and `belowBar` counts them all, so
    // a tenant with more than eight conclusions saw the summary under-count
    // exactly the rows "labelled, never hidden" is about.
    const base = marketFixture()
    const data = { ...base, conclusions: { ...base.conclusions, belowBar: 4 } }
    const text = renderText(marketConclusions.render(data, 'app', ctx))
    expect(text).toContain('4 below the bar this update')
    expect(text).toContain('1 of them are on this page')
    // Where nothing is past the cap, the disclosure says nothing extra.
    expect(renderText(marketConclusions.render(base, 'app', ctx))).not.toContain('are on this page')
  })

  it('dates the conclusions by the update that reached them, with the word update on it', () => {
    const text = renderText(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(text).toContain('concluded with the update of 27 Sep')
  })

  it('links each conclusion’s themes into Voice by slug', () => {
    const markup = render(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/voice?themes=comfort_and_fit')
  })

  it('prints the sort it actually used', () => {
    const text = renderText(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(text).toContain('Ordered by strongest evidence first, then by how many videos are behind it')
  })

  it('counts the videos behind a conclusion out of the corpus it counted them over', () => {
    // `distinctVideos` counts over the WHOLE corpus — Össur has 1,699 analysed
    // videos — and "301 videos behind it" under a heading reading "this month",
    // beside a Competitive surface saying September held 449, is a share of the
    // month that does not exist. The copy contract cannot catch it: the node is
    // a figure, and only a level must carry its "of N".
    const text = renderText(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(text).toContain('157 of 1,699 videos behind it')
    expect(text).toContain('not over this month alone')
  })

  it('says the bare count when the corpus could not be read, never a made-up denominator', () => {
    const base = marketFixture()
    const data = { ...base, conclusions: { ...base.conclusions, corpusVideos: null } }
    const text = renderText(marketConclusions.render(data, 'app', ctx))
    expect(text).toContain('157 videos behind it')
    expect(text).not.toMatch(/157 of \d/)
  })
})

describe('MK2 · the ledger', () => {
  it('draws the artboard’s seven columns, with the identity, the grounding and the afterwards', () => {
    // CHANGED BY THE ARTBOARD PORT (wave 2). Four columns became seven: the #
    // a person can say out loud, the evidence behind each row and what the
    // conversation did after the client decided — the three tracks wave 1
    // built the fields for. "What it was" became the artboard's
    // "Recommendation", and "First made" its "First raised", stacked over the
    // months the advice has been standing.
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toContain('Recommendation')
    expect(text).toContain('First raised')
    expect(text).toContain('Grounded in')
    expect(text).toContain('Afterwards')
    expect(text).toContain('Jun')
    expect(text).toContain('3 months')   // the age, stacked under the month
    expect(text).toContain('Done')
    expect(text).toContain('2 Sep')      // the row decided this month
    expect(text).toContain('3 videos')   // grounded in, counted
  })

  it('does not print two different "New"s one column apart', () => {
    // The artboard's chip in Repeated is the word "New", and Your decision
    // prints "New" for an undecided row — two words spelled the same, one
    // column apart, meaning "raised this month" and "you have not decided".
    // The chip is the one that moves, and its basis (and its clock) is printed
    // under the table rather than left in a title.
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toContain('First time')
    expect(text).toContain('First time marks a row first raised by an update inside this month')
    expect(text).toContain('the update’s clock, not the comment’s')
    // "New" survives exactly where the status column puts it.
    expect((text.match(/\bNew\b/g) ?? [])).toHaveLength(1)
  })

  it('counts the repeats in UPDATES, with the word updates on them', () => {
    // D9: `timesMade` counts updates, and the column printed calendar months
    // with nothing saying so. Production's only repeat came back three days
    // later, which "2 months" reads as a second month.
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toContain('2 updates running')
    expect(text).toContain('1 update')
    expect(text).toContain('in 2 months')
  })

  it('never leaves the afterwards cell blank, and prints the clustering caveat beside the verdict', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    // The drawn comparison: both sides, both denominators, the band, and the
    // badge — which refuses, so no magnitude travels with it (D2).
    expect(text).toContain('21 of 130 videos in your audience')
    expect(text).toContain('too few to compare')
    expect(text).toContain('like for like')
    // The two silences, each its own sentence rather than a dash.
    expect(text).toContain('We start reading the month after you do.')
    expect(text).not.toMatch(/Afterwards\s+—/)
  })

  it('says the evidence was replaced rather than printing zero videos behind a row', () => {
    // Every cited `audience_insights` row of Sealand's twelve drawn rows has
    // been pruned, so the column would otherwise read "0 videos" down the page.
    const text = renderText(marketAdvice.render(unrecordedFixture(), 'app', ctx))
    expect(text).toContain('evidence replaced')
    expect(text).not.toContain('0 videos')
  })

  it('draws one row expanded, with its argument and its comment as separate nodes', () => {
    const markup = render(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(markup).toContain('Why we keep raising it')
    // The comment is its own node with its own ref — never a span inside the
    // scrubbed argument, because a number in a quotation is still refused.
    expect(markup).toContain('Wat gebeur as')
    expect(renderText(markup)).toContain('Repair and warranty questions arrive as questions')
  })

  it('prints the status word on a row still marked New, where the parked page prints nothing', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'print', ctx))
    expect(text).toContain('New')
  })

  it('says how many of the whole ledger have been acted on, and never claims a quarter', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    // TWO, matching the two rows the fixture draws as Done. The count is over
    // all 64 identities, and it may not be smaller than what the table shows.
    expect(text).toContain('acted on 2 of 64')
    expect(text).not.toMatch(/quarter/i)
  })

  it('puts the derivation one press from the number, and prints it inline where nothing can be pressed', () => {
    // Three tiles ended in a wall of 11px grey prose that a reader's eye skips
    // — which is the one thing a stated basis must not do. It is behind the
    // page's own dotted-underline disclosure in `app` and INLINE in print and
    // email, where there is nothing to press: a disclosure nobody can open is
    // a basis that has been hidden.
    const app = render(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(app).toContain('<details')
    expect(app).toContain('How these columns count')
    expect(renderText(marketAdvice.render(marketFixture(), 'app', ctx))).toContain('Grounded in counts the videos')
    for (const mode of ['print', 'email'] as RenderMode[]) {
      const markup = render(marketAdvice.render(marketFixture(), mode, ctx))
      expect(markup).not.toContain('<details')
      expect(markupOf(markup)).toContain('Grounded in counts the videos')
    }
    // Same rule on the other three blocks that carry one.
    for (const block of [marketConclusions, marketPlans, marketSayHear]) {
      expect(render(block.render(marketFixture(), 'app', ctx))).toContain('<details')
      expect(render(block.render(marketFixture(), 'print', ctx))).not.toContain('<details')
    }
  })

  it('explains the within-month repeat once underneath, where the column now counts updates', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toContain('inside one calendar month')
    expect(text).toContain('Grounded in counts the videos behind a piece of advice')
  })

  it('names the after-line only while no row on the page answers in that column', () => {
    // The unlock named the ABSENCE of an Afterwards column. The column exists
    // now, so the sentence prints where nothing has been read — production
    // today — and not beside a table that answers.
    expect(renderText(marketAdvice.render(unrecordedFixture(), 'app', ctx)))
      .toContain('What the conversation did after you acted')
    expect(renderText(marketAdvice.render(marketFixture(), 'app', ctx)))
      .not.toContain('What the conversation did after you acted')
  })

  it('says when decisions are not being written down at all', () => {
    const data = marketFixture()
    const text = renderText(marketAdvice.render({ ...data, advice: { ...data.advice, recorded: false } }, 'app', ctx))
    expect(text).toContain('not being written down')
  })

  it('says advice lands with the next update when the ledger is empty', () => {
    expect(marketAdvice.emptyState(firstUpdateFixture())).toBe('Advice lands with your next update.')
  })

  it('gives every row an address, and lands a deep link on the row it names', () => {
    // `?rec=<id>` is in four sent emails and every digest until WP17. It used
    // to resolve to a lineage that reached only MK5's accept button, so a
    // reader following one landed on a ledger of the oldest twelve that did
    // not contain the row they clicked.
    const data = deepLinkFixture()
    const markup = render(marketAdvice.render(data, 'app', ctx))
    expect(markup).toContain(`id="advice-${data.advice.highlight}"`)
    expect(markup).toContain(`/dashboard/market?item=${data.advice.highlight}`)
    expect(renderText(marketAdvice.render(data, 'app', ctx))).toContain('This is the piece of advice your link named.')
  })

  it('says so when the link names advice the ledger no longer holds', () => {
    const base = marketFixture()
    const data = { ...base, advice: { ...base.advice, highlight: null, requestedLine: ADVICE_REQUESTED_GONE } }
    expect(renderText(marketAdvice.render(data, 'app', ctx))).toContain('no longer holds')
  })

  it('counts the rows it did not draw, as the footer’s right-hand note', () => {
    // The artboard's footer note is "Jul → Sep 2026", which D12 refuses: the
    // denominator is every identity ever recommended and has no quarter. What
    // the note can honestly say is how much of the ledger is on the page.
    //
    // CHANGED BY THE FIX PASS. It printed the CONSTANT `LEDGER_SHOWN` on the
    // left and the computed remainder on the right, so this fixture — 3 rows
    // of 64 — read "12 oldest shown · 61 behind them", and 12 + 61 = 73. The
    // assertion held the wrong sentence in place, which is why the rule below
    // is now the arithmetic and not a string: the two halves are the same
    // array counted twice and they must add to the total.
    const data = marketFixture()
    const text = renderText(marketAdvice.render(data, 'app', ctx))
    expect(text).toContain('3 shown · 61 behind them')
    expect(text).not.toContain('12 oldest shown')
    expect(text).not.toMatch(/quarter/i)
    const shown = data.advice.rows.length
    const behind = Number((text.match(/(\d+) behind them/) ?? [])[1])
    expect(shown + behind).toBe(data.advice.total)
  })

  it('never states a row count the table is not showing, in any state', () => {
    // Every state that draws a footer note: the note's two halves come off the
    // rows on the page, so a loader returning fewer rows than the cap — or the
    // deep-link arm, which APPENDS a row and draws one MORE than the cap —
    // still adds up.
    for (const data of [marketFixture(), unrecordedFixture(), deepLinkFixture()]) {
      const text = renderText(marketAdvice.render(data, 'app', ctx))
      const note = text.match(/(\d+) shown · ([\d,]+) behind them/)
      if (!note) continue
      expect(Number(note[1])).toBe(data.advice.rows.length)
      expect(Number(note[1]) + Number(note[2].replace(/,/g, ''))).toBe(data.advice.total)
    }
  })
})

describe('the handover fixture does not argue with itself', () => {
  // Rule 6 of the brief makes this fixture wave 2's handover, and wave 2 will
  // render these blocks side by side from it. Two numbers in it are read off
  // the rows rather than typed, because both had come to disagree with the
  // table beside them.
  it('counts the comparisons its own ledger refused', () => {
    const data = marketFixture()
    const drawn = data.advice.rows.map((r) => r.afterwards.verdict).filter((v) => v != null)
    // One comparison drawn, and it could not be answered: the baseline is
    // 9 of 104 and SHARE_BAND's floor is 10, so `proportionDelta` reads thin.
    expect(drawn).toHaveLength(1)
    expect(drawn[0]!.state).toBe('too_little_data')
    expect(data.record.lines.join(' ')).toContain('1 comparison was refused')
    expect(data.record.lines.join(' ')).not.toContain('Nothing was refused')
  })

  it('never says fewer have been acted on than the table shows as Done', () => {
    const data = marketFixture()
    const done = data.advice.rows.filter((r) => r.statusLabel === 'Done').length
    expect(done).toBe(2)
    expect(data.advice.acted).toBeGreaterThanOrEqual(done)
    expect(data.advice.actedLine).toContain('2 of 64')
  })
})

describe('MK4 · declared moves', () => {
  it('names the month a move’s first score lands in, and never a number of updates', () => {
    const text = renderText(marketMoves.render(marketFixture(), 'app', ctx))
    expect(text).toContain('first scoring lands with the October reading')
    expect(text).not.toMatch(/tracked for \d+ updates?/i)
  })

  it('tells "not recorded here" apart from "nothing dated yet"', () => {
    expect(marketMoves.emptyState(unrecordedFixture())).toContain('not recorded for this workspace yet')
    expect(marketMoves.emptyState(firstUpdateFixture())).toContain('Nothing dated yet')
  })

  it('names the unlock without naming a month for it', () => {
    const text = renderText(marketMoves.render(marketFixture(), 'app', ctx))
    // Changed by Block D · D2: the card and the scoring are built, so the
    // block's unlock says what it does instead of what it does not.
    expect(text).toContain(MOVES_UNLOCK)
    expect(text).not.toMatch(/not built yet/)
    expect(text).not.toMatch(/bottom section/)
  })
})

describe('MK5 · how a move is made', () => {
  // THREE OF FIVE SINCE D4 — "Upload a plan" was named as not built while the
  // feature ran on Ask; Market now reads the result back and the row links to
  // where a document is uploaded. The ARTBOARD PORT (wave 2) turned the five
  // stacked paragraphs into the artboard's row of 44px controls, and moved the
  // say-vs-hear claims out into their own card (`market.sayhear`).
  it('lists five ways and says how many work today', () => {
    const text = renderText(marketWays.render(marketFixture(), 'app', ctx))
    expect(text).toContain('five ways in · 3 of 5 work today')
    expect(text).toContain('Confirm this month\u2019s card')
    expect(text).toContain('Track this')
    expect(text).toContain('Register a claim you make')
    expect(text).toContain('Upload a plan')
  })

  it('sends Track this to the surface that has a subject in hand', () => {
    const markup = render(marketWays.render(marketFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/subjects')
  })

  it('draws the accept button in the app and nowhere else, in its own slot', () => {
    const app = render(marketWays.render(marketFixture(), 'app', ctx))
    expect(app).toContain('Accept this advice')
    // The row it would act on is named beneath the button rather than in a
    // paragraph under the whole list.
    expect(renderText(app)).toContain('The oldest you have not decided on')
    expect(render(marketWays.render(marketFixture(), 'print', ctx))).not.toContain('<button')
    expect(render(marketWays.render(marketFixture(), 'email', ctx))).not.toContain('<button')
  })

  it('keeps a way that does not work as a slot with its unlock, never a live control', () => {
    const markup = render(marketWays.render(marketFixture(), 'app', ctx))
    expect(renderText(markup)).toContain('Registering a claim')
    // "Register a claim you make" is not live, so it is not a link.
    expect(markup).not.toMatch(/<a[^>]*>\s*Register a claim you make/)
  })

  it('announces a dead way as disabled and prints the sentence a mouse used to have to find', () => {
    // It was a <span> wearing the live button's ring: not focusable, no role,
    // no aria-disabled, and its "how" in a `title` no keyboard and no touch
    // reaches — told apart from a working control by a colour shift alone.
    const markup = render(marketWays.render(marketFixture(), 'app', ctx))
    expect(markup).toContain('aria-disabled="true"')
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Register a claim you make<\/button>/)
    // The "how" of a dead way is now on the page, not only in a tooltip.
    expect(renderText(markup)).toContain('each with its verdict per month')
    // And paper still draws no control at all.
    expect(render(marketWays.render(marketFixture(), 'print', ctx))).not.toContain('<button')
  })
})

describe('MK5b · say vs hear', () => {
  it('is its own card, with the verdicts and the hold they do not have', () => {
    const text = renderText(marketSayHear.render(marketFixture(), 'app', ctx))
    expect(text).toContain('Say vs hear')
    expect(text).toContain('3 claims · your audience')
    expect(text).toContain('Pushed back')
    expect(text).toContain('how each claim reads in the latest update')
    expect(text).toContain('held across two updates')
  })

  it('prints no per-claim count, because `SayVsHearEntry` carries none', () => {
    // The artboard writes "echoed 14 videos · pushed back 3". The schema has no
    // count field and lib/pipeline is not this package's to change, so the
    // card prints the verdict and says what the verdict is worth.
    const text = renderText(marketSayHear.render(marketFixture(), 'app', ctx))
    expect(text).not.toMatch(/echoed \d/)
    expect(text).not.toMatch(/pushed back \d/)
  })

  it('says so when nothing of the client\u2019s own was read this update', () => {
    expect(marketSayHear.emptyState(unrecordedFixture())).toContain('Nothing you have said in your own posts')
  })
})

describe('MK3 · this month\u2019s card', () => {
  it('counts the posts, the floor and the claims, each against the population it is a share of', () => {
    const text = renderText(marketCard.render(marketFixture(), 'app', ctx))
    expect(text).toContain('posts published in September')
    expect(text).toContain('cleared the comment floor')
    expect(text).toContain('Claims you made')
    // The subject rows denominate on what was READ, not on what was published.
    expect(text).toMatch(/Counted over posts/)
  })

  it('leads the hooks row with a hook, and prints the label or the basis but not both', () => {
    // The row read "Hooks  of 17 posts: not classified 12 · a personal story 3
    // · a / bold claim 1" — the largest bucket first is the one that says
    // nothing about a hook, and a single right-aligned string broke wherever
    // the line ran out. The denominator stays at the head, which is what makes
    // the whole node a level.
    const text = renderText(marketCard.render(marketFixture(), 'app', ctx))
    expect(text).toMatch(/of 17 posts: a personal story 3/)
    expect(text).toMatch(/not classified 12$|not classified 12 /)
    // The email arm printed "17 posts published · posts published in
    // September" — the label and the basis, which are the same words.
    const email = renderText(marketCard.render(marketFixture(), 'email', ctx))
    expect(email).toContain('posts published in September')
    expect(email).not.toContain('posts published · posts published')
  })

  it('names the press rather than drawing a button nobody can press', () => {
    const text = renderText(marketCard.render(marketFixture(), 'app', ctx))
    expect(text).not.toContain('Yes, count this as a move')
    expect(text).toContain(MOVES_UNLOCK)
  })

  it('keeps every level and its "of N" in one cell, and prints two claims as two rows', () => {
    // The movement rows ran as one sentence in a justify-between row and broke
    // as "26 of 84 videos against 23 / of 85" with the badge in the gap — the
    // reading rule (b) exists to prevent. `FigureCell` (wave 1) holds the pair
    // as one unit and stamps its own markers.
    const markup = render(marketCard.render(marketFixture(), 'app', ctx))
    const text = renderText(marketCard.render(marketFixture(), 'app', ctx))
    expect(text).toMatch(/26 of 84 videos/)
    expect(text).toMatch(/23\s*of 85/)
    // The claims are not one truncated line: two claims that share an opening
    // print as two distinguishable rows, each reaching its own second line.
    expect(markup).not.toContain('truncate text-[12.5px]')
    expect(markup).toContain('line-clamp-3')
    // The email arm keeps both halves on one line, where they cannot break.
    const email = renderText(marketCard.render(marketFixture(), 'email', ctx))
    expect(email).toContain('26 of 84 videos')
    expect(email).toContain('23 of 85')
  })

  it('prints the two movement rows as verdicts, with no magnitude beside a refusal', () => {
    const markup = render(marketCard.render(marketFixture(), 'app', ctx))
    // D2: a verdict carries the change and the band together or neither.
    expect(markup).toContain('data-copy="verdict"')
    expect(renderText(markup)).not.toMatch(/too few to compare\s*[\u25b2\u25bc]/)
  })
})

describe('MK6 · plans re-checked', () => {
  it('prints the three verdict counts against the claims they partition', () => {
    const text = renderText(marketPlans.render(marketFixture(), 'app', ctx))
    // The DOCUMENT'S OWN NAME leads, not a model-written title of it.
    expect(text).toContain('summer-2627-brief.pdf')
    expect(text).toContain('Supported 1 of 3')
    expect(text).toContain('Contradicted 1 of 3')
    expect(text).toContain('Untested 1 of 3')
  })

  it('dates the chips by the re-reading, and never claims a verdict was held', () => {
    const text = renderText(marketPlans.render(marketFixture(), 'app', ctx))
    expect(text).toContain('as re-read on 13 Sep')
    expect(text).not.toMatch(/held \d+ updates?/)
  })

  it('says what a claim count is a count of, and what the floor is', () => {
    const text = renderText(marketPlans.render(marketFixture(), 'app', ctx))
    expect(text).toContain('not out of one month')
    expect(text).toContain('nothing here is held')
  })

  it('says how many plans have been checked when it is drawing one of several', () => {
    const base = marketFixture()
    const two = { ...base, plans: [base.plans[0], { ...base.plans[0], planId: 'pc-2' }] }
    expect(renderText(marketPlans.render(two, 'app', ctx))).toContain('newest of 2 checked')
    expect(renderText(marketPlans.render(base, 'app', ctx))).not.toContain('newest of')
  })

  it('names its own absence for a workspace with no plan', () => {
    expect(marketPlans.emptyState(unrecordedFixture())).toContain('No plan has been checked')
  })
})

describe('MK4 · a move, read', () => {
  it('draws the chart only where three readings stand behind it', () => {
    const markup = render(marketMoves.render(marketFixture(), 'app', ctx))
    // The fixture's move has three months in one regime, so the line is drawn.
    expect(markup).toContain('<svg')
    expect(renderText(markup)).toContain('You · 10 of 84 videos')
    expect(renderText(markup)).toContain('Freitag · 41 of 142 videos')
  })

  it('marks the declaration on the line the verdict compares across', () => {
    // The verdict under the chart says "before it was declared" and the line
    // carried no mark for where "before" ended. `MoveReading.declaredAt` is
    // the rule's date; the tick prints it and the rule's own title says what
    // it is, because the four `CalendarRule` kinds are a pen and not a
    // taxonomy this block may extend.
    const markup = render(marketMoves.render(marketFixture(), 'app', ctx))
    expect(markup).toContain('Move declared')
    // The rule's tick carries the declaration's own day, drawn on the axis it
    // belongs to, beside the meta that already named it.
    const text = renderText(marketMoves.render(marketFixture(), 'app', ctx))
    expect(text).toContain('Move declared — Push repairability 12 Aug')
    expect(text).toContain('declared 12 Aug')
    expect(text).toContain('before it was declared')
  })

  it('prints the control beside the move and never subtracted from it', () => {
    const text = renderText(marketMoves.render(marketFixture(), 'app', ctx))
    expect(text).toContain('Beside it, the category')
    expect(text).not.toMatch(/net of|adjusted for|minus the category/i)
  })
})

describe('the sections that are not built', () => {
  it('names MK3 with an owner and no invented date', () => {
    const text = renderText(marketUnlocks.render(marketFixture(), 'app', ctx))
    // THE CARD IS BUILT; THE PRESS IS NOT — so the row that is listed here as
    // missing names the confirming, not the card (Phase 1 D2 fix pass). MK6 is
    // not asserted here: this fixture now carries a checked plan, so D4 drops
    // that row — the test below owns it.
    expect(text).toContain('Confirming this month’s card')
    expect(text).toContain('The card is read above')
    expect(text).toContain('Verbatim engineering')
    expect(text).not.toMatch(/by \d{1,2} \w+/)
  })

  // MK6 IS NAMED ONLY WHERE IT IS ABSENT (D4). A workspace with a checked plan
  // sees the card; one with none still sees the row, now owned by the reader
  // rather than by engineering, because uploading is the thing that is missing.
  it('names MK6 for a workspace with no plan, and drops it once there is one', () => {
    expect(renderText(marketUnlocks.render(unrecordedFixture(), 'app', ctx))).toContain('Plans re-checked')
    expect(renderText(marketUnlocks.render(marketFixture(), 'app', ctx))).not.toContain('Plans re-checked')
  })
})
