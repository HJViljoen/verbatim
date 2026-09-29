import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { BRAND_RULE_VERSION } from '../brands/aliases'
import { ownPostCensus } from '../reading/own-posts'
import { AUGUST_BRANDS, NO_MATCH_CHECKS, SEPTEMBER_BRANDS, STAND_IN_CHECKS } from '../test/brands-fixture'
import type { BRAND_HAND_CHECKS } from '../brands/precision'
import {
  askedMonthsLine, buildAsked, buildContent, buildFindings, buildInFull, buildNameBlock, buildPosts, buildShare, buildTopics,
  findingKindWords, leadTheme, levelWords, nameCommentsLine, nameLeadParts, nameOwnParts, ninetyDays, recurrenceMonths,
  shareWaiting, noFindingLine, topicWords, topicsCounted, type BrandMonthIn, type Part,
} from './brands'
import { competitiveFixture } from '../../components/pages/competitive-surface/fixture'

// The Brands page's pure half (WP3.5). Every figure is a staging reading:
// the brand counts are scripts/brand-mentions.ts's plan of 27 Sep
// (lib/test/brands-fixture.ts), the ninety-day counts are
// `window_denominators` and `window_kind_readings` over 23 Jun to 20 Sep
// (research brand-counting.md F31 and F33, re-read on staging 27 Sep), the
// question themes are that window's `window_theme_readings` for Cotopaxi's
// audience, the own posts are September's `competitor_owned` videos on
// staging, and the panel is Össur's August and September panel on staging.

const words = (parts: readonly Part[] | null): string =>
  (parts ?? []).map((p) => (p.t === 'text' ? p.s : String(p.value))).join('')

describe('B1 · your name in your market', () => {
  const base = { clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, hasRows: true, outside: [] as string[], ownPosts: 8, ownPostComments: { comments: 1, posts: 1 } }

  it('is "not counted yet" until production has checked the name', () => {
    const b = buildNameBlock({ ...base, checks: { [SEALAND_CLIENT_ID]: {} } })
    expect(b.counted).toBeNull()
    expect(words(nameLeadParts(b))).toBe('Your name in your market in September: not counted yet.')
    expect(nameOwnParts(b)).toBeNull()
    expect(nameCommentsLine(b)).toBeNull()
  })

  it('prints what the reading found once every match outside your own posts is read (staging: none of 654)', () => {
    const b = buildNameBlock({ ...base, checks: STAND_IN_CHECKS })
    expect(words(nameLeadParts(b))).toBe('In September your name came up in none of your market’s 654 videos.')
    expect(words(nameOwnParts(b))).toBe('The 8 videos that name you are your own posts.')
    expect(nameCommentsLine(b)).toBe('One September comment named you, under one of your own posts.')
  })

  it('never says every video naming you is your own post where the market named you too (finish-list item 20)', () => {
    const b = { month: '2026-09-01', counted: { n: 852, k: 1, ownPosts: 9, ownPostComments: 1, ownPostCommentPosts: 1 } }
    expect(words(nameLeadParts(b))).toBe('In September your name came up in 1 of your market’s 852 videos.')
    expect(words(nameOwnParts(b))).toBe('It also came up in 9 of your own posts.')
  })

  it('waits for a match outside your own posts that nobody has read by hand', () => {
    expect(buildNameBlock({ ...base, outside: ['v-unread'], checks: STAND_IN_CHECKS }).counted).toBeNull()
  })

  it('says nothing about your own posts where none names you', () => {
    const b = buildNameBlock({ ...base, ownPosts: 0, ownPostComments: { comments: 0, posts: 0 }, checks: STAND_IN_CHECKS })
    expect(nameOwnParts(b)).toBeNull()
    expect(nameCommentsLine(b)).toBeNull()
  })
})

const monthIn = (sep: typeof SEPTEMBER_BRANDS[number]): BrandMonthIn => {
  const aug = AUGUST_BRANDS.find((a) => a.brandKey === sep.brandKey)
  return {
    brandKey: sep.brandKey,
    label: sep.label,
    hasRows: sep.hasRows,
    curr: { kAny: sep.kAny, kOrganic: sep.kOrganic },
    prev: aug ? { kAny: aug.kAny } : null,
  }
}

