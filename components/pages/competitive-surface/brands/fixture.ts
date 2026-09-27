import { SEALAND_CLIENT_ID } from '@/lib/config'
import { readingMonthFor, scheduledUpdateAfter } from '@/lib/reading/reading-month'
import { AUGUST_BRANDS, SEPTEMBER_BRANDS, STAND_IN_CHECKS } from '@/lib/test/brands-fixture'
import {
  buildNameBlock, buildShare, buildTopics,
  type BrandMonthIn, type BrandsPageData,
} from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import { competitiveFixture } from '../fixture'

// The Brands page's fixtures (market-first WP3.5). EVERY FIGURE IS A STAGING
// READING, taken read-only through the page's own loader
// (`loadCompetitiveSurface(scope, { brands: true })` on zfmxrrugaihxpubunleu,
// 27 Sep 2026, clocks 27 Sep and 11 Oct): the ninety days 23 Jun to 20 Sep
// (Sealand) and 16 Jun to 13 Sep (Össur, paused), the 20 Sep and 13 Sep
// updates' Pass C findings and the quotes the loader picked for them,
// September's own posts and the claims read from them, the playbook's
// category column, and Össur's attention panel. The brand counts are
// brand-mentions' 27 Sep plan (lib/test/brands-fixture.ts); staging's hand
// check is not production's, so the counted state borrows the stand-in checks
// that file defines, and the shipped state prints "not counted yet".

const SEALAND_UPDATES = ['2026-09-09T12:31:15.553Z', '2026-09-10T07:17:02.291Z', '2026-09-20T08:33:47.358Z']
const SUNDAY = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })

const sealandReading = () => readingMonthFor({
  now: '2026-09-27T08:30:00.000Z',
  updates: SEALAND_UPDATES,
  videosByMonth: new Map([['2026-08-01', 377], ['2026-09-01', 654]]),
  firstRunMonth: '2026-06-01',
  nextUpdateAfter: SUNDAY,
})

const monthIn = (sep: typeof SEPTEMBER_BRANDS[number]): BrandMonthIn => {
  const aug = AUGUST_BRANDS.find((a) => a.brandKey === sep.brandKey)
  return { brandKey: sep.brandKey, label: sep.label, hasRows: sep.hasRows, curr: { kAny: sep.kAny, kOrganic: sep.kOrganic }, prev: aug ? { kAny: aug.kAny } : null }
}

const CHIP = 'not read as a change: we changed our searches in September'

/** Sealand's Brands page on staging at 27 Sep. `counted`: production's hand
 *  check stood in by `STAND_IN_CHECKS` (Cotopaxi, Patagonia, The North Face
 *  and your name); else every brand and your name "not counted yet", as the
 *  page ships until the check lands. */
