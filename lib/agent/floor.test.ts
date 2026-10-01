import { describe, expect, it } from 'vitest'
import { ASK_FINDING_FLOOR, askQuoteOk, floorAnswer, storedAnswerThin, tooLittleToAnswer } from './floor'

// Walkthrough item 4. "What's people's perception of Sealand?" was answered
// "perception is mixed…" over findings measured at 0, 1 and 0 of 360 videos.

const point = (id: string, count: number) => ({ id, text: `finding ${id}`, conversationCount: count })
const answer = (grounded: ReturnType<typeof point>[], over: Record<string, unknown> = {}) => ({
  answer: 'The model’s summary of every point.',
  grounded,
  judgement: [
    { text: 'from G1', basedOn: ['G1'] },
    { text: 'from G1 and G2', basedOn: ['G1', 'G2'] },
    { text: 'from nothing', basedOn: [] as string[] },
  ],
  nearest: [{ text: 'close', insightIds: ['x'], conversationCount: 1 }],
  silent: false,
  ...over,
})
const floor = Math.max(ASK_FINDING_FLOOR, 3)
const byCount = (p: { conversationCount: number }) => p.conversationCount

describe('floorAnswer', () => {
  it('says there is too little to answer where no finding clears the floor', () => {
    const out = floorAnswer(answer([point('G1', 0), point('G2', floor - 1), point('G3', 0)]), byCount, floor)
    expect(out.state).toBe('thin')
    expect(out.answer.grounded).toEqual([])
    expect(out.answer.judgement).toEqual([])
    expect(out.answer.answer).toBe('')
    expect(out.lead).toBe(tooLittleToAnswer())
    expect(out.dropped).toEqual(['G1', 'G2', 'G3'])
  })

  it('never prints a finding with nothing behind it, whatever the floor', () => {
    const out = floorAnswer(answer([point('G1', 0), point('G2', 12)]), byCount, 1)
    expect(out.answer.grounded.map((g) => g.id)).toEqual(['G2'])
  })

  it('keeps what stands, and the judgement that reasons from it', () => {
    const out = floorAnswer(answer([point('G1', floor), point('G2', 0)]), byCount, floor)
    expect(out.state).toBe('partial')
    expect(out.answer.grounded.map((g) => g.id)).toEqual(['G1'])
    expect(out.answer.judgement).toEqual([
      { text: 'from G1', basedOn: ['G1'] },
      { text: 'from G1 and G2', basedOn: ['G1'] },
    ])
    // The lead summarised both points, so it gives way; the caller prints its
    // own sentence for the point that stands, and nothing says one was left
    // out (§0a).
    expect(out.answer.answer).toBe('')
    expect(out.lead).toBeNull()
  })

  it('leaves a whole answer alone', () => {
    const a = answer([point('G1', floor), point('G2', floor + 4)])
    const out = floorAnswer(a, byCount, floor)
    expect(out.state).toBe('whole')
    expect(out.lead).toBeNull()
    expect(out.answer.answer).toBe(a.answer)
    expect(out.answer.judgement).toEqual(a.judgement)
  })

  it('treats an answer with nothing grounded under it as too little', () => {
    expect(floorAnswer(answer([]), byCount, floor).state).toBe('thin')
  })

  it('leaves silence as it is: it already says so', () => {
    const silent = answer([], { silent: true, answer: 'Nothing in the conversation speaks to this.' })
    expect(floorAnswer(silent, byCount, floor)).toMatchObject({ state: 'whole', lead: null, answer: silent })
  })

  it('reads support off the caller, so a measured level decides where there is one', () => {
    const measured = new Map([['G1', 0]])
    const out = floorAnswer(answer([point('G1', 40)]), (p) => measured.get(p.id) ?? p.conversationCount, floor)
    expect(out.state).toBe('thin')
  })

  it('drops a nearest thing under the floor too', () => {
    const out = floorAnswer(answer([point('G1', floor)], { nearest: [{ text: 'n', insightIds: [], conversationCount: 0 }] }), byCount, floor)
    expect(out.answer.nearest).toEqual([])
  })

  it('writes the too-little sentence as a finding, with nothing about the floor (§0a)', () => {
    expect(tooLittleToAnswer()).toBe('There is too little in your market about this to answer it.')
    expect(tooLittleToAnswer()).not.toMatch(/\d|\bwe\b|videos behind/)
  })
})

describe('askQuoteOk — the quotes an answer may print', () => {
  const english = { text: 'I love how this bag holds up after years of use' }
  const market = { segment: 'market', rival: null }

  it('prints a readable market voice', () => {
    expect(askQuoteOk(english, market)).toBe(true)
    expect(askQuoteOk(english, undefined)).toBe(true)
  })

  it('refuses a quote a reader cannot read', () => {
    expect(askQuoteOk({ text: 'Mera Dil to bth hai order kru pr quality se daar lg rha h', lang: 'hi', english: null }, market)).toBe(false)
    expect(askQuoteOk({ text: 'Mera Dil to bth hai order kru', lang: 'hi', english: 'My heart wants to order but I am scared about quality' }, market)).toBe(true)
  })

  it('refuses a maker’s video and one our searches found off-topic', () => {
    expect(askQuoteOk(english, { segment: 'maker', rival: null })).toBe(false)
    expect(askQuoteOk(english, { segment: 'noise', rival: null })).toBe(false)
  })

  it('refuses someone selling', () => {
    expect(askQuoteOk({ text: 'Beautiful bags available now, DM for order and price' }, market)).toBe(false)
  })

  it('prints a rival’s voice only where the question named that rival', () => {
    const patagonia = { text: 'I just don’t know about spending my money on a 300 dollar shirt from them', lang: 'en' }
    expect(askQuoteOk(patagonia, { segment: 'market', rival: 'Patagonia' })).toBe(false)
    expect(askQuoteOk(patagonia, { segment: 'market', rival: 'Patagonia' }, ['patagonia'])).toBe(true)
  })

  it('matches the named rival as retrieval does: accents and case folded', () => {
    const q = { text: 'The knee from them fits better than anything I tried before', lang: 'en' }
    expect(askQuoteOk(q, { segment: 'market', rival: 'Össur' }, ['ossur'])).toBe(true)
    expect(askQuoteOk(q, { segment: 'market', rival: ' Ottobock' }, ['OTTOBOCK'])).toBe(true)
    expect(askQuoteOk(q, { segment: 'market', rival: 'Ottobock' }, ['Össur'])).toBe(false)
  })
})

describe('storedAnswerThin — the rail’s word for an answer it did not measure', () => {
  it('is thin where no point has the floor’s videos behind its evidence', () => {
    expect(storedAnswerThin({ silent: false, grounded: [{ conversationCount: 1 }, { conversationCount: ASK_FINDING_FLOOR - 1 }] })).toBe(ASK_FINDING_FLOOR > 1)
    expect(storedAnswerThin({ silent: false, grounded: [{ conversationCount: 1 }, { conversationCount: ASK_FINDING_FLOOR }] })).toBe(false)
  })

  it('agrees with floorAnswer on the same stored counts', () => {
    const thin = answer([point('G1', 1), point('G2', Math.max(0, floor - 1))])
    expect(storedAnswerThin(thin, floor)).toBe(floorAnswer(thin, (p) => p.conversationCount, floor).state === 'thin')
  })

  it('never calls silence, or a result with no points listed, thin', () => {
    expect(storedAnswerThin({ silent: true, grounded: [] })).toBe(false)
    expect(storedAnswerThin({})).toBe(false)
    expect(storedAnswerThin(null)).toBe(false)
  })
})
