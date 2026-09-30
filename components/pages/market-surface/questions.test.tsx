import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { BlockFrame } from '@/components/blocks/frame'
import { JUDGE_NOT_CHECKED } from '@/lib/reading/own-posts'
import { MOVES_MARKET_HOW, moveMarketReads, type MarketSurfaceData } from '@/lib/pages/market-surface'
import { MARKET_BLOCKS, MarketSurfacePage } from './index'
import { UNCHECKED_TAIL, marketQuestions } from './questions'
import { marketAdvice } from './advice'
import { marketMoves } from './moves'
import { claimsHead, claimsTally, marketSayHear } from './sayhear'
import {
  deepLinkFixture, firstUpdateFixture, marketFixture, ossurMovesFixture, sealandMovesFixture, sealandQuestionsFiled, unrecordedFixture,
} from './fixture'

// WP3.6 · Your moves, rebuilt (market-first plan §2.6 Y1–Y6).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES: MarketSurfaceData[] = [
  marketFixture(), unrecordedFixture(), firstUpdateFixture(), deepLinkFixture(), sealandMovesFixture(), ossurMovesFixture(),
]

describe('market.questions (Y1) · three modes, an empty state, a fixture state', () => {
  it('renders every state in every mode against the copy contract', () => {
    for (const data of STATES) {
      for (const mode of MODES) assertCopyContract(render(marketQuestions.render(data, mode, ctx)))
    }
  })

  it('lists the month’s questions not led by makers, ranked by videos, of the category', () => {
    const text = renderText(marketQuestions.render(sealandMovesFixture(), 'app', ctx))
    const at = (s: string) => text.indexOf(s)
    expect(text).toContain('In September')
    expect(text).toContain('of 626')
    expect(at('Confusion over airline bag sizes 21')).toBeGreaterThan(-1)
    expect(at('Questions about buying and shipping 20')).toBeGreaterThan(at('Confusion over airline bag sizes'))
    expect(at('Questions about bag materials 11')).toBeGreaterThan(at('Questions about buying and shipping'))
    // A purchase theme is not a question, whatever its size.
    expect(text).not.toContain('Ready to buy handmade bags')
  })

  // Walkthrough B8: "none of 25 · checked: seeking · model · recommendations"
  // read as word-matching. The words looked for ride as a tooltip.
  it('marks each question touched or not, with what was looked for as a tooltip, not on the page', () => {
    const text = renderText(marketQuestions.render(sealandMovesFixture(), 'app', ctx))
    expect(text).toContain('of your 20')
    expect(text).not.toContain('words matched')
    expect(text).toMatch(/Confusion over airline bag sizes[^]*?none of 20/)
    expect(text).not.toContain('checked:')
    expect(render(marketQuestions.render(sealandMovesFixture(), 'app', ctx))).toContain('We looked in your posts for: airline, sizes')
  })

  it('reads the three months by subject, and before MF3 says "so far", never a false none', () => {
    const text = renderText(marketQuestions.render(sealandMovesFixture(), 'app', ctx))
    expect(text).toContain('Over the last 3 months, by subject')
    expect(text).toContain('of your 56')
    expect(text).toMatch(/Waterproofing provisional Demand for real waterproofing 3 · Worries about zippers in rain 2 16/)
    expect(text).toMatch(/Price provisional Price and sale questions 6 12/)
    expect(text).toMatch(/Repair & warranty provisional 11/)
    // No subject row says a bare "none": the judge has filed none of the 56
    // posts. One statement per cell (walkthrough B8), never "not checked yet"
    // beside "none of 56 shared two of its words".
    const subjects = text.slice(text.indexOf('Over the last 3 months'))
    expect(subjects.split(UNCHECKED_TAIL).length - 1).toBe(3)
    expect(subjects.split('none of 56 so far').length - 1).toBe(3)
    expect(subjects).not.toContain(JUDGE_NOT_CHECKED)
    expect(subjects).not.toContain('shared two of its words')
  })

  it('after MF3, reads the judge: a filed post about the subject touches it, every post filed reads none', () => {
    const data = { ...sealandMovesFixture(), questions: sealandQuestionsFiled() }
    const text = renderText(marketQuestions.render(data, 'app', ctx))
    expect(text).not.toContain(JUDGE_NOT_CHECKED)
    expect(text).toMatch(/Price[^]*?1 of 56 your post of 22 Jul ?: sale · discounts/)
    expect(text).not.toContain('the post check')
    expect(text).toMatch(/Waterproofing[^]*?none of 56/)
    assertCopyContract(render(marketQuestions.render(data, 'app', ctx)))
  })

  it('renders Össur: no maker rule, no subjects, its questions of 338 against its 109 posts', () => {
    for (const mode of MODES) assertCopyContract(render(marketQuestions.render(ossurMovesFixture(), mode, ctx)))
    const text = renderText(marketQuestions.render(ossurMovesFixture(), 'app', ctx))
    expect(text).toContain('Questions about prosthetic function 28')
    expect(text).toContain('Price and availability questions 14')
    expect(text).toContain('of 338')
    expect(text).toContain('none of 109')
    expect(text).not.toContain('by subject')
    expect(text).not.toContain('makers')
    // And the whole page renders.
    expect(render(<MarketSurfacePage data={ossurMovesFixture()} />)).toContain('Questions to answer')
  })

  it('says its empty state on a copy stored before it, and when nothing was asked', () => {
    const stored = { ...marketFixture(), questions: undefined }
    expect(marketQuestions.emptyState(stored)).toContain('not on this copy')
    for (const mode of MODES) assertCopyContract(render(marketQuestions.render(stored, mode, ctx)))
    const none = { ...marketFixture(), questions: { ...marketFixture().questions!, themes: [], subjects: [], empty: 'No question theme in your market reached 10 videos in September, and no subject was asked about over the last three months.' } }
    expect(renderText(marketQuestions.render(none, 'app', ctx))).toContain('No question theme in your market reached 10 videos')
  })

  it('links to Subjects by its current label, and is email-safe', () => {
    expect(render(marketQuestions.render(sealandMovesFixture(), 'app', ctx))).toContain('Open Subjects')
    const email = render(marketQuestions.render(sealandMovesFixture(), 'email', ctx))
    expect(email).toContain('<table')
    expect(email).not.toContain('class=')
    expect(email).not.toContain('var(--')
  })
})