export function sealandBrands(counted = true): BrandsPageData {
  const checks = counted ? STAND_IN_CHECKS : undefined
  return {
    month: '2026-09-01',
    prevMonth: '2026-08-01',
    name: buildNameBlock({
      clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, hasRows: true, outside: [], ownPosts: 8,
      ownPostComments: { comments: 1, posts: 1 }, checks,
    }),
    topics: buildTopics({
      clientId: SEALAND_CLIENT_ID, month: '2026-09-01', prevMonth: '2026-08-01', n: 654, nOrganic: 516, prevN: 377,
      tracked: SEPTEMBER_BRANDS.map(monthIn), watched: null, chip: CHIP, read: 'live', checks,
    }),
    inFull: {
      window: { from: '2026-06-23', to: '2026-09-21' },
      rows: [
        { audience: 'competitor:Cotopaxi', label: 'Cotopaxi', videos: 32, comments: 613, href: '/dashboard/competitive?vs=Cotopaxi', selected: true },
        { audience: 'competitor:Freitag', label: 'Freitag', videos: 8, comments: 133, href: '/dashboard/competitive?vs=Freitag', selected: false },
        { audience: 'competitor:The North Face', label: 'The North Face', videos: 6, comments: 44, href: '/dashboard/competitive?vs=The+North+Face', selected: false },
        { audience: 'competitor:Patagonia', label: 'Patagonia', videos: 5, comments: 122, href: '/dashboard/competitive?vs=Patagonia', selected: false },
      ],
      selected: {
        audience: 'competitor:Cotopaxi', label: 'Cotopaxi', videos: 32,
        kinds: [
          { kind: 'praise', label: 'Praising it', videos: 25 },
          { kind: 'question', label: 'Asking how it works', videos: 21 },
          { kind: 'purchase_intent', label: 'Ready to buy', videos: 20 },
          { kind: 'pain_point', label: 'Hitting a problem', videos: 11 },
          { kind: 'objection', label: 'Pushing back', videos: 7 },
          { kind: 'feature_request', label: 'Asking for something', videos: 5 },
          { kind: 'switching_signal', label: 'Leaving for something else', videos: 5 },
          { kind: 'demographic_signal', label: 'Saying who they are', videos: 1 },
        ],
      },
    },
    asked: {
      audience: 'competitor:Cotopaxi', label: 'Cotopaxi', window: { from: '2026-06-23', to: '2026-09-21' }, videos: 21,
      byMonth: [{ month: '2026-08-01', videos: 13 }, { month: '2026-09-01', videos: 8 }],
      themes: [
        { registryId: 'bffa8059-80d0-49ad-ba49-181baa7bd45d', label: 'Carry-on size compliance anxiety', videos: 12 },
        { registryId: '8fa08a79-3c6c-4444-812a-6ce8cd650df8', label: 'Questions on product details', videos: 5 },
        { registryId: 'ef6bdcdc-5dd1-4cd9-966a-1d0f0f244019', label: 'Feature-by-feature bag scrutiny', videos: 2 },
      ],
      all: false,
      more: 3,
    },
    findings: {
      groups: [{
        rival: 'Cotopaxi',
        findings: [
          {
            id: '08ee298c-980f-4b32-a0be-92ec0822aa32', category: 'sentiment_differential', kindWords: 'how the talk differs',
            title: 'Durability praise does not remove carry-comfort concern',
            quote: { ref: 'c:0a485ab7-9f1d-4d35-964d-808fee1b42cc', text: 'I have a Cotopaxi backpack that’s about 5 year old now. I’ve used it a ton for hiking, day pack, swimming gear, whatever. I’m happy with it. It shows no signs of wear.', lang: 'en', english: null },
            seen: { months: 2, of: 6 },
          },
          {
            id: 'a544fce4-ffa4-4098-9352-b61b77df85a6', category: 'sentiment_differential', kindWords: 'how the talk differs',
            title: 'Organization talk becomes trip-readiness scrutiny around Cotopaxi',
            quote: { ref: 'c:13192a76-bab9-4aec-acf2-5cb541dde56b', text: 'i was just wondering if anyone had personal experiences with it.', lang: 'en', english: null },
            seen: { months: 3, of: 6 },
          },
          {
            id: 'a802998b-d8c0-4ac4-bb24-19d6782244a2', category: 'notable_account', kindWords: 'an account shaping the talk',
            title: 'Family Travel Psych is shaping the family-travel bag checklist',
            quote: { ref: 'c:b07bc999-5612-46c8-9c51-4d24c2f775a6', text: 'Cotopaxi seems easier to use, with the large opening, but the material does not look as durable as the other one.', lang: 'en', english: null },
            seen: { months: 2, of: 6 },
          },
        ],
      }],
      thin: ['Freitag', 'The North Face', 'Patagonia'],
      floor: 10,
    },
    posts: {
      month: '2026-09-01',
      rows: [
        { audience: 'competitor:Freedom of Movement', label: 'Freedom of Movement', posts: 30 },
        { audience: 'competitor:The North Face', label: 'The North Face', posts: 23 },
        { audience: 'competitor:Cotopaxi', label: 'Cotopaxi', posts: 21 },
        { audience: 'competitor:Patagonia', label: 'Patagonia', posts: 19 },
        { audience: 'competitor:Freitag', label: 'Freitag', posts: 14 },
        { audience: 'competitor:Old School', label: 'Old School', posts: 8 },
        { audience: 'competitor:Rareform', label: 'Rareform', posts: 1 },
      ],
      claims: [
        { audience: 'competitor:Freedom of Movement', label: 'Freedom of Movement', id: '56155e4b-6ba9-4cf9-9965-acb29d4ea4a0', claim: 'Freedom of Movement has opened a newly renovated store in Hyde Park with a fresh and attractive look.', posts: { k: 1, n: 30 } },
        { audience: 'competitor:The North Face', label: 'The North Face', id: '1657d00a-5e9e-4d30-a6a9-bd632b27ee06', claim: "Norman's 13 is an extremely challenging and remote endurance adventure combining climbing and running across all 13 Sierra Nevada peaks over 14,000 feet.", posts: { k: 1, n: 23 } },
        { audience: 'competitor:Cotopaxi', label: 'Cotopaxi', id: '2ccfebca-f5db-46cb-b498-35ebee4240f4', claim: 'The new 3 liter unpackable sling can hold a 16 liter day pack plus other essentials.', posts: { k: 1, n: 21 } },
        { audience: 'competitor:Patagonia', label: 'Patagonia', id: '0b6e2461-5f14-4c0d-8e1a-a0caf8f80a5d', claim: "The spring '92 line has a tightened and more focused collection of styles in shorts, pants, and shirts.", posts: { k: 1, n: 19 } },
      ],
    },
    content: {
      month: '2026-09-01', read: 1947, published: 2192,
      formats: [
        { key: 'promotional', label: 'Promotional', k: 531, n: 1947 },
        { key: 'tutorial', label: 'Tutorial', k: 391, n: 1947 },
        { key: 'story', label: 'Story', k: 260, n: 1947 },
        { key: 'review', label: 'Review', k: 256, n: 1947 },
        { key: 'educational', label: 'Educational', k: 201, n: 1947 },
      ],
      openings: [
        { key: 'bold-claim', label: 'Bold claim', k: 746, n: 1776 },
        { key: 'personal-story', label: 'Personal story', k: 582, n: 1776 },
        { key: 'question', label: 'Question', k: 172, n: 1776 },
        { key: 'demonstration', label: 'Demonstration', k: 144, n: 1776 },
        { key: 'listicle', label: 'Listicle', k: 79, n: 1776 },
      ],
    },
    share: buildShare({ month: '2026-09-01', stats: null, rivals: [], startsWith: '2026-10-04T04:00:00.000Z' }),
  }
}

