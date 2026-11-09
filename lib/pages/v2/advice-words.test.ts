import { describe, expect, it } from 'vitest'

import { titleFromBody } from '../../prose/advice-title'
import { adviceHeading, adviceTitle, UNTITLED_ADVICE } from './advice-words'

// A piece of advice whose title is its body's own first clause (9 Nov, the
// live-data bugs): Your moves' third piece read "People judge a device by
// whether they can wear it through work…" over "People judge a device by
// whether they can wear it through work, clothing, …", the same words twice,
// the first time cut. The scrub had dropped the model's title (a digit), and
// the pipeline stores the body's first clause in its place (`titleFromBody`).

const LONG =
  'Buyers weigh a liner by whether it stays put through a full shift, the heat of the afternoon and the walk home without rubbing or slipping. ' +
  'Make fit follow-up a service the clinic books, not a call the wearer has to chase.'

describe('a piece of advice\'s heading, said once', () => {
  it('heads with the body\'s first sentence, whole, where the title was cut from it, and starts the body after it', () => {
    const stored = titleFromBody(LONG)!
    expect(stored.endsWith('…')).toBe(true)
    expect(adviceTitle(stored, LONG)).toBe(stored)
    expect(adviceHeading(stored, LONG)).toEqual({
      title: 'Buyers weigh a liner by whether it stays put through a full shift, the heat of the afternoon and the walk home without rubbing or slipping',
      body: 'Make fit follow-up a service the clinic books, not a call the wearer has to chase.',
      fromBody: true,
    })
    // A blank stored title names it the same way, and heads the same way.
    expect(adviceHeading(adviceTitle('', LONG), LONG).title).toBe(adviceHeading(stored, LONG).title)
  })

  it('where the first clause was short enough to be the title uncut, still says it once', () => {
    const body = 'People ask whether it fits: they want a trial before they pay. A clinic trial answers both.'
    expect(titleFromBody(body)).toBe('People ask whether it fits')
    expect(adviceHeading('People ask whether it fits', body)).toEqual({ title: 'People ask whether it fits: they want a trial before they pay', body: 'A clinic trial answers both.', fromBody: true })
  })

  it('a one-sentence body becomes the heading and leaves no body', () => {
    const body = 'Offer a fitting check at six weeks so a loose socket is caught before it hurts.'
    expect(adviceHeading(titleFromBody(body)!, body)).toEqual({ title: 'Offer a fitting check at six weeks so a loose socket is caught before it hurts', body: null, fromBody: true })
  })

  it('leaves a title of its own, and a nameless piece, as they are', () => {
    expect(adviceHeading('Stand up an access desk', LONG)).toEqual({ title: 'Stand up an access desk', body: LONG, fromBody: false })
    expect(adviceHeading(UNTITLED_ADVICE, null)).toEqual({ title: UNTITLED_ADVICE, body: null, fromBody: false })
  })
})
