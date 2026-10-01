import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, figureCount, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { markupText as markupOf, render, renderText } from '@/lib/test/render'
import { ADVICE_REQUESTED_GONE } from '@/lib/pages/market-surface'
import { afterwardsFor, GROUNDED_BASIS } from '@/lib/reading/afterwards'
import { pairOn } from '@/lib/reading/pairs'
import { sealandJudge } from '@/lib/test/sealand-pairs'
import { marketClaimEcho } from '@/lib/reading/own-posts'
import { MOVES_UNLOCK } from '@/lib/pages/overview'
import { pageModule } from '@/components/pages/registry'
import type { AdviceRow } from '@/lib/pages/market-surface'
import { MARKET_BLOCKS, MOVES_STACKS, MarketSurfacePage, drawnOnMarket, startClasses, tileGrid } from './index'
import { marketConclusions } from './conclusions'
import { CURRENT_TAG, EARLIER_ADVICE, marketAdvice, whyHeading } from './advice'
import { marketCard } from './card'
import { marketMoves } from './moves'
import { marketPlans } from './plans'
import { marketSayHear } from './sayhear'
import { marketWays } from './ways'
import { marketQuestions } from './questions'
import { deepLinkFixture, firstUpdateFixture, marketFixture, sealandMovesFixture, unrecordedFixture } from './fixture'
import { moveReadingFixture } from '@/components/pages/overview/fixture'
import { MOVE_SUBJECT_FAILED } from '@/lib/reading/moves'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [marketFixture(), unrecordedFixture(), firstUpdateFixture(), deepLinkFixture(), sealandMovesFixture()]

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

  it('declares figures only where it reads the month in the market (WP3.6 Y1, Y3)', () => {
    // Until WP3.6 nothing on this surface was a reading of a month. The
    // questions (Y1) and the claims' market counts (Y3) are, and they declare
    // what they print; every other block still declares none.
    const reading = new Set(['market.questions', 'market.sayhear'])
    expect(figureCount(MARKET_BLOCKS.filter((b) => !reading.has(b.key)).map((b) => blockAnswers(b, sealandMovesFixture()).figures))).toBe(0)
    const q = blockAnswers(marketQuestions, sealandMovesFixture()).figures
    // The three question themes; no subject, since none is ready on
    // production (T0a, YM-9; ruling U6).
    expect(Object.values(q).map((f) => f.value)).toEqual([21, 20, 11])
    const sh = blockAnswers(marketSayHear, sealandMovesFixture()).figures
    expect(Object.values(sh).map((f) => f.value)).toEqual([25, 89, 0])
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
  // 2026-09-24. The page used to estimate each block's height in px from its
  // data and turn that into a row span, because `PageGrid`'s rows were a fixed
  // 116px under an `overflow-hidden` tile. Production found both failure
  // directions: the conclusions tile's last row sat under the next section's
  // heading, and the ledger (67 recommendations, a span of twelve) ended 600px
  // above its own card's bottom edge. The grid's rows are `minmax(116px, auto)`
  // now; these are the rules that replace the estimate.
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

  it('claims one row unit per tile as a floor, whatever the data', () => {
    // A span computed from the data is a guess at what the grid now measures.
    for (const place of Object.values(tileGrid())) expect(place.row).toBe(1)
    for (const data of [...STATES, twelveRowLedger()]) {
      const markup = render(<MarketSurfacePage data={data} />)
      expect(markup).not.toMatch(/xl:row-span-(?:[2-9]|1[0-2])\b/)
      expect(markup).not.toMatch(/min-h-\[(?!116px)\d+px\]/)
      expect(markup).toContain('xl:auto-rows-[minmax(116px,auto)]')
    }
  })

  it('draws the page in the preview’s order: in one line, questions, advice, say and hear, the moves pair, then the tail (WP3.6)', () => {
    // The readings are one full-width row each; your moves and the month's
    // card sit side by side from xl, each as tall as it draws.
    expect(render(<MarketSurfacePage data={marketFixture()} />)).toContain('xl:items-start')
    const grid = tileGrid()
    expect(grid['market.line'].rowStart).toBe(1)
    expect(grid['market.questions'].rowStart).toBe(2)
    expect(grid['market.advice'].rowStart).toBe(3)
    expect(grid['market.sayhear'].rowStart).toBe(4)
    expect(grid['market.conclusions'].rowStart).toBe(1)
    expect(grid['market.unlocks']).toBeUndefined()
    expect(MOVES_STACKS.map((st) => st.keys)).toEqual([['market.moves'], ['market.card']])
    expect(MOVES_STACKS.reduce((n, st) => n + st.col, 0)).toBe(12)
    const markup = render(<MarketSurfacePage data={sealandMovesFixture()} />)
    expect(markup).toContain('contents xl:flex xl:min-w-0 xl:flex-col xl:gap-6 xl:col-span-6')
    const at = (title: string) => markup.indexOf(title)
    const order = ['In one line', 'Questions to answer', 'The advice, and what you decided', 'What you say, and what your market says back', 'What we concluded', 'Plans re-checked', 'How a move is made']
    expect(order.map(at).every((i) => i >= 0)).toBe(true)
    expect([...order.map(at)].sort((a, b) => a - b)).toEqual(order.map(at))
    // The moves pair sits between say-and-hear and the conclusions.
    const moves = markup.indexOf('Your moves', at('What you say, and what your market says back'))
    expect(moves).toBeGreaterThan(at('What you say, and what your market says back'))
    expect(moves).toBeLessThan(at('What we concluded'))
  })

  it('gives every start a class Tailwind can see', () => {
    // Class strings are written out in full, never interpolated (the rule
    // components/shell/tile.tsx follows). A start the map has no entry for
    // would silently fall back and stack two tiles in one column.
    for (const place of Object.values(tileGrid())) {
      if (place.col === 12) continue // a full-width line pins nothing (WP3.6)
      const classes = startClasses(place)
      expect(classes, JSON.stringify(place)).toBe(`xl:col-start-${place.colStart} xl:row-start-${place.rowStart}`)
    }
  })

  it('answers for every block on the page', () => {
    const grid = tileGrid()
    const stacked = MOVES_STACKS.flatMap((st) => st.keys)
    for (const block of MARKET_BLOCKS) {
      expect(grid[block.key] != null || stacked.includes(block.key) || block.key === 'market.ways', block.key).toBe(true)
    }
  })

  it('spends the dotted underline only on something that opens', () => {
    // MASTER rule 5 makes the decoration a promise, and
    // `components/claim-popover.tsx` states it: nothing gets this treatment
    // unless it can open. Five counts wore it as a bare span — the two
    // conclusion figures and the three grounding cells — on a page where every
    // Derivation summary wears it and does open.
    for (const block of MARKET_BLOCKS) {
      for (const data of STATES) {
        // Cut every pressable element whole — the decoration may sit on it or
        // on a span inside it — and nothing decorated may be left over.
        const markup = render(block.render(data, 'app', ctx))
          .replace(/<(summary|button|a)\b[\s\S]*?<\/\1>/g, ' ')
        expect(markup, `${block.key} decorates something that cannot be pressed`).not.toContain('decoration-dotted')
      }
    }
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
    expect(app).toContain('2 of 9 above the evidence bar')
    expect(app).not.toMatch(/\bconfirmed\b/)
    const print = renderText(marketConclusions.render(marketFixture(), 'print', ctx))
    expect(print).toContain('Below the evidence bar')
    expect(print).toContain('Showcase Innovations in 3D Printed Prosthetics')
  })

  it('flags a conclusion as New only where it holds an earlier month to compare, and defines New nowhere on the page', () => {
    // `recurrence` is `recurrenceOf` over the leading theme registry id: the
    // first row has three months behind it, the third has one and is new, and
    // the second has no month reading at all — which is NOT new and carries no
    // chip, because an absent record is not a new theme.
    const markup = render(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(markup.match(/>New</g) ?? []).toHaveLength(1)
    // The sentence says what the query asks for: mentioned, in the client's
    // audience or the category — never the wider "read" it used to promise
    // (`recurrenceForTarget` counts `k > 0` over `MARKET_AUDIENCES`).
    // "New" is defined once, in Settings › How to read (copy de-clutter D).
    expect(renderText(markup)).not.toContain('New means')
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

  it('never says "this month": the title is the preview’s, and the update rides as a row tag (market-first WP1.9)', () => {
    expect(marketConclusions.title).toBe('What we concluded')
    for (const mode of ['app', 'print', 'email'] as const) {
      const markup = render(marketConclusions.render(marketFixture(), mode, ctx))
      const text = renderText(markup)
      expect(text).not.toMatch(/this month/i)
      // At the head of the cards, before the first conclusion, not a footer note.
      const tag = 'Read over everything to date, concluded with the update of 27 Sep'
      expect(text).toContain(tag)
      expect(text.indexOf(tag)).toBeLessThan(text.indexOf('Comfort and personalisation remain the real proof of value'))
      assertCopyContract(markup)
    }
  })

  it('draws no tag where there is nothing concluded', () => {
    const base = marketFixture()
    const data = { ...base, conclusions: { ...base.conclusions, rows: [], empty: 'Conclusions land with your next update.' } }
    expect(renderText(marketConclusions.render(data, 'app', ctx))).not.toContain('concluded with the update')
  })

  it('links each conclusion’s themes into Voice by slug', () => {
    const markup = render(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/voice?themes=comfort_and_fit')
  })

  it('does not narrate its ordering (copy de-clutter B48)', () => {
    const text = renderText(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(text).not.toContain('Ordered by')
  })

  // T0a (mechanism 6; YM-26): the count is every video read to date, and it
  // says so on the count in market terms ("all time"), never as "157 of
  // 1,699", which read as a share of this month.
  it('says the videos behind a conclusion are all time, on the count itself', () => {
    // `distinctVideos` counts over the WHOLE corpus — Össur has 1,699 analysed
    // videos — and "301 videos behind it" under a heading reading "this month",
    // beside a Competitive surface saying September held 449, is a share of the
    // month that does not exist. The copy contract cannot catch it: the node is
    // a figure, and only a level must carry its "of N".
    const text = renderText(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(text).toContain('157 videos behind it, all time')
    expect(text).not.toContain('157 of 1,699')
    // The basis sentence is said once on the page, on the advice table's
    // "Grounded in" header (copy de-clutter ruling C).
    expect(text).not.toContain('not over this month alone')
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
  // THE COLUMN THAT SAID ONE THING TWELVE TIMES (polish pass, 2026-09-24).
  // Nothing on the live page has two monthly readings behind a decision, so
  // `afterwardsFor` answers every row with the same fifteen words — printed
  // twelve times down a 200px column, with `a.unlock` saying it again under
  // the table. The artboard's Afterwards column is an em dash on the rows that
  // have nothing to report.
  it('says the Afterwards column once where it says one thing about every row', () => {
    const data = marketFixture()
    const line = 'Not decided yet.'
    const rows = data.advice.rows.map((r) => ({ ...r, afterwards: { state: 'too_soon' as const, line, verdict: null, months: [] } }))
    const text = renderText(marketAdvice.render({ ...data, advice: { ...data.advice, rows } }, 'app', ctx))
    expect(rows.length).toBeGreaterThan(1)
    expect((text.match(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(1)
    expect(text).toContain('Afterwards, on every row:')
  })

  // AND ROW BY ROW THE MOMENT THEY DISAGREE. A ledger where one row is decided
  // and another is not is saying something per row, and folding would hide the
  // difference that makes the column worth having.
  it('keeps the Afterwards cells per row as soon as two rows answer differently', () => {
    const data = marketFixture()
    const rows = data.advice.rows.map((r, i) => ({
      ...r,
      afterwards: { state: 'too_soon' as const, line: i === 0 ? 'One answer.' : 'A different answer.', verdict: null, months: [] },
    }))
    const text = renderText(marketAdvice.render({ ...data, advice: { ...data.advice, rows } }, 'app', ctx))
    expect(text).toContain('One answer.')
    expect(text).toContain('A different answer.')
    expect(text).not.toContain('Afterwards, on every row:')
  })

  // ONE REFUSAL, SAID ONCE (deploy 1 review, the lead's R3): a reading
  // refused for its month pair says "not compared" in its cell, and the chip
  // under the table says why, once, in every mode.
  // T0a (YM-16; plan §0a, the one condition): a refused Afterwards is not
  // shown and not explained: no chip, no "not compared", no sentence.
  it('prints nothing for a month-pair refusal: no chip, no "not compared" and no sentence', () => {
    const data = marketFixture()
    const pair = { mode: 'refuse' as const, cause: 'searches' as const, changeMonth: '2026-09-01', checkWith: null }
    const sentence = 'Not read as a change: we changed our searches in September.'
    const rows = data.advice.rows.map((r, i) => ({
      ...r,
      afterwards: i === 0
        ? { state: 'too_soon' as const, line: 'Not decided yet.', verdict: null, months: [] }
        : { state: 'refused' as const, line: sentence, verdict: null, months: ['2026-09-01'], pair },
    }))
    expect(rows.length).toBeGreaterThan(2)
    for (const mode of MODES) {
      const text = renderText(marketAdvice.render({ ...data, advice: { ...data.advice, rows } }, mode, ctx))
      expect(text, mode).not.toContain('not read as a change')
      expect(text, mode).not.toContain(sentence)
      expect(text, mode).not.toContain('not compared')
      expect(render(marketAdvice.render({ ...data, advice: { ...data.advice, rows } }, mode, ctx)), mode).not.toContain('data-pair-chip')
      // The row that was not refused still says its own thing.
      expect(text, mode).toContain('Not decided yet.')
    }
  })

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
    expect(text).toContain('Behind it, all time')
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
    // The chip marks a row the LATEST UPDATE raised for the first time (the
    // lead's R10); the fixture's September row is made one here, and the
    // other rows are not.
    const base = marketFixture()
    // Row 1 leads as its own card (WP3.6 Y2), so the chip is tried on the
    // table's first row.
    const data = { ...base, advice: { ...base.advice, rows: base.advice.rows.map((r, i) => (i === 1 ? { ...r, timesMade: 1, monthsRepeated: 1, firstInLatest: true } : r)) } }
    const text = renderText(marketAdvice.render(data, 'app', ctx))
    expect(text).toContain('First time')
    // Its clock rides as the chip's tooltip (copy de-clutter B57).
    expect(text).not.toContain('First time marks a row')
    expect(render(marketAdvice.render(data, 'app', ctx))).toContain('the update’s clock, not the comment’s')
    // And no "New" beside it: the one undecided row here is the current
    // recommendation, whose card says "Not decided yet" (WP3.6 wave 2).
    expect(text).toContain('Not decided yet')
    expect((text.match(/\bNew\b/g) ?? [])).toHaveLength(0)
  })

  // THE LEAD'S R10: a column that would be the chip on every visible row says
  // nothing, so it is not drawn, in any mode.
  it('omits the Repeated column where every visible row was first raised by the latest update', () => {
    const base = marketFixture()
    const data = { ...base, advice: { ...base.advice, rows: base.advice.rows.map((r) => ({ ...r, timesMade: 1, monthsRepeated: 1, firstInLatest: true })) } }
    for (const mode of MODES) {
      const text = renderText(marketAdvice.render(data, mode, ctx))
      expect(text, mode).not.toContain('First time')
      expect(text, mode).not.toMatch(/\bRepeated\b/)
      assertCopyContract(render(marketAdvice.render(data, mode, ctx)))
    }
  })

  it('states the count, never "First time", on a September row raised by more than one update (deploy 1 review)', () => {
    // Row 1 on staging's 2 Oct render: "First time" beside the advice the
    // Overview's headline calls "repeated across 3 updates".
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).not.toContain('First time')
    // The current recommendation leads as a card (WP3.6 Y2), counted in updates.
    expect(text).toMatch(/1 · current recommendation Increase Content Volume to Improve Share of Voice repeated across 2 updates/)
    expect(render(marketAdvice.render(marketFixture(), 'app', ctx))).not.toContain('text-warning')
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

  it('never leaves an undecided cell blank, and draws a like-for-like comparison with both sides and the band', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    // The drawn comparison (HYPOTHETICAL: one grouping on record): both sides,
    // both denominators, the band, and the badge — which refuses, so no
    // magnitude travels with it (D2). No grouping caveat: there is none.
    expect(text).toContain('21 of 130 videos in your audience')
    expect(text).toContain('too few to compare')
    expect(text).not.toContain('like for like')
    // The two silences, each its own sentence rather than a dash.
    expect(text).toContain('Not decided yet.')
    expect(text).not.toMatch(/Afterwards\s+—/)
  })

  // NOT LIKE FOR LIKE, OR REFUSED, IS NOT SHOWN (T0a, YM-16; review findings 1
  // and 4). The same row with its months as today's corpus holds them (no
  // grouping on record), or stored as a reading whose verdict carries the
  // flag, or across a pair the judge refused on thin data: the cell prints
  // nothing, with no caveat, no reason, no badge and no month before.
  it('draws nothing for a comparison across two groupings or a refused pair, in every mode, live or stored', () => {
    const data = marketFixture()
    const row = data.advice.rows.find((r) => r.lineageId === 'L-old')!
    const drawn = row.afterwards
    const refusedPair = { mode: 'refuse' as const, cause: 'searches' as const, changeMonth: '2026-09-01', checkWith: null }
    const variants = [
      // Live: today's corpus, no grouping on record.
      afterwardsFor({
        pair: null, decidedAt: '2026-06-02T10:00:00.000Z', targetIds: ['reg-repair'], objectLabel: 'Repair & warranty',
        series: [{ month: '2026-05-01', k: 9, n: 104 }, { month: '2026-07-01', k: 11, n: 118 }, { month: '2026-09-01', k: 21, n: 130 }],
        audience: 'client',
      }),
      // Live: the review's own case, a May to September pair the judge refuses.
      afterwardsFor({
        pair: (prev, month) => pairOn(sealandJudge('2026-10-02T06:00:00.000Z'))(prev, month, 'client'),
        decidedAt: '2026-06-02T10:00:00.000Z', targetIds: ['reg-repair'], objectLabel: 'Repair & warranty',
        series: [{ month: '2026-05-01', k: 9, n: 104, clusteringKey: 'k1' }, { month: '2026-07-01', k: 11, n: 118, clusteringKey: 'k1' }, { month: '2026-09-01', k: 21, n: 130, clusteringKey: 'k1' }],
        audience: 'client',
      }),
      // Stored before T0a: a reading whose verdict carries the flag, or the
      // refused pair's note on a thin verdict.
      { ...drawn, verdict: { ...drawn.verdict!, flags: ['clustering_unknown' as const] } },
      { ...drawn, verdict: { ...drawn.verdict!, pair: refusedPair } },
    ]
    for (const afterwards of variants) {
      const rows = data.advice.rows.map((r) => (r.lineageId === 'L-old' ? { ...r, afterwards } : r))
      const shown = { ...data, advice: { ...data.advice, rows } }
      for (const mode of ['app', 'print', 'email'] as const) {
        const text = renderText(marketAdvice.render(shown, mode, ctx))
        expect(text, mode).not.toContain('21 of 130')
        expect(text, mode).not.toContain('9 of 104')
        expect(text, mode).not.toContain('May 2026')
        expect(text, mode).not.toContain('like for like')
        expect(text, mode).not.toContain('grouped')
        expect(text, mode).not.toContain('We cannot read this one')
        expect(text, mode).not.toContain('Not read as a change')
        expect(text, mode).not.toContain('Afterwards, on every row')
      }
      expect(blockAnswers(marketAdvice, shown).verdicts).toHaveLength(0)
    }
  })

  it('says the evidence is an earlier read rather than printing zero videos behind a row', () => {
    // Every cited `audience_insights` row of Sealand's twelve drawn rows has
    // been pruned, so the column would otherwise read "0 videos" down the page.
    // It said "evidence replaced" on 51 rows, which is our bookkeeping (B8).
    const text = renderText(marketAdvice.render(unrecordedFixture(), 'app', ctx))
    expect(text).toContain('an earlier read')
    expect(text).not.toContain('evidence replaced')
    expect(text).not.toContain('0 videos')
  })

  it('draws one row expanded, with its argument and its comment as separate nodes', () => {
    const markup = render(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(markup).toContain('Why we keep raising it')
    // The comment is its own node with its own ref — never a span inside the
    // scrubbed argument, because a number in a quotation is still refused.
    expect(markup).toContain('Wat gebeur as')
    // The first row with an argument, in the ledger's order since WP1.9: the
    // current recommendation has none here, so the row after it opens.
    expect(renderText(markup)).toContain('Nobody in the category shows the repair path on camera')
    expect(renderText(markup)).not.toContain('Repair and warranty questions arrive as questions')
  })

  it('prints a word for a recommendation nobody has decided on, where the parked page prints nothing', () => {
    // The current recommendation leads as its card, and says so in words.
    const text = renderText(marketAdvice.render(marketFixture(), 'print', ctx))
    expect(text).toContain('Not decided yet')
    // A table row still undecided prints the pill's word.
    const base = marketFixture()
    const undecided = { ...base, advice: { ...base.advice, rows: base.advice.rows.map((r, i) => (i === 1 ? { ...r, status: 'new' as const, statusLabel: 'New', decidedAt: null } : r)) } }
    expect(renderText(marketAdvice.render(undecided, 'print', ctx))).toMatch(/\bNew\b/)
  })

  it('survives a snapshot frozen before the Afterwards column existed', () => {
    // `market.advice` is a named brief section at 017fc6e and at HEAD, so a
    // `report_snapshots` row whose `surfaces.market` froze before wave 1 built
    // `AdviceRow.afterwards` reaches this block by the ordinary path. Three
    // sites dereferenced the field unguarded, and `verdicts()` is the worse
    // one: it is part of the renderable contract a brief's reading merge
    // walks, so the artefact's READING threw before anything was drawn.
    const base = marketFixture()
    const frozen = {
      ...base,
      advice: {
        ...base.advice,
        rows: base.advice.rows.map((r) => {
          const { afterwards: _gone, ...rest } = r
          return rest as AdviceRow
        }),
      },
    }
    expect(() => marketAdvice.verdicts?.(frozen)).not.toThrow()
    expect(marketAdvice.verdicts?.(frozen)).toEqual([])
    for (const mode of MODES) {
      const text = renderText(marketAdvice.render(frozen, mode, ctx))
      // The fifth thing the column can say, and it is about our record — never
      // one of the four sentences a reading produces, and never blank.
      expect(text).toContain('This was saved before we recorded what happened afterwards')
      expect(text).not.toContain('too few to compare')
    }
    // And the page still draws a tile for it.
    expect(render(<MarketSurfacePage data={frozen} />)).toContain('This was saved before we recorded what happened afterwards')
  })

  it('says how many of the whole ledger have been acted on, and never claims a quarter', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    // TWO, matching the two rows the fixture draws as Done. The count is over
    // all 64 identities, and it may not be smaller than what the table shows.
    expect(text).toContain('acted on 2 of 64')
    expect(text).not.toMatch(/quarter/i)
  })

  // T0a (mechanism 6; YM-14): the all-time basis is the count's own label,
  // "Behind it, all time", in every mode, in market terms: no tooltip, and
  // no note about "everything we have read for you".
  it('says the all-time basis on the count’s own label in every mode, never as a tooltip or a note', () => {
    const app = render(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(markupOf(app)).toContain(`Behind it, ${GROUNDED_BASIS}`)
    expect(app).not.toContain('title="all time"')
    expect(app).not.toContain('How the Repeated column counts')
    for (const mode of ['app', 'print', 'email'] as RenderMode[]) {
      const markup = render(marketAdvice.render(marketFixture(), mode, ctx))
      expect(markup).not.toContain('<details')
      expect(markupOf(markup)).not.toContain('everything we have read for you')
      expect(markupOf(markup), mode).toMatch(/[Bb]ehind it, all time/)
    }
    const mk1 = render(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(markupOf(mk1)).not.toContain('counted over everything we have read for you')
    expect(markupOf(mk1)).not.toContain('New means')
    // Plans keeps its disclosure; nothing on paper is behind one.
    expect(render(marketPlans.render(marketFixture(), 'app', ctx))).toContain('<details')
    for (const block of [marketConclusions, marketPlans, marketSayHear]) {
      expect(render(block.render(marketFixture(), 'print', ctx))).not.toContain('<details')
    }
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
    // WP3.6 (25 Sep rulings): the footer holds a link alone, the preview's
    // "Show all 64 →", naming the whole ledger, never the cap.
    expect(text).toContain(`Show all ${data.advice.total} →`)
    expect(render(marketAdvice.render(data, 'app', ctx))).toContain('ledger=all')
    expect(text).not.toContain('shown')
    expect(text).not.toContain('behind them')
    expect(text).not.toMatch(/quarter/i)
  })

  it('never states a row count the table is not showing, in any state', () => {
    // Every state that draws a footer note: the note's two halves come off the
    // rows on the page, so a loader returning fewer rows than the cap — or the
    // deep-link arm, which APPENDS a row and draws one MORE than the cap —
    // still adds up.
    for (const data of [marketFixture(), unrecordedFixture(), deepLinkFixture()]) {
      const text = renderText(marketAdvice.render(data, 'app', ctx))
      const note = text.match(/(\d+) of ([\d,]+) shown/)
      if (!note) continue
      expect(Number(note[1])).toBe(data.advice.rows.length)
      expect(Number(note[2].replace(/,/g, ''))).toBe(data.advice.total)
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

  it('does not restate the scoring rule under the moves (copy de-clutter B66)', () => {
    const text = renderText(marketMoves.render(marketFixture(), 'app', ctx))
    expect(text).not.toContain(MOVES_UNLOCK)
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
    // No header meta since WP3.6 (25 Sep rulings): each way says for itself.
    expect(text).not.toContain('five ways in')
    expect(text).toContain('Confirm September\u2019s card')
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

  it('does not make the ways that write nothing the loudest thing on the row', () => {
    // `LIVE` was the tile's own white inside a solid hairline — no fill at
    // all — and `DEAD` was `bg-inner`, a filled grey slab, so the two ways
    // that write NOTHING were the two heaviest objects on a row whose meta
    // says "3 of 5 work today". And a flex column stretches its children, so
    // the 260px the SENTENCE needs was spent on the BUTTON: the dead ways
    // rendered 260px wide while the live ones shrank to their text.
    const markup = render(marketWays.render(marketFixture(), 'app', ctx))
    const dead = markup.match(/<button[^>]*disabled[^>]*class="([^"]*)"/)
      ?? markup.match(/<button[^>]*class="([^"]*)"[^>]*disabled/)
    expect(dead, 'no disabled control found').not.toBeNull()
    expect(dead![1]).not.toContain('bg-inner')
    expect(dead![1]).toContain('text-muted-foreground')
    // Every slot sizes its control by the control's own label, the way the
    // artboard's five `inline-flex` buttons do.
    for (const slot of markup.match(/class="[^"]*max-w-\[260px\][^"]*"/g) ?? []) {
      expect(slot, slot).toContain('items-start')
    }
    expect(markup).toContain('max-w-[260px]')
  })
})

describe('MK5b · say vs hear, whose reading it is (walkthrough item 8)', () => {
  const asked = 'People love upcycling ideas and anti-waste design, but they also ask what materials are used, where they come from, and whether an upcycling claim is genuine.'
  const followers = 'People respond to Sealand as a community-rooted label, praising the cleanup work and expressing interest in showing up for events.'
  const d = (() => {
    const base = marketFixture()
    return {
      ...base,
      ways: {
        ...base.ways,
        claims: [
          { ...base.ways.claims[0], theySay: asked, audience: 'contradicts', echo: marketClaimEcho({ stance: 'contradicts', reading: { k: 125, n: 852 }, theySay: asked }) },
          { ...base.ways.claims[1], theySay: followers, audience: 'echoes', echo: marketClaimEcho({ stance: 'echoes', reading: { k: 0, n: 852 }, theySay: followers, followers: 3 }) },
        ],
      },
    }
  })()

  it('calls questions questions, not pushback', () => {
    const text = renderText(marketSayHear.render(d, 'app', ctx))
    expect(text).toContain('Questioned')
    expect(text).not.toContain('Pushed back')
  })

  it('says a sentence is your followers’ where the market carried none of it', () => {
    const text = renderText(marketSayHear.render(d, 'app', ctx))
    expect(text).toContain('Not talked about')
    expect(text).toContain('0 of 852 videos in')
    expect(text).toContain('Said by your own followers, not your market:')
    expect(text).toContain('raised under 3 of your own posts')
    expect(copyViolations(marketSayHear.render(d, 'app', ctx))).toEqual([])
  })
})

describe('MK5b · say vs hear', () => {
  it('is its own card, with the verdicts and the hold they do not have', () => {
    const text = renderText(marketSayHear.render(marketFixture(), 'app', ctx))
    expect(text).toContain('What you say, and what your market says back')
    expect(text).toContain('Pushed back')
    // The update dating is the column head's (25 Sep rulings, WP3.6).
    expect(text).toContain('Your market, this update')
    expect(text).not.toContain('held across two updates')
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
    // AND THE SEPARATOR TRAILS ITS BUCKET. Carried on the front it landed at
    // the START of the wrapped second line — "· a question 1 · not classified
    // 12" — so no bucket's own span may begin with one, and the last carries
    // none at all.
    const markup = render(marketCard.render(marketFixture(), 'app', ctx))
    const buckets = markup.match(/<span class="whitespace-nowrap">([^<]*)<\/span>/g) ?? []
    expect(buckets.length).toBeGreaterThan(1)
    for (const b of buckets) expect(b, b).not.toMatch(/>\s*·/)
    expect(buckets[buckets.length - 1]).not.toContain('·')
    // The email arm printed "17 posts published · posts published in
    // September" — the label and the basis, which are the same words.
    const email = renderText(marketCard.render(marketFixture(), 'email', ctx))
    expect(email).toContain('posts published in September')
    expect(email).not.toContain('posts published · posts published')
  })

  it('names the press rather than drawing a button nobody can press', () => {
    const text = renderText(marketCard.render(marketFixture(), 'app', ctx))
    expect(text).not.toContain('Yes, count this as a move')
    expect(text).not.toContain(MOVES_UNLOCK)
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

  it('prints the speaker\u2019s own words on a claim row, never the model\u2019s paraphrase', () => {
    // MERGE, BLOCK D WAVE 2. This block was written against `CardClaim.claim`
    // \u2014 `video_claims.claim`, the model's paraphrase \u2014 inside quotation
    // marks. E-main took that field off the row in the same wave (code review
    // C1 / I6): the paraphrase was a model-written string taking the `quote`
    // exemption, and it reached `report_snapshots.data` as a bare string with
    // no ref behind it. The card prints `CardClaim.quote` now, cut by the same
    // `claimText` Overview uses, so the two surfaces cut one sentence in one
    // place.
    for (const mode of ['app', 'print', 'email'] as const) {
      const text = renderText(marketCard.render(marketFixture(), mode, ctx))
      expect(text).toContain('We get things wrong, and we say so')
      expect(text).not.toContain('Sealand acknowledges ongoing challenges and setbacks')
    }
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
    // T0a (mechanism 6; YM-34): a floor, never "k of n" over the all-time corpus.
    expect(text).toMatch(/at least \d+ videos? we can show you a comment from/)
    expect(text).not.toMatch(/\d+ of [\d,]+ videos we can show you/)
    // The hold is real since the walkthrough (item 5), and the card says how.
    expect(text).toContain('changes only when the evidence behind it does')
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
    expect(text).toContain('Move declared: Push repairability 12 Aug')
    expect(text).toContain('declared 12 Aug')
    expect(text).toContain('before it was declared')
  })

  it('prints the control beside the move and never subtracted from it', () => {
    const text = renderText(marketMoves.render(marketFixture(), 'app', ctx))
    expect(text).toContain('Beside it, the category')
    expect(text).not.toMatch(/net of|adjusted for|minus the category/i)
  })
})
// ---- the masthead · the artboard's ruling ---------------------------------

/**
 * THE SERIF MASTHEAD, RULED BY THE ARTBOARD AND MEASURED HERE SO IT CANNOT
 * DRIFT (block-d-review `market` finding 6, referred twice and open since).
 *
 * The finding: the masthead is set in IBM Plex Serif, the face MASTER reserves
 * for speech, so the product's own sentence and a commenter's own words are
 * typeset identically — a typeface ROLE against THE MOCK IS THE SPEC.
 *
 * THE MOCK ANSWERS IT, AND SO DOES THE SYSTEM. `Market.dc.html:111` is the
 * masthead node and it is `font-family: 'IBM Plex Serif'; font-size: 17px;
 * font-weight: 500; line-height: 1.35; letter-spacing: -.005em; color:
 * #26292C; text-wrap: pretty; max-width: 86ch` — which is what this page
 * prints, class for declaration. And it is not the artboard freelancing: the
 * design system's own type ramp (`spec/design-system.md:69`) has a row for it
 * — "Hero lead (the page's one sentence) · **serif** · 17px · 500 · 1.35 ·
 * -0.005em" — so the hero lead is the ONE non-quote serif node the system
 * declares, and `--font-serif`'s "verbatim quotes ONLY" comment three tables
 * up is about the token's other users, not a ban on the ramp above it.
 * `Main.dc.html:124` and `Subjects.dc.html:294` draw the same node the same
 * way, so this is a rule the mock states three times.
 *
 * NO CHANGE MADE, AND THE MEASUREMENT IS THE COMMIT. Competitive was asked the
 * same question and does not have it: `Competitive.dc.html` contains zero
 * serif nodes and `components/pages/competitive-surface/` contains zero
 * `font-serif`, so there is no masthead there to rule on.
 */
describe('the masthead', () => {
  it('is not printed: "we never claim you caused it" is off the in-app pages (copy de-clutter L6)', () => {
    const markup = render(MarketSurfacePage({ data: marketFixture() }))
    expect(markup).not.toContain('font-serif text-[17px]')
    expect(markupOf(markup)).not.toContain('We never claim you caused it')
  })
})

describe('absences are lines, not cards (sweep 2026-09-24)', () => {
  it('draws no plans card with no plan, and no say-vs-hear card with no claim', () => {
    const base = marketFixture()
    const bare = { ...base, plans: [], ways: { ...base.ways, claims: [] } }
    expect(drawnOnMarket('market.plans', bare)).toBe(false)
    expect(drawnOnMarket('market.sayhear', bare)).toBe(false)
    expect(drawnOnMarket('market.card', bare)).toBe(true)
    const markup = render(<MarketSurfacePage data={bare} />)
    expect(markup).not.toContain('Plans re-checked')
    expect(markup).not.toContain('What you say, and what your market says back')
  })
})

// ---- market-first WP1.9: the current recommendation first ------------------------

describe('MK2 · the current recommendation first (market-first WP1.9)', () => {
  it('tags the first row "current recommendation", and no other, in every mode', () => {
    const data = marketFixture()
    expect(data.advice.rows[0].lineageId).toBe(data.advice.current)
    for (const mode of ['app', 'print', 'email'] as const) {
      const text = renderText(marketAdvice.render(data, mode, ctx))
      expect(text.split(CURRENT_TAG).length - 1).toBe(1)
      // The tag heads the lead card (WP3.6 Y2): before the first row's title,
      // and the first row's title before the second row's.
      expect(text.indexOf(CURRENT_TAG)).toBeLessThan(text.indexOf(data.advice.rows[0].title))
      expect(text.indexOf(data.advice.rows[0].title)).toBeLessThan(text.indexOf(data.advice.rows[1].title))
    }
  })

  it('numbers the rows in that order, the current recommendation as 1', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toMatch(/1 · current recommendation Increase Content Volume to Improve Share of Voice/)
    expect(text).toMatch(/2 Show the warranty process on camera/)
  })

  it('no longer says "oldest first" anywhere on the block', () => {
    for (const data of [marketFixture(), unrecordedFixture(), deepLinkFixture()]) {
      for (const mode of ['app', 'print', 'email'] as const) {
        expect(renderText(marketAdvice.render(data, mode, ctx))).not.toMatch(/oldest first/i)
      }
    }
  })

  it('a copy stored before WP1.9 carries no current lineage, and draws no tag', () => {
    const { current: _current, ...stored } = marketFixture().advice
    const data = { ...marketFixture(), advice: stored }
    expect(renderText(marketAdvice.render(data, 'app', ctx))).not.toContain(CURRENT_TAG)
  })

  it('keeps the copy contract with the tag on', () => {
    for (const mode of ['app', 'print', 'email'] as const) {
      assertCopyContract(render(marketAdvice.render(marketFixture(), mode, ctx)))
    }
  })
})

// DECISION C (WP1.1): Your moves names a move on a failed subject and does
// not read it, and never says "too few readings" about it.
describe('Your moves · a move on a subject being re-described', () => {
  it('prints the sentence, no chart and no verdict, in every mode', () => {
    const base = marketFixture()
    const data = { ...base, moves: { ...base.moves, readings: [moveReadingFixture('failed')] } }
    for (const mode of MODES) {
      assertCopyContract(render(marketMoves.render(data, mode, ctx)))
      const text = renderText(marketMoves.render(data, mode, ctx))
      expect(text).toContain(MOVE_SUBJECT_FAILED)
      expect(text).not.toContain('too few readings')
    }
  })
})

// WP3.6 wave 2: the lead card's decision, as the approved preview draws it:
// the word behind its square, the day you marked it, and "Mark done".
describe('The advice · what you decided about the current recommendation, and Mark done', () => {
  // Sealand's lead (§2.6's print): Working on it, marked on 15 Sep.
  const lead = () => sealandMovesFixture()
  const withLead = (over: Partial<AdviceRow>) => {
    const d = lead()
    return { ...d, advice: { ...d.advice, rows: d.advice.rows.map((r, i) => (i === 0 ? { ...r, ...over } : r)) } }
  }
  const leadCard = (markup: string) => markup.slice(0, markup.indexOf('<table'))

  it('says what you decided and when, with Mark done beside it (app)', () => {
    const card = leadCard(render(marketAdvice.render(lead(), 'app', ctx)))
    const text = markupOf(card)
    expect(text).toContain('Working on it')
    expect(text).toContain('you marked it on 15 Sep')
    expect(card).toMatch(/<button[^>]*type="button"[^>]*>[\s\S]*?Mark done<\/button>/)
    // The word is the ledger's five statuses behind a quiet chevron, not a pill.
    expect(card).toContain('title="Change what you decided"')
    expect(card).not.toContain('h-[30px]') // the ledger pill's height
  })

  it('offers no Mark done once it is done', () => {
    const card = leadCard(render(marketAdvice.render(withLead({ status: 'acted_on', statusLabel: 'Done' }), 'app', ctx)))
    expect(markupOf(card)).toContain('Done')
    expect(card).not.toContain('Mark done')
  })

  it('says "Not decided yet" and no day where nobody has decided, and still offers Mark done', () => {
    const card = leadCard(render(marketAdvice.render(withLead({ status: 'new', statusLabel: 'New', decidedAt: null }), 'app', ctx)))
    const text = markupOf(card)
    expect(text).toContain('Not decided yet')
    expect(text).not.toContain('you marked it on')
    expect(card).toContain('Mark done')
    // The email's card says the same word, not the ledger pill's "New".
    const undecided = withLead({ status: 'new', statusLabel: 'New', decidedAt: null })
    const email = renderText(marketAdvice.render(undecided, 'email', ctx))
    const emailCard = email.slice(0, email.indexOf(undecided.advice.rows[1].title))
    expect(emailCard).toContain('· Not decided yet')
    expect(emailCard).not.toMatch(/\bNew\b/)
  })

  it('prints the same words on paper, with nothing to press', () => {
    const card = leadCard(render(marketAdvice.render(lead(), 'print', ctx)))
    expect(markupOf(card)).toContain('Working on it you marked it on 15 Sep')
    expect(card).not.toContain('<button')
    const email = render(marketAdvice.render(lead(), 'email', ctx))
    expect(email).not.toContain('<button')
    expect(renderText(email)).toContain('Working on it · 15 Sep')
  })

  it('keeps the copy contract in each decision state and mode', () => {
    for (const over of [{}, { status: 'acted_on' as const, statusLabel: 'Done' }, { status: 'new' as const, statusLabel: 'New', decidedAt: null }]) {
      for (const mode of MODES) assertCopyContract(render(marketAdvice.render(withLead(over), mode, ctx)))
    }
  })
})

// Walkthrough item 6: "Show all 79" under 12 rows, several of them one idea.
describe('MK2 · the short list in the app', () => {
  const base = marketFixture()
  const [first, second, third] = base.advice.rows
  const d = { ...base, advice: { ...base.advice, shortlist: { rows: [first, { ...second, alsoRaised: 4 }], earlier: base.advice.total - 2 } } }

  it('draws the short list, with the rest one quiet link away', () => {
    const text = renderText(marketAdvice.render(d, 'app', ctx))
    expect(text).toContain(second.title)
    expect(text).not.toContain(third.title)
    expect(text).toContain(EARLIER_ADVICE)
    expect(text).not.toMatch(/Show all \d/)
    expect(render(marketAdvice.render(d, 'app', ctx))).toContain('ledger=all')
  })

  it('says when an idea came back in other words', () => {
    expect(renderText(marketAdvice.render(d, 'app', ctx))).toContain('also raised 4 times in other words')
  })

  it('leaves exports and briefs the ledger they always drew', () => {
    const email = renderText(marketAdvice.render(d, 'email', ctx))
    expect(email).toContain(third.title)
    expect(email).toMatch(/Show all \d/)
  })

  it('keeps the copy contract', () => {
    assertCopyContract(marketAdvice.render(d, 'app', ctx))
  })

  it('does not say "Why we keep raising it" over advice raised once', () => {
    expect(whyHeading({ timesMade: 1 })).toBe('Why we recommend it')
    expect(whyHeading({ timesMade: 1, alsoRaised: 2 })).toBe('Why we keep raising it')
    expect(whyHeading({ timesMade: 3 })).toBe('Why we keep raising it')
  })
})
