import { describe, expect, it } from 'vitest'

import { cleanQuote } from '../../quotes'
import { quoteTextHash } from '../../quote-text'

import {
  convEvidenceOf, convPageHref, convSiblingsOf, convVideoOrder, marketParams, MARKET_CONV_VIDEOS, MARKET_CONV_VIDEOS_MAX, shownConvVideos, videoQuotes,
  type ConvEvidenceRow, type ConvVideoRow, type MarketConv,
} from './market'

// A CONVERSATION'S PAGE AS THE EVIDENCE (F3-Market-Conversation, 17 Oct): its
// videos in the period, most comments about it first, and under each the
// comments about it the quote gate lets print. The params that open a video's
// list or every video name only the conversation's own videos. Pure.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CONV = id(900)

const video = (n: number, o: Partial<ConvVideoRow> = {}): ConvVideoRow => ({
  id: id(n), platform: 'tiktok', video_id: `n${n}`, video_url: `https://www.tiktok.com/v/${n}`, account_name: `@creator${n}`, caption: `Video ${n}`,
  comments_count: 100 - n, upload_date: '2026-10-03', is_client: false, is_competitor: false, competitor_name: null, hashtags: [], topics: [], source: 'discovered', ...o,
})

const row = (o: { e: string; c: string; v: number; insight?: string; quote?: string | null; rank?: number; redacted?: boolean; author?: string; day?: number }): ConvEvidenceRow => ({
  evidenceId: o.e, insightId: o.insight ?? 'm1', commentId: o.c, quote: o.quote === undefined ? 'How long does a liner last before it starts slipping off?' : o.quote,
  rank: o.rank ?? 1, redacted: o.redacted ?? false,
  comment: { date: `2026-10-${String(o.day ?? 6).padStart(2, '0')}T10:00:00.000Z`, platform: 'tiktok', videoId: `n${o.v}`, author: o.author ?? `viewer-${o.c}` },
})

describe('the order of its videos', () => {
  it('most counted comments about it first, ties by the video\'s own total; a video with none last, at 0; nothing outside the refs', () => {
    const videos = [video(1), video(2), video(3), video(4), video(9)]
    const evidence = [
      row({ e: 'a', c: 'c1', v: 1 }), row({ e: 'b', c: 'c2', v: 2 }), row({ e: 'c', c: 'c3', v: 2 }),
      // Two citations of one comment count it once.
      row({ e: 'd', c: 'c3', v: 2, insight: 'm2' }),
      row({ e: 'e', c: 'c4', v: 3 }),
      // A comment the refs do not count, and a video outside the refs.
      row({ e: 'f', c: 'x1', v: 3 }), row({ e: 'g', c: 'c9', v: 9 }),
    ]
    const order = convVideoOrder({ videoIds: [id(1), id(2), id(3), id(4)], commentIds: new Set(['c1', 'c2', 'c3', 'c4', 'c9']), videos, evidence })
    expect(order.map((o) => [o.video.id, o.comments.size])).toEqual([[id(2), 2], [id(1), 1], [id(3), 1], [id(4), 0]])
  })

  it('shows five, every one with ?videos=all (bounded), and the opened one wherever it falls, only where it is its own', () => {
    const order = Array.from({ length: 70 }, (_, i) => ({ video: { id: id(i + 1) } }))
    expect(shownConvVideos(order, {}).ids).toHaveLength(MARKET_CONV_VIDEOS)
    expect(shownConvVideos(order, { videos: true }).ids).toHaveLength(MARKET_CONV_VIDEOS_MAX)
    const opened = shownConvVideos(order, { video: id(9) })
    expect(opened).toEqual({ ids: [id(1), id(2), id(3), id(4), id(5), id(9)], open: id(9) })
    expect(shownConvVideos(order, { video: id(999) })).toEqual({ ids: order.slice(0, 5).map((o) => o.video.id), open: null })
  })
})

