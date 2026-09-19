import { describe, expect, it } from 'vitest'
import { freezeQuotes } from '../../renderables/quotes-freeze'
import type { ResearchAnswer } from './research'

// C1 (review, 2026-08-31): the research step's output is memoised by Inngest,
// so no comment's words may leave the step. The step freezes its answers;
// this pins the shape so a new field carrying text does not slip through.
describe('the research step output carries no comment text', () => {
  it('freezeQuotes strips every quote text from a ResearchAnswer', () => {
    const answer: ResearchAnswer = {
      question: { id: 'anchor.stops', text: 'What stops people?', purpose: 'anchor' },
      answer: 'Model prose.',
      outcome: 'answered',
      grounded: [{
        id: 'G1', text: 'People hesitate over fit.', insightIds: ['i1'], themeLabels: ['fit'],
        conversationCount: 12, questionId: 'anchor.stops',
        quotes: [{ ref: 'e:abc', text: 'the actual comment words', commentId: 'c1', videoId: 'v1' }],
      }],
      judgement: [], silent: false, conversationCount: 12, costUsd: 0.05, ms: 100,
    }
    const frozen = freezeQuotes([answer]).data
    const texts = frozen.flatMap((a) => a.grounded.flatMap((g) => g.quotes.map((q) => q.text))).filter(Boolean)
    expect(texts).toEqual([])
    expect(frozen[0].grounded[0].quotes[0].ref).toBe('e:abc')
    expect(frozen[0].grounded[0].text).toBe('People hesitate over fit.')
  })
})

// AND THE MONTH IT CARRIES CARRIES NONE EITHER. `ResearchOut.brief` is the
// reading `researchStep` loaded, handed to `writeStep` and `freezeStep` so a
// build reads six page loaders once rather than three times — and it goes
// through the same freeze, because `surfaces` and `slideFigures` hold the
// commenters' own words (`overview.sentence.voices[].quote`,
// `scripted[].quote`).
describe('the brief reading the research step hands on', () => {
  it('leaves every quote in a surface as a ref with no text', () => {
    const brief = {
      reading: null,
      surfaces: { overview: { sentence: { voices: [{ quote: { ref: 'e:abc', text: 'the actual comment words' } }] } } },
      missing: [],
      map: [],
      sections: [],
      slideFigures: {
        cannotTell: { refusals: [], line: '', items: [] },
        switching: null,
        crosscheck: null,
        scripted: [{ objection: { label: 'x', registryId: null, source: 'kind' as const, value: { k: 1, n: 2 } }, say: '', because: [], alsoRunning: [], quote: { ref: 'c:def', text: 'another commenter' } }],
        line: null,
        untracked: [],
      },
    }
    const frozen = freezeQuotes(brief).data
    const surfaces = frozen.surfaces as { overview: { sentence: { voices: { quote: { ref: string; text: string } }[] } } }
    expect(surfaces.overview.sentence.voices[0].quote).toEqual({ ref: 'e:abc', text: '' })
    expect(frozen.slideFigures.scripted[0].quote).toEqual({ ref: 'c:def', text: '' })
  })
})
