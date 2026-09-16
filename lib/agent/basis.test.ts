import { describe, it, expect } from 'vitest'
import { askBasisLine, nothingSearchable, type AskBasis } from './basis'

const base: AskBasis = {
  updateAt: '2026-09-13T04:06:38.483Z',
  // Össur's real figure: 119 denominator rows over 63 months, FOUR of which
  // clear the video floor — which is what the movement block on the same page
  // counts, and what a claim about change can stand on.
  monthlyReadings: 4,
  embedded: 3129,
  total: 3129,
  lastEmbeddedAt: '2026-09-15T07:31:49.323Z',
}

describe('askBasisLine', () => {
  it('states the four facts, in the design’s order', () => {
    expect(askBasisLine(base, { asked: true })).toBe(
      'Answered against the update of 13 Sep. Today: 4 monthly readings · 3,129 of 3,129 findings searchable · embedded as at 15 Sep',
    )
  })

  it('says the box will answer against it, before a question is asked', () => {
    expect(askBasisLine(base)).toMatch(/^Answers are given against the update of 13 Sep · /)
  })

  // Under a thread answered in August, only the update belongs to the answer;
  // the index facts are today's. One `·`-joined list read as four facts about
  // that August answer.
  it('breaks tense after the update an answer was given against', () => {
    expect(askBasisLine(base, { asked: true })).toContain('of 13 Sep. Today: 4 monthly readings')
    // The box on the landing page is all one tense and takes no break.
    expect(askBasisLine(base)).not.toContain('Today:')
  })

  it('says nothing has been read rather than printing four empty facts', () => {
    expect(askBasisLine({ ...base, updateAt: null })).toBe(
      'Nothing has been read for this workspace yet, so there is nothing to answer from.',
    )
  })

  it('tells a failed month read apart from a workspace with no months', () => {
    expect(askBasisLine({ ...base, monthlyReadings: null })).toContain('monthly readings not recorded here yet')
    expect(askBasisLine({ ...base, monthlyReadings: 0 })).toContain('no month yet carries enough videos to compare on')
  })

  // The number and the movement block below it are the SAME count, and on
  // Össur they used to disagree by a factor of fifteen: "63 monthly readings"
  // over a block reading "4 months of readings behind it".
  it('counts what a comparison can stand on, not every month we hold a row for', () => {
    expect(askBasisLine({ ...base, monthlyReadings: 4 })).toContain('4 monthly readings')
    expect(askBasisLine({ ...base, monthlyReadings: 4 })).not.toContain('63')
  })

  it('says one reading in the singular', () => {
    expect(askBasisLine({ ...base, monthlyReadings: 1 })).toContain('1 monthly reading ·')
  })

  it('states an unsearchable corpus as none, not as a rounding error', () => {
    // Sealand answered at 27% coverage on 2026-09-15 with nothing saying so.
    // Zero is the state that makes every answer a lie about the corpus, and
    // "0 of 2,872" reads like a small number rather than like all of it.
    expect(askBasisLine({ ...base, embedded: 0, total: 2872 })).toContain('none of 2,872 findings searchable')
    expect(askBasisLine({ ...base, embedded: 785, total: 2872 })).toContain('785 of 2,872 findings searchable')
  })

  it('says there is nothing to search when there is nothing at all', () => {
    expect(askBasisLine({ ...base, embedded: 0, total: 0 })).toContain('nothing to search yet')
  })

  it('says not recorded, never never, for a vector written before the column', () => {
    const line = askBasisLine({ ...base, lastEmbeddedAt: null })
    expect(line).toContain('when they were indexed is not recorded')
    expect(line).not.toContain('never')
  })

  it('prints no pipeline jargon and no score', () => {
    const line = askBasisLine(base, { asked: true })
    expect(line).not.toMatch(/\brun\b|Pass [A-E]|\bT\d|embedding|vector|cosine|similarity/i)
  })
})

describe('nothingSearchable', () => {
  it('is true only when there is a corpus and none of it is reachable', () => {
    expect(nothingSearchable({ ...base, embedded: 0, total: 2872 })).toBe(true)
    expect(nothingSearchable({ ...base, embedded: 0, total: 0 })).toBe(false)
    expect(nothingSearchable(base)).toBe(false)
  })
})
