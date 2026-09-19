import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import type { WeekData } from '@/lib/pages/week'
import { weekUnusual } from './unusual'
import { absentReadingFixture, thinFixture, weekFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

const withState = (state: WeekData['unusual']['state'], extra: Partial<WeekData['unusual']> = {}): WeekData => {
  const d = weekFixture()
  return { ...d, unusual: { ...d.unusual, state, flags: [], ...extra } }
}

describe('WK1 · unusual this week', () => {
  it('renders in all three modes, in every state, and keeps the copy contract', () => {
    const states: WeekData[] = [
      weekFixture(),
      thinFixture(),
      absentReadingFixture(),
      withState('nothing_unusual'),
      withState('refused', { note: 'This update read well under its usual number of videos, so this week is not compared with the months behind it.' }),
      withState('not_checked', { setSize: null, tested: null }),
      withState('unreadable', { flaggedCount: 2 }),
    ]
    for (const data of states) {
      for (const mode of MODES) {
        assertCopyContract(render(weekUnusual.render(data, mode, ctx)))
      }
    }
  })

  it('prints the flag in full — object, week, baseline, band and n', () => {
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).toContain('28')
    expect(text).toContain('Objections · of 205 videos this update covered')
    expect(text).toContain('every audience together')
    // THE MOCK'S ONE-LINE CLAIM, IN THE HONEST FORM (Block D wave 2). The
    // artboard asserts "running at 3.1× its usual rate, mostly under Freitag
    // content"; a bare multiple carries neither n nor band, and nothing
    // decomposes a flag by audience. What is printed in that slot is the
    // banded k-of-n the code can actually write — the object, both levels, the
    // difference and the band it cleared — inside a verdict node.
    expect(text).toContain('Objections ran at 13.7% of this update against 3.5% across Jun 2026, Jul 2026, Aug 2026 — a difference of 10.2 points, on a band of 4.9.')
    expect(text).not.toContain('×')
  })

  it('sets the interpretation’s figures in the sentence’s own face', () => {
    // Design review F6. A mono glyph is one advance wide whatever it is, so
    // "13.7%" and "3.5%" inside a sans paragraph read "13 . 7%" and "3 . 5%" —
    // six lines under a claim line setting the same two numbers in sans. The
    // marker is unchanged, so the contract still tells code's number from the
    // model's words; only the face moves.
    const markup = render(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(markup).toContain('data-copy="figure" class="font-semibold tabular-nums"')
    expect(markup).not.toContain('data-copy="figure" class="font-mono tabular-nums"')
    assertCopyContract(markup)
  })

  it('joins the header’s two counts without claiming one denominator', () => {
    // Code review C10. The meta read "3 of 42 tested cleared its band · of 205
    // videos this update": two "of"s joined by a dot, over two different
    // denominators — objects the check tested, and videos the update covered.
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).toContain('1 of 14 tested cleared its band · across 205 videos this update')
    expect(text).not.toContain('cleared its band · of ')
  })

  it('marks the flag’s own label as the model’s words, not as the page’s verdict', () => {
    // Code review C6 / design review F9. `flag.label` is a `pass_b_theme`
    // string a reasoning model wrote. The lead sentence was ONE verdict node
    // around it, and a verdict node is the contract's widest exemption: rule
    // (c) cuts its whole range out of the sweep, so a label carrying a
    // direction word printed unchecked in the page's first sentence and read
    // as the product's own movement claim.
    const d = weekFixture()
    const flags = d.unusual.flags.map((f) => ({ ...f, label: 'Concerns about declining quality' }))
    for (const mode of MODES) {
      const markup = render(weekUnusual.render({ ...d, unusual: { ...d.unusual, flags } }, mode, ctx))
      // The label names the call that wrote it — in the lead AND in the level
      // cell under it, which is the second place it is printed.
      expect(markup.match(/data-copy="subject" data-slot="pass_b_theme"/g)?.length ?? 0, mode).toBeGreaterThanOrEqual(2)
      assertCopyContract(markup)
    }
  })

  it('names the months the baseline pooled, and which of them were still filling', () => {
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Jun 2026, Jul 2026, Aug 2026')
    // August is 66% of Össur's baseline and does not freeze until 30 days after
    // it ends: telling a reader which months went in without telling them two
    // thirds of it was still moving is half a statement.
    expect(text).toContain('August had not finished when this was read')
  })

  it('marks a baseline that was not read under one grouping', () => {
    // `baseline_regime` exists so a surface can say this; printing the
    // filling-months caveat and not this one tells a reader the comparison
    // will move without telling them it may not be like for like.
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).toContain('not all read under one grouping, so the comparison is not strictly like for like')
  })

  it('says nothing about the grouping where the check read one', () => {
    const d = weekFixture()
    const data = { ...d, unusual: { ...d.unusual, flags: [{ ...d.unusual.flags[0], baselineRegime: 'one' }] } }
    expect(renderText(weekUnusual.render(data, 'app', ctx))).not.toContain('like for like')
    // A kind has no grouping to be like-for-like about, and an absent column is
    // not an answer either.
    for (const regime of ['not_grouped', null]) {
      const other = { ...d, unusual: { ...d.unusual, flags: [{ ...d.unusual.flags[0], baselineRegime: regime }] } }
      expect(renderText(weekUnusual.render(other, 'app', ctx)), String(regime)).not.toContain('like for like')
    }
  })

  it('labels the model’s paragraph as an interpretation and says who wrote it', () => {
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Interpretation · written by a model, from the figures above')
    expect(text).toContain('Most of the pushback sits under one creator’s fitting video')
  })

  it('writes the model’s figure tokens in, and never prints one', () => {
    for (const mode of MODES) {
      const text = renderText(weekUnusual.render(weekFixture(), mode, ctx))
      // The stored sentence says `[[flag_1_week_share]]`; the reader sees the
      // product's own measured value, in the product's own formatting.
      expect(text, mode).not.toMatch(/\[\[/)
      expect(text, mode).toContain('Objections ran at 13.7% of this update against 3.5% across the three months behind it.')
    }
  })

  it('drops whole a sentence citing a figure the block does not hold', () => {
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).not.toContain('is dropped whole')
  })

  it('marks the model’s own words as prose and the substituted number as a figure', () => {
    // Rule (a): a digit inside a prose node is a number the model typed, so the
    // markup has to let the contract tell the two apart inside one paragraph.
    const markup = render(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(markup).toMatch(/data-copy="prose"/)
    expect(markup).toMatch(/data-copy="figure"[^>]*>13\.7%/)
  })

  it('carries the two quotes the explanation rests on', () => {
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Insurance covered nothing and the quote was more than my car')
    expect(text).toContain('Love the socket, hate what they charge for a liner')
    expect(blockAnswers(weekUnusual, weekFixture()).quotes).toHaveLength(2)
  })

  it('says "nothing unusual in this update" in full, with the set it watched', () => {
    const text = renderText(weekUnusual.render(withState('nothing_unusual'), 'app', ctx))
    expect(text).toContain('Nothing unusual in this update. Every one of the 31 objects this check watches read inside its usual band.')
    // ONE CLOCK PER SENTENCE (design review F8). The question, the metas and
    // the footer all say "update"; these three said "week", on a page where
    // Sealand's newest update covers thirty days. The block's TITLE keeps the
    // artboard's "Unusual this week" — that is the page's own name — and every
    // sentence stating what was MEASURED says update.
    for (const state of ['nothing_unusual', 'refused', 'baseline_forming'] as const) {
      const sentence = weekUnusual.emptyState(withState(state)) ?? ''
      expect(sentence, state).not.toMatch(/\bweek\b/)
    }
  })

  it('says when the check can first speak, rather than "forming" and nothing', () => {
    const text = renderText(weekUnusual.render(thinFixture(), 'app', ctx))
    expect(text).toContain('baseline forming — 1 of 3 months; the check starts with the November reading.')
    expect(text).toContain('does not have three yet')
    // AND NEVER SAYS THE WEEK WAS QUIET. A baseline that cannot speak has not
    // found nothing; it has not looked.
    expect(text).not.toContain('Nothing unusual this week')
  })

  it('names a thin update rather than reading it', () => {
    const data = withState('refused', {
      note: 'This update read well under its usual number of videos, so this week is not compared with the months behind it.',
      updateVideos: 96,
      medianVideos: 476,
    })
    const text = renderText(weekUnusual.render(data, 'app', ctx))
    expect(text).toContain('read well under its usual number of videos')
    expect(text).toContain('This update analysed 96 videos against a usual 476.')
    expect(text).not.toContain('Nothing unusual this week')
  })

  it('tells "we could not read them" apart from "nothing was unusual"', () => {
    // The check's own row said two flags fired; the flags read failed. Calling
    // that a quiet week is the conflation `anomaly_checks` exists to prevent.
    const text = renderText(weekUnusual.render(withState('unreadable', { flaggedCount: 2 }), 'app', ctx))
    expect(text).toContain('raised 2 flags and they could not be read just now')
    expect(text).not.toContain('Nothing unusual this week')
  })

  it('tells "nobody has looked" apart from "nothing was unusual"', () => {
    const text = renderText(weekUnusual.render(withState('not_checked', { setSize: null, tested: null }), 'app', ctx))
    expect(text).toContain('No update has run this check for this workspace yet — which is not the same as nothing being unusual.')
  })

  it('declares the week’s n and every figure of every flag', () => {
    const figures = blockAnswers(weekUnusual, weekFixture()).figures
    expect(figures.week_videos).toEqual({ value: 205, unit: 'videos', label: 'videos this update covered' })
    expect(figures.flag_1_week_videos.value).toBe(28)
    expect(figures.flag_1_band.value).toBe(4.9)
    // The two keys the explainer's own table offers, so the sentence it is
    // most likely to write resolves instead of being dropped.
    expect(figures.flag_1_week_share).toEqual({ value: 13.7, unit: 'pct', label: 'Objections — share of this update' })
    expect(figures.flag_1_baseline_share.value).toBe(3.5)
  })

  it('speaks no direction word — one week against three months is two readings', () => {
    for (const mode of MODES) {
      const text = renderText(weekUnusual.render(weekFixture(), mode, ctx))
      expect(text, mode).not.toMatch(/\b(rising|growing|fading|gaining|climbing|surging)\b/i)
    }
  })

  it('draws the thirteen-update series and says it is a series of UPDATES', () => {
    for (const mode of MODES) {
      const text = renderText(weekUnusual.render(weekFixture(), mode, ctx))
      // THE NEWEST UPDATE'S OWN COUNT, IN WORDS, IN EVERY ARM. The chart's end
      // label draws the digits; only this says what they are.
      expect(text, mode).toContain('618 videos this update found')
      // THE COUNT BAND CARRIES ITS UNIT. This block's other band is in
      // percentage points ("a band of 4.9"); an unlabelled count band beside it
      // is how 4.9 points gets read as five videos. THREE OF THE TWELVE BEHIND
      // IT FOUND NOTHING, and the band counts 9 rather than 12: a legend saying
      // "the 12 before it" while the band was drawn on 9 would be the page and
      // the picture disagreeing.
      //
      // WHICH SENTENCE SAYS IT DEPENDS ON WHETHER THE CHART IS DRAWN (design
      // review F4). On screen and on paper the picture's own legend carries the
      // band and the quiet count, and the words under it carry the head alone —
      // they used to carry all three, so the tile stated the band twice and the
      // quiet count twice, two lines apart in one column. The email arm draws
      // no SVG, so there the words ARE the chart and state everything.
      if (mode === 'email') {
        expect(text, mode).toContain('the 9 that found anything')
        expect(text, mode).toContain('ran 1–559 videos, typical 462')
        expect(text, mode).toContain('3 of the updates behind this one found nothing at all')
      } else {
        expect(text, mode).toContain('the 9 updates behind it that found anything ran')
        expect(text, mode).toContain('1–559 videos')
        expect(text, mode).toContain('typical 462')
        expect(text, mode).toContain('3 of them found nothing at all, drawn off the line and left out of the range')
        // ONCE, not twice — the defect F4 named.
        expect(text.match(/1–559/g) ?? [], mode).toHaveLength(1)
        expect(text.match(/found nothing at all/g) ?? [], mode).toHaveLength(1)
      }
      // The axis's own words, which are the whole deviation: thirteen
      // deliveries, not thirteen weeks.
      expect(text, mode).toContain('the last 13 updates · what each one brought in')
      expect(text, mode).not.toContain('weeks')
      // And no multiple: the mock's "3.1× its usual rate" has no honest form.
      expect(text, mode).not.toContain('×')
    }
  })

  it('restates the newest update’s count as a contribution to its month', () => {
    // THE RULE THIS SURFACE LIVES UNDER. The legend states three window-dated
    // counts and the axis a fourth; without the restatement a reader has four
    // numbers about a delivery and nothing tying any of them to a period.
    for (const mode of MODES) {
      const text = renderText(weekUnusual.render(weekFixture(), mode, ctx))
      expect(text, mode).toContain('this update’s contribution to September so far: 205 of 449')
      expect(text, mode).toContain('each point is one delivery’s own days, never a month')
    }
  })

  it('states the SAME contribution §4 states, because it is the same read', () => {
    // §1 and §4 print this claim from one windowed read clipped one way. A
    // fixture in which they disagreed would be the page contradicting itself
    // in the artefact wave 2 builds its port against.
    const d = weekFixture()
    const one = renderText(weekUnusual.render(d, 'app', ctx))
    expect(d.cameIn.contribution).not.toBeNull()
    expect(one).toContain(`this update’s contribution to September so far: ${d.cameIn.contribution!.videos} of ${d.cameIn.contribution!.of}`)
    const thin = thinFixture()
    expect(thin.cameIn.contribution).not.toBeNull()
    expect(renderText(weekUnusual.render(thin, 'app', ctx)))
      .toContain(`this update’s contribution to September so far: ${thin.cameIn.contribution!.videos} of ${thin.cameIn.contribution!.of}`)
  })

  it('names BOTH months where the window crossed one', () => {
    // Sealand's newest update covers 11 Aug – 10 Sep. A window that crosses
    // carries two months, each with its own clipped numerator and its own
    // denominator — never one sum, because denominators do not add.
    const text = renderText(weekUnusual.render(thinFixture(), 'app', ctx))
    expect(text).toContain('this update’s contribution to August so far: 260 of 512')
    expect(text).toContain('this update’s contribution to September so far: 394 of 475')
  })

  it('draws the series on the arm production is in, with no contribution to state', () => {
    // M3 unapplied on both tenants: thirteen points, their windows and their
    // counts are all still true, and the contribution is a sentence.
    const text = renderText(weekUnusual.render(absentReadingFixture(), 'app', ctx))
    expect(text).toContain('1,098 videos this update found')
    expect(text).toContain('cannot be stated here, so every figure above is of the delivery’s own days alone')
    expect(text).toContain('The windowed reading is not installed for this workspace')
    expect(text).not.toContain('contribution to September so far')
  })

  it('says so rather than leaving four window counts standing alone', () => {
    // Production today: M3 is not applied, so every point's contribution is
    // empty. The restatement is then a sentence, not a silence.
    const d = weekFixture()
    const series = d.unusual.series!
    const points = series.points.map((p) => ({ ...p, contribution: [], comments: null }))
    const text = renderText(weekUnusual.render(
      { ...d, unusual: { ...d.unusual, series: { ...series, points } } }, 'app', ctx,
    ))
    expect(text).toContain('cannot be stated here, so every figure above is of the delivery’s own days alone')
    expect(text).not.toContain('contribution to September so far')
  })

  it('draws the series while the baseline is still forming', () => {
    // Sealand cannot be told whether its update was unusual for two more
    // months. What it CAN be told is what each update brought in — a fact about
    // our reading, true whether or not there are three months to compare it
    // with, and the honest half of "baseline forming".
    const text = renderText(weekUnusual.render(thinFixture(), 'app', ctx))
    expect(text).toContain('baseline forming — 1 of 3 months')
    expect(text).toContain('1,098 videos this update found')
    expect(text).toContain('the last 13 updates · what each one brought in')
    // SEVEN OF SEALAND'S TWELVE FOUND NOTHING. The band stands on five, and the
    // seven are drawn rather than dropped.
    // The legend's words, because the chart is drawn on this arm (F4).
    expect(text).toContain('the 5 updates behind it that found anything ran')
    expect(text).toContain('7 of them found nothing at all, drawn off the line and left out of the range')
  })

  it('says nothing about the series where no update carries a window', () => {
    const d = weekFixture()
    const text = renderText(weekUnusual.render({ ...d, unusual: { ...d.unusual, series: null } }, 'app', ctx))
    expect(text).not.toContain('this update ·')
    expect(text).not.toContain('what each one brought in')
  })

  it('is email-safe', () => {
    const markup = render(weekUnusual.render(weekFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })
})

describe('the thirteen-point chart (Block D wave 2)', () => {
  it('draws one point per update, zeroes included, and does not join them to the line', () => {
    const markup = render(weekUnusual.render(weekFixture(), 'app', ctx))
    const d = weekFixture()
    expect(d.unusual.series!.points).toHaveLength(13)
    // A point per update, and the zero deliveries are among them: three of
    // Össur's thirteen found nothing and are drawn on the floor rather than
    // dropped out of the chart.
    // TEN CIRCLES AND THREE GUTTER SQUARES (review W4). The updates that found
    // something are solid points on the line; the three that found nothing are
    // `below_numerator`'s hollow square in the gutter row 6px under the
    // baseline, which is decision U's rule applied here — the ringed-hollow
    // circle is the one token MASTER §3.9 reserves and it stays unspent.
    expect(markup.match(/<circle/g)).toHaveLength(10)
    expect(markup.match(/<rect/g)).toHaveLength(4)
    expect(markup).toContain('y="135"')
    expect(markup).not.toContain('r="2.6"')
    expect(markup).toContain('<polyline')
    // AND THE LINE BREAKS AT EACH OF THEM (design review F5). One polyline over
    // every point dived to the floor and climbed back three times — a gather
    // gap drawn as the conversation collapsing and recovering. Össur's series
    // is 0 · 94 · 0 · 1 462 · 0 · 488 456 473 376 466 559 618, so the runs of
    // two-or-more that found something are two: [94] alone draws no stroke,
    // [1, 462] does, and the six from 488 on do.
    expect(markup.match(/<polyline/g)).toHaveLength(2)
    // The quiet updates are a different MARK in a different ROW, not the same
    // dot at zero and not the reserved ring; the legend's swatch is the same
    // square, and its sentence ("drawn off the line") is now true of them.
    expect(markup).toContain('found nothing · the 7 days to 5 Jul')
    expect(markup).toContain('drawn off the line and left out of the range')
  })

  it('names its axis as updates and never as weeks', () => {
    // D6: months do not divide into weeks, and this page prints nothing
    // computed over a week alone. The axis is our own delivery cadence and the
    // chart says so under itself.
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).toContain('What each update found')
    expect(text).toContain('13 updates to 13 Sep')
    expect(text).toContain('each point is one delivery’s own days, never a month')
    expect(text).not.toContain('per week')
    expect(text).not.toContain('a typical week')
  })

  it('labels the band in videos, beside a block whose other band is in points', () => {
    // Two unlabelled bands on one block is how 4.9 points gets read as five
    // videos. This one says "videos"; the flag's says "points".
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).toContain('1–559 videos')
    expect(text).toContain('3 of them found nothing at all, drawn off the line and left out of the range')
    expect(text).toContain('on a band of 4.9')
  })

  it('draws no chart in an email, and keeps the words there', () => {
    const markup = render(weekUnusual.render(weekFixture(), 'email', ctx))
    expect(markup).not.toContain('<svg')
    expect(markup).not.toContain('<polyline')
    expect(renderText(weekUnusual.render(weekFixture(), 'email', ctx)))
      .toContain('618 videos this update found')
  })

  it('draws nothing at all below two points', () => {
    const d = weekFixture()
    const one = { ...d, unusual: { ...d.unusual, series: { ...d.unusual.series!, points: d.unusual.series!.points.slice(-1) } } }
    expect(render(weekUnusual.render(one, 'app', ctx))).not.toContain('<svg')
  })

  it('shades no band where no band was drawn', () => {
    // `updateBand` refuses below its minimum, and a shaded guess behind a line
    // is a claim about what is typical that nothing measured.
    const d = weekFixture()
    const short = {
      ...d,
      unusual: { ...d.unusual, series: { ...d.unusual.series!, band: null, median: null } },
    }
    const markup = render(weekUnusual.render(short, 'app', ctx))
    expect(markup).toContain('<svg')
    // THE BAND'S RECT, NOT EVERY RECT (review W4): the gutter's quiet-update
    // squares are rects too, and they are a fact about a delivery rather than
    // a claim about what is typical, so they are drawn either way.
    expect(markup).not.toContain('fill="var(--inner)"')
    expect(markup.match(/<rect/g)).toHaveLength(3)
    expect(markupText(markup)).toContain('too few updates behind it to say what is typical')
  })
})
