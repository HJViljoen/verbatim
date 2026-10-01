import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { surface } from '@/lib/nav'
import { CompetitiveSurfacePage } from '../index'
import { brandsFixture, ossurBrandsFixture } from '../brands/fixture'
import { CompetitivePage, competitiveBlocks } from './index'
import { designBrands, designFixture } from './fixture'

// The Competitive page against the approved artboard (Page-Competitive.dc.html,
// pages build 1 Oct), on the artboard's own Sealand figures, and against the
// client rules: nothing about how it is made, only what has something to say,
// bars against 100%, no left stripes, no em dash.

// `renderText` puts a space at every tag edge; a comma never takes one.
const text = (node: Parameters<typeof render>[0]) => renderText(node).replace(/\s+/g, ' ').replace(/ ,/g, ',')
const STATES = [designFixture(), brandsFixture(), brandsFixture(false), ossurBrandsFixture()]

describe('Competitive · the artboard', () => {
  it('prints the artboard’s blocks in its order, with its words', () => {
    const t = text(<CompetitivePage data={designFixture()} />)
    const order = [
      surface('competitive').label,
      'Brands in your market',
      'Videos that named the brand unprompted, September so far',
      'Patagonia 13 videos',
      'The North Face 11 videos',
      'Cotopaxi 4 videos',
      'Freitag 2 videos',
      'Rareform 1 video',
      'Sealand You 1 video',
      'Not named unprompted in September: Freedom of Movement, Old School.',
      'A brand in full',
      'Videos about each brand you track, last 90 days (30 Jun to 27 Sep)',
      'Patagonia 22 Cotopaxi 17 The North Face 9 Freitag 6 Freedom of Movement 1',
      'No videos in the last 90 days: Old School, Rareform.',
      'Cotopaxi in full',
      'What people did in the comments, of its 17 videos',
      'Praised a bag 12 Asked a question 12 Said they want to buy 12 Complained about something 6 Wished for something 2 Said they’re switching 2 Said who they are 1',
      'Said about Cotopaxi',
      '“I second cotopaxi. I have their duffel and have had their allpa backpack and both are solid” Reddit · 23 Sep · Cotopaxi',
      '“Cotopaxi is ok but way overpriced.',
      'Reddit · 22 Sep · Cotopaxi',
      'Asked under their content',
      '12 of its videos carry a question. Asked most:',
      'Questions about bag size and brand Cotopaxi 6 videos',
      'Confusion over bag measurements Cotopaxi 1 video',
      'Where a rival’s talk differs',
      'Set against what your market says about you',
      'Cotopaxi where the content differs',
      'Organization, measurements, and packing proof',
      'Cotopaxi and other bags in your market, set against Sealand',
      'Patagonia where it stands out',
      'Ethics paired with proven longevity',
      'Patagonia, set against Sealand',
      'What they post, and what they say about themselves',
      'Posts on their own accounts in September',
      'Brand Posted What they say about themselves',
      'Freedom of Movement Instagram, TikTok 50 posts',
      'Patagonia Instagram, TikTok, YouTube 38 posts',
      'Rareform TikTok 1 post',
      'What works in your market’s videos',
      'Other bags in your market',
      'Story videos draw the strongest response of the common formats, 3.0 times the engagement of the median video. Tutorials, the second most common format, draw 1.4 times.',
      'How they are made',
      'Share of the 2,623 category videos posted in September with a recognisable format',
      'Share Engagement Promotional 28% 2.3× Tutorial 21% 1.4× Story 13% 3.0× Review 13% 2.2× Educational 10% 1.5× How-to 4% 1.9×',
      'How they open',
      'Share of the 2,439 with a recognisable opening',
      'Share Engagement Bold claim 44% 1.6× Personal story 32% 2.5× Question 9% 1.8× Demonstration 7% 1.5× Listicle 5% 1.9× Statistic 1% 5.7×',
    ]
    let at = 0
    for (const words of order) {
      const i = t.indexOf(words, at)
      expect(i, `"${words}" after position ${at} in: ${t.slice(at, at + 200)}`).toBeGreaterThanOrEqual(0)
      at = i + words.length
    }
  })

  it('keeps the copy contract in every state', () => {
    for (const data of STATES) assertCopyContract(render(<CompetitiveSurfacePage data={data} />))
  })

  it('draws every bar against 100%, never against the top row', () => {
    const markup = render(<CompetitivePage data={designFixture()} />)
    // Cotopaxi's 12 of 17, and the category's promotional 737 of 2,623.
    expect(markup).toContain(`width:${(100 * 12) / 17}%`)
    expect(markup).toContain(`width:${(100 * 737) / 2623}%`)
    expect(markup).not.toContain('width:100%')
  })

  it('prints no left stripe, no em dash, no emoji and nothing about how it is made', () => {
    for (const data of STATES) {
      const markup = render(<CompetitiveSurfacePage data={data} />)
      const t = text(<CompetitiveSurfacePage data={data} />)
      expect(markup).not.toMatch(/border-l(?:-|\b)|border-left/)
      expect(t).not.toContain('—')
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(t).not.toMatch(/\bupdate\b|our searches|searches found|not counted yet|as at|Export|in all\b|how sound|we read|gathered|so far ·/i)
    }
  })

  it('cuts the name block, the share of what our searches found, and Export', () => {
    for (const data of STATES) {
      const t = text(<CompetitiveSurfacePage data={data} />)
      expect(t).not.toContain('Your name in your market')
      expect(t).not.toContain('Share of what our searches found')
      expect(t).not.toContain('Export')
    }
  })

  it('reads "September" once the month has ended', () => {
    const data = designFixture()
    const ended = { ...data, reading: data.reading ? { ...data.reading, state: 'ended' as const } : data.reading }
    const t = text(<CompetitivePage data={ended} />)
    expect(t).toContain('Videos that named the brand unprompted, September Patagonia')
  })
})