// Freitag at the research's name precision (F7: about 14%), to draw the
// "mostly another word" state; the others are the stand-in checks.
const WITH_FREITAG: typeof BRAND_HAND_CHECKS = {
  [SEALAND_CLIENT_ID]: {
    ...STAND_IN_CHECKS[SEALAND_CLIENT_ID],
    Freitag: { headline: { read: 0, brand: 0 }, rest: { read: 7, brand: 1 }, on: '2026-10-05', where: 'production', ruleVersion: BRAND_RULE_VERSION, of: 'test stand-in', source: 'research F7' },
  },
}

describe('B1 · the brands in your market', () => {
  const topics = (checks?: typeof BRAND_HAND_CHECKS, chip: string | null = 'not read as a change: we changed our searches in September') =>
    buildTopics({
      clientId: SEALAND_CLIENT_ID,
      month: '2026-09-01',
      prevMonth: '2026-08-01',
      n: 654,
      nOrganic: 516,
      prevN: 377,
      tracked: SEPTEMBER_BRANDS.map(monthIn),
      watched: null,
      chip,
      read: 'live',
      checks,
    })

  it('prints "none found" for a brand production\'s list held no match of, once the mention layer was read and holds none', () => {
    const read = (mentionsRead: boolean) => buildTopics({
      clientId: SEALAND_CLIENT_ID, month: '2026-09-01', prevMonth: '2026-08-01', n: 654, nOrganic: 516, prevN: 377,
      tracked: SEPTEMBER_BRANDS.map(monthIn), watched: null, chip: null, read: 'live', checks: NO_MATCH_CHECKS, mentionsRead,
    })
    const words = (b: ReturnType<typeof read>) => Object.fromEntries(b.tracked.map((r) => [r.label, topicWords(r)]))
    expect(words(read(true))).toMatchObject({ 'Freedom of Movement': 'no video names it', 'Old School': 'no video names it', Rareform: 'no video names it', Cotopaxi: 'not counted yet' })
    // A layer that could not be read proves nothing: "not counted yet".
    expect(words(read(false))).toMatchObject({ 'Freedom of Movement': 'not counted yet', 'Old School': 'not counted yet' })
  })

  it('prints every brand "not counted yet" until production has checked it, with no chip over nothing', () => {
    const b = topics({ [SEALAND_CLIENT_ID]: {} })
    expect(b.tracked.map((r) => [r.label, topicWords(r)])).toEqual([
      ['Cotopaxi', 'not counted yet'],
      ['Freedom of Movement', 'not counted yet'],
      ['Freitag', 'not counted yet'],
      ['Old School', 'not counted yet'],
      ['Patagonia', 'not counted yet'],
      ['Rareform', 'not counted yet'],
      ['The North Face', 'not counted yet'],
    ])
    expect(b.tracked.every((r) => r.kAny == null && r.prevK == null)).toBe(true)
    expect(topicsCounted(b.tracked)).toBe(false)
    expect(b.chip).toBeNull()
  })

  it('counts the checked brands, the headline leaving out every video our rival searches found, August beside (staging 516 of 654; 377)', () => {
    const b = topics(WITH_FREITAG)
    expect(b.tracked.slice(0, 4).map((r) => [r.label, r.kOrganic, r.kAny, r.prevK])).toEqual([
      ['Patagonia', 13, 45, 24],
      ['The North Face', 6, 36, 15],
      ['Cotopaxi', 3, 28, 32],
      ['Freitag', null, null, null],
    ])
    expect(topicWords(b.tracked[3])).toBe('mostly the German word for Friday · not counted')
    // A brand with no row in the mention layer is never a 0.
    expect(b.tracked.slice(4).map((r) => topicWords(r))).toEqual(['not counted yet', 'not counted yet', 'not counted yet'])
    expect(b.chip).toBe('not read as a change: we changed our searches in September')
  })

  it('draws no watched column for a tenant with no list', () => {
    expect(topics(STAND_IN_CHECKS).watched).toBeNull()
  })

  it('reads a brand whose reading month was not read as not counted, even where it is checked', () => {
    const b = buildTopics({
      clientId: SEALAND_CLIENT_ID, month: '2026-09-01', prevMonth: '2026-08-01', n: null, nOrganic: null, prevN: 377,
      tracked: [{ ...monthIn(SEPTEMBER_BRANDS[4]), curr: null }], watched: null, chip: null, read: 'live', checks: STAND_IN_CHECKS,
    })
    expect(b.tracked[0].count).toBe('not_yet')
  })
})

