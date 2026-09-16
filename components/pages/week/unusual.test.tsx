import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import type { WeekData } from '@/lib/pages/week'
import { weekUnusual } from './unusual'
import { thinFixture, weekFixture } from './fixture'

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
    expect(text).toContain('13.7% this update against 3.5% before it')
    expect(text).toContain('a difference of 10.2 points on a band of 4.9')
  })

  it('names the months the baseline pooled, and which of them were still filling', () => {
    const text = renderText(weekUnusual.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Jun 2026, Jul 2026, Aug 2026')
    // August is 66% of Össur's baseline and does not freeze until 30 days after
    // it ends: telling a reader which months went in without telling them two
    // thirds of it was still moving is half a statement.
    expect(text).toContain('August had not finished when this was read')
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

  it('says "nothing unusual this week" in full, with the set it watched', () => {
    const text = renderText(weekUnusual.render(withState('nothing_unusual'), 'app', ctx))
    expect(text).toContain('Nothing unusual this week. Every one of the 31 objects this check watches read inside its usual band.')
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

  it('is email-safe', () => {
    const markup = render(weekUnusual.render(weekFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })
})
