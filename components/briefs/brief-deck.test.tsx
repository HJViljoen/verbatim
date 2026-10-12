import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { deckPages } from '@/lib/reports/briefs/deck'
import { BRIEF_ROLES, type BriefRole, type MonthlyBriefData } from '@/lib/reports/briefs/types'
import { BriefDeck, briefPageCount } from './brief-deck'
import { briefFixture } from './fixture'

// The monthly brief's deck, the render tier (AGENTS.md): what each page
// PRINTS against the canvas (the "Monthly briefs" artboards, Heinrich 12 Oct:
// every brief looks exactly like them), one render per page, against the copy
// contract and the design bans. The writers' words are `stored` from the
// monthly_brief slot (the long-run patterns from week_read), code's counts
// `figure`, a commenter's words `quote`. The fixture fills every component the
// canvas draws for each role.

const BUILT = '2026-10-05T08:00:00.000Z'

/** The design bans (Heinrich, 30 Sep): no left stripe, no highlighted phrase,
 *  no em dash, and no shadow on the paper. */
function bans(markup: string, text: string) {
  expect(markup).not.toMatch(/border-left|borderLeft/)
  expect(markup).not.toContain('<mark')
  expect(markup).not.toMatch(/box-shadow|boxShadow/)
  expect(text).not.toContain('—')
}

/** The markup of one page of a role's fixture deck. */
function page(role: BriefRole, n: number, d: MonthlyBriefData = briefFixture(role)): string {
  const markup = render(<BriefDeck data={d} builtAt={BUILT} />)
  const at = markup.indexOf(`data-brief-page="${n}"`)
  const next = markup.indexOf(`data-brief-page="${n + 1}"`)
  return markup.slice(at, next < 0 ? undefined : next)
}
const text = (markup: string) => renderText(<div dangerouslySetInnerHTML={{ __html: markup }} />)

