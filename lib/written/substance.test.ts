import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { gateFor } from '../quote-context'
import { quoteGate, type QuoteVideo } from '../quote-gate'
import { pickFindingQuote } from './compose'
import { FORM_VALUE, isQuestion, opensMidThought, quoteForm, quoteValue, substanceScore, SUBSTANCE_WEIGHT, type QuoteSubstance } from './substance'
import { candidate, ref } from './test-fixtures'
import type { QuoteOption } from './types'

// How much a quote says on its own (writer v3), pinned on the two quotes the
// v2 read printed that said nothing a reader could take away (Sealand, 27 Sep),
// against the self-contained claims it passed over, at their real fits.

const QUESTION = 'What is your recommendation for a checked bag?'
const FRAGMENT = "Now an umbrella. I come from using hiking bags so they make more sense to me but I've come to realize there's weight that's completely valid in providing comfort and structure."
const OSPREY = "If you think you'll be doing a lot of walking with the backpack, I'd recommend the Osprey Farpoint, or backpacks with a proper frame/back support to improve comfort."
const COLUMBIA = 'I recommend looking at Columbia tiger brook series.'
const SANDQVIST = 'Check out the rolltops by Sandqvist. I have had mine for 5 years, use it everyday.'
const NORTH_FACE = 'I picked north face because of the strap and back padding has saved my back and shoulders from being sore from carrying multiple notebooks and a textbook!'
const HIP_BELT = "I’ve never experienced a bag that didn’t destroy my shoulders until two weeks ago because I got an Osprey that had a thick waist belt that rested on my hips. I’m in disbelief at how much it’s helped."

describe('quoteForm', () => {
  it("reads v2's two weak quotes for what they are", () => {
    expect(quoteForm(QUESTION)).toBe('question')
    expect(quoteForm(FRAGMENT)).toBe('fragment')
  })

  it('reads the self-contained claims v2 passed over as claims', () => {
    for (const q of [OSPREY, COLUMBIA, SANDQVIST, NORTH_FACE, HIP_BELT]) expect(quoteForm(q), q).toBe('claim')
  })

  it('a bare question is questions and nothing else of three words or more, with or without the mark', () => {
    expect(quoteForm('But do you have that in red tho')).toBe('fragment') // opens on "but", and a question besides
    expect(quoteForm('Do you have it in red')).toBe('question')
    expect(quoteForm('Wow. Where did you get it?')).toBe('question')
    expect(quoteForm('Is this carry on size? What are the dimensions?')).toBe('question')
    // A question with context says something.
    expect(quoteForm('I fly Ryanair a lot and the sizer is tiny. Would this fit under the seat?')).toBe('claim')
    // A long run-on that opens on "why" goes on to say something.
    expect(quoteForm("Why is it worth what people are saying it's worth, I'm so lost, looks like a dumb cheap bag no offense intended")).toBe('claim')
    // An exclamation is not a question.
    expect(quoteForm('What a gorgeous bag this is!')).toBe('claim')
  })

  it('a fragment opens as a continuation; a short opener counts only on a stub', () => {
    expect(opensMidThought('And this color is so cute')).toBe(true)
    expect(opensMidThought('Also the straps are thin.')).toBe(true)
    expect(opensMidThought('… and then the zip broke')).toBe(true)
    expect(opensMidThought('Now an umbrella. I carry it everywhere.')).toBe(true)
    expect(opensMidThought('Now I carry my laptop without any pain at all.')).toBe(false)
    expect(opensMidThought("But's not a word people open with")).toBe(false)
    expect(opensMidThought('The baby Emerson is my everyday bag!! And this color is so cute')).toBe(false)
  })

  it('a statement too short to claim anything, and emoji read past', () => {
    expect(quoteForm('Cute bag omg 😍😍')).toBe('statement')
    expect(quoteForm('The baby Emerson is seriously my faaaav everyday bag!! And this color is so cute 🩵🩵🩵')).toBe('claim')
    expect(isQuestion('So cute?!')).toBe(true)
  })
})

