import { readingMonthFor, scheduledUpdateAfter } from '@/lib/reading/reading-month'
import type { BrandsPageData, TopicRow } from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import { competitiveFixture } from '../fixture'

// The Competitive page as the approved artboard draws it (Page-Competitive.dc.
// html, pages build 1 Oct): Sealand's real figures from the design's own data
// (scratchpad design/pages3_data.json and pages_rev_data.json: the live brand
// read for September, the ninety days 30 Jun to 27 Sep, the 27 Sep run's Pass C
// findings, September's own posts and their claims, and the category's
// September formats and openings with This week's engagement method).

const UPDATES = ['2026-09-13T06:20:00.000Z', '2026-09-20T06:20:00.000Z', '2026-09-27T06:20:00.000Z']

const reading = () => readingMonthFor({
  now: '2026-09-28T08:30:00.000Z',
  updates: UPDATES,
  videosByMonth: new Map([['2026-08-01', 377], ['2026-09-01', 852]]),
  firstRunMonth: '2026-06-01',
  nextUpdateAfter: scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' }),
})

const counted = (label: string, k: number): TopicRow => ({ brandKey: label.toLowerCase(), label, count: 'counted', kAny: k, kOrganic: k, prevK: null })
const none = (label: string): TopicRow => ({ brandKey: label.toLowerCase(), label, count: 'none', kAny: null, kOrganic: null, prevK: null })
const href = (name: string) => `/dashboard/competitive?vs=${encodeURIComponent(name)}`
const filed = (label: string, videos: number, selected = false) => ({ audience: `competitor:${label}`, label, videos, comments: 0, href: href(label), selected })