describe('the brief deck, every role', () => {
  const canvasPages: Record<BriefRole, number> = { sales: 9, marketing: 8, content: 8, leadership: 8 }
  for (const role of BRIEF_ROLES) {
    const d = briefFixture(role)
    const markup = render(<BriefDeck data={d} builtAt={BUILT} />)
    const words = renderText(<BriefDeck data={d} builtAt={BUILT} />)
    it(`${role}: the canvas's ${canvasPages[role]} pages, the copy contract and the bans on every page`, () => {
      assertCopyContract(markup)
      bans(markup, words)
      const n = briefPageCount(d)
      expect(n).toBe(canvasPages[role])
      expect(n).toBe(deckPages(d).length)
      expect(markup.match(/data-brief-page="/g)).toHaveLength(n)
      for (let k = 2; k <= n; k++) expect(words).toContain(`${k} / ${n}`)
      expect(words).toContain('Created by Acme with Verbatim · 5 October 2026')
      expect(markup).toContain('data-copy="stored" data-slot="monthly_brief"')
      expect(markup).toContain('data-copy="quote"')
    })
    it(`${role}: prints no section the canvas has no page for, and no count line under an item`, () => {
      for (const gone of ['Who else is in the decision', 'How Acme is remembered', 'Words to borrow', 'Light on the back and holds everything']) expect(words).not.toContain(gone)
      expect(words).not.toMatch(/\d+ videos · /)
      expect(words).not.toContain('other packs in your market')
    })
  }

  it('prints the sheet size and page breaks only for the printer, and a hairline, never a shadow, on screen', () => {
    const d = briefFixture('sales')
    expect(render(<BriefDeck data={d} builtAt={BUILT} print />)).toContain('@page { size: 1280px 720px; margin: 0; }')
    const screen = render(<BriefDeck data={d} builtAt={BUILT} />)
    expect(screen).not.toContain('@page')
    expect(screen).toContain('outline:1px solid #E3E5E8')
  })
})

describe('the cover', () => {
  it('names the company, the brief and the month, the pages, and the contents by their short names', () => {
    const t = text(page('leadership', 1))
    expect(t).toContain('Verbatim')
    expect(t).toContain('Acme Leadership brief September 2026')
    expect(t).toContain('In this brief · 8 pages')
    expect(t).toContain('Where Acme stands against its rivals')
    expect(t).toContain('Rivals own concrete jobs')
    expect(page('leadership', 1)).toContain('background:#26292C')
    expect(page('sales', 1)).toContain('background:#FFD43B')
    expect(page('marketing', 1)).toContain('background:#F2651D')
  })
})

describe('In short', () => {
  it('prints the summary, code\'s two figures, the other briefs\' ideas and the contents', () => {
    const p = page('sales', 2)
    const t = text(p)
    expect(t).toContain('In short')
    expect(t).toContain('The talk shows a buyer who already likes the idea')
    expect(t).toContain('852')
    expect(t).toContain('23%')
    expect(t).toContain('of them about Buying & delivery, the biggest subject')
    expect(t).toContain('Also this month, in the other briefs')
    expect(t).toContain('Marketing brief Reuse wins attention')
    expect(t).toContain('3 The route to buy')
    expect(t).toContain('5 Who is buying, continued')
    assertCopyContract(p)
  })
})

describe('a finding', () => {
  it('prints the headline, what was heard, In practice, the reading in yellow, the voice with the canvas\'s cite, where it was heard and its subject', () => {
    const p = page('sales', 3)
    const t = text(p)
    expect(t).toContain('The finding')
    expect(t).toContain('Interest stalls when the route to buy stays unclear')
    expect(t).toContain('What it means for a sale')
    expect(t).toContain('In practice')
    expect(t).toContain('YouTube · 23 Sep · translated from Japanese')
    expect(t).toContain('Heard in August and September')
    expect(t).toContain('Part of Buying & delivery, the biggest subject in your market: 23% of September\'s videos.')
    expect(p).toContain('#FFD43B')
    assertCopyContract(p)
  })

  it('a quote on the company\'s own post says so first', () => {
    expect(text(page('marketing', 4))).toContain('On an Acme post · Instagram · 18 Sep')
  })

  it('Leadership\'s finding carries what each brand is heard for, the company\'s chip dark', () => {
    const p = page('leadership', 5)
    const t = text(p)
    expect(t).toContain('What each brand is heard for')
    expect(t).toContain('Ridgeline Travel use')
    expect(t).toContain('Acme A brand to approve of and support')
    assertCopyContract(p)
  })
})

/** Every section page of a role, by its eyebrow, rendered once. */
function sectionPage(role: BriefRole, eyebrow: string): string {
  const d = briefFixture(role)
  const at = deckPages(d).find((p) => p.eyebrow === eyebrow)
  if (!at) throw new Error(`no page ${eyebrow}`)
  return page(role, at.n, d)
}

describe('every canvas page, with every component it draws', () => {
  const cases: [BriefRole, string, string[]][] = [
    ['sales', 'Who is buying', ["Four kinds of people talk about packs like Acme's. Three of them buy.", 'Researcher', 'What they want', 'What stops them', 'What moves them', 'For a sale', 'Pack lover']],
    ['sales', 'Who is buying, continued', ['Who is buying, continued', 'Supporter', 'Maker', 'Mostly makes, rarely buys', 'Mostly makes rather than buys.']],
    ['sales', 'What stops them', ['The reasons a willing buyer hesitates before committing.', 'Price that has to earn its keep', 'No way to act', 'What they want settled first', 'What it is made from: the fabric, handles and reinforcement.', 'Reddit · 23 Sep', 'A story that feels off is argued in full in the Marketing brief.']],
    ['sales', 'What tips them into buying', ['01', 'The old pack gives out', '05', 'The design that lands', 'Back to school', 'TikTok · 26 Sep']],
    ['sales', 'Who buyers compare you with', ['Ridgeline', 'Bought for travel use', 'What buyers praise', 'Where buyers push back', 'Also in the set', 'On Ridgeline', 'I second ridgeline']],
    ['sales', 'Language to handle with care', ['reused or recycled', 'waterproof', 'sustainable']],
    ['marketing', 'Believes and doubts', ['What it believes', 'What it doubts', 'A good quality expensive pack']],
    ['marketing', 'In its own words', ['What they call it', 'How they praise it', 'The problem, in their words', 'tears under load', 'What makes them stop, share and argue', 'They stop on', 'They share', 'They argue over']],
    ['marketing', 'Says and hears', ['What Acme says in its own posts', 'What comes back from the market', 'Heard back', 'Not echoed', 'Heard as values', 'Tested', 'Confused']],
    ['marketing', 'How rivals are heard', ['Ridgeline A travel tool with personality', 'Acme (you) Values', 'Own posts published in September', 'Five or more comments', 'Share of its posts that started a conversation', '44%']],
    ['content', 'The questions people ask', ['Where can I actually buy this pack', 'Admiration is turning into buying intent', 'If there is a pattern, tutorial or dimensions, where are they?']],
    ['content', 'Hooks and formats', ['Hooks and formats that work', 'The category', 'Ridgeline', 'Engagement', '28.1%', '4.7%', 'What the numbers say', 'Median engagement across all the category\'s videos: 2.1%']],
    ['content', 'What viewers come for', ['What viewers come for, and what loses them', 'What earns a response', 'What loses them', 'Inventive reuse']],
    ['content', 'What people want shown', ['What people want to be shown', 'What it is made of', 'YouTube · 24 Sep']],
    ['content', 'Where the confusion starts', ['People misread packs like Acme', 'The confusion starts at first sight', 'Soft means badly made']],
    ['leadership', 'Where the market stands', ['Share of the 852 videos in your market in September', 'Buying & delivery', '23%', 'TikTok · 26 Sep', 'Also following: Repair & warranty 3%.', 'What people do in the comments', 'Saying it worked', 'The mood', 'Positive', '13.5%']],
    ['leadership', 'Where Acme stands', ['Where Acme stands against its rivals', 'Share of comments', 'Share of videos', 'Acme 1.1% · its five rivals 3.1% · the rest of the category 95.7%', 'Where it is talked about', 'Acme (you)', 'Its own Instagram posts', 'second of these six brands']],
    ['leadership', 'What buyers weigh', ['What they weigh', 'What holds them', 'What moves them', 'Comfort is so important']],
    ['leadership', 'The risks', ['Risk 1', 'Risk 2', 'Argued in full in the Marketing brief', 'Questions for the business', '01', 'Which Acme models are buyers comparing']],
    ['leadership', 'What holds so far', ['Patterns here describe August and September. Each was heard in both months.', '01', "Acme's position, in one line", 'Well regarded for what it stands for', "The month's five ideas, and where each is argued", 'This brief']],
  ]
  for (const [role, eyebrow, says] of cases) {
    it(`${role} · ${eyebrow}`, () => {
      const p = sectionPage(role, eyebrow)
      const t = text(p)
      for (const s of says) expect(t).toContain(s)
      assertCopyContract(p)
      bans(p, t)
    })
  }

  it('a component whose material does not stand draws nothing, never a placeholder', () => {
    const d = briefFixture('leadership')
    const market = d.sections.find((s) => s.key === 'leadership.market')!
    delete market.kinds
    delete market.mood
    const holds = d.sections.find((s) => s.key === 'leadership.holds')!
    delete holds.position
    d.findings[0].heardFor = undefined
    const t = renderText(<BriefDeck data={d} builtAt={BUILT} />)
    for (const gone of ['What people do in the comments', 'The mood', 'position, in one line', 'What each brand is heard for']) expect(t).not.toContain(gone)
  })
})
