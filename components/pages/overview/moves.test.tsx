import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyNodes, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { MOVES_UNLOCK } from '@/lib/pages/overview'
import { CARD_CONFIRM_SLOT, REGIME_BREAK, claimText, movesMeta, overviewMoves, seriesLine } from './moves'
import { overviewRecord } from './record'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV5 · your moves', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewMoves.render(data, mode, ctx)))
      }
    }
  })

  it('lists each dated move with the month its first score lands in', () => {
    // BLOCK D WAVE 2: a move that HAS a reading now prints the reading (its
    // banded comparison and every side's series) and a move that does not
    // prints `moveLine`, which is the sentence naming the month its first score
    // lands in. The fixture carries one of each, which is what the artboard
    // draws.
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Track: Waterproofing · tracked 2 Sep')
    expect(text).toContain('first scoring lands with the October reading')
  })

  // BLOCK D · D2 CHANGED THIS SENTENCE AND THE REASON IS THE PACKAGE. The
  // block used to print "Scoring, and the pre-filled monthly card, are not
  // built yet. They will land on Market." Both are built now — the card counts
  // this month's own posts and every move carries the one banded comparison it
  // earns — so the old string would be a copy claim the code contradicts,
  // which is the defect AGENTS.md names ("a page once claimed 'no email is
  // sent' while Resend sent"). It still names NO MONTH, for the old reason.
  it('names what the block does rather than a delivery date it cannot know', () => {
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain(MOVES_UNLOCK)
    expect(text).toContain('read from the month after it was dated')
    expect(text).not.toMatch(/not built yet/)
    expect(text).not.toMatch(/bottom section/)
    // No month, no quarter, no promised date.
    expect(MOVES_UNLOCK).not.toMatch(/January|February|March|April|May|June|July|August|September|October|November|December|quarter/)
  })

  it('carries the masthead that stops every line reading as a causal claim', () => {
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('We never claim you caused it')
  })

  it('is honest rather than empty when nothing has been dated', () => {
    const text = renderText(overviewMoves.render(refusedFixture(), 'app', ctx))
    expect(text).toContain('Nothing dated yet. Press Track this on a subject or a theme')
    // Nothing is scored and nothing is ticked.
    expect(text).not.toMatch(/\b(working|worked|succeeded|up \d)\b/i)
  })

  it('declares no figures — nothing on it is a reading', () => {
    expect(blockAnswers(overviewMoves, overviewFixture()).figures).toEqual({})
  })

  it('is email-safe', () => {
    const markup = render(overviewMoves.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })
})

describe('OV6 · how sound is this month', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewRecord.render(data, mode, ctx)))
      }
    }
  })

  it('prints the record BEHIND the band’s sentence, and not the sentence again', () => {
    // CHANGED BY THE FIX PASS (design review Blocker 2 / High 3, code review
    // I3 and I7). The block passed `record.line` — ~180 characters — as
    // `BlockFrame`'s `meta`, which renders `whitespace-nowrap` inside an
    // `overflow-hidden` tile: it was cut mid-clause on the live page ("…27% of
    // what was said on camera"), and it squeezed the h2 beside it into five
    // stacked words. It is the soundness band's sentence, it wraps there, and
    // this block prints the record it rests on.
    const text = renderText(overviewRecord.render(overviewFixture(), 'app', ctx))
    expect(text).not.toContain('27% of what was said on camera was not in English · 1 tracking change')
    // The meta slot is not empty — it carries "the record →", which is four
    // words and fits — but nothing long is passed through it any more.
    expect(text).toContain('the record →')
    expect(text).toContain('2,359 videos carried conversation in this window')
  })

  it('counts the comparisons this page refused, and dates the freeze', () => {
    const text = renderText(overviewRecord.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('2 comparisons were refused on this page')
    expect(text).toContain('This month stops moving on 31 Oct 2026')
  })

  it('says so when nothing was refused', () => {
    const data = overviewFixture()
    const lines = data.record.lines.filter((l) => !l.includes('refused on this page'))
    const text = renderText(overviewRecord.render(
      { ...data, record: { ...data.record, lines: [...lines, 'Every comparison this page asked for was drawn.'] } },
      'app', ctx,
    ))
    expect(text).toContain('Every comparison this page asked for was drawn.')
  })

  it('prints each refusal\u2019s reason, in every mode — not only in a hover title', () => {
    // The block promised "each with its reason beside it" while the reason
    // lived in the badge's `title`: invisible in print, and dropped entirely by
    // the email arm, which prints the word alone.
    for (const mode of MODES) {
      const text = renderText(overviewRecord.render(overviewFixture(), mode, ctx))
      expect(text, mode).toContain('too little was read on one side or both')
      expect(text, mode).toContain('the two sides were grouped differently')
    }
  })

  it('links to the record, absolutely, in an email', () => {
    const markup = render(overviewRecord.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('https://app.verbatimintel.com/dashboard/settings')
    expect(markup).not.toContain('class=')
  })

  it('declares no figures — the blocks above already print them', () => {
    expect(blockAnswers(overviewRecord, overviewFixture()).figures).toEqual({})
  })
})

