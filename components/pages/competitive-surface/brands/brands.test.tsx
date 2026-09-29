import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { TOPICS_NOT_READ } from '@/lib/pages/brands'
import { BRANDS_LINES, COMPETITIVE_BLOCKS, CompetitiveSurfacePage } from '../index'
import { competitiveFixture } from '../fixture'
import { competitiveRivals } from '../rivals'
import { competitiveQuestions } from '../questions'
import { competitiveOwnClaims } from '../own-claims'
import { competitivePlaybook } from '../playbook'
import { competitiveStandings } from '../standings'
import { brandsFixture, ossurBrandsFixture } from './fixture'
import { competitiveName } from './name'
import { competitiveTopics } from './topics'
import { brandsInFull } from './in-full'
import { brandsAsked } from './asked'
import { competitiveFindings } from './findings'
import { brandsPosts } from './posts'
import { brandsContent } from './content'
import { brandsShare } from './share'

// The Brands page (market-first WP3.5, deploy 5) against the approved preview
// and the 25 Sep rulings, on staging's own readings (./fixture.ts).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [brandsFixture(), brandsFixture(false), ossurBrandsFixture()]
const BRANDS_BLOCKS = [competitiveName, competitiveTopics, brandsInFull, brandsAsked, competitiveFindings, brandsPosts, brandsContent, brandsShare]
const text = (node: Parameters<typeof render>[0]) => renderText(node).replace(/\s+/g, ' ')

