import { SEALAND_CLIENT_ID } from '../config'

// WHAT "YOUR MARKET" IS, SAID ONCE ON THE FRONT PAGE (finish-list item 24,
// 29 Sep 2026).
//
// The product reads the wider market a client sells into, not the client's own
// customers (Heinrich's ruling: there is not enough regional data for a read
// of its own). A client read "Your market in September: 852 videos" as her own
// customers, and asked "whose market is this?" at the first comment from
// Zambia. The sidebar keeps "Your market"; the front page's headline and the
// line under it say plainly what it is.
//
// READ-TIME AND APP-ONLY. The route sets `OverviewData.frame`; the loader does
// not, so the monthly report (which prints this page's blocks on the month
// that has ended, and is on hold) prints what it printed before.

/**
 * What a tenant sells, as a plural noun, where we have it: "bags like
 * Sealand's". A tenant with none reads "what Össur sells", which is true
 * of every tenant and needs no entry. `tracking_configs.market_description`
 * (MF3) is the stored home for this once it is written for a tenant; it is
 * null for Sealand, and writing it reads as a change of ours on every page.
 */
export const WHAT_THEY_SELL: Readonly<Record<string, string>> = {
  [SEALAND_CLIENT_ID]: 'bags',
}

export interface MarketFrame {
  /** Stands where the size headline says "Your market": "The market Sealand
   *  sells into". */
  subject: string
  /** The line under the headline. */
  lede: string
}

export function marketFrame(clientId: string, brand: string): MarketFrame {
  const noun = WHAT_THEY_SELL[clientId]
  const what = noun ? `${noun} like ${brand}’s` : `what ${brand} sells`
  return {
    subject: `The market ${brand} sells into`,
    lede: `What people buying and talking about ${what} say on Instagram, TikTok, YouTube and Reddit, worldwide, not only ${brand}’s own customers.`,
  }
}

/** The size headline's subject, as `sizeSentence` writes it. */
export const SIZE_SUBJECT = 'Your market'

/**
 * The size headline with the frame's subject: "The market Sealand sells into,
 * in September so far: [[market_videos]] videos and …". A body that is not the
 * size sentence (a change that leads, "Nothing has been read into …") is
 * returned as it is.
 */
export function framedHeadline(body: string, frame: MarketFrame | null | undefined): string {
  const lead = `${SIZE_SUBJECT} in `
  if (!frame || !body.startsWith(lead)) return body
  return `${frame.subject}, in ${body.slice(lead.length)}`
}
