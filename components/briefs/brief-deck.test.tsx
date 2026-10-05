import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { deckPages } from '@/lib/reports/briefs/deck'
import { BRIEF_ROLES, type BriefRole, type MonthlyBriefData } from '@/lib/reports/briefs/types'
import { BriefDeck, briefPageCount } from './brief-deck'
import { briefFixture } from './fixture'

// The monthly brief's deck (T8 wired), the render tier (AGENTS.md): what each
// page PRINTS, one render per block (the cover, In short, a finding, and every
// section's page), against the copy contract and the design bans. The
// writers' words are `stored` from the monthly_brief slot, code's counts
// `figure`, a commenter's words `quote`.

const BUILT = '2026-10-05T08:00:00.000Z'

/** The design bans (Heinrich, 30 Sep): no left stripe, no highlighted phrase,
 *  no em dash. */
function bans(markup: string, text: string) {
  expect(markup).not.toMatch(/border-left|borderLeft/)
  expect(markup).not.toContain('<mark')
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
  for (const role of BRIEF_ROLES) {
    const d = briefFixture(role)
    const markup = render(<BriefDeck data={d} builtAt={BUILT} />)
    const words = renderText(<BriefDeck data={d} builtAt={BUILT} />)
    it(`${role}: keeps the copy contract and the bans on every page, and numbers its pages once`, () => {
      assertCopyContract(markup)
      bans(markup, words)
      const n = briefPageCount(d)
      expect(n).toBe(deckPages(d).length)
      expect(markup.match(/data-brief-page="/g)).toHaveLength(n)
      for (let k = 2; k <= n; k++) expect(words).toContain(`${k} / ${n}`)
      expect(words).toContain('Created by Acme with Verbatim · 5 October 2026')
      // The writers' words name their slot; a commenter's are quotes.
      expect(markup).toContain('data-copy="stored" data-slot="monthly_brief"')
      expect(markup).toContain('data-copy="quote"')
    })
  }

  it('prints the sheet size and page breaks only for the printer', () => {
    const d = briefFixture('sales')
    expect(render(<BriefDeck data={d} builtAt={BUILT} print />)).toContain('@page { size: 1280px 720px; margin: 0; }')
    expect(render(<BriefDeck data={d} builtAt={BUILT} />)).not.toContain('@page')
  })
})

describe('the cover', () => {
  it('names the company, the brief and the month, and the pages in it', () => {
    const t = text(page('leadership', 1))
    expect(t).toContain('Verbatim')
    expect(t).toContain('Acme Leadership brief September 2026')
    expect(t).toMatch(/In this brief · \d+ pages/)
    expect(t).toContain('Where the market stands')
  })
})

describe('In short', () => {
  it('prints the summary, code\'s two figures, the other briefs\' ideas and the contents', () => {
    const p = page('sales', 2)
    const t = text(p)
    expect(t).toContain('In short')
    expect(t).toContain('Buyers like the idea of a pack that lasts')
    expect(p).toContain('data-copy="figure"')
    expect(t).toContain('900')
    expect(t).toContain('Also this month, in the other briefs')
    expect(t).toContain('Content brief People ask to see the pack carried on a long day')
    expect(t).toContain('In this brief')
    assertCopyContract(p)
  })
})

describe('a finding', () => {
  it('prints the headline, what was heard, the reading in yellow, the voices with their cite, and whose talk it was', () => {
    const p = page('sales', 3)
    const t = text(p)
    expect(t).toContain('The finding')
    expect(t).toContain('The route to buy decides whether interest becomes an order')
    expect(t).toContain('What it means for a sale')
    expect(t).toContain('In practice')
    expect(t).toContain('Reddit · 21 Sep · other packs in your market')
    expect(t).toContain('YouTube · 21 Sep · about Ridgeline')
    expect(t).toContain('Heard in August and September')
    expect(t).toContain('12 videos · other packs in your market 10 · about Ridgeline 2')
    expect(p).toContain('#FFD43B')
    assertCopyContract(p)
  })
})

/** Every section page of a role, by its title, rendered once. */
function sectionPage(role: BriefRole, title: string): string {
  const d = briefFixture(role)
  const pages = deckPages(d)
  const at = pages.find((p) => p.body.kind === 'section' && p.body.section.title === title)
  if (!at) throw new Error(`no page for ${title}`)
  return page(role, at.n, d)
}

describe('every section\'s page', () => {
  const cases: [BriefRole, string, string[]][] = [
    ['sales', 'Who is buying', ['Commuters with a laptop', 'What they look for first', '6 videos · other packs in your market 5 · about Ridgeline 1']],
    ['sales', 'Who else is in the decision', ['Shop staff']],
    // What they want settled first prints beside what stops them, as the design draws it.
    ['sales', 'What stops them', ['Price that has to earn its keep', 'Argued in the Content brief', 'What they want settled first', 'Will the pack keep rain out?']],
    ['sales', 'What tips them into buying', ['01', 'The old pack gives out', '02']],
    ['sales', 'What each rival is bought for', ['Ridgeline', 'What buyers choose it for', 'Where buyers push back', '4 videos · about Ridgeline']],
    ['sales', 'Language to handle with care', ['waterproof']],
    ['marketing', 'What the market believes, and what it doubts', ['What it believes', 'What it doubts', 'A good pack will outlast a cheap one by years.']],
    ['marketing', 'In its own words', ['What they praise', 'In their words', 'So roomy and still light on the back.', 'TikTok']],
    ['marketing', 'What Acme says, and what comes back', ['What Acme says in its own posts', 'What comes back from the market', '4 videos · about Acme']],
    ['marketing', 'How Acme is remembered', ['Praised for', 'Criticised for']],
    ['marketing', 'How the rivals are heard', ['Ridgeline', 'Owners know Ridgeline']],
    ['content', 'The questions people ask', ['Where can I buy this pack', 'Interest is ready but the route is unclear.']],
    ['content', "What works in the market's videos", ['Formats', 'The market', 'Engagement', '12.5%', '5.0%', 'What the numbers say']],
    ['content', 'What comments say about the videos', ['What the comments praise', 'What the comments complain about']],
    ['content', 'What people want to be shown', ['How it carries', 'Show it with a laptop and lunch in it please.']],
    ['content', 'Where the confusion starts', ['People misread soft packs', 'Soft means badly made']],
    ['content', 'Words to borrow', ['Light on the back and holds everything.']],
    ['leadership', 'Where the market stands', ['Share of the 900 videos in your market in September', 'Buying & delivery', '23%', 'Argued in the Sales brief']],
    ['leadership', 'Where Acme stands', ['Brand', 'Comments', 'Videos', 'Ridgeline', '1.6%', '1.4%', "Acme's own posts drew 245 comments in September.", 'Praised for']],
    ['leadership', 'What buyers weigh, and what makes them switch', ['What they weigh', 'What keeps them', 'What moves them', 'Comfort is the reason I left my old pack.']],
    // The questions for the business print under the risks, as the design draws them.
    ['leadership', 'The risks, in business terms', ['Risk 1', 'Interest that stalls before the sale', 'Questions for the business', 'Which models are buyers comparing against Ridgeline?']],
  ]
  for (const [role, title, says] of cases) {
    it(`${role} · ${title}`, () => {
      const p = sectionPage(role, title)
      const t = text(p)
      expect(t).toContain(title)
      for (const s of says) expect(t).toContain(s)
      assertCopyContract(p)
      bans(p, t)
    })
  }

  it('a section too long for one sheet carries on to a page titled "…, continued"', () => {
    const d = briefFixture('sales')
    const stops = d.sections.find((s) => s.key === 'sales.stops')!
    stops.groups[0].items = Array.from({ length: 9 }, (_, k) => ({ ...stops.groups[0].items[0], title: `Objection ${k + 1}`, text: 'Shoppers ask whether the pack is worth paying more for than one from a supermarket, and whether the straps hold up after a year of daily use on a crowded bus.' }))
    const t = renderText(<BriefDeck data={d} builtAt={BUILT} />)
    expect(t).toContain('What stops them, continued')
    expect(t).toContain('Objection 9')
  })
})