describe('Brands · every block, every mode, every state', () => {
  it('keeps the copy contract', () => {
    for (const block of BRANDS_BLOCKS) {
      for (const data of STATES) {
        for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
      }
    }
  })

  it('heads each block with its title alone and foots it with links alone (25 Sep rulings)', () => {
    for (const block of BRANDS_BLOCKS) {
      for (const data of STATES) {
        const markup = render(block.render(data, 'app', ctx))
        const header = /<header[^>]*>([\s\S]*?)<\/header>/.exec(markup)?.[1] ?? ''
        expect(header.replace(/<[^>]+>/g, '')).toBe(block.title)
        const footer = /<footer[^>]*>([\s\S]*?)<\/footer>/.exec(markup)?.[1] ?? ''
        // A footer holds one link, and the words of that link only.
        expect(footer.replace(/<a [\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, '').trim()).toBe('')
      }
    }
  })

  it('prints no "how sound", no em dash of its own, and "complete" nowhere', () => {
    for (const data of STATES) {
      const t = text(<CompetitiveSurfacePage data={data} />)
      expect(t).not.toMatch(/how sound/i)
      expect(t).not.toMatch(/\bcomplete\b/i)
      expect(t).not.toContain('—')
    }
  })

  it('never prints your brand against a rival: no face-off, no "(you)" row, no said-about tile', () => {
    for (const data of STATES) {
      const t = text(<CompetitiveSurfacePage data={data} />)
      expect(t).not.toContain('(you)')
      expect(t).not.toMatch(/you against|face-off/i)
    }
  })
})

describe('B1 · your name in your market', () => {
  it('prints the name line and where it came up once production has checked it', () => {
    const t = text(competitiveName.render(brandsFixture(), 'app', ctx))
    expect(t).toContain('In September your name came up in none of your market’s 654 videos.')
    expect(t).toContain('The 8 videos that name you are your own posts.')
    expect(t).toContain('Where your name came up')
    expect(t).toContain('In your market’s 654 videos 0')
    expect(t).toContain('In your own posts 8')
    expect(t).toContain('One September comment named you, under one of your own posts.')
    expect(t).toContain('See your own posts on Your moves →')
  })

  it('is "not counted yet" until then, with nothing beside it', () => {
    const t = text(competitiveName.render(brandsFixture(false), 'app', ctx))
    expect(t).toContain('Your name in your market in September: not counted yet.')
    expect(t).not.toContain('Where your name came up')
  })
})

describe('B1 · brands in your market', () => {
  it('counts each checked brand, the headline without any video our rival searches found, August beside', () => {
    const t = text(competitiveTopics.render(brandsFixture(), 'app', ctx))
    expect(t).toContain('Brands we track videos each came up in')
    expect(t).toContain('Outside our brand searches of 516')
    expect(t).toContain('In all of 654')
    expect(t).toContain('In all of 377')
    expect(t).toContain('Patagonia 13 45 24')
    expect(t).toContain('The North Face 6 36 15')
    expect(t).toContain('Cotopaxi 3 28 32')
    expect(t).toContain('Freitag not counted yet')
    expect(t).toContain('not read as a change: we changed our searches in September')
    expect(t).toContain('Ask about a brand →')
    // No watched list on staging (MF3), so no column for it.
    expect(t).not.toContain('Named, but not searched')
  })

  it('prints no figure heads and no chip over a table of brands not counted yet', () => {
    const t = text(competitiveTopics.render(brandsFixture(false), 'app', ctx))
    expect(t).not.toContain('of 516')
    expect(t).not.toContain('not read as a change')
    expect(t).toContain('Cotopaxi not counted yet')
  })

  it('says in one line that brands are not read for a tenant with no brand rule (Össur)', () => {
    expect(text(competitiveTopics.render(ossurBrandsFixture(), 'app', ctx))).toContain(TOPICS_NOT_READ)
  })
})

describe('B2 · a brand in full, last 90 days', () => {
  it('lists what was filed under each brand and reads the biggest in full, as counts', () => {
    const t = text(brandsInFull.render(brandsFixture(), 'app', ctx))
    expect(t).toContain('Filed under each brand Brand Videos Comments Cotopaxi 32 613 Freitag 8 133 The North Face 6 44 Patagonia 5 122')
    expect(t).toContain('Cotopaxi in full of its 32 videos')
    expect(t).toContain('What people did Videos Praising it 25 Asking how it works 21 Ready to buy 20 Hitting a problem 11')
    // Freitag prints plainly (the lead's R2): no homonym note on its filed counts.
    expect(t).not.toMatch(/German|Friday/)
  })

  it('lists a brand with nothing filed at zero, unlinked, saying why where we do not search for it (finish-list item 20)', () => {
    const d = brandsFixture()
    const inFull = d.brands!.inFull!
    const rows = [...inFull.rows, { audience: 'competitor:Old School', label: 'Old School', videos: 0, comments: 0, href: '/dashboard/competitive?vs=Old+School', selected: false, note: 'no search term: we read its own posts' }]
    const data = { ...d, brands: { ...d.brands!, inFull: { ...inFull, rows } } }
    const t = text(brandsInFull.render(data, 'app', ctx))
    expect(t).toContain('Old School no search term: we read its own posts 0 0')
    expect(render(brandsInFull.render(data, 'app', ctx))).not.toContain('vs=Old+School')
  })

  it('opens another brand in full from its name, in the app only', () => {
    const app = render(brandsInFull.render(brandsFixture(), 'app', ctx))
    expect(app).toContain('href="/dashboard/competitive?vs=Freitag"')
    expect(render(brandsInFull.render(brandsFixture(), 'print', ctx))).not.toContain('?vs=')
  })

  it('draws CO1 as it was on a page read without the Brands readings', () => {
    const data = competitiveFixture()
    for (const mode of MODES) expect(render(brandsInFull.render(data, mode, ctx))).toBe(render(competitiveRivals.render(data, mode, ctx)))
  })

  it('opens the brand read in full on Conversation, over the same ninety days (the preview’s footer)', () => {
    const app = render(brandsInFull.render(brandsFixture(), 'app', ctx))
    expect(text(brandsInFull.render(brandsFixture(), 'app', ctx))).toContain('Open Cotopaxi’s videos →')
    expect(app).toContain('href="https://app.verbatimintel.com/dashboard/voice?brand=Cotopaxi#board"')
    expect(text(brandsInFull.render(ossurBrandsFixture(), 'app', ctx))).toContain('Open Ottobock’s videos →')
    // The email carries it; a print has no links.
    expect(render(brandsInFull.render(brandsFixture(), 'email', ctx))).toContain('/dashboard/voice?brand=Cotopaxi#board')
    expect(render(brandsInFull.render(brandsFixture(), 'print', ctx))).not.toContain('/dashboard/voice')
  })

  it('keeps the reader’s month on the way, and names the brand the reader opened (?vs=)', () => {
    const inAugust = blockContext('', EMAIL, { month: '2026-08', vs: 'Freitag' })
    expect(render(brandsInFull.render(brandsFixture(), 'app', inAugust))).toContain('href="/dashboard/voice?month=2026-08&amp;brand=Cotopaxi#board"')
    const b = brandsFixture()
    const freitag = { ...b, brands: { ...b.brands!, inFull: { ...b.brands!.inFull, selected: { ...b.brands!.inFull.selected!, audience: 'competitor:Freitag', label: 'Freitag', videos: 8 } } } }
    const t = text(brandsInFull.render(freitag, 'app', ctx))
    expect(t).toContain('Open Freitag’s videos →')
    expect(render(brandsInFull.render(freitag, 'app', ctx))).toContain('/dashboard/voice?brand=Freitag#board')
  })

  it('draws no footer where no brand had a video in the ninety days', () => {
    const b = brandsFixture()
    const none = { ...b, brands: { ...b.brands!, inFull: { ...b.brands!.inFull, rows: [], selected: null } } }
    expect(render(brandsInFull.render(none, 'app', ctx))).not.toContain('<footer')
  })
})

describe('B3 · asked under their content', () => {
  it('counts the question videos, month by month, and the themes asked most', () => {
    const t = text(brandsAsked.render(brandsFixture(), 'app', ctx))
    expect(t).toContain('21 question videos')
    expect(t).toContain('under Cotopaxi’s content, last 90 days')
    expect(t).toContain('13 in August · 8 in September')
    expect(t).toContain('Asked most videos Carry-on size compliance anxiety 12 Questions on product details 5 Feature-by-feature bag scrutiny 2')
    // The link counts what it opens: the six question themes, not the 21
    // question videos.
    expect(t).toContain('Show all 6 →')
    expect(t).not.toContain('Show all 21')
    expect(render(brandsAsked.render(brandsFixture(), 'app', ctx))).toContain('asked=all')
  })

  it('draws CO5 as it was on a page read without the Brands readings', () => {
    const data = competitiveFixture()
    for (const mode of MODES) expect(render(brandsAsked.render(data, mode, ctx))).toBe(render(competitiveQuestions.render(data, mode, ctx)))
  })
})

describe('B4 · where a rival’s talk differs', () => {
  it('draws the picked brand’s findings as cards with their voice, and no recurrence Readiness says is not built (finish-list item 20)', () => {
    const markup = render(competitiveFindings.render(brandsFixture(), 'app', ctx))
    const t = text(competitiveFindings.render(brandsFixture(), 'app', ctx))
    expect(t).toContain('Cotopaxi against the category')
    expect(t).toContain('an account shaping the talk')
    expect(t).toContain('Durability praise does not remove carry-comfort concern')
    expect(t).not.toContain('seen in')
    expect(markup).toContain('data-slot="pass_c_finding"')
    expect(markup).toContain('data-copy="quote"')
    expect(t).toContain('Ask about Cotopaxi →')
    expect(markup).toContain('/dashboard/agent?ask=What%20does%20my%20market%20say%20about%20Cotopaxi%3F')
  })

  it('follows the brand picked above: its cards, its line and its Ask link (finish-list item 20)', () => {
    const d = brandsFixture()
    const inFull = d.brands!.inFull!
    const pick = (label: string) => ({ ...d, brands: { ...d.brands!, inFull: { ...inFull, selected: { ...inFull.selected!, label, audience: `competitor:${label}` } } } })
    const t = text(competitiveFindings.render(pick('Freitag'), 'app', ctx))
    expect(t).not.toContain('Cotopaxi against the category')
    expect(t).toContain('Freitag has fewer than 10 videos in the last 90 days, too few to set against the category.')
    expect(t).toContain('Ask about Freitag →')
    expect(competitiveFindings.quotes?.(pick('Freitag'))).toEqual([])
  })

  it('freezes each card’s voice by its comment ref', () => {
    expect(competitiveFindings.quotes?.(brandsFixture())).toEqual([
      'c:0a485ab7-9f1d-4d35-964d-808fee1b42cc', 'c:13192a76-bab9-4aec-acf2-5cb541dde56b', 'c:b07bc999-5612-46c8-9c51-4d24c2f775a6',
    ])
  })

  it('prints a non-English voice in its own words with the English beneath (Össur)', () => {
    const t = text(competitiveFindings.render(ossurBrandsFixture(), 'app', ctx))
    expect(t).toContain('Lo estás haciendo excelente!!!')
    expect(t).toContain('You are doing excellent!!!')
  })
})

describe('B5 · what they post and say about themselves', () => {
  it('lists each brand’s posts in the month and the claim most carried, as plain text over its posts', () => {
    const markup = render(brandsPosts.render(brandsFixture(), 'app', ctx))
    const t = text(brandsPosts.render(brandsFixture(), 'app', ctx))
    expect(t).toContain('Posts in September own accounts')
    expect(t).toContain('Freedom of Movement 30 The North Face 23 Cotopaxi 21 Patagonia 19 Freitag 14 Old School 8 Rareform 1')
    expect(t).toContain('What they say about themselves as they word it')
    expect(t).toContain('Freedom of Movement 1 of 30 Freedom of Movement has opened a newly renovated store in Hyde Park')
    expect(markup).toContain('data-slot="pass_a_brand_claim"')
    // A claim is never set as a quote.
    expect(markup).not.toContain('data-copy="quote"')
    expect(t).toContain('The accounts we track, in Settings →')
  })

  it('says so in one line where no brand published in the month (Össur)', () => {
    expect(text(brandsPosts.render(ossurBrandsFixture(), 'app', ctx))).toContain('No brand you track published a post in September.')
  })

  it('draws CO4 as it was on a page read without the Brands readings', () => {
    const data = competitiveFixture()
    for (const mode of MODES) expect(render(brandsPosts.render(data, mode, ctx))).toBe(render(competitiveOwnClaims.render(data, mode, ctx)))
  })
})

describe('B6 · how the market makes content', () => {
  it('prints the category’s formats and openings, each a share of those read', () => {
    const t = text(brandsContent.render(brandsFixture(), 'app', ctx))
    expect(t).toContain('The formats and openings of the category videos posted in September, counted by the day they were posted, not by September’s comments. 1,947 of the 2,192 have their format read.')
    expect(t).toContain('1,947 of the 2,192 have their format read.')
    expect(t).toContain('Format of 1,947 Promotional 27%')
    expect(t).toContain('Opening of 1,776 Bold claim 42%')
    expect(t).toContain('The Content brief →')
  })

  it('draws CO7 as it was on a page read without the Brands readings', () => {
    const data = competitiveFixture()
    for (const mode of MODES) expect(render(brandsContent.render(data, mode, ctx))).toBe(render(competitivePlaybook.render(data, mode, ctx)))
  })
})

describe('B7 · share of what our searches found', () => {
  it('waits for the first panel, naming its update (Sealand)', () => {
    const t = text(brandsShare.render(brandsFixture(), 'app', ctx))
    expect(t).toContain('Each brand’s share of the videos our searches found.')
    expect(t).toContain('Starts with the 4 Oct update')
    expect(t).toContain('What we changed, and when →')
  })

  it('prints each brand’s videos on the panel (Össur: 8 of 77)', () => {
    expect(text(brandsShare.render(ossurBrandsFixture(), 'app', ctx))).toContain('Brand September of 77 Ottobock 8 of 77')
  })

  it('draws CO2 as it was on a page read without the Brands readings', () => {
    const data = competitiveFixture()
    for (const mode of MODES) expect(render(brandsShare.render(data, mode, ctx))).toBe(render(competitiveStandings.render(data, mode, ctx)))
  })
})

describe('the Brands page', () => {
  it('is titled Brands, with the month selector, its one line and Export, and no horizon pills', () => {
    const t = text(<CompetitiveSurfacePage data={brandsFixture()} />)
    expect(t.startsWith('Brands ')).toBe(true)
    expect(t).toContain('as at the 20 Sep update')
    expect(t).toContain('Export')
    expect(t).not.toMatch(/Last 3 months|Last 12 months|Since we started/)
  })

  it('draws the preview’s blocks in its order and spans', () => {
    const markup = render(<CompetitiveSurfacePage data={brandsFixture()} />)
    const tiles = [...markup.matchAll(/data-col="(\d+)"[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => [m[2], Number(m[1])])
    expect(tiles).toEqual([
      ['Your name in your market', 12],
      ['Brands in your market', 12],
      ['A brand in full, last 90 days', 8],
      ['Asked under their content', 4],
      ['Where a rival’s talk differs', 12],
      ['What they post and say about themselves', 12],
      ['How the market makes content', 6],
      ['Share of what our searches found', 6],
    ])
    expect(BRANDS_LINES.flat().map((x) => x.block.key)).toEqual(COMPETITIVE_BLOCKS.slice(0, 8).map((b) => b.key))
  })

  it('draws no name tile for a tenant with no brand rule (Össur)', () => {
    const t = text(<CompetitiveSurfacePage data={ossurBrandsFixture()} />)
    expect(t).not.toContain('Your name in your market')
    expect(t).toContain('Ottobock in full of its 88 videos')
  })
})