describe('B2 · a brand in full, last 90 days', () => {
  it('ends the ninety days at the update, never the clock (research F31: 23 Jun to 20 Sep)', () => {
    expect(ninetyDays('2026-09-20T08:33:47.358Z')).toEqual({ from: '2026-06-23', to: '2026-09-21' })
    // A month's own end is already the half-open end.
    expect(ninetyDays('2026-10-01T00:00:00.000Z')).toEqual({ from: '2026-07-03', to: '2026-10-01' })
  })

  const RIVALS = ['Cotopaxi', 'Freitag', 'Rareform', 'The North Face', 'Patagonia', 'Freedom of Movement', 'Old School']
    .map((name) => ({ name, audience: `competitor:${name}` }))
  // window_denominators, 23 Jun to 20 Sep (staging).
  const DEN = [
    { audience: 'client', videos: 8, comments: 230 },
    { audience: 'competitor:Cotopaxi', videos: 32, comments: 613 },
    { audience: 'competitor:Freitag', videos: 8, comments: 133 },
    { audience: 'competitor:Patagonia', videos: 5, comments: 122 },
    { audience: 'competitor:The North Face', videos: 6, comments: 44 },
    { audience: 'industry-other', videos: 908, comments: 27_018 },
  ]
  // window_kind_readings, the same window (staging).
  const KINDS = [
    ['demographic_signal', 1], ['feature_request', 5], ['objection', 7], ['pain_point', 11], ['praise', 25],
    ['purchase_intent', 20], ['question', 21], ['switching_signal', 5],
  ].map(([kind, videos]) => ({ audience: 'competitor:Cotopaxi', kind: kind as string, videos: videos as number }))

  const block = (wanted: string | null) => buildInFull({
    window: { from: '2026-06-23', to: '2026-09-21' }, rivals: RIVALS, denominators: DEN, kinds: KINDS, wanted,
    hrefFor: (name) => `/dashboard/competitive?vs=${encodeURIComponent(name)}`,
  })

  it('lists the brands filed with a video in the window, most first, never your own or the category; then every other brand we track, at zero', () => {
    const b = block(null)
    expect(b.rows.map((r) => [r.label, r.videos, r.comments])).toEqual([
      ['Cotopaxi', 32, 613], ['Freitag', 8, 133], ['The North Face', 6, 44], ['Patagonia', 5, 122],
      ['Freedom of Movement', 0, 0], ['Old School', 0, 0], ['Rareform', 0, 0],
    ])
    expect(b.rows[0].selected).toBe(true)
  })

  it('says why a brand we do not search for has nothing filed (finish-list item 20: Old School was missing)', () => {
    const b = buildInFull({
      window: { from: '2026-06-23', to: '2026-09-21' }, rivals: RIVALS, denominators: DEN, kinds: KINDS, wanted: 'Old School',
      hrefFor: () => '', unsearched: new Set(['old school']),
    })
    expect(b.rows.find((r) => r.label === 'Old School')?.note).toBe('no search term: we read its own posts')
    expect(b.rows.find((r) => r.label === 'Freedom of Movement')?.note).toBeNull()
    // Nothing to read in full: the biggest is read instead.
    expect(b.selected?.label).toBe('Cotopaxi')
  })

  it('reads the biggest in full by default: what people did, as counts (research F33)', () => {
    expect(block(null).selected?.kinds.map((k) => [k.label, k.videos])).toEqual([
      ['Praising it', 25], ['Asking how it works', 21], ['Ready to buy', 20], ['Hitting a problem', 11],
      ['Pushing back', 7], ['Asking for something', 5], ['Leaving for something else', 5], ['Saying who they are', 1],
    ])
  })

  it('reads the brand `?vs=` names', () => {
    const b = block('patagonia')
    expect(b.selected?.label).toBe('Patagonia')
    expect(b.rows.find((r) => r.label === 'Patagonia')?.selected).toBe(true)
    expect(b.rows.filter((r) => r.selected)).toHaveLength(1)
  })

  it('reads none where no brand had a video in the window', () => {
    const b = buildInFull({ window: { from: '2026-06-23', to: '2026-09-21' }, rivals: RIVALS, denominators: [], kinds: [], wanted: null, hrefFor: () => '' })
    expect(b.rows.every((r) => r.videos === 0)).toBe(true)
    expect(b.selected).toBeNull()
  })
})

