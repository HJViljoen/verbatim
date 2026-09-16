import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { layoutFor, SUBJECT_BLOCKS } from './index'
import { subjectsList } from './list'
import { subjectsSubject } from './subject'
import { subjectsLine } from './line'
import { subjectsKinds } from './kinds'
import { subjectsVoices } from './voices'
import { subjectsUnanswered } from './unanswered'
import { candidatesFixture, refusedFixture, subjectsFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('the Subjects blocks, all of them', () => {
  it('render in all three modes on a reading, a refusal and a candidate set, and keep the copy contract', () => {
    for (const data of [subjectsFixture(), refusedFixture(), candidatesFixture()]) {
      for (const block of SUBJECT_BLOCKS) {
        for (const mode of MODES) {
          assertCopyContract(render(block.render(data, mode, ctx)))
        }
      }
    }
  })

  it('every block says something honest when it has nothing — a refusal is a reading too', () => {
    const data = refusedFixture()
    for (const block of SUBJECT_BLOCKS) {
      const empty = block.emptyState(data)
      expect(empty, block.key).toBeTruthy()
      expect(renderText(block.render(data, 'app', ctx)), block.key).toContain(empty!)
    }
  })

  it('never prints a pipeline key at a reader', () => {
    const text = renderText(
      <>{SUBJECT_BLOCKS.map((b) => <span key={b.key}>{b.render(subjectsFixture(), 'app', ctx)}</span>)}</>,
    )
    for (const key of ['industry-other', 'competitor:', 'audience_insights', 'run_id', 'Pass A']) {
      expect(text).not.toContain(key)
    }
  })

  it('states no figure twice with two different values', () => {
    const data = subjectsFixture()
    expect(figureConflicts(SUBJECT_BLOCKS.map((b) => blockAnswers(b, data).figures))).toEqual([])
  })
})

describe('SU1 · the subjects list', () => {
  it('names every subject with its level and the day it was named', () => {
    const text = renderText(subjectsList.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Durability')
    expect(text).toContain('26 of 84 videos')
    expect(text).toContain('named 19 Aug 2026')
  })

  it('groups a four-digit count like every other number on the page', () => {
    const data = subjectsFixture()
    const [first, ...rest] = data.list.rows
    const big = {
      ...data,
      list: { ...data.list, rows: [{ ...first, level: { k: 1042, n: 3877, pct: 26.9 } }, ...rest] },
    }
    const text = renderText(subjectsList.render(big, 'app', ctx))
    expect(text).toContain('1,042 of 3,877 videos')
    expect(text).toContain('26.9%')
  })

  it('prints the supersede rule wherever the editing happens', () => {
    for (const mode of MODES) {
      expect(renderText(subjectsList.render(subjectsFixture(), mode, ctx)), mode)
        .toContain('Renaming or adding a subject starts a new line. The old line is kept.')
    }
  })

  it('says subjects are not recorded when M4 is not applied — never "no subjects"', () => {
    expect(subjectsList.emptyState(refusedFixture())).toBe('Your subjects are not recorded for this workspace yet.')
  })

  it('offers the proposed set rather than an empty list, and says nothing is counted', () => {
    const data = candidatesFixture()
    expect(subjectsList.emptyState(data)).toContain('Confirm the set')
    const text = renderText(subjectsList.render(data, 'app', ctx))
    expect(text).toContain('2 proposed · none confirmed, so nothing is counted yet.')
    // The Confirm control is ON the row — a candidate listed as prose under the
    // editor is the one control a client needs, out of reach.
    expect(text).toContain('Durability')
    expect(text).toContain('not counted yet')
    expect(text).toContain('Confirm')
  })

  it('is email-safe', () => {
    const markup = render(subjectsList.render(subjectsFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('draws no editor controls outside the app — a button in a PDF is a picture of a button', () => {
    for (const mode of ['print', 'email'] as const) {
      const markup = render(subjectsList.render(subjectsFixture(), mode, ctx))
      expect(markup, mode).not.toContain('Add a subject')
      expect(markup, mode).not.toContain('<button')
    }
  })
})

describe('SU2 · the subject in full', () => {
  it('prints every side as a level with its count', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('31%')
    expect(text).toContain('26 of 84 videos')
    expect(text).toContain('43.7%')
    expect(text).toContain('62 of 142 videos')
    expect(text).toContain('24.5%')
    expect(text).toContain('340 of 1,388 videos')
  })

  it('refuses your own side’s change and answers the category’s, and says which in one sentence', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('too little data')
    expect(text).toContain('carried too few videos this month to compare')
  })

  it('prints a direction word only inside a verdict node', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('growing, 3 months')
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('offers Track this and Ask about this in the app, and neither on paper', () => {
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))).toContain('Track this')
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))).toContain('Ask about this')
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'print', ctx))).not.toContain('Ask about this')
  })

  it('sends the subject to Ask, as a question the page can answer', () => {
    // /dashboard/agent?subject=<id> was read by nothing: the Agent page took
    // no search params, so the client landed on a blank composer.
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/agent?ask=How%20are%20we%20seen%20on%20Durability%3F')
  })

  it('links the videos behind YOUR figure, with the count', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/videos?subject=s1')
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))).toContain('the 26 videos behind your figure')
  })

  it('declares a share and a count per side, and no verdict a side did not earn', () => {
    const { figures, verdicts } = blockAnswers(subjectsSubject, subjectsFixture())
    expect(Object.keys(figures)).toHaveLength(6)
    expect(verdicts).toHaveLength(3)
    expect(verdicts.filter((v) => v.state === 'moved')).toHaveLength(1)
  })

  it('says "no reading yet" where the audience was read and this subject was not in it', () => {
    // monthly_subject_readings emits a row only where videos > 0, so this is
    // the state of every freshly confirmed subject's first month — and the
    // denominator row beside it proves the audience IS tracked.
    const data = subjectsFixture()
    const [own, ...rest] = data.selected!.sides
    const unread = {
      ...data,
      selected: {
        ...data.selected!,
        sides: [{ ...own, k: null, pct: null, observed: false, silence: 'no_reading' as const }, ...rest],
      },
    }
    const text = renderText(subjectsSubject.render(unread, 'app', ctx))
    expect(text).toContain('— no reading yet')
    expect(text).not.toContain('— not tracked')
  })

  it('says the subject is provisional while its precision is unmeasured', () => {
    const data = subjectsFixture()
    const provisional = { ...data, selected: { ...data.selected!, calibration: 'calibrating' as const } }
    expect(renderText(subjectsSubject.render(provisional, 'app', ctx)))
      .toContain('still checking how often we get this subject right')
  })
})

