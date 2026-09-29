import { describe, expect, it } from 'vitest'
import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { framedHeadline, marketFrame, SIZE_SUBJECT } from './market-frame'
import { sizeSentence } from './overview'

// Finish-list item 24: the front page says what "Your market" is.

describe('marketFrame', () => {
  it('names the market Sealand sells into, and whose words these are', () => {
    const f = marketFrame(SEALAND_CLIENT_ID, 'Sealand')
    expect(f.subject).toBe('The market Sealand sells into')
    expect(f.lede).toBe('What people buying and talking about bags like Sealand’s say on Instagram, TikTok, YouTube and Reddit, worldwide, not only Sealand’s own customers.')
  })

  it('needs no noun for a tenant we hold none for', () => {
    expect(marketFrame(OSSUR_CLIENT_ID, 'Össur').lede).toContain('talking about what Össur sells say on')
  })
})

describe('framedHeadline', () => {
  const size = sizeSentence({ month: '2026-09-01', soFar: true, videos: 852, comments: 21468 })
  const frame = marketFrame(SEALAND_CLIENT_ID, 'Sealand')

  it('is bound to the size sentence’s own subject', () => {
    expect(size.body.startsWith(`${SIZE_SUBJECT} in `)).toBe(true)
  })

  it('swaps "Your market" for the market Sealand sells into, and keeps the figures as tokens', () => {
    expect(framedHeadline(size.body, frame)).toBe('The market Sealand sells into, in September so far: [[market_videos]] videos and [[market_comments]] comments.')
  })

  it('leaves any other headline, and an unframed one, as it is', () => {
    expect(framedHeadline(size.body, undefined)).toBe(size.body)
    expect(framedHeadline('Nothing has been read into September yet.', frame)).toBe('Nothing has been read into September yet.')
    const lead = 'Durability came up in [[d_share]] of the category’s videos this month, [[d_videos]] of [[d_of]] videos.'
    expect(framedHeadline(lead, frame)).toBe(lead)
  })
})