describe('substanceScore and quoteValue', () => {
  it('is mostly the form, a little the gate, and nothing where none was recorded', () => {
    expect(FORM_VALUE).toEqual({ claim: 1, statement: 0.5, question: 0, fragment: 0 })
    expect(substanceScore(undefined)).toBe(0)
    expect(substanceScore({ form: 'claim', gate: 12 })).toBeCloseTo(1)
    expect(substanceScore({ form: 'claim', gate: 0 })).toBeCloseTo(0.8)
    expect(substanceScore({ form: 'question', gate: 16 })).toBeCloseTo(0.2) // the gate counts to its cap only
    expect(substanceScore({ form: 'fragment', gate: 12 })).toBeCloseTo(0.2)
    expect(quoteValue(0.6, { form: 'claim', gate: 12 })).toBeCloseTo(0.6 + SUBSTANCE_WEIGHT)
    expect(quoteValue(null, { form: 'claim', gate: 12 })).toBeCloseTo(SUBSTANCE_WEIGHT)
  })

  it("the gate's own score cannot demote the two: it rates them at the top (why the form is needed)", () => {
    const video: QuoteVideo = { platform: 'reddit', videoId: 'x', caption: 'Which backpack should I buy for travel?', hashtags: [], topics: [], accountName: 'someone', isClient: false, isCompetitor: false, competitorName: null, source: 'discovered', segment: 'market' }
    const score = (claim: string, kind: string, text: string) => {
      const v = quoteGate({ text, lang: 'en', english: null, video }, gateFor(SEALAND_CLIENT_ID, { claim, requireRelevance: true, kind }))
      return v.ok ? v.score : -1
    }
    const rec = 'Seeking brand and model recommendations'
    const comfort = 'Comfort depends on structure and straps'
    expect(score(rec, 'purchase_intent', QUESTION)).toBeGreaterThanOrEqual(score(rec, 'purchase_intent', COLUMBIA))
    expect(score(comfort, 'praise', FRAGMENT)).toBeGreaterThan(score(comfort, 'praise', NORTH_FACE))
  })
})

describe("the finding's quote: fit weighed with substance (v2's two, at their real fits)", () => {
  const used = () => ({ refs: new Set<string>(), threads: new Set<string>() })
  const opt = (id: string, thread: string, substance: QuoteSubstance): QuoteOption => ({ quote: ref(id, thread), insightId: `ins-${id}`, insightText: 'x', substance })

  it('"Buyers compare bags by exact travel and carry needs": the bare question loses to a self-contained recommendation', () => {
    // Fits as the v2 read measured them (27 Sep): the question was the best fit.
    const options = [
      opt('osprey', 't1', { form: 'claim', gate: 12 }),
      opt('columbia', 't2', { form: 'claim', gate: 10 }),
      opt('sandqvist', 't3', { form: 'claim', gate: 6 }),
      opt('question', 't4', { form: 'question', gate: 12 }),
    ]
    const fit = new Map([['e:question', 0.659], ['e:columbia', 0.644], ['e:osprey', 0.616], ['e:sandqvist', 0.604]])
    const c1 = candidate({ id: 'C1', quoteOptions: options, quoteRefs: options.slice(0, 3).map((o) => o.quote) })
    const chosen = pickFindingQuote(c1, [c1], used(), fit)
    expect(chosen?.ref).not.toBe('e:question')
    expect(options.find((o) => o.quote.ref === chosen?.ref)?.substance?.form).toBe('claim')
    // Without substance, the fit alone printed the question (v2).
    const bare = candidate({ id: 'C1', quoteOptions: options.map(({ substance: _s, ...o }) => o) })
    expect(pickFindingQuote(bare, [bare], used(), fit)?.ref).toBe('e:question')
  })

  it('"Comfort is judged with weight in the bag": the fragment loses to the strap and back padding line', () => {
    const c2 = candidate({
      id: 'C2',
      quoteOptions: [
        opt('northface', 't1', { form: 'claim', gate: 10 }),
        opt('hipbelt', 't2', { form: 'claim', gate: 8 }),
        opt('umbrella', 't3', { form: 'fragment', gate: 16 }),
      ],
    })
    const fit = new Map([['e:umbrella', 0.702], ['e:northface', 0.648], ['e:hipbelt', 0.593]])
    expect(pickFindingQuote(c2, [c2], used(), fit)?.ref).toBe('e:northface')
  })

  it('a bare question still wins where the claim fits the finding worse by more than the weight: it is about something else', () => {
    const c = candidate({ id: 'C1', quoteOptions: [opt('claim', 't1', { form: 'claim', gate: 12 }), opt('question', 't2', { form: 'question', gate: 12 })] })
    expect(pickFindingQuote(c, [c], used(), new Map([['e:question', 0.8], ['e:claim', 0.55]]))?.ref).toBe('e:question')
  })

  it('with no fit measured, substance orders the options, then the writer\'s order', () => {
    const c = candidate({ id: 'C1', quoteOptions: [opt('frag', 't1', { form: 'fragment', gate: 16 }), opt('stmt', 't2', { form: 'statement', gate: 4 }), opt('claim', 't3', { form: 'claim', gate: 6 })] })
    expect(pickFindingQuote(c, [c], used(), null)?.ref).toBe('e:claim')
  })
})