describe('B3 · asked under their content', () => {
  // window_theme_readings for Cotopaxi's audience, 23 Jun to 20 Sep, question
  // themes on the 20 Sep themed run (staging).
  const THEMES = [
    { registryId: 'bffa8059', label: 'Carry-on size compliance anxiety', videos: 12 },
    { registryId: '8fa08a79', label: 'Questions on product details', videos: 5 },
    { registryId: 'ef6bdcdc', label: 'Feature-by-feature bag scrutiny', videos: 2 },
    { registryId: '06b55739', label: 'Asking about easier gear hauling', videos: 1 },
    { registryId: '4129a4c7', label: 'Confusion over exact dimensions', videos: 1 },
    { registryId: '73c275cb', label: 'Patagonia’s backpack reputation questioned', videos: 1 },
  ]
  // month_kind_readings, question, Cotopaxi (staging): June's is outside the
  // window's whole months and is left out.
  const MONTHS = [{ month: '2026-06-01', videos: 4 }, { month: '2026-08-01', videos: 13 }, { month: '2026-09-01', videos: 8 }]
  const asked = (all: boolean) => buildAsked({
    rival: { name: 'Cotopaxi', audience: 'competitor:Cotopaxi' }, window: { from: '2026-06-23', to: '2026-09-21' }, month: '2026-09-01',
    questionVideos: 21, months: MONTHS, themes: THEMES, all,
  })

  it('counts the question videos over the window, and month by month (the preview: 21; 13 in August · 8 in September)', () => {
    const a = asked(false)
    expect(a?.videos).toBe(21)
    expect(words(askedMonthsLine(a!))).toBe('13 in August · 8 in September')
  })

  it('lists the three question themes asked under the most videos, and counts the rest', () => {
    const a = asked(false)
    expect(a?.themes.map((t) => [t.label, t.videos])).toEqual([
      ['Carry-on size compliance anxiety', 12], ['Questions on product details', 5], ['Feature-by-feature bag scrutiny', 2],
    ])
    expect(a?.more).toBe(3)
  })

  it('lists every one with `?asked=all`', () => {
    const a = asked(true)
    expect(a?.themes).toHaveLength(6)
    expect(a?.more).toBe(0)
  })

  it('draws nothing where no brand is read in full', () => {
    expect(buildAsked({ rival: null, window: { from: '2026-06-23', to: '2026-09-21' }, month: '2026-09-01', questionVideos: 0, months: [], themes: [], all: false })).toBeNull()
  })
})