describe('the comments under a video', () => {
  const v = video(1)
  const base = { video: v, commentIds: new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']), members: new Set(['m1']), translations: new Map(), gate: {}, kind: null }

  it('its members\' counted comments, one each, best-ranked first; never a demographic citation, another conversation\'s, the creator\'s own or a sale', () => {
    const quotes = videoQuotes({
      ...base,
      evidence: [
        row({ e: 'a2', c: 'c1', v: 1, rank: 2, quote: 'Mine lasted eight months before it started slipping. Is that normal?' }),
        row({ e: 'a1', c: 'c1', v: 1, rank: 1, quote: 'Mine lasted eight months before it started slipping, is that normal for everyone?' }),
        row({ e: 'b', c: 'c2', v: 1, rank: 3, quote: 'Nobody at my fitting said anything about replacing the liner.' }),
        row({ e: 'c', c: 'c3', v: 1, redacted: true, quote: '' }),
        row({ e: 'd', c: 'c4', v: 1, insight: 'm9', quote: 'A comment cited for another conversation entirely, about knees.' }),
        row({ e: 'f', c: 'c5', v: 1, author: 'creator1', quote: 'Thanks for watching everyone, the liner link is in my bio.' }),
        row({ e: 'g', c: 'c6', v: 1, quote: 'DM to order, liners 50% off this week only, shipping worldwide.' }),
        row({ e: 'h', c: 'x', v: 1, quote: 'Not one of the counted comments, so never printed here.' }),
        row({ e: 'i', c: 'c7', v: 2, quote: 'A comment under another video entirely, about the liner.' }),
      ],
    })
    expect(quotes.map((q) => q.text)).toEqual([
      'Mine lasted eight months before it started slipping, is that normal for everyone?',
      'Nobody at my fitting said anything about replacing the liner.',
    ])
    expect(quotes[0]).toEqual({ text: quotes[0].text, lang: null, english: null, date: '6 Oct' })
  })

  it('a comment in another language prints with its English where the cache has one, and not without a reading', () => {
    const text = '¿Cada cuánto hay que cambiar el liner? A mí nadie me lo explicó nunca en la clínica.'
    const evidence = [row({ e: 'a', c: 'c1', v: 1, quote: text })]
    expect(videoQuotes({ ...base, evidence })).toEqual([])
    const translations = new Map([[quoteTextHash(cleanQuote(text)), { lang: 'es', english: 'How often do you have to change the liner? Nobody ever explained it to me at the clinic.' }]])
    expect(videoQuotes({ ...base, evidence, translations })).toEqual([{ text, lang: 'es', english: 'How often do you have to change the liner? Nobody ever explained it to me at the clinic.', date: '6 Oct' }])
  })

  it('the gate\'s relevance holds where its claim can require it', () => {
    const quotes = videoQuotes({
      ...base,
      gate: { claim: 'Which knee to buy: recommendations and comparison', requireRelevance: true },
      evidence: [
        row({ e: 'a', c: 'c1', v: 1, quote: 'Love your energy, you are an inspiration to all of us here.' }),
        row({ e: 'b', c: 'c2', v: 1, quote: 'Which knee would you recommend for someone who hikes a lot?' }),
      ],
    })
    expect(quotes.map((q) => q.text)).toEqual(['Which knee would you recommend for someone who hikes a lot?'])
  })
})

describe('what people said', () => {
  const videos = Array.from({ length: 8 }, (_, i) => video(i + 1))
  const evidence = videos.flatMap((v, i) => Array.from({ length: 8 - i }, (_, j) => row({ e: `e${i}-${j}`, c: `c${i}-${j}`, v: i + 1, quote: `Comment number ${j + 1} about how long a liner lasts under video ${i + 1}.` })))
  const commentIds = new Set(evidence.map((e) => e.commentId))
  const args = (raw: Record<string, string> = {}) => ({
    convId: CONV, kind: null, videoIds: videos.map((v) => v.id), commentIds, members: new Set(['m1']), videos, evidence, translations: new Map(),
    named: new Map([[id(1), ['Össur']], [id(2), ['Ottobock']]]), brand: 'Össur', brands: 'counted' as const, gate: {}, p: marketParams(raw),
  })

  it('five videos, three comments each, "Show all N" where more may print, and "Show more videos" with what remains, at 640 and on a phone', () => {
    const ev = convEvidenceOf(args())
    expect(ev.videos.map((v) => [v.aboutCount, v.quotes.length, v.quotable])).toEqual([[8, 3, 8], [7, 3, 7], [6, 3, 6], [5, 3, 5], [4, 3, 4]])
    expect(ev.more).toEqual({ href: `/dashboard/market/conversations/${CONV}?videos=all#what-people-said`, desktop: 3, phone: 5 })
    // Who each is about, only where a tracked brand is named in its counted
    // comments: the client's chip, a rival's; the market's carries none.
    expect(ev.videos.slice(0, 3).map((v) => v.about)).toEqual(['client', 'rival:Ottobock', null])
  })

  it('opened: every printable comment of that video, its link closing it; the period kept', () => {
    const ev = convEvidenceOf(args({ video: id(7), period: 'month' }))
    const open = ev.videos.find((v) => v.open)!
    expect(open.id).toBe(id(7))
    expect(open.quotes).toHaveLength(2)
    expect(open.href).toBe(`/dashboard/market/conversations/${CONV}?period=month`)
    expect(ev.videos.find((v) => v.id === id(1))!.href).toBe(`/dashboard/market/conversations/${CONV}?period=month&video=${id(1)}#video-${id(1)}`)
    // The opened sixth is drawn on a phone too: four of eight there.
    expect(ev.more).toMatchObject({ desktop: 2, phone: 4 })
  })

  it('every video with ?videos=all: none remain, and each video\'s own link keeps the list open', () => {
    const ev = convEvidenceOf(args({ videos: 'all' }))
    expect(ev.videos).toHaveLength(8)
    expect(ev.more).toBeNull()
    expect(ev.capped).toBeNull()
    expect(ev.videos[0].href).toBe(`/dashboard/market/conversations/${CONV}?videos=all&video=${id(1)}#video-${id(1)}`)
  })

  it('brands not counted: no chip on any video', () => {
    expect(convEvidenceOf({ ...args(), brands: 'not_counted' }).videos.every((v) => v.about === null)).toBe(true)
  })
})

describe('its addresses and its siblings', () => {
  it('convPageHref keeps the period and month, and takes the browser to the card', () => {
    const p = marketParams({ period: 'month', month: '2026-09' })
    expect(convPageHref(p, CONV, { video: id(1) })).toBe(`/dashboard/market/conversations/${CONV}?period=month&month=2026-09&video=${id(1)}#video-${id(1)}`)
    expect(convPageHref(marketParams({}), CONV, { videos: true })).toBe(`/dashboard/market/conversations/${CONV}?videos=all#what-people-said`)
    expect(convPageHref(marketParams({}), CONV)).toBe(`/dashboard/market/conversations/${CONV}`)
  })

  it('marketParams reads ?video= as a row id only, and ?videos=all', () => {
    expect(marketParams({ video: id(1).toUpperCase(), videos: 'all' })).toMatchObject({ video: id(1), videos: true })
    expect(marketParams({ video: '../etc', videos: 'yes' })).toMatchObject({ video: null, videos: false })
  })

  it('convSiblingsOf: its subject\'s others in the subject\'s order; under none, the period\'s biggest eight', () => {
    const conv = (n: number, subjectId: string | null): MarketConv => ({
      id: id(n), label: `C${n}`, kind: null, subjectId, subjectName: null, week: 30 - n, weeks: [], month: 40 - n, months: [], who: [], mix: null, isNew: false, monthVerdict: null, setApart: null,
    })
    const convs = [conv(1, 's'), conv(2, 't'), conv(3, 's'), ...Array.from({ length: 10 }, (_, i) => conv(10 + i, null))]
    const p = marketParams({})
    const under = convSiblingsOf({ convId: id(1), convs, parent: { id: 's', name: 'Fit' }, period: 'week', p })
    expect(under.parent).toEqual({ id: 's', name: 'Fit', href: '/dashboard/market/subjects/s' })
    expect(under.items).toEqual([{ id: id(3), label: 'C3', href: `/dashboard/market/conversations/${id(3)}`, count: 27, month: 37 }])
    const none = convSiblingsOf({ convId: id(1), convs, parent: null, period: 'month', p })
    expect(none.parent).toBeNull()
    expect(none.items).toHaveLength(8)
    expect(none.items[0]).toMatchObject({ id: id(2), count: 38, month: null })
  })
})
