import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { PRIVACY_LINE, REDDIT_CAP_LINE } from '@/lib/reading/method'
import { BRIEF_UNIT, LABEL_RULE, PLAYBOOK_EMPTY } from '@/lib/pages/content-brief'
import { CONTENT_BRIEF_BLOCKS, contentMake, contentPlaybook, contentRecord } from './index'
import {
  contentBriefFixture,
  emptyContentBriefFixture,
  emptyLedger,
  ledgerWithDismissal,
  refusedContentBriefFixture,
  thinContentBriefFixture,
} from './fixture'

// The render tier for the content brief's three blocks (Block D wave 2,
// E-content). One static render per block per mode per state, asserted against
// the copy contract — what the block PRINTS, which is the level the honesty
// rules are written at.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [contentBriefFixture(), thinContentBriefFixture(), refusedContentBriefFixture(), emptyContentBriefFixture()]
const LEDGERS = [ledgerWithDismissal(), emptyLedger()]

describe('the content brief’s own blocks', () => {
  it('keeps the copy contract in every mode and every state', () => {
    for (const block of CONTENT_BRIEF_BLOCKS) {
      for (const data of STATES) {
        for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
      }
    }
    for (const data of LEDGERS) {
      for (const mode of MODES) assertCopyContract(render(contentMake.render(data, mode, ctx)))
    }
  })

  it('is email-safe: tables, no classes, no CSS variables', () => {
    for (const block of CONTENT_BRIEF_BLOCKS) {
      const markup = render(block.render(contentBriefFixture(), 'email', ctx))
      expect(markup).toContain('<table')
      expect(markup).not.toContain('class=')
      expect(markup).not.toContain('var(--')
    }
    const make = render(contentMake.render(ledgerWithDismissal(), 'email', ctx))
    expect(make).toContain('<table')
    expect(make).not.toContain('class=')
    expect(make).not.toContain('var(--')
  })

  it('prints no direction word of its own — the stored nodes cut out first', () => {
    // Of its OWN. A recommendation's title is Pass D-b's imperative and is
    // rendered `stored` under that slot's policy; what this asserts is that
    // nothing CODE writes on these slides claims a direction. D5: the mock's
    // "growing, 3rd month" and "outperformed" are exactly what may not appear.
    const sweep = (markup: string) =>
      renderText(markup.replace(/<([a-z0-9]+)[^>]*data-copy="(stored|quote)"[^>]*>[\s\S]*?<\/\1>/g, ' '))
    for (const block of CONTENT_BRIEF_BLOCKS) {
      for (const data of STATES) {
        expect(sweep(render(block.render(data, 'app', ctx)))).not.toMatch(
          /\b(growing|fading|rising|climbing|slipping|gaining|outperform\w*|flat)\b/i,
        )
      }
    }
    for (const data of LEDGERS) {
      expect(sweep(render(contentMake.render(data, 'app', ctx)))).not.toMatch(
        /\b(growing|fading|rising|climbing|slipping|gaining|outperform\w*|flat)\b/i,
      )
    }
  })
})

describe('content.playbook — the mock’s page 3', () => {
  const data = contentBriefFixture()
  const markup = render(contentPlaybook.render(data, 'print', ctx))
  const text = renderText(markup)

  it('names the clock every figure on it keeps (D9)', () => {
    expect(text).toContain('videos published in September')
  })

  it('prints a denominator in every cell it draws (D10)', () => {
    // FigureCell stamps `level` only where an "of N" was handed to it, and the
    // copy contract fails a level without one — so the assertion that matters
    // is that there ARE levels here and the contract passed above.
    expect(markup.match(/data-copy="level"/g)?.length ?? 0).toBeGreaterThan(6)
  })

  it('states the classified n against the published one, per side', () => {
    expect(text).toMatch(/Read from [\d,]+ of .+ videos published in September\./)
  })

  it('says why Reddit is in no engagement row, in the one sentence that says it', () => {
    expect(text).toContain('carries no engagement rate')
  })

  it('draws no remainder row and no partition (D4)', () => {
    expect(text).not.toContain('Other kinds')
    // Every side's rows are shares of that side's own classified n, so two
    // sides' cells never share a denominator.
    const sides = data.playbook.playbook!.formats.sides
    expect(new Set(sides.map((s) => s.of)).size).toBeGreaterThan(1)
  })

  it('publishes its figures by token, prefixed so nothing collides', () => {
    const answers = blockAnswers(contentPlaybook, data)
    expect(Object.keys(answers.figures).every((k) => k.startsWith('content_'))).toBe(true)
    expect(answers.verdicts).toEqual([])
  })

  it('says so rather than drawing a hole when nothing was published', () => {
    expect(blockAnswers(contentPlaybook, emptyContentBriefFixture()).empty).toBe(PLAYBOOK_EMPTY)
    expect(renderText(render(contentPlaybook.render(emptyContentBriefFixture(), 'print', ctx)))).toContain(PLAYBOOK_EMPTY)
  })
})