// ---- Block D wave 2 · the artboard's §5 ------------------------------------

describe('OV5, ported to the artboard', () => {
  it('draws the pre-filled card beside the declared moves', () => {
    // Wave 1 built `buildMoveCandidate` and `readMove` and nothing rendered
    // either of them.
    const markup = render(overviewMoves.render(overviewFixture(), 'app', ctx))
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('xl:grid-cols-2')
    expect(text).toContain('This month’s card · pre-filled from your own posts')
  })

  it('names the clock every own-post figure is on — ONCE for the rows that share it', () => {
    // D9: own posts are dated by `upload_date` — a third clock — and the card
    // says so rather than letting a reader assume the month is the comment's.
    //
    // CHANGED BY THE FIX PASS (design review High 8). The basis printed on each
    // counted row, which made the first row read "posts published · posts
    // published in September" — the label and the basis in the same four words
    // — and repeated the same clause three more times in one 240px card. The
    // rows that share a clock now name it once, under them; the row on a
    // DIFFERENT clock still carries its own, which is the assertion below this
    // one and the whole point of the rule.
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('17 posts published')
    expect(text).toContain('8 of 17 cleared the comment floor')
    expect(text).toContain('every count above is dated by the post itself — posts published in September')
    // Said once, not four times.
    expect(text.split('posts published in September').length - 1).toBe(1)
    expect(text).not.toContain('posts published · posts published in September')
  })

  it('prints what the speaker SAID, never the model’s paraphrase of it', () => {
    // Code review C1 / I6. `video_claims` holds two columns: `claim` is the
    // model's 93-to-197-character summary and `quote` is the sentence on the
    // transcript. The card printed the summary inside quotation marks under
    // `data-copy="quote"` — the one exemption reserved for words a model did
    // not write — and carried it as a bare string into every stored export.
    const data = overviewFixture()
    const markup = render(overviewMoves.render(data, 'app', ctx))
    const text = renderText(overviewMoves.render(data, 'app', ctx))
    expect(text).toContain('“We get things wrong, and we say so, and then we do better the next year.”')
    expect(text).not.toContain('Sealand acknowledges ongoing challenges')
    expect(text).not.toContain('award-winning B Corp certified brand')
    // The quotation mark on this row is now truthful, so the marker stays.
    expect(markup).toContain('data-copy="quote"')
  })

  it('denominates the subject rows on posts READ, not posts published', () => {
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Subjects matched · posts of yours we read in September')
    expect(text).toContain('Durability 3 of 5')
  })

  it('prints the real hook enum, including the row that is mostly empty', () => {
    // Twelve of Sealand's seventeen September posts carry no hook, so
    // "not classified" is the largest row rather than a rounding footnote.
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('not classified 12 of 17')
  })

  it('caps and cuts the claims rather than laying out the mock’s slogan tally', () => {
    const long = 'x'.repeat(200)
    expect(claimText(long).length).toBeLessThanOrEqual(96)
    expect(claimText('short claim')).toBe('short claim')
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('and 3 more, each said on its own post')
  })

  it('prints the paired movement side by side and never differenced', () => {
    // D2: the mock puts "+4 pts" next to "too few to compare". A Verdict
    // carries the change and the band together or neither, so each side prints
    // its own badge.
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('your audience too few to compare')
    expect(text).toContain('the category ▲ 3 pts · band 1.9')
  })

  it('keeps the button’s slot with an honest sentence in it, and names no date', () => {
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain(CARD_CONFIRM_SLOT)
    expect(CARD_CONFIRM_SLOT).not.toMatch(/\b(Oct|Nov|Dec|Jan|Q[1-4])\b/)
  })

  it('counts the whole ledger, never a quarter', () => {
    // D12: a quarter of a table deleted and reinserted every update is a
    // window over a table with no history in it.
    const text = renderText(overviewMoves.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('every piece of advice this product has ever given you')
    expect(text).not.toContain('this quarter')
  })

  it('counts the card in the header only where there is something to confirm', () => {
    const m = overviewFixture().moves
    expect(movesMeta(m)).toBe('2 declared · 1 card waiting for you')
    expect(movesMeta({ ...m, card: m.card ? { ...m.card, proposal: null } : null })).toBe('2 declared')
    expect(movesMeta({ ...m, rows: [], card: null })).toBeUndefined()
  })

  it('prints every side’s own series beside the others, never a difference', () => {
    const reading = overviewFixture().moves.readings[0]
    const line = seriesLine(reading)
    expect(line).toContain('You')
    expect(line).toContain('The category')
    expect(line).toContain('Freitag')
    expect(line).not.toContain('per 100 videos')
  })

  // A LEVEL WITHOUT ITS "of N" IS A SCORE, and this line printed six of them
  // (Block D wave 3, M5). The denominators were on the object the whole time —
  // `MoveSeries.points` is `{month, k, n, pct}` — and only `pct` was read; the
  // sentence under the line says "read against 3 months", which is how many
  // months and never what of. Each month carries its OWN denominator, because
  // each month has one.
  it('prints every level in the run with its own denominator', () => {
    const reading = overviewFixture().moves.readings[0]
    const line = seriesLine(reading)
    expect(line).toContain('07/26 7.3% 6 of 82')
    expect(line).toContain('09/26 11.9% 10 of 84')
    expect(line).toContain('07/26 9.1% 118 of 1,290')
    // And the node is MARKED, so rule (b) reaches it from here on — it escaped
    // the contract entirely while it carried no marker.
    const markup = render(overviewMoves.render(overviewFixture(), 'app', ctx))
    const level = copyNodes(markup).find((n) => n.kind === 'level' && n.text.includes('07/26'))
    expect(level).toBeDefined()
    expect(copyViolations(markup).filter((v) => v.rule === 'level-denominator')).toEqual([])
  })

  it('draws the arrows only where a LINE would be allowed, and marks a regime break', () => {
    // Code review I4. An arrowed run of levels is the same claim as the
    // sparkline, and it was printed unconditionally two lines above the very
    // note that says why no line may be drawn.
    const reading = overviewFixture().moves.readings[0]
    expect(reading.chartNote).toBeNull()
    expect(seriesLine(reading)).toContain('→')

    // Below three readings the chart is refused, so the points are printed
    // side by side and nothing between them says "and then".
    const refused = { ...reading, chartNote: 'Aug → Sep only' }
    expect(seriesLine(refused)).not.toContain('→')
    expect(seriesLine(refused)).toContain('%')

    // Two months grouped differently are not one run, whatever the count.
    const broken = {
      ...reading,
      series: reading.series.map((s, i) =>
        i === 0
          ? { ...s, noClustering: false, regimeByMonth: Object.fromEntries(s.points.map((p, j) => [p.month, j === 0 ? 'r1' : 'r2'])) }
          : s,
      ),
    }
    expect(seriesLine(broken)).toContain(REGIME_BREAK.trim())
  })

  it('declares the moves’ verdicts, so the record can count what refused', () => {
    const { verdicts } = blockAnswers(overviewMoves, overviewFixture())
    expect(verdicts.length).toBeGreaterThan(0)
  })
})