describe('SU2 · the monthly line', () => {
  it('draws one line per side on the page’s own axis', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('<svg')
    expect(markup).toContain('Durability')
  })

  it('falls back to a table of the months in an email, never a dropped chart', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('<svg')
  })

  it('says what is not recorded rather than drawing an empty axis', () => {
    expect(subjectsLine.emptyState(refusedFixture())).toBe('Your subjects are not recorded for this workspace yet.')
  })
})

describe('SU2 · the kind mix', () => {
  it('names the denominator it used — the audience’s videos, not the subject’s', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('every video in the audience')
    expect(text).toContain('of 1,388 videos')
    expect(text).toContain('of 84 videos')
  })

  it('reads the kinds in the client’s words, never the pipeline’s enum', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Asking how it works')
    expect(text).toContain('Saying it worked')
    expect(text).toContain('Pushing back')
    // No enum value reaches a reader. ("question" itself survives inside the
    // Reddit sentence, which is English — "the question-and-objection videos"
    // — and is the one place the word is the reader's rather than Pass A's.)
    expect(text).not.toMatch(/\b(pain_point|purchase_intent|demographic_signal|switching_signal|feature_request|buying_trigger|misinformation)\b/)
  })

  it('names Reddit’s share of the question-and-objection videos', () => {
    expect(renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))).toContain('Reddit carried')
  })

  it('says the kind mix is not recorded when M5 has not landed', () => {
    const data = subjectsFixture()
    const bare = {
      ...data,
      selected: { ...data.selected!, sides: data.selected!.sides.map((s) => ({ ...s, kinds: [], reddit: null })) },
    }
    expect(subjectsKinds.emptyState(bare)).toContain('not recorded month by month')
  })
})

describe('SU2 · the kind mix, on its own month', () => {
  it('names the month, because it is one month among twelve months of furniture', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Sep · every video in the audience')
  })
})

