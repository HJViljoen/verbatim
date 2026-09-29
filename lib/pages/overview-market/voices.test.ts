import { describe, it, expect } from 'vitest'

import { accountKey, pickQuotes, quotable, type QuoteCandidate } from './voices'

// Two of September's real comments (DR F35, plan §2.2's print): one on the
// airline-sizes theme, one on the colours theme. Their ids are labels.
const AIRLINE = 'About time they do something about the people who have too many or too big ‘carry on’ suitcases'
const PINK = 'If you made it in pink and a bigger size I would buy it immediately'

const c = (over: Partial<QuoteCandidate> = {}): QuoteCandidate => ({
  evidenceId: 'ev-airline',
  quote: AIRLINE,
  rank: 1,
  lang: 'en',
  english: null,
  insightKind: 'question',
  commentId: 'cm-1',
  commentDate: '2026-09-14T00:00:00.000Z',
  author: 'traveller_amy',
  videoAccount: 'packinglight',
  ...over,
})

describe('the quote rule (plan §4.0 Quotes)', () => {
  it('takes a comment dated in the reading month, of the right kind, from someone other than the video’s account', () => {
    expect(quotable(c(), '2026-09-01', 'question')).toBe(true)
  })

  it('refuses a comment from another month (the June Cotopaxi quotes, GR F9)', () => {
    expect(quotable(c({ commentDate: '2026-06-07T00:00:00.000Z' }), '2026-09-01', 'question')).toBe(false)
    expect(quotable(c({ commentDate: '2026-10-01T00:00:00.000Z' }), '2026-09-01', 'question')).toBe(false)
  })

  it('refuses the video’s own account, however it is spelt', () => {
    expect(quotable(c({ author: '@PackingLight' }), '2026-09-01', 'question')).toBe(false)
    expect(accountKey(' @PackingLight ')).toBe('packinglight')
  })

  it('refuses a YouTube channel answering under its own video: the handle against the channel’s title', () => {
    // Staging's shape: the comment's author is "@azsewing", the video's
    // account is the channel title "A-Z Sewing".
    expect(accountKey('@azsewing')).toBe(accountKey('A-Z Sewing'))
    expect(quotable(c({ author: '@azsewing', videoAccount: 'A-Z Sewing' }), '2026-09-01', 'question')).toBe(false)
    // Letters in any script count, and full-width forms fold (NFKC).
    expect(accountKey('@Zoë_Näh-Studio')).toBe(accountKey('Zoë Näh Studio'))
    expect(accountKey('ＡＢＣ bags')).toBe('abcbags')
  })

  it('still quotes someone else, and never matches on an empty name', () => {
    expect(quotable(c({ author: '@traveller_amy', videoAccount: 'A-Z Sewing' }), '2026-09-01', 'question')).toBe(true)
    // An author of punctuation only folds to nothing: never "the same account".
    expect(quotable(c({ author: '@__', videoAccount: '--' }), '2026-09-01', 'question')).toBe(true)
    expect(quotable(c({ author: null, videoAccount: null }), '2026-09-01', 'question')).toBe(true)
  })

  it('refuses the wrong kind, and anything with no comment behind it', () => {
    expect(quotable(c({ insightKind: 'praise' }), '2026-09-01', 'question')).toBe(false)
    expect(quotable(c({ commentId: null }), '2026-09-01', 'question')).toBe(false)
    expect(quotable(c({ insightKind: 'praise' }), '2026-09-01', null)).toBe(true)
  })

  it('refuses a quote a reader cannot read: another language with no English yet', () => {
    expect(quotable(c({ quote: 'Ich brauche diese Tasche für meine nächste Reise sofort', lang: 'de', english: null }), '2026-09-01', null)).toBe(false)
    expect(quotable(c({ quote: 'Ich brauche diese Tasche für meine nächste Reise sofort', lang: 'de', english: 'I need this bag for my next trip right away' }), '2026-09-01', null)).toBe(true)
  })

  it('orders by the evidence’s own rank, never by likes, and prints one wording once', () => {
    const picked = pickQuotes([
      c({ evidenceId: 'ev-3', rank: 3, quote: PINK, insightKind: 'feature_request' }),
      c({ evidenceId: 'ev-1', rank: 1 }),
      c({ evidenceId: 'ev-2', rank: 2 }),
    ], { month: '2026-09-01', kind: null, count: 2 })
    expect(picked.map((p) => p.evidenceId)).toEqual(['ev-1', 'ev-3'])
  })

  it('never takes the headline’s voices from a maker’s or an off-topic video, and refuses one whose segment was not read (decision F)', () => {
    // Staging's 2 Oct lead, "Price and sale questions" (a fifth makers): its
    // best-ranked comment, "That first bag is how much in black", sits under
    // a video segments_for_videos marks 'maker' (a handmade-bag account).
    const candidates = [
      c({ evidenceId: 'ev-maker', rank: 1, quote: 'That first bag is how much in black', segment: 'maker' }),
      c({ evidenceId: 'ev-noise', rank: 2, quote: PINK, segment: 'noise' }),
      c({ evidenceId: 'ev-unread', rank: 3, quote: 'Does it fit under the seat on a budget airline', segment: null }),
      c({ evidenceId: 'ev-market', rank: 4, segment: 'market' }),
    ]
    expect(pickQuotes(candidates, { month: '2026-09-01', kind: null, count: 2, marketVideosOnly: true }).map((p) => p.evidenceId)).toEqual(['ev-market'])
    // The asks, and a tenant with no segment rule, keep the four rules alone.
    expect(pickQuotes(candidates, { month: '2026-09-01', kind: null, count: 2 }).map((p) => p.evidenceId)).toEqual(['ev-maker', 'ev-noise'])
  })

  // Default M-c. Staging's 2 Oct headline on "Price and sale questions"
  // printed "300rs pair + shipping . DM for order." (Instagram, 15 Sep, under
  // a category video) beside "Wow so your bags cost K363 in Zambia? …"
  // (TikTok, 18 Sep): the first is a seller's offer, not the market talking.
  it('the headline\'s voices skip a sale offer or an ad and take the next eligible voice (default M-c)', () => {
    const ZAMBIA = 'Wow so your bags cost K363 in Zambia? Definitely adding this to my future purchases'
    const candidates = [
      c({ evidenceId: 'ev-ad', rank: 1, quote: '300rs pair + shipping . DM for order.', segment: 'market' }),
      c({ evidenceId: 'ev-zambia', rank: 2, quote: ZAMBIA, segment: 'market' }),
      c({ evidenceId: 'ev-link', rank: 3, quote: 'Link da minha loja https://br.shp.ee/NZZK9LGT', lang: 'pt', english: 'My shop link https://br.shp.ee/NZZK9LGT', segment: 'market' }),
      c({ evidenceId: 'ev-maker', rank: 4, quote: 'That first bag is how much in black', segment: 'maker' }),
      c({ evidenceId: 'ev-market', rank: 5, segment: 'market' }),
    ]
    const opts = { month: '2026-09-01', kind: null, count: 2 }
    expect(pickQuotes(candidates, { ...opts, marketVideosOnly: true, skipOffers: true }).map((p) => p.evidenceId)).toEqual(['ev-zambia', 'ev-market'])
    // Makers stay excluded (decision F) with the offer rule on, and without a
    // segment rule the offer rule alone still skips the ad.
    expect(pickQuotes(candidates, { ...opts, skipOffers: true }).map((p) => p.evidenceId)).toEqual(['ev-zambia', 'ev-maker'])
    // The asks do not take the rule: their four rules alone.
    expect(pickQuotes(candidates, opts).map((p) => p.evidenceId)).toEqual(['ev-ad', 'ev-zambia'])
  })

  // THE WALKTHROUGH'S QUOTE GATE (29 Sep, lib/quote-gate.ts). Production's
  // two voices on "Price and sale status questions" were a Turkish knitter's
  // audience ("Bless your hands… what is the price?") and a comment under an
  // Ibadan seller's sale post; both videos read 'market' to the segment rule.
  it('with the gate, the two voices come from the market and not from a maker\u2019s or a seller\u2019s post', () => {
    const KNITTER = { platform: 'instagram', videoId: 'DdmFVg0uuDH', accountName: 'trend_orgu4', caption: 'Pullu çanta modeli #handmade #handmadebag', hashtags: ['handmade', 'handmadebag'], topics: ['handmade bag'], segment: 'market' }
    const SELLER = { platform: 'tiktok', videoId: '7686980095516462356', accountName: 'SLIPPERS/SHOES/BAGS IN IBADAN.', caption: 'Viral TASSEL bag in nude colour combo. Available to order.  PRICE: 25,000', hashtags: ['handmadebagsinibadan'], topics: ['handmade bags', 'sales'], segment: 'market' }
    const RYANAIR = { platform: 'reddit', videoId: '1wa0if5', accountName: 'r/Ryanair', caption: 'Cotopaxi Allpa 42L as my only bag on Ryanair — will it work?', hashtags: [], topics: ['carry-on luggage'], segment: 'market' }
    const candidates = [
      c({ evidenceId: 'ev-knit', rank: 1, quote: 'Ellerinize sağlık model çok güzel fiyat nedir ? 😍', lang: 'tr', english: 'Bless your hands, the model is very beautiful, what is the price? 😍', segment: 'market', context: KNITTER }),
      c({ evidenceId: 'ev-zambia', rank: 2, quote: 'Wow so your bags cost K363 in Zambia? Definitely adding this to my future purchases', segment: 'market', context: SELLER }),
      c({ evidenceId: 'ev-price', rank: 3, quote: 'Paid way too much for mine, the price for this bag is steep', segment: 'market', context: RYANAIR }),
      c({ evidenceId: 'ev-price-2', rank: 4, quote: 'Is the price worth it for a bag like this on budget airlines', segment: 'market', context: RYANAIR }),
    ]
    const gate = { market: 'carry' as const, makerRule: true, claim: 'Price and sale status questions', requireRelevance: true }
    // One per thread: the Ryanair thread gives one voice, and nothing pads the second.
    expect(pickQuotes(candidates, { month: '2026-09-01', kind: null, count: 2, marketVideosOnly: true, skipOffers: true, gate }).map((p) => p.evidenceId)).toEqual(['ev-price'])
  })
})
