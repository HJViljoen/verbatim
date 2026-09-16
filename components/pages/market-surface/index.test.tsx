import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, figureCount, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { ADVICE_REQUESTED_GONE } from '@/lib/pages/market-surface'
import { MARKET_BLOCKS } from './index'
import { marketConclusions } from './conclusions'
import { marketAdvice } from './advice'
import { marketMoves } from './moves'
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

  it('declares no figures — nothing on this surface is a reading of a month', () => {
    expect(figureCount(MARKET_BLOCKS.map((b) => blockAnswers(b, marketFixture()).figures))).toBe(0)
  })
})

describe('MK1 · what we concluded', () => {
  it('labels a conclusion below the evidence bar rather than hiding it', () => {
    const text = renderText(marketConclusions.render(marketFixture(), 'app', ctx))
    expect(text).toContain('Strong evidence')
    expect(text).toContain('Early signal')
    expect(text).toContain('Below the evidence bar')
    expect(text).toContain('1 below the bar')
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
  it('shows what it was, when it was first made, the repeat count and the decision', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toContain('What it was')
    expect(text).toContain('First made')
    expect(text).toContain('28 Jun')
    expect(text).toContain('Done')
    expect(text).toContain('2 Sep')
  })

  it('prints the status word on a row still marked New, where the parked page prints nothing', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'print', ctx))
    expect(text).toContain('New')
  })

  it('says how many of the whole ledger have been acted on, and never claims a quarter', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toContain('acted on 1 of 64')
    expect(text).not.toMatch(/quarter/i)
  })

  it('says "twice, in one month" on the row and explains it once underneath', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toContain('twice, in one month')
    expect(text).toContain('inside one calendar month')
  })

  it('names the after-line as what is coming rather than leaving a blank column', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toContain('What the conversation did after you acted')
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

  it('counts the rows it did not draw', () => {
    const text = renderText(marketAdvice.render(marketFixture(), 'app', ctx))
    expect(text).toContain('62 newer pieces of advice')
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
    expect(text).toContain('Scoring, and the pre-filled monthly card, arrive with Market’s bottom section.')
    expect(text).not.toMatch(/bottom section in \w+ 20\d\d/)
  })
})

describe('MK5 · how a move is made', () => {
  it('lists five ways and says how many work today', () => {
    const text = renderText(marketWays.render(marketFixture(), 'app', ctx))
    expect(text).toContain('2 of 5 ways work today')
    expect(text).toContain('Confirm this month’s card')
    expect(text).toContain('Track this')
    expect(text).toContain('Accept a piece of advice')
    expect(text).toContain('Register a claim you make')
    expect(text).toContain('Upload a plan')
  })

  it('sends Track this to the surface that has a subject in hand', () => {
    const markup = render(marketWays.render(marketFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/subjects')
  })

  it('draws the accept button in the app and nowhere else', () => {
    expect(render(marketWays.render(marketFixture(), 'app', ctx))).toContain('Accept this advice')
    expect(render(marketWays.render(marketFixture(), 'print', ctx))).not.toContain('<button')
    expect(render(marketWays.render(marketFixture(), 'email', ctx))).not.toContain('<button')
  })

  it('says the claim verdicts are a current reading, not a verdict per month', () => {
    const text = renderText(marketWays.render(marketFixture(), 'app', ctx))
    expect(text).toContain('Pushed back')
    expect(text).toContain('how each claim reads in the latest update')
    expect(text).toContain('held across two updates')
  })
})

describe('the sections that are not built', () => {
  it('names MK3 and MK6 with an owner and no invented date', () => {
    const text = renderText(marketUnlocks.render(marketFixture(), 'app', ctx))
    expect(text).toContain('This month’s card')
    expect(text).toContain('Plans re-checked')
    expect(text).toContain('Verbatim engineering')
    expect(text).not.toMatch(/by \d{1,2} \w+/)
  })
})