describe('B4 · where a rival’s talk differs', () => {
  it('anchors a finding on the theme its cited insights fall in most, the rival’s own first (staging, 20 Sep run)', () => {
    // "Durability praise does not remove carry-comfort concern" cites 25
    // insights in the category's "Frustration with bag weight" and 8 in
    // Cotopaxi's "Durability that earns trust".
    const cited = new Set(['a1', 'a2', 'a3', 'c1', 'c2'])
    const obs = [
      { themeId: '0c0784d8', bucket: 'industry-other', members: ['a1', 'a2', 'a3', 'x'] },
      { themeId: '378dd773', bucket: 'competitor:Cotopaxi', members: ['c1', 'c2', 'y'] },
      { themeId: '9084e1ef', bucket: 'competitor:Cotopaxi', members: ['c1'] },
    ]
    expect(leadTheme(cited, obs, 'competitor:Cotopaxi')).toEqual({ registryId: '378dd773', audience: 'competitor:Cotopaxi' })
    // With nothing in the rival's own audience, the biggest overall.
    expect(leadTheme(cited, obs.slice(0, 1), 'competitor:Cotopaxi')).toEqual({ registryId: '0c0784d8', audience: 'industry-other' })
    expect(leadTheme(new Set(['z']), obs, 'competitor:Cotopaxi')).toBeNull()
  })

  it('looks back six months, never before the first', () => {
    expect(recurrenceMonths('2026-09-01', '2026-06-01')).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])
    expect(recurrenceMonths('2026-11-01', '2026-01-01')).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01'])
  })

  it('groups the findings by brand in B2’s order, and names the brands too thin to set against the category', () => {
    const b = buildFindings({
      rivals: ['Cotopaxi', 'Freitag', 'The North Face', 'Patagonia'],
      findings: [
        { id: 'f1', rival: 'Cotopaxi', category: 'sentiment_differential', title: 'Organization talk becomes trip-readiness scrutiny around Cotopaxi', quote: null, seen: { months: 2, of: 4 } },
        { id: 'f2', rival: 'Cotopaxi', category: 'topic_ownership', title: 'Family Travel Psych is shaping the family-travel bag checklist', quote: null, seen: null },
      ],
      videos: new Map([['Cotopaxi', 32], ['Freitag', 8], ['The North Face', 6], ['Patagonia', 5]]),
      floor: 10,
    })
    // How the talk differs before who shapes it (the preview's order).
    expect(b.groups.map((g) => [g.rival, g.findings.map((f) => f.kindWords)])).toEqual([
      ['Cotopaxi', ['how the talk differs', 'a topic it holds']],
    ])
    const ordered = buildFindings({
      rivals: ['Cotopaxi'],
      findings: [
        { id: 'f2', rival: 'Cotopaxi', category: 'topic_ownership', title: 'Family Travel Psych is shaping the family-travel bag checklist', quote: null, seen: null },
        { id: 'f1', rival: 'Cotopaxi', category: 'sentiment_differential', title: 'Organization talk becomes trip-readiness scrutiny around Cotopaxi', quote: null, seen: null },
        { id: 'f3', rival: 'Cotopaxi', category: 'content_gap', title: 'a', quote: null, seen: null, impact: 'high' },
      ],
      videos: new Map([['Cotopaxi', 32]]),
      floor: 10,
    })
    expect(ordered.groups[0].findings.map((f) => f.id)).toEqual(['f3', 'f1', 'f2'])
    expect(noFindingLine(b, 'Freitag')).toBe('Freitag has fewer than 10 videos in the last 90 days, too few to set against the category.')
    expect(noFindingLine({ ...b, thin: [] }, 'Freitag')).toBe('The latest update did not set Freitag against the category.')
  })

  it('holds back the kinds whose titles are the model’s shorthand (default of 29 Sep, finish-list item 20)', () => {
    const b = buildFindings({
      rivals: ['Cotopaxi'],
      findings: [
        { id: 'f1', rival: 'Cotopaxi', category: 'content_gap', title: 'Organization, measurements, and packing proof', quote: null, seen: null },
        { id: 'f2', rival: 'Cotopaxi', category: 'engagement_benchmark', title: 'Shopping-mode responses versus affiliation-mode responses', quote: null, seen: null },
        { id: 'f3', rival: 'Cotopaxi', category: 'notable_account', title: 'InsaneWaves translates utility into shopper language', quote: null, seen: null },
      ],
      videos: new Map([['Cotopaxi', 32]]),
      floor: 10,
    })
    expect(b.groups[0].findings.map((f) => f.id)).toEqual(['f1'])
  })

  it('words every Pass C category plainly', () => {
    expect(findingKindWords('content_gap')).toBe('where the content differs')
    expect(findingKindWords('something_new')).toBe('something new')
  })
})