describe('Your moves · the 25 Sep rulings, swept on this page (WP3.6)', () => {
  it('no block passes BlockFrame a meta or a footer note, in any mode or state', () => {
    const bad: string[] = []
    for (const block of MARKET_BLOCKS) {
      for (const data of STATES) {
        for (const mode of MODES) {
          const el = block.render(data, mode, ctx)
          if (!isValidElement(el) || el.type !== BlockFrame) { bad.push(`${block.key} [${mode}] is not drawn in a BlockFrame`); continue }
          const props = el.props as { meta?: unknown; footerNote?: unknown }
          if (props.meta != null) bad.push(`${block.key} [${mode}] passes meta`)
          if (props.footerNote != null) bad.push(`${block.key} [${mode}] passes footerNote`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('prints no "how sound" string anywhere on the page', () => {
    for (const data of STATES) expect(renderText(<MarketSurfacePage data={data} />)).not.toMatch(/how sound/i)
  })
})

describe('Y2 · the current recommendation leads', () => {
  it('prints §2.6’s fixture: "Add a “Know Before You Buy” standard · 156 videos behind it"', () => {
    for (const mode of MODES) {
      const text = renderText(marketAdvice.render(sealandMovesFixture(), mode, ctx))
      expect(text, mode).toMatch(/1 · current recommendation Add a “Know Before You Buy” standard to every Sealand bag page and social shop link/)
      expect(text, mode).toContain('repeated across 3 updates')
      expect(text, mode).toContain('156 videos behind it')
      // It leads: the second row comes after it.
      expect(text.indexOf('Know Before You Buy'), mode).toBeLessThan(text.indexOf('Increase Content Volume'))
      assertCopyContract(render(marketAdvice.render(sealandMovesFixture(), mode, ctx)))
    }
    expect(renderText(marketAdvice.render(sealandMovesFixture(), 'app', ctx))).toContain('Show all 67 →')
  })
})

describe('Y3 · what you say, counted in your market', () => {
  it('feeds each claim’s echo with the month’s market videos, not the client audience', () => {
    const text = renderText(marketSayHear.render(sealandMovesFixture(), 'app', ctx))
    expect(text).toContain('25 of 654 videos in September')
    expect(text).toContain('89 of 654 videos in September')
    expect(text).toContain('0 of 654 videos in September')
    expect(text).toContain('Not talked about')
    expect(text).not.toContain('your audience')
    for (const mode of MODES) assertCopyContract(render(marketSayHear.render(sealandMovesFixture(), mode, ctx)))
  })

  it('counts your claims by subject only once the judge has filed them', () => {
    const text = renderText(marketSayHear.render(sealandMovesFixture(), 'app', ctx))
    // Before the judge has filed them there is nothing to say by subject, and
    // "which subject each is about: not checked yet" was our backlog (B8).
    expect(text).not.toContain('Of your 98 claims read to date')
    expect(text).not.toContain(JUDGE_NOT_CHECKED)
    expect(text).not.toMatch(/\b0 waterproofing/)
  })

  it('counts the claims it draws in the table head, and points back only to a count it printed', () => {
    const text = renderText(marketSayHear.render(sealandMovesFixture(), 'app', ctx))
    // The claims are not filed by subject yet, so no count line stands above
    // the table and it names the claims itself.
    expect(text).toContain('Your claims, with what your market said back')
    // Up to five claims are drawn (CLAIM_ROWS): the head counts them all.
    expect(claimsHead(5, true)).toBe('Five of them, with what your market said back')
    expect(claimsHead(4, true)).toBe('Four of them, with what your market said back')
    // No "Of your N claims" line above it: "them" would point at nothing.
    const base = sealandMovesFixture()
    const unread = renderText(marketSayHear.render({ ...base, ways: { ...base.ways, claimSubjects: null } }, 'app', ctx))
    expect(unread).toContain('Your claims, with what your market said back')
    expect(unread).not.toContain('of them')
  })
})

describe('Y3 · every claim accounted for (sw-2 item 2)', () => {
  // Production, 30 Sep: "Of your 104 claims read to date: 12 looks & style ·
  // 10 buying & delivery · 9 price · 6 durability · 1 still to be read" (38).
  const base = sealandMovesFixture()
  const claimSubjects = {
    claims: 104,
    subjects: [
      { subjectId: 'l', name: 'Looks & style', k: 12 },
      { subjectId: 'b', name: 'Buying & delivery', k: 10 },
      { subjectId: 'p', name: 'Price', k: 9 },
      { subjectId: 'd', name: 'Durability', k: 6 },
    ],
    unfiled: 1,
    state: 'partial' as const,
    accounted: { under: 27, redescribed: 70, outside: 7, pending: 0 },
  }
  const text = renderText(marketSayHear.render({ ...base, ways: { ...base.ways, claimSubjects } }, 'app', ctx))

  it('says where the claims not counted under a subject are, and that they add up', () => {
    expect(text).toContain('Of your 104 claims read to date')
    expect(text).toContain('27 sit under one or more of these subjects (a claim can sit under more than one), 70 under subjects being re-described and 7 under none of them.')
    const a = claimSubjects.accounted
    expect(a.under + a.redescribed + a.outside + a.pending).toBe(claimSubjects.claims)
    assertCopyContract(render(marketSayHear.render({ ...base, ways: { ...base.ways, claimSubjects } }, 'app', ctx)))
  })

  it('writes the tally only where something needs accounting for', () => {
    expect(claimsTally({ under: 5, redescribed: 0, outside: 0, pending: 0 }, 5)).toBeNull()
    expect(claimsTally({ under: 4, redescribed: 0, outside: 0, pending: 2 }, 4)).toBe('4 sit under one or more of these subjects and 2 still to be read.')
  })
})

describe('Y4 · moves read in the market, as levels', () => {
  const moves = [
    { id: 'm-w', kind: 'subject' as const, subject_id: 's-water', registry_ids: null, lineage_id: null, title: 'Show the zip test on camera', declared_at: '2026-08-12T09:00:00.000Z' },
    { id: 'm-a', kind: 'advice' as const, subject_id: null, registry_ids: null, lineage_id: 'L-none', title: 'Accept the fit and facts advice', declared_at: '2026-09-02T09:00:00.000Z' },
  ]
  // Staging's pooled market, August and September (measured 27 Sep: the
  // market's videos 377 and 654; Waterproofing's market videos 15 and 29),
  // and nothing read for October yet.
  const reads = moveMarketReads({
    moves,
    month: '2026-09-01',
    on: (m) => (m.id === 'm-w' ? 'on the subject Waterproofing' : 'on a piece of advice'),
    subjects: new Map([['s-water', { name: 'Waterproofing', calibration: 'provisional' as const }]]),
    themes: new Map(),
    adviceTargets: new Map(),
    levels: (_kind, _id, month) => (month === '2026-08-01' ? 15 : month === '2026-09-01' ? 29 : null),
    n: (month) => (month === '2026-08-01' ? 377 : month === '2026-09-01' ? 654 : null),
  })

  it('reads the move’s month and the two after it, as levels, and names the ones not read yet', () => {
    expect(reads[0].months.map((m) => [m.role, m.month, m.state, m.k, m.n])).toEqual([
      ['move', '2026-08-01', 'read', 15, 377],
      ['after', '2026-09-01', 'read', 29, 654],
      ['after_that', '2026-10-01', 'not_yet', null, null],
    ])
    // An advice move whose evidence names no theme has no level to show.
    expect(reads[1].label).toBeNull()
  })

  it('renders levels with their "of N", never a verdict and never a cause', () => {
    const data = { ...sealandMovesFixture(), moves: { ...sealandMovesFixture().moves, rows: [], empty: null, market: reads } }
    for (const mode of MODES) {
      const markup = render(marketMoves.render(data, mode, ctx))
      assertCopyContract(markup)
      const text = renderText(markup)
      expect(text, mode).toContain('15 of 377 (4%)')
      expect(text, mode).toContain('29 of 654 (4%)')
      expect(text, mode).toContain('reads with the October reading')
      expect(text, mode).not.toMatch(/caus|because of (?:you|your)|thanks to/i)
    }
    expect(marketMoves.verdicts!(data)).toEqual([])
  })

  it('with nothing dated, says so and how a dated move will read', () => {
    const text = renderText(marketMoves.render(sealandMovesFixture(), 'app', ctx))
    expect(text).toContain('No move dated yet.')
    expect(text).toContain(MOVES_MARKET_HOW)
    expect(text).toContain('Track a subject')
  })
})
