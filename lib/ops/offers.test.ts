import { describe, it, expect } from 'vitest'

import { offerSignal, pastOffers, readsAsOffer } from './offers'

// Market page default M-c: the headline's voices skip sale offers and ads.
// Every quote below marked (staging) is a real comment in Sealand's staging
// evidence (`insight_evidence`, read 26 Sep; some cut at 160 characters). The
// ones marked (illustrative) show a shape staging holds no example of.

describe('offerSignal: a seller\'s shapes', () => {
  it('the staging headline\'s ad: a price with shipping, and "DM for order"', () => {
    const ad = '300rs pair + shipping . DM for order.' // (staging) Instagram, 15 Sep
    expect(offerSignal(ad)).toBe('price_shipping')
    expect(offerSignal('300rs pair. DM for order.')).toBe('dm_order')
    expect(readsAsOffer(ad)).toBe(true)
  })

  it('a price with shipping in the seller\'s other words (illustrative)', () => {
    expect(offerSignal('Only $49, free shipping!')).toBe('price_shipping')
    expect(offerSignal('Rs 1200 shipping included')).toBe('price_shipping')
    expect(offerSignal('450/- + delivery')).toBe('price_shipping')
  })

  it('"DM for price" and its kin (illustrative)', () => {
    for (const t of ['DM for price', 'dm me for orders', 'Inbox for price 😍', 'WhatsApp us to order', 'Message me for pricing']) {
      expect(offerSignal(t)).toBe('dm_order')
    }
  })

  it('a link, or a pointer to one (staging)', () => {
    for (const t of [
      '✸ Link da minha loja - Savi https://br.shp.ee/NZZK9LGT',
      'Do you want to help us? Check our link in the bio.',
      'To purchase: Search Saddlecrestco.store in your browser for the website❤️ Or click the link in my profile🫶 https://saddlecrestco.store',
      'optimally you could make your own using 1.25oz tyvek or some other ultralight fabric (e.g. from ripstopbytheroll.com), but www.ultralitesacks.com is a good bran',
    ]) expect(offerSignal(t)).toBe('link')
  })

  it('a phone number, or "my WhatsApp number"', () => {
    expect(offerSignal('Call +92 300 1234567 for bulk')).toBe('phone') // (illustrative)
    expect(offerSignal('orders: 0300-1234567')).toBe('phone') // (illustrative)
    expect(offerSignal('So please like comment and then share my video for me. And if you want anything, so I\'ll put my WhatsApp number below, then you can make your order.')).toBe('phone') // (staging)
  })

  it('"order now" as an instruction (illustrative)', () => {
    expect(offerSignal('Order now!')).toBe('order_now')
    expect(offerSignal('New colours in. Shop now at our store')).toBe('order_now')
  })
})

describe('offerSignal: the market talking, which stays', () => {
  it('buyers on price and shipping (staging)', () => {
    for (const t of [
      '$2310 dollars Canadian with tax plus shipping !!! Wow they can keep it !',
      'May I know the price and shipping fee please? Thanks',
      'Wow so your bags cost K363 in Zambia? Definitely adding this to my future purchases',
      'Wanted to get a Fyro but fees and shipping are over 100€+ here in Europe',
      'Consider using a discounted shipping intermediary (e.g. pirateship). A mailer that size should be between 6 and 13, with an average of about $8.',
      'I do dropshipping myself, and it’s been working well lately. Around $6k net every two weeks.',
    ]) expect(offerSignal(t)).toBeNull()
  })

  it('buyers asking by DM (staging)', () => {
    for (const t of [
      'Can you please DM ?',
      'Could you dm additional pics, please? And factory info if available? Thank you!',
      'Is it possible to buy this bag with shopping to Poland? Could you please send details in DM',
      'I will be dm you soon!😍😍',
    ]) expect(offerSignal(t)).toBeNull()
  })

  it('numbers that are not phone numbers', () => {
    expect(offerSignal('What is 20 000 000? This is American dollars? Or the money of some other countrie??')).toBeNull() // (staging)
    expect(offerSignal('If you are using budget airlines like Ryanair and want to go personal item only, you need a bag that is 40x30x20cm.')).toBeNull() // (staging)
    expect(offerSignal('Ordered on 12.08.2024 10:30 and still waiting')).toBeNull() // (illustrative)
  })

  it('a buyer who will order, and a full stop with no space after it (illustrative)', () => {
    expect(offerSignal('Love it, I\'ll order now')).toBeNull()
    expect(offerSignal('I bought it.In the end it broke')).toBeNull()
    expect(offerSignal('')).toBeNull()
    expect(offerSignal(null)).toBeNull()
  })
})

describe('pastOffers: an ad does not use up the candidates a theme reads', () => {
  const AD = '300rs pair + shipping . DM for order.' // (staging)
  const text = (t: { q: string }) => t.q

  it('keeps the offer in place and reads one more, so the next eligible voice is read', () => {
    const ranked = [{ q: AD }, { q: 'a' }, { q: 'b' }, { q: 'c' }]
    expect(pastOffers(ranked, 2, text).map(text)).toEqual([AD, 'a', 'b'])
  })

  it('is the plain cut where nothing is an offer', () => {
    const ranked = [{ q: 'a' }, { q: 'b' }, { q: 'c' }]
    expect(pastOffers(ranked, 2, text).map(text)).toEqual(['a', 'b'])
    expect(pastOffers([], 2, text)).toEqual([])
  })
})