export function designBrands(): BrandsPageData {
  return {
    month: '2026-09-01',
    prevMonth: null,
    noun: 'bags',
    name: { month: '2026-09-01', counted: { n: 852, k: 1, ownPosts: 8, ownPostComments: 0, ownPostCommentPosts: 0 } },
    topics: {
      month: '2026-09-01', prevMonth: null, n: 852, nOrganic: 672, prevN: null,
      tracked: [counted('Patagonia', 13), counted('The North Face', 11), counted('Cotopaxi', 4), counted('Freitag', 2), counted('Rareform', 1), none('Freedom of Movement'), none('Old School')],
      watched: null, chip: null, read: 'live',
    },
    inFull: {
      window: { from: '2026-06-30', to: '2026-09-28' },
      rows: [filed('Patagonia', 22), filed('Cotopaxi', 17, true), filed('The North Face', 9), filed('Freitag', 6), filed('Freedom of Movement', 1), filed('Old School', 0), filed('Rareform', 0)],
      selected: {
        audience: 'competitor:Cotopaxi', label: 'Cotopaxi', videos: 17,
        kinds: [
          { kind: 'praise', label: 'Praising it', videos: 12 },
          { kind: 'question', label: 'Asking how it works', videos: 12 },
          { kind: 'purchase_intent', label: 'Ready to buy', videos: 12 },
          { kind: 'pain_point', label: 'Hitting a problem', videos: 6 },
          { kind: 'feature_request', label: 'Asking for something', videos: 2 },
          { kind: 'switching_signal', label: 'Leaving for something else', videos: 2 },
          { kind: 'demographic_signal', label: 'Saying who they are', videos: 1 },
        ],
      },
    },
    saidAbout: {
      audience: 'competitor:Cotopaxi', label: 'Cotopaxi',
      quotes: [
        { ref: 'c:design-1', text: 'I second cotopaxi. I have their duffel and have had their allpa backpack and both are solid', lang: 'en', english: null, platform: 'reddit', date: '2026-09-23T10:00:00.000Z' },
        { ref: 'c:design-2', text: 'Cotopaxi is ok but way overpriced. A backpack that expensive should be lighter, more water resistant and have waterproof zippers imo.', lang: 'en', english: null, platform: 'reddit', date: '2026-09-22T10:00:00.000Z' },
      ],
    },
    asked: {
      audience: 'competitor:Cotopaxi', label: 'Cotopaxi', window: { from: '2026-06-30', to: '2026-09-28' }, videos: 12,
      byMonth: [],
      themes: [
        { registryId: 'design-asked-1', label: 'Questions about bag size and brand', videos: 6 },
        { registryId: 'design-asked-2', label: 'Confusion over bag measurements', videos: 1 },
      ],
      all: false, more: 0,
    },
    findings: {
      groups: [
        {
          rival: 'Patagonia',
          findings: [{
            id: 'design-f2', category: 'competitive_threat', kindWords: 'where it stands out', impact: 'medium',
            title: 'Ethics paired with proven longevity',
            body: 'Patagonia earns audience trust from a mix of ethical activism and proof that products hold up over time. Sealand receives praise for mission and local values, but the comparison does not show the same audience language around long-life performance. That pairing lets Patagonia own both the values conversation and the quality reassurance behind premium consideration.',
            about: { brands: [], market: false, client: true },
            quote: null, seen: null,
          }],
        },
        {
          rival: 'Cotopaxi',
          findings: [{
            id: 'design-f1', category: 'content_gap', kindWords: 'where the content differs', impact: 'high',
            title: 'Organization, measurements, and packing proof',
            body: 'Cotopaxi and the wider category attract audience talk about compartments, packing efficiency, bag size, and missing dimensions, while Sealand commentary does not surface equivalent product-proof questions or praise. This matters because shoppers want to picture laptop fit, pocket layout, and whether a bag works within packing constraints before they buy.',
            about: { brands: [], market: true, client: true },
            quote: null, seen: null,
          }],
        },
      ],
      thin: [], floor: 10,
    },
    posts: {
      month: '2026-09-01',
      rows: [
        { audience: 'competitor:Freedom of Movement', label: 'Freedom of Movement', posts: 50, platforms: ['Instagram', 'TikTok'], said: [
          { id: 'p1', claim: 'Freedom of Movement has opened a newly renovated store in Hyde Park with a fresh and attractive look.' },
          { id: 'p2', claim: 'The store features the latest spring collection with colorful clothing designed to keep customers free and moving.' },
        ] },
        { audience: 'competitor:Patagonia', label: 'Patagonia', posts: 38, platforms: ['Instagram', 'TikTok', 'YouTube'], said: [
          { id: 'p3', claim: "The spring '92 line has a tightened and more focused collection of styles in shorts, pants, and shirts." },
          { id: 'p4', claim: 'Patagonia is focused on refining and improving their product lines with new fabrics and styles each season.' },
        ] },
        { audience: 'competitor:Cotopaxi', label: 'Cotopaxi', posts: 29, platforms: ['Instagram', 'TikTok', 'YouTube'], said: [
          { id: 'p5', claim: 'The new 3 liter unpackable sling can hold a 16 liter day pack plus other essentials.' },
          { id: 'p6', claim: "Cotopaxi's Empacable Collection features lightweight packs that fold into their own pouches for easy portability." },
        ] },
        { audience: 'competitor:The North Face', label: 'The North Face', posts: 29, platforms: ['Instagram', 'TikTok', 'YouTube'], said: [
          { id: 'p7', claim: "Norman's 13 is an extremely challenging and remote endurance adventure combining climbing and running across all 13 Sierra Nevada peaks over 14,000 feet." },
        ] },
        { audience: 'competitor:Freitag', label: 'Freitag', posts: 20, platforms: ['Instagram', 'TikTok'], said: [] },
        { audience: 'competitor:Old School', label: 'Old School', posts: 16, platforms: ['Instagram', 'TikTok'], said: [] },
        { audience: 'competitor:Rareform', label: 'Rareform', posts: 1, platforms: ['TikTok'], said: [] },
      ],
      claims: [],
    },
    content: null,
    share: { month: '2026-09-01', rows: null, startsWith: null },
    works: {
      month: '2026-09-01', formatsOf: 2623, hooksOf: 2439,
      formats: [
        { key: 'promotional', label: 'Promotional', k: 737, multiple: 2.26 },
        { key: 'tutorial', label: 'Tutorial', k: 538, multiple: 1.4 },
        { key: 'story', label: 'Story', k: 348, multiple: 3.02 },
        { key: 'review', label: 'Review', k: 338, multiple: 2.24 },
        { key: 'educational', label: 'Educational', k: 254, multiple: 1.46 },
        { key: 'how-to', label: 'How-to', k: 112, multiple: 1.88 },
      ],
      hooks: [
        { key: 'bold-claim', label: 'Bold claim', k: 1069, multiple: 1.64 },
        { key: 'personal-story', label: 'Personal story', k: 782, multiple: 2.49 },
        { key: 'question', label: 'Question', k: 223, multiple: 1.83 },
        { key: 'demonstration', label: 'Demonstration', k: 182, multiple: 1.46 },
        { key: 'listicle', label: 'Listicle', k: 111, multiple: 1.85 },
        { key: 'statistic', label: 'Statistic', k: 23, multiple: 5.71 },
      ],
    },
  }
}

/** The artboard's page: Sealand, September so far. */
export function designFixture(over: Partial<BrandsPageData> = {}): CompetitiveSurfaceData {
  return competitiveFixture({ brand: 'Sealand', reading: reading(), brands: { ...designBrands(), ...over } })
}