describe('B5 · what they post and say about themselves', () => {
  // September's own posts on staging (competitor_owned, uploaded in the
  // month): Freedom of Movement 30, The North Face 23, Cotopaxi 21, Patagonia
  // 19, Freitag 14, Old School 8, Rareform 1.
  const POSTS: [string, number][] = [['Freedom of Movement', 30], ['The North Face', 23], ['Cotopaxi', 21], ['Patagonia', 19], ['Freitag', 14], ['Old School', 8], ['Rareform', 1]]
  const census = (name: string, posts: number, claims: { id: string; post: number; claim: string }[] = []) => ownPostCensus({
    month: '2026-09-01',
    audience: `competitor:${name}`,
    audienceLabel: name,
    videos: Array.from({ length: posts }, (_, i) => ({ id: `${name}-${i}`, upload_date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, comments_count: 0, hook_style: null, classified_type: null })),
    claims: claims.map((c) => ({ id: c.id, source_video_id: `${name}-${c.post}`, entity: 'competitor', claim: c.claim, quote: '' })),
    membership: [],
    echoes: [],
  })

  it('lists each brand’s posts in the month, most first', () => {
    const b = buildPosts({ month: '2026-09-01', censuses: POSTS.map(([n, p]) => census(n, p)) })
    expect(b.rows.map((r) => [r.label, r.posts])).toEqual(POSTS)
    expect(b.claims).toEqual([])
  })

  it('takes each brand’s claim carried by the most posts, in the claims read’s words (staging’s Cotopaxi and Freitag claims)', () => {
    const b = buildPosts({
      month: '2026-09-01',
      censuses: [
        census('Cotopaxi', 21, [
          { id: 'k1', post: 2, claim: 'The new 3 liter unpackable sling can hold a 16 liter day pack plus other essentials.' },
          { id: 'k2', post: 2, claim: 'Cotopaxi’s Empacable Collection features lightweight packs that fold into their own pouches for easy portability.' },
          { id: 'k3', post: 5, claim: 'Cotopaxi’s Empacable Collection features lightweight packs that fold into their own pouches for easy portability.' },
        ]),
        census('Freitag', 14, [{ id: 'k4', post: 0, claim: 'The Lassie is a smaller version of Freitag Heritage bags, suitable for spontaneous shopping.' }]),
      ],
    })
    expect(b.claims.map((c) => [c.label, c.posts.k, c.posts.n, c.claim.slice(0, 32)])).toEqual([
      ['Cotopaxi', 2, 21, 'Cotopaxi’s Empacable Collection '],
      ['Freitag', 1, 14, 'The Lassie is a smaller version '],
    ])
    expect(levelWords(2, 21)).toBe('2 of 21')
  })
})

describe('B6 · how the market makes content', () => {
  // The playbook of Competitive's fixture (Össur's September, read read-only
  // from staging on 18 Sep): the category's column only.
  it('keeps the category’s side only, its rows most first, with how many were read for format', () => {
    const p = competitiveFixture().playbook!
    const side = p.formats.sides.find((x) => x.audience === 'industry-other')!
    const c = buildContent({ month: '2026-09-01', formats: p.formats, hooks: p.hooks, audience: 'industry-other' })
    expect(c?.read).toBe(side.of)
    expect(c?.published).toBe(side.published)
    expect(c?.formats.length).toBeGreaterThan(0)
    expect(c?.formats.length).toBeLessThanOrEqual(5)
    expect(c?.formats.every((r) => r.n === side.of)).toBe(true)
    expect(c?.formats.map((r) => r.k)).toEqual([...c!.formats.map((r) => r.k)].sort((a, b) => b - a))
    expect(buildContent({ month: '2026-09-01', formats: p.formats, hooks: p.hooks, audience: 'competitor:Nobody' })).toBeNull()
  })
})

describe('B7 · share of what our searches found', () => {
  const RIVALS = [{ name: 'Ottobock', audience: 'competitor:Ottobock' }]
  it('prints each brand’s videos on the panel, of the panel’s videos (Össur’s panel on staging)', () => {
    const aug = buildShare({ month: '2026-08-01', stats: [{ audience: 'client', panelVideos: 13 }, { audience: 'competitor:Ottobock', panelVideos: 10 }, { audience: 'industry-other', panelVideos: 122 }], rivals: RIVALS, startsWith: null })
    expect(aug.rows).toEqual([{ audience: 'competitor:Ottobock', label: 'Ottobock', k: 10, n: 145 }])
    expect(levelWords(10, 145)).toBe('7%')
    const sep = buildShare({ month: '2026-09-01', stats: [{ audience: 'client', panelVideos: 14 }, { audience: 'competitor:Ottobock', panelVideos: 8 }, { audience: 'industry-other', panelVideos: 55 }], rivals: RIVALS, startsWith: null })
    expect(levelWords(sep.rows![0].k, sep.rows![0].n)).toBe('8 of 77')
  })

  it('waits for the first panel, naming the update it freezes with, or says the month is not read', () => {
    const waiting = buildShare({ month: '2026-09-01', stats: null, rivals: RIVALS, startsWith: '2026-10-04T04:00:00.000Z' })
    expect(waiting.rows).toBeNull()
    expect(shareWaiting(waiting)).toBe('Starts with the 4 Oct update')
    expect(shareWaiting(buildShare({ month: '2026-09-01', stats: [], rivals: RIVALS, startsWith: null }))).toBe('Not read for September.')
  })
})