/** Össur's Brands page on staging at 11 Oct (paused since the 13 Sep update):
 *  no brand rule, so no name and no brand counts; Ottobock over the ninety days
 *  ending on 13 Sep; its panel. */
export function ossurBrands(): BrandsPageData {
  return {
    month: '2026-09-01',
    prevMonth: null,
    name: null,
    topics: null,
    inFull: {
      window: { from: '2026-06-16', to: '2026-09-14' },
      rows: [{ audience: 'competitor:Ottobock', label: 'Ottobock', videos: 88, comments: 2034, href: '/dashboard/competitive?vs=Ottobock', selected: true }],
      selected: {
        audience: 'competitor:Ottobock', label: 'Ottobock', videos: 88,
        kinds: [
          { kind: 'praise', label: 'Praising it', videos: 53 },
          { kind: 'question', label: 'Asking how it works', videos: 38 },
          { kind: 'pain_point', label: 'Hitting a problem', videos: 26 },
          { kind: 'purchase_intent', label: 'Ready to buy', videos: 24 },
          { kind: 'demographic_signal', label: 'Saying who they are', videos: 17 },
          { kind: 'feature_request', label: 'Asking for something', videos: 4 },
          { kind: 'switching_signal', label: 'Leaving for something else', videos: 2 },
          { kind: 'objection', label: 'Pushing back', videos: 1 },
          { kind: 'buying_trigger', label: 'What made them look', videos: 1 },
        ],
      },
    },
    asked: {
      audience: 'competitor:Ottobock', label: 'Ottobock', window: { from: '2026-06-16', to: '2026-09-14' }, videos: 38,
      byMonth: [{ month: '2026-07-01', videos: 3 }, { month: '2026-08-01', videos: 20 }, { month: '2026-09-01', videos: 10 }],
      themes: [
        { registryId: 'd322d060-65fa-4229-b4fa-42c4dec71baf', label: 'Questions about activity use', videos: 8 },
        { registryId: 'f2bcd457-9ad7-4a02-b45e-ff53b45c1db0', label: 'Questions about knee specifications', videos: 8 },
        { registryId: 'f5aea948-08a1-4787-829f-8063bc34cdde', label: 'Where to get service', videos: 4 },
      ],
      all: false,
      more: 10,
    },
    findings: {
      groups: [{
        rival: 'Ottobock',
        findings: [
          {
            id: '57155fa4-23cc-43cb-96be-645c2d3aaec0', category: 'sentiment_differential', kindWords: 'how the talk differs',
            title: 'Rehabilitation carries a warmer tone around Ottobock than around Össur',
            quote: { ref: 'c:2f29107e-31d4-48ae-b555-5cb3a2777fd8', text: 'Que você chegue em lugares inimagináveis na sua profissão amiga,que felicidade ver a sua evolução e ver de pertinho tudo isso ❤️🥹', lang: 'pt', english: 'May you reach unimaginable places in your profession, friend, what a joy to see your progress and to see all this up close ❤️🥹' },
            seen: { months: 5, of: 6 },
          },
          {
            id: '959a4f77-30c5-4072-95a5-7e6a8c75754f', category: 'content_gap', kindWords: 'where the content differs',
            title: 'Scenario-based knee education is landing outside Össur',
            quote: { ref: 'c:13528a88-e45a-437b-bd6c-9ef9cff582fa', text: 'Any tips on using my c-leg', lang: 'en', english: null },
            seen: { months: 4, of: 6 },
          },
          {
            id: '61a4223f-9355-4f3d-854e-3b7fe4fc1022', category: 'content_gap', kindWords: 'where the content differs',
            title: 'Family and pediatric pathways are more visible around Ottobock and industry creators',
            quote: { ref: 'c:41b562da-30e0-40a7-8c23-49f00f49b952', text: 'Lo estás haciendo excelente!!! ❤️', lang: 'es', english: 'You are doing excellent!!! ❤️' },
            seen: { months: 6, of: 6 },
          },
        ],
      }],
      thin: [],
      floor: 10,
    },
    posts: { month: '2026-09-01', rows: [], claims: [] },
    content: {
      month: '2026-09-01', read: 687, published: 757,
      formats: [
        { key: 'story', label: 'Story', k: 280, n: 687 },
        { key: 'educational', label: 'Educational', k: 113, n: 687 },
        { key: 'promotional', label: 'Promotional', k: 105, n: 687 },
        { key: 'testimonial', label: 'Testimonial', k: 73, n: 687 },
        { key: 'entertainment', label: 'Entertainment', k: 54, n: 687 },
      ],
      openings: [
        { key: 'personal-story', label: 'Personal story', k: 309, n: 647 },
        { key: 'bold-claim', label: 'Bold claim', k: 169, n: 647 },
        { key: 'question', label: 'Question', k: 66, n: 647 },
        { key: 'demonstration', label: 'Demonstration', k: 38, n: 647 },
        { key: 'listicle', label: 'Listicle', k: 18, n: 647 },
      ],
    },
    share: buildShare({
      month: '2026-09-01',
      stats: [{ audience: 'client', panelVideos: 14 }, { audience: 'competitor:Ottobock', panelVideos: 8 }, { audience: 'industry-other', panelVideos: 55 }],
      rivals: [{ name: 'Ottobock', audience: 'competitor:Ottobock' }],
      startsWith: null,
    }),
  }
}

/** The page data around the Brands readings: Competitive's fixture, with
 *  Sealand's reading month where the readings are Sealand's. */
export function brandsFixture(counted = true): CompetitiveSurfaceData {
  return competitiveFixture({ brand: 'Sealand', reading: sealandReading(), brands: sealandBrands(counted) })
}

export function ossurBrandsFixture(): CompetitiveSurfaceData {
  return competitiveFixture({ brands: ossurBrands() })
}
