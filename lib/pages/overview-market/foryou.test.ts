import { describe, expect, it } from 'vitest'

import { DIRECTION_WORDS } from '../../calibration'
import { answeredBy, contentWords, postsSharing } from '../subjects'
import {
  buildForYou,
  buildPublished,
  CHECKED_SHOWN,
  FOLLOWERS_MIN_K,
  FOR_YOU_SENTENCES,
  forYouSentence,
  forYouWords,
} from './foryou'

// What it means for you, and what you published (market-first WP2.5): the
// pure half. Figures are staging's Sealand (read with the 20 Sep update) and
// production's September census (§2.2), each named where it is used.

const SEP = '2026-09-01'
// Staging's three question groups on Waterproofing over the last 3 months
// (GR F24), as the Subjects page lists them.
const WATER_GROUPS = ['Demand for real waterproofing', 'Worries about zippers in rain', 'Coated canvas cracking concerns']

describe('the matcher: two or more NON-GENERIC words, per post', () => {
  it('drops the words every bag post and every question share, and the words that frame a group', () => {
    expect(contentWords('Love for stylish bag design')).toEqual(['stylish', 'design'])
    expect(contentWords('Demand for real waterproofing')).toEqual(['waterproofing'])
    expect(contentWords('Questions about buying and shipping')).toEqual(['shipping'])
  })

  it('prints the words as the label wrote them, never a stem ("canvas", not "canva")', () => {
    const checked = WATER_GROUPS.flatMap((g) => postsSharing(g, []).checked)
    expect(checked).toEqual(['waterproofing', 'zippers', 'rain', 'coated', 'canvas', 'cracking'])
  })

  it('matches a post on two of the label\'s words, and names them; two words from two posts are not one', () => {
    const posts = [
      { id: 'p1', topics: ['zippers', 'rain jacket'] },
      { id: 'p2', topics: ['zippers'] },
      { id: 'p3', topics: ['rain'] },
    ]
    expect(postsSharing('Worries about zippers in rain', posts)).toEqual({
      checked: ['zippers', 'rain'],
      matched: [{ id: 'p1', words: ['zippers', 'rain'] }],
    })
  })

  it('never calls a question touched on "bag", "love" or "handmade" (the old one-shared-word failure)', () => {
    expect(answeredBy('Love for handmade bag design', ['handmade bag love'])).toBe(false)
    expect(postsSharing('Love for handmade bag design', [{ id: 'p', topics: ['love', 'handmade', 'bag'] }]).matched).toEqual([])
    expect(answeredBy('Durability and repairs', ['durability of our repairs'])).toBe(true)
  })
})

