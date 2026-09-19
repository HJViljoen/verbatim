import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { overviewSentence, provenanceLine, voicesFromLine } from './sentence'
import { overviewFixture, prunedLedgerFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV1 · in one sentence', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewSentence.render(data, mode, ctx)))
      }
    }
  })

  // A LIVE LEDGER TITLE IS MODEL PROSE AND FAILS RULE (c) UNMARKED. Two of
  // Össur's 56 recommendations are "Increase Content Volume to Improve Share of
  // Voice" and "Increase Brand Presence to Capitalize on Low Competitor…", and
  // topRecommendation ranks over a table deleted and reinserted every update,
  // so which one lands on the front page changes with the run.
  it('marks the top recommendation’s title as stored prose, naming its slot', () => {
    for (const mode of MODES) {
      const data = overviewFixture()
      data.sentence.ledger = { ...data.sentence.ledger!, title: 'Increase Content Volume to Improve Share of Voice' }
      const markup = render(overviewSentence.render(data, mode, ctx))
      const node = copyNodes(markup).find((n) => n.text.startsWith('Increase Content Volume'))
      expect(node?.kind).toBe('stored')
      expect(node?.slot).toBe('pass_d_b_recommendation')
      assertCopyContract(markup)
    }
  })

  // A BARE NUMERAL NEEDS ITS NOUN (Block D wave 3, M10). "chosen from the 37
  // the month's videos carried" is two "the"-phrases with a zero relative
  // pronoun between a numeral and a possessive, set at 11px mono as the second
  // thing the eye reaches in the lead tile. The count stays — disposition #18's
  // point is that a reader can see two were CHOSEN and not that two were all
  // there was — and it is the heading's own noun that makes the clause read.
  it('names what the two voices were chosen from, in a sentence', () => {
    expect(voicesFromLine(2, 37)).toBe('chosen from the 37 voices this month’s videos carried')
    // Nothing to say where the pool is the shown set.
    expect(voicesFromLine(2, 2)).toBeNull()
    expect(voicesFromLine(2, 1)).toBeNull()
  })

  it('writes the figures into the sentence and marks them as code’s', () => {
    const node = overviewSentence.render(overviewFixture(), 'app', ctx)
    const markup = render(node)
    const text = renderText(node)
    expect(text).toContain('Will it survive a wet commute came up in 9.4%')
    expect(text).toContain('130 of 1,388 videos')
    expect(markup).not.toContain('[[t1_share]]')
    const figures = copyNodes(markup).filter((n) => n.kind === 'figure')
    expect(figures.map((f) => f.text)).toContain('9.4%')
  })

  // A MONO GLYPH IS ONE ADVANCE WIDE WHATEVER IT IS, so tabular mono inside a
  // 17px serif line sets "9.4%" as "9 . 4%" and "1,388" as "1 , 388" — the
  // defect `TokenProse`'s own docblock names. It reached this hero because the
  // block hand-rolls the serif through `className`, so the face rule never saw
  // a hero and fell to its body default (Block D wave 3, M1).
  it('sets the hero sentence’s figures in the sentence’s own face, never mono', () => {
    const markup = render(overviewSentence.render(overviewFixture(), 'app', ctx))
    const hero = markup.slice(markup.indexOf('font-serif'))
    const at = hero.indexOf('data-copy="figure"')
    expect(at).toBeGreaterThan(-1)
    const figure = hero.slice(at, at + 120)
    expect(figure).not.toContain('font-mono')
    expect(figure).toContain('font-semibold')
  })

  it('marks the model’s read as prose, and code’s sentence as neither', () => {
    const nodes = copyNodes(render(overviewSentence.render(overviewFixture(), 'app', ctx)))
    const prose = nodes.filter((n) => n.kind === 'prose')
    expect(prose).toHaveLength(1)
    expect(prose[0].text).toContain('Durability has become the question of the season')
    // The one place the model may argue carries its label and says who wrote it.
    const text = renderText(render(overviewSentence.render(overviewFixture(), 'app', ctx)))
    expect(text).toContain('Interpretation')
    expect(text).toContain('We wrote this read ourselves this month.')
  })

  it('prints the unusual line with its band, its n and one quote', () => {
    const text = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Unusual this week:')
    expect(text).toContain('21 of 310 videos')
    expect(text).toContain('band ±2.1 points')
  })

  it('drops the unusual line entirely when nothing fired — never a reassurance', () => {
    const text = renderText(overviewSentence.render(refusedFixture(), 'app', ctx))
    expect(text).not.toContain('Unusual this week')
    expect(text).not.toContain('Nothing unusual')
  })

  it('prints the top recommendation with its age and your decision', () => {
    const text = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Lead with repairability')
    // BLOCK D WAVE 2 (`main.sentence.rec.provenance` / `.stamp`): three
    // clauses that had no field at all before this package, and the mock's
    // words changed where the rule refuses them — "first RAISED" becomes "first
    // on record" (D14, earliest evidence), "3 updates running" becomes "across
    // 3 updates" (D9, nothing counts consecutiveness), and the grounding is
    // `Grounding.line`, which names what it counted over.
    expect(text).toContain('first on record 3 months ago')
    expect(text).toContain('repeated across 3 updates')
    expect(text).toContain('videos behind it')
    // The status is now a CONTROL and the stamp is its own mono line under it.
    expect(text).toContain('Working on it')
    expect(text).toContain('you marked it on 2 Sep')
  })

  it('shows the original and the English under it, never instead of it', () => {
    const text = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Dit het twee winters gehou.')
    expect(text).toContain('It held through two winters.')
  })

  it('hands back its quotes as refs and its verdict', () => {
    const { quotes, verdicts } = blockAnswers(overviewSentence, overviewFixture())
    expect(quotes).toEqual(['e:1', 'e:2', 'c:1'])
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0].bandPts).toBe(1.8)
  })

  it('is email-safe', () => {
    const markup = render(overviewSentence.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('links onward to Market, absolutely', () => {
    const markup = render(overviewSentence.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('https://app.verbatimintel.com/dashboard/market')
  })

  it('heads the voices with two of N, and links the cite where there is somewhere to go', () => {
    const markup = render(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(renderText(overviewSentence.render(overviewFixture(), 'app', ctx))).toContain('Two voices')
    expect(markup).toContain('href="https://www.tiktok.com/@x/video/1"')
    // The second voice has no stored video URL: the cite is printed whole,
    // without a dead link.
    // The cite tail names WHOSE video it was (`main.sentence.voice1`), which
    // is the fact that makes a quote evidence for the claim above it — it used
    // to end with the constant "under a video we read" on every quote.
    expect(markup).toContain('TikTok · 11 Sep · under your own video')
    expect((markup.match(/<a [^>]*href="https:\/\/www\.tiktok\.com/g) ?? []).length).toBe(1)
  })
})

// ---- Block D wave 2 · the artboard's §1 ------------------------------------

describe('OV1, ported to the artboard', () => {
  it('sets the month’s sentence at the hero ramp, not at body size', () => {
    // mock-gap §Visual fidelity names this the single biggest visual gap: the
    // page's one sentence printed at 13.5px sans like any other paragraph.
    const markup = render(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('font-serif text-[17px] font-medium leading-[1.35]')
  })

  it('puts the voices in their own column, behind a rule', () => {
    const markup = render(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('xl:grid-cols-2')
    // The quote's rule is P0's green tint, which is the artboard's.
    expect(markup).toContain('border-l-2 border-primary/30')
  })

  it('dates the block by the last update and NOT by a promised next one', () => {
    // D14: nothing in the product holds the next update's date, so the mock's
    // "· next 4 Oct" is not printed at all.
    const text = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('update of 13 Sep')
    expect(text).not.toContain('next 4 Oct')
  })

  it('puts the month and its freeze state in the footer note, not in the body', () => {
    const markup = render(overviewSentence.render(overviewFixture(), 'app', ctx))
    // `BlockFrame.footerNote` — the right-hand mono slot P0 built and nothing
    // used. Six of Main's footer notes were body paragraphs or absent.
    expect(markup).toContain('shrink-0 font-mono text-[11px] font-normal text-muted-foreground">September 2026 · still filling')
  })

  it('prints the video’s own on-screen text as a sibling of the quote, never inside it', () => {
    const markup = render(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('on-screen text on the same video: “1 bag. 3 years. 0 regrets”')
    // It is a different speaker, so it is outside the blockquote and carries no
    // `quote` marker of its own.
    const quoted = markup.slice(markup.indexOf('Dit het twee winters'))
    expect(quoted.indexOf('</blockquote>')).toBeLessThan(quoted.indexOf('on-screen text'))
  })

  it('says the evidence is gone rather than printing “0 videos behind it”', () => {
    // The state every live Sealand recommendation is in: the row cited
    // evidence and `prune-stale-analysis` has since removed all of it.
    const data = prunedLedgerFixture()
    const text = renderText(overviewSentence.render(data, 'app', ctx))
    expect(data.sentence.ledger?.grounding?.pruned).toBe(true)
    expect(text).not.toContain('0 videos behind it')
    expect(text).toContain('no longer on record')
    expect(provenanceLine(data.sentence.ledger!)).toBe(data.sentence.ledger!.grounding!.line)
  })

  it('drops each provenance clause that has no reading behind it', () => {
    const base = overviewFixture().sentence.ledger!
    expect(provenanceLine({ ...base, monthsOld: null, timesMade: 1, grounding: null })).toBeNull()
    expect(provenanceLine({ ...base, monthsOld: null, timesMade: 1 })).toBe(base.grounding!.line)
  })

  it('keeps the copy contract in all three modes with the pruned ledger too', () => {
    for (const mode of MODES) {
      assertCopyContract(render(overviewSentence.render(prunedLedgerFixture(), mode, ctx)))
    }
  })
})
