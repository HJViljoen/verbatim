// Does a comment read as a sale offer or an ad? (Market page default M-c.)
//
// THE HEADLINE'S VOICES ARE THE MARKET TALKING, NOT SOMEONE SELLING TO IT.
// Staging's September headline printed "300rs pair + shipping . DM for order."
// as one of its two voices on "Price and sale questions": a seller's post
// under a category video, which is the theme's own evidence of the right kind
// and dated in the month, and so passed every quote rule (`quotable`). This is
// the one more rule the headline's voices take (`pickQuotes` `skipOffers`):
// a voice that reads as an offer is skipped and the next eligible one is used.
//
// FIVE SIGNALS, EACH ONE A SELLER'S SHAPE, not a buyer's:
//
//   - a price with shipping: a price, then "+ shipping", "free shipping" or
//     "shipping included", in a comment that asks nothing. A buyer's "$2310
//     dollars Canadian with tax plus shipping !!! Wow they can keep it !" or
//     "May I know the price and shipping fee please?" (staging) is a buyer on
//     price, and stays;
//   - "DM for order" or "DM for price" (and "WhatsApp to order", "inbox for
//     price"): the seller's instruction. A buyer's "Can you please DM ?" or
//     "Could you please send details in DM" (staging) stays;
//   - a link: an address ("https://", "www.", a bare shop domain) or "link in
//     my bio";
//   - a phone number (nine to fifteen digits in one run of digits, spaces,
//     hyphens and brackets, not a grouped amount like "20 000 000" or a
//     date), or "my WhatsApp number";
//   - "order now" or "shop now", as an instruction (a sentence of its own, or
//     "order now at …"), never a buyer's "I'll order now".
//
// PURE. A false positive only costs the headline a voice (the next one is
// used); a false negative prints an ad under the market's headline.

export type OfferSignal = 'price_shipping' | 'dm_order' | 'link' | 'phone' | 'order_now'

// A price: a currency sign or code before or after digits ("$49", "300rs",
// "Rs 300", "R450", "€20", "49 dollars").
const PRICE = /(?:[$€£₹]\s?\d|\b(?:rs\.?|inr|pkr|usd|eur|gbp|zar)\s?\d|\bR\d|\d[\d,.]*\s?(?:rs|inr|pkr|usd|eur|gbp|zar|dollars?|rupees?|euros?)\b|\d\/-)/i
const WITH_SHIPPING = /(?:\+\s*(?:free\s+)?(?:shipping|delivery|postage|courier)\b|\bfree\s+(?:shipping|delivery)\b|\b(?:shipping|delivery)\s+(?:included|incl\.?|free)\b)/i

const DM_ORDER = /\b(?:dm|pm|inbox|message|whatsapp)(?:\s+(?:me|us))?\s+(?:for|to)\s+(?:order|orders|ordering|price|prices|pricing)\b/i

// An address or a pointer to one. A bare domain's ending must be lower case,
// so a missing space after a full stop ("it.In the end") is not an address.
const ADDRESS = /\bhttps?:\/\/|\bwww\.|\blink\s+in\s+(?:my\s+|our\s+|the\s+)?(?:bio|profile)\b/i
const BARE_DOMAIN = /\b[a-zA-Z0-9][a-zA-Z0-9-]+\.(?:com|net|org|store|shop|site|online|io|ly|link)\b/

const PHONE_RUN = /\+?\d[\d\s()-]{7,}\d/g
const GROUPED_AMOUNT = /^\d{1,3}(?:[\s,.]\d{3})+$/
const OWN_NUMBER = /\b(?:my|our)\s+(?:whatsapp|phone|contact|mobile)\s+(?:number|no\.?)(?=\s|$|[.,!:;])/i

const ORDER_NOW = /(?:^|[.!:;\n•|]\s*|\s-\s*)(?:order|shop)\s+now\b|\b(?:order|shop)\s+now\s+(?:at|on|via|from|through)\b/i

function phoneNumber(text: string): boolean {
  for (const m of text.match(PHONE_RUN) ?? []) {
    const run = m.trim()
    if (GROUPED_AMOUNT.test(run)) continue
    const digits = run.replace(/\D/g, '').length
    if (digits >= 9 && digits <= 15) return true
  }
  return OWN_NUMBER.test(text)
}

/** The first offer signal a comment carries, or null. */
export function offerSignal(text: string | null | undefined): OfferSignal | null {
  const t = (text ?? '').trim()
  if (!t) return null
  if (!t.includes('?') && PRICE.test(t) && WITH_SHIPPING.test(t)) return 'price_shipping'
  if (DM_ORDER.test(t)) return 'dm_order'
  if (ADDRESS.test(t) || BARE_DOMAIN.test(t)) return 'link'
  if (phoneNumber(t)) return 'phone'
  if (ORDER_NOW.test(t)) return 'order_now'
  return null
}

/** Does the comment read as a sale offer or an ad? */
export const readsAsOffer = (text: string | null | undefined): boolean => offerSignal(text) != null

/**
 * The best `n` of `ranked` (already in rank order), with offers kept in place
 * but not counted toward `n`: the headline skips them (`pickQuotes`
 * `skipOffers`), so an ad among the few candidates a theme reads would cost
 * the headline a voice it could have printed. The next eligible voice is then
 * one the loader has read.
 */
export function pastOffers<T>(ranked: readonly T[], n: number, textOf: (t: T) => string | null | undefined): T[] {
  const out: T[] = []
  let counted = 0
  for (const t of ranked) {
    if (counted >= n) break
    out.push(t)
    if (!readsAsOffer(textOf(t))) counted++
  }
  return out
}