describe('Competitive · only what has something to say', () => {
  it('draws the five blocks where each has something', () => {
    expect(competitiveBlocks(designBrands(), 'Sealand')).toEqual(['list', 'pane', 'findings', 'posts', 'works'])
  })

  it('omits each block with nothing to show, and says nothing in its place', () => {
    const empty = designFixture({
      topics: null, name: null,
      inFull: { window: { from: '2026-06-30', to: '2026-09-28' }, rows: [], selected: null },
      asked: null, saidAbout: null,
      findings: { groups: [], thin: [], floor: 10 },
      posts: { month: '2026-09-01', rows: [], claims: [] },
      works: null,
    })
    expect(competitiveBlocks(empty.brands!, 'Sealand')).toEqual([])
    expect(text(<CompetitivePage data={empty} />).trim()).toBe(surface('competitive').label)
  })

  it('draws the pane without its right column where nothing is said or asked', () => {
    const t = text(<CompetitivePage data={designFixture({ saidAbout: null, asked: null })} />)
    expect(t).toContain('Cotopaxi in full')
    expect(t).not.toContain('Said about')
    expect(t).not.toContain('Asked under their content')
  })

  it('prints the title alone with nothing read', () => {
    expect(text(<CompetitiveSurfacePage data={null} />).trim()).toBe(surface('competitive').label)
  })

  it('a finding with no client side ends at its brands', () => {
    const b = designBrands()
    const g = b.findings.groups[1]
    const data = designFixture({ findings: { ...b.findings, groups: [{ ...g, findings: [{ ...g.findings[0], about: { brands: ['Patagonia'], market: false, client: false } }] }] } })
    const t = text(<CompetitivePage data={data} />)
    expect(t).toContain('Cotopaxi and Patagonia What they post')
    expect(t).not.toContain('set against')
  })
})