describe('content.record — the mock’s page 5', () => {
  const data = contentBriefFixture()
  const text = renderText(render(contentRecord.render(data, 'print', ctx)))

  it('names the unit every share on the brief is a share of', () => {
    expect(text).toContain(BRIEF_UNIT)
  })

  it('says a format and a hook label were not worded by a model', () => {
    expect(text).toContain(LABEL_RULE)
  })

  it('carries the Reddit cap, which no brief has ever printed', () => {
    expect(text).toContain(REDDIT_CAP_LINE)
  })

  it('carries the delivery record and the reading counter, verbatim', () => {
    expect(text).toContain('4 updates since 6 Sep 2026 \u00b7 longest gap 7 days \u00b7 last on 27 Sep 2026')
    expect(text).toContain('your 3rd monthly reading · the quarter view needs 6')
  })

  it('states the language share on its own basis, never as a fact about comments (D15)', () => {
    expect(text).toContain('of what was said on camera was not in English')
  })

  it('promises no future date and claims no start date (D14)', () => {
    expect(text).not.toMatch(/next update lands/i)
    expect(text).not.toMatch(/tracking since/i)
  })

  it('falls back to the sentences it can stand behind on a fresh database', () => {
    const refused = renderText(render(contentRecord.render(refusedContentBriefFixture(), 'print', ctx)))
    expect(refused).toContain('The month-by-month reading has not been recorded for this workspace yet.')
    expect(refused).toContain(BRIEF_UNIT)
    expect(refused).not.toContain('monthly reading · the quarter view')
  })

  it('has one honest line when the record could not be read at all', () => {
    expect(blockAnswers(contentRecord, emptyContentBriefFixture()).empty).toContain('has not been read')
  })
})

describe('content.make — the mock’s page 2', () => {
  const data = ledgerWithDismissal()
  const markup = render(contentMake.render(data, 'print', ctx))
  const text = renderText(markup)

  it('draws three things to make and one to stop', () => {
    expect(text).toContain('01')
    expect(text).toContain('02')
    expect(text).toContain('03')
    expect(text).toContain('What not to make')
    expect(text).toContain('Lead with price comparisons against Ottobock')
  })

  it('marks the model’s own words as stored, naming the call that wrote them', () => {
    expect(markup).toContain('data-copy="stored"')
    expect(markup).toContain('data-slot="pass_d_b_recommendation"')
  })

  it('prints a reading with both sides and the band beside the word', () => {
    expect(markup).toContain('data-copy="verdict"')
    expect(text).toMatch(/\d+ of \d+ videos in .* against \d+ of \d+ in /)
  })

  it('draws no sparkline and no trail — two month readings are not a series (D3)', () => {
    expect(markup).not.toContain('<svg')
  })

  it('hands its verdicts and its quote refs back for freezing', () => {
    const answers = blockAnswers(contentMake, data)
    expect(answers.quotes).toContain('e:ev-9')
    expect(answers.verdicts.length).toBeGreaterThan(0)
    for (const v of answers.verdicts) expect(v.value.n).toBeGreaterThan(0)
  })

  it('says advice lands with the next update when the ledger is empty', () => {
    expect(blockAnswers(contentMake, emptyLedger()).empty).toBe('Advice lands with your next update.')
  })

  it('claims nothing about whether a comment was answered (D6)', () => {
    expect(text).not.toMatch(/ignored/i)
    expect(text).not.toMatch(/answered last week/i)
  })
})

describe('the privacy line is the product’s one wording', () => {
  it('is the same string the record footnote carries', () => {
    expect(PRIVACY_LINE).toBe('Commenters are never identified; quotes carry platform and date only.')
  })
})