describe('SU2 · the voices', () => {
  it('shows the original and the English beneath it, labelled', () => {
    const text = renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Nach 14 Monaten ist der Reißverschluss hin')
    expect(text).toContain('After 14 months the zip is done')
  })

  it('says how many it drew, out of how many there were', () => {
    expect(renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))).toContain('2 of 41')
  })

  it('sends the reader to the comment where there is a link, and prints the words where there is not', () => {
    const markup = render(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('https://www.tiktok.com/@maker/video/7312345678901234567')
    expect(renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))).toContain('youtube · 22 Sep · under a Freitag video')
  })

  it('declares its refs so a snapshot can freeze ids and resolve words at render', () => {
    expect(blockAnswers(subjectsVoices, subjectsFixture()).quotes).toEqual(['e:1', 'e:2'])
  })

  it('says a quote whose words are gone is counted, not quotable', () => {
    const data = subjectsFixture()
    const erased = {
      ...data,
      selected: { ...data.selected!, voices: [{ ...data.selected!.voices[0], quote: { ref: 'e:1', text: '' } }] },
    }
    expect(renderText(subjectsVoices.render(erased, 'app', ctx))).toContain('counted, not quotable')
  })
})

describe('SU3 · questions your posts did not answer', () => {
  it('says the count and the population, and prints no share', () => {
    const text = renderText(subjectsUnanswered.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('came up in 130 of the videos we have read')
    expect(text).toContain('none of your 9 posts in the last 12 months touched it')
    expect(text).toContain('counts, not shares')
  })

  it('says which half of your posts it matched on, because the other half is unreadable', () => {
    // `video_claims` carries RLS and no tenant SELECT policy until M8, so the
    // claims half of the haystack came back empty with no error on every page
    // a client opens — and an empty half reads as "you never answered this".
    // The OV4 precedent: name the side that cannot be read.
    const text = renderText(subjectsUnanswered.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('what your posts are about')
    expect(text).toContain('not readable yet')
  })

  it('names Reddit’s 40-comment cap where the questions lean on it', () => {
    expect(renderText(subjectsUnanswered.render(subjectsFixture(), 'app', ctx)))
      .toContain('we read up to 40 comments on each')
  })

  it('refuses to rank a gap under the gate, and says how many videos there were', () => {
    const data = subjectsFixture()
    const short = {
      ...data,
      selected: {
        ...data.selected!,
        unanswered: {
          ...data.selected!.unanswered,
          rows: [],
          questionVideos: 4,
          refusal: '4 videos asked something about this subject — we do not rank a gap under 10.',
        },
      },
    }
    expect(subjectsUnanswered.emptyState(short)).toContain('we do not rank a gap under 10')
  })

  it('declares one figure per row it printed', () => {
    const figures = blockAnswers(subjectsUnanswered, subjectsFixture()).figures
    expect(Object.keys(figures)).toHaveLength(2)
    expect(Object.values(figures).every((f) => f.unit === 'videos')).toBe(true)
  })

  it('carries no verdict at all — its two halves are dated two ways', () => {
    expect(blockAnswers(subjectsUnanswered, subjectsFixture()).verdicts).toEqual([])
  })
})

describe('the page’s own layout', () => {
  it('draws all six blocks when a subject is selected', () => {
    expect(layoutFor(subjectsFixture()).map((b) => b.block.key)).toEqual(SUBJECT_BLOCKS.map((b) => b.key))
  })

  it('drops the four blocks that are about a subject when there is no subject', () => {
    // Six tiles printing the same sentence down two screens of empty space is
    // honest and unreadable. The page decides what to drop; that division is
    // the block contract's own ("a report drops a slide").
    for (const data of [refusedFixture(), candidatesFixture()]) {
      expect(layoutFor(data).map((b) => b.block.key)).toEqual(['subjects.list', 'subjects.subject'])
    }
  })

  it('never asks the grid for a span it does not have', () => {
    for (const data of [subjectsFixture(), refusedFixture()]) {
      for (const { col, row } of layoutFor(data)) {
        expect(col).toBeGreaterThanOrEqual(1)
        expect(col).toBeLessThanOrEqual(12)
        expect(row).toBeGreaterThanOrEqual(1)
        expect(row).toBeLessThanOrEqual(6)
      }
    }
  })
})