describe('buildForYou: the lines, in the preview\'s order', () => {
  const water = (calibration: 'ready' | 'provisional' | 'failed') => ({
    subject: { id: 's-water', name: 'Waterproofing', calibration },
    asked: 16,
    posts: 56,
    sharing: { checked: ['waterproofing', 'zippers', 'rain', 'coated', 'canvas', 'cracking'], matched: [] },
  })

  it('prints Waterproofing\'s 16 question videos and "none of your 56 posts" (staging, GR F24)', () => {
    const b = buildForYou({ month: SEP, questions: water('provisional'), lead: null, followers: null })
    expect(b.lines).toHaveLength(1)
    const [l] = b.lines
    expect(l.kind).toBe('unanswered')
    expect(l.sentenceKey).toBe('foryou.unanswered.none')
    expect(l.figures.foryou_asked.value).toBe(16)
    expect(l.figures.foryou_posts.value).toBe(56)
    expect(l.calibration).toBe('provisional')
    expect(l.matchedPosts).toEqual([])
  })

  it('draws no line for a subject being re-described', () => {
    expect(buildForYou({ month: SEP, questions: water('failed'), lead: null, followers: null }).lines).toEqual([])
  })

  it('names the posts that matched and switches to the "some" sentence', () => {
    const q = { ...water('ready'), sharing: { checked: ['zippers', 'rain'], matched: [{ id: 'p1', words: ['zippers', 'rain'] }] } }
    const [l] = buildForYou({ month: SEP, questions: q, lead: null, followers: null }).lines
    expect(l.sentenceKey).toBe('foryou.unanswered.some')
    expect(l.figures.foryou_touched.value).toBe(1)
    expect(forYouWords(l)).toEqual({ matched: true, words: ['zippers', 'rain'], more: false })
  })

  it('puts the lead theme against the month\'s posts (staging: "Price and sale questions", 20 posts, none)', () => {
    const lead = { label: 'Price and sale questions', posts: 20, sharing: postsSharing('Price and sale questions', []) }
    const [l] = buildForYou({ month: SEP, questions: null, lead, followers: null }).lines
    expect(l.kind).toBe('lead_touch')
    expect(l.sentenceKey).toBe('foryou.lead_touch.none')
    expect(l.labelKind).toBe('theme')
    expect(forYouWords(l)).toEqual({ matched: false, words: ['price', 'sale'], more: false })
    expect(buildForYou({ month: SEP, questions: null, lead: { ...lead, posts: 0 }, followers: null }).lines).toEqual([])
  })

  it('claims nothing about makers where no maker rule chose the lead (Össur: "the market’s second biggest conversation")', () => {
    const lead = { label: 'Admiration for personal resilience', posts: 109, sharing: postsSharing('Admiration for personal resilience', []), fewMakers: false }
    const [l] = buildForYou({ month: SEP, questions: null, lead, followers: null }).lines
    expect(l.sentenceKey).toBe('foryou.lead_biggest.none')
    expect(FOR_YOU_SENTENCES[l.sentenceKey]).not.toContain('makers')
    // Staging's board: "Audience identities and amputation types" (44) is
    // bigger and never quoted, so the lead (34) is second.
    const [second] = buildForYou({ month: SEP, questions: null, lead: { ...lead, rank: 1 }, followers: null }).lines
    expect(second.sentenceKey).toBe('foryou.lead_biggest.second.none')
    expect(FOR_YOU_SENTENCES[second.sentenceKey]).toBe('The market’s second biggest conversation. None of your [[foryou_posts]] {month} posts shared two or more of its words.')
  })

  it('names the month, never "the month", in the lead line (plan §2.2: "of your 20 September posts"; §5.1)', () => {
    expect(forYouSentence('foryou.lead_touch.none', SEP)).toBe('The market’s biggest conversation with few makers. None of your [[foryou_posts]] September posts shared two or more of its words.')
    expect(forYouSentence('foryou.lead_biggest.second.some', '2026-10-01')).toBe('The market’s second biggest conversation. [[foryou_touched]] of your [[foryou_posts]] October posts shared two or more of its words.')
    expect(forYouSentence('foryou.nothing', SEP)).toBeNull()
    for (const k of Object.keys(FOR_YOU_SENTENCES)) expect(forYouSentence(k, SEP)).not.toMatch(/\{month\}|the month\b/)
  })

  it('names the lead\'s place and never calls a smaller theme the biggest', () => {
    const lead = { label: 'Price and sale questions', posts: 20, sharing: postsSharing('Price and sale questions', []) }
    const key = (rank: number) => buildForYou({ month: SEP, questions: null, lead: { ...lead, rank }, followers: null }).lines[0].sentenceKey
    expect(key(0)).toBe('foryou.lead_touch.none')
    expect(FOR_YOU_SENTENCES[key(2)]).toBe('The market’s third biggest conversation with few makers. None of your [[foryou_posts]] {month} posts shared two or more of its words.')
    expect(FOR_YOU_SENTENCES[key(3)]).toBe('One of the market’s biggest conversations with few makers. None of your [[foryou_posts]] {month} posts shared two or more of its words.')
    expect(key(9)).toBe(key(3))
    // Every lead sentence: no digit, no em dash.
    for (const k of Object.keys(FOR_YOU_SENTENCES).filter((x) => x.startsWith('foryou.lead_'))) expect(FOR_YOU_SENTENCES[k]).not.toMatch(/\d|—/)
  })

  it('prints the followers\' subject only for a READY subject (decision C; Community & purpose is provisional)', () => {
    const f = (calibration: 'ready' | 'provisional') => ({ subject: { id: 's-c', name: 'Community & purpose', calibration }, k: 6, n: 9 })
    expect(buildForYou({ month: SEP, questions: null, lead: null, followers: f('provisional') }).lines).toEqual([])
    const [l] = buildForYou({ month: SEP, questions: null, lead: null, followers: f('ready') }).lines
    expect(l.sentenceKey).toBe('foryou.followers')
  })

  it('shows at most CHECKED_SHOWN checked words, then "…"', () => {
    const [l] = buildForYou({ month: SEP, questions: water('ready'), lead: null, followers: null }).lines
    const w = forYouWords(l)
    expect(w.words).toHaveLength(CHECKED_SHOWN)
    expect(w.more).toBe(true)
  })
})

describe('FOR_YOU_SENTENCES: code\'s words', () => {
  it('hold only tokens their lines carry, no direction word, no em dash, and "the subjects picked for you"', () => {
    for (const [key, body] of Object.entries(FOR_YOU_SENTENCES)) {
      for (const token of body.match(/\[\[([a-z_]+)\]\]/g) ?? []) expect(['[[foryou_asked]]', '[[foryou_posts]]', '[[foryou_touched]]'], key).toContain(token)
      expect(body).not.toContain('—')
      expect(body).not.toContain('you follow')
      for (const word of DIRECTION_WORDS) expect(body.toLowerCase(), key).not.toMatch(new RegExp(`\\b${word}\\b`))
    }
  })
})

describe('buildPublished: the posts census', () => {
  it('counts production\'s September (§2.2): 20 posts, 30 the month before, 10 with 5+ comments, 9 read with 234 comments', () => {
    const p = buildPublished({
      month: SEP,
      posts: [...Array.from({ length: 10 }, () => ({ uploadDate: '2026-09-10', commentsCount: 5 })), ...Array.from({ length: 10 }, () => ({ uploadDate: '2026-09-10', commentsCount: 4 }))],
      prevPosts: 30,
      audience: { videos: 9, comments: 234 },
      themes: [{ label: 'Keen to join events', k: 2 }, { label: 'Respect for Sealand’s mission', k: 4 }, { label: 'Support for clean-up initiatives', k: 3 }, { label: 'A one-video theme', k: 1 }],
      movesDated: 0,
    })
    expect(p).toMatchObject({ posts: 20, prevPosts: 30, drewFive: 10, withReading: 9, readingComments: 234, movesDated: 0 })
    expect(p.followers.map((f) => f.k)).toEqual([4, 3, 2])
    expect(p.followers.every((f) => f.k >= FOLLOWERS_MIN_K)).toBe(true)
  })

  it('reads an audience with no row as not read, never 0 (staging holds none for Sealand)', () => {
    const p = buildPublished({ month: SEP, posts: [], prevPosts: 32, audience: null, themes: [], movesDated: 0 })
    expect(p.withReading).toBeNull()
    expect(p.readingComments).toBeNull()
  })
})
