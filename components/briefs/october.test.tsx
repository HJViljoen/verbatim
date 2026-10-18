import { describe, expect, it } from 'vitest'

import { MoveSentence } from '@/components/pages/v2/moves/moves'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { MOVE_CARDS } from '@/lib/pages/v2/moves-fixture'
import { moveSentence } from '@/lib/reports/briefs/app'
import { OSSUR_APP, SEALAND_APP, WORST_APP } from '@/lib/reports/briefs/app-fixture'
import { deckPages } from '@/lib/reports/briefs/deck'
import { BRIEF_ROLES, type BriefRole, type MonthlyBriefData } from '@/lib/reports/briefs/types'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { BriefDeck } from './brief-deck'
import { verdictSlotWidth } from './app-pages'
import { briefFixture, octoberFixture, subjectsFixture } from './fixture'

// The October canvas's pages, the render tier (AGENTS.md): what each prints
// against its board (briefs-2026-10, approved 18 Oct), the copy contract, the
// design bans, and every named item a link into the app.

const BUILT = '2026-11-01T08:00:00.000Z'
const APP = 'https://app.example.com'

function bans(markup: string, text: string) {
  expect(markup).not.toMatch(/border-left|borderLeft/)
  expect(markup).not.toContain('<mark')
  expect(markup).not.toMatch(/box-shadow|boxShadow/)
  expect(text).not.toContain('—')
}

/** One page of a deck, by its header. */
function page(d: MonthlyBriefData, eyebrow: string, appUrl = APP): string {
  const markup = render(<BriefDeck data={d} builtAt={BUILT} appUrl={appUrl} />)
  const n = deckPages(d).find((p) => p.eyebrow === eyebrow)?.n
  if (!n) throw new Error(`no page ${eyebrow}`)
  const at = markup.indexOf(`data-brief-page="${n}"`)
  const next = markup.indexOf(`data-brief-page="${n + 1}"`)
  return markup.slice(at, next < 0 ? undefined : next)
}
/** The words a reader reads (a tag boundary before a comma or a stop is no
 *  space on the page). */
const text = (markup: string) => renderText(<div dangerouslySetInnerHTML={{ __html: markup }} />).replace(/\s+([,.])/g, '$1')

describe('every role on the October canvas, Össur, Sealand and the worst case', () => {
  for (const role of BRIEF_ROLES) {
    for (const [name, d] of [
      ['Össur', octoberFixture(role)],
      ['Sealand', octoberFixture(role, { tenant: 'sealand' })],
      ['the worst case', octoberFixture(role, { app: WORST_APP, subjects: subjectsFixture(WORST_APP.subjectReads) })],
    ] as const) {
      it(`${role}, ${name}: the copy contract and the bans on every page`, () => {
        const markup = render(<BriefDeck data={d} builtAt={BUILT} appUrl={APP} />)
        assertCopyContract(markup)
        bans(markup, renderText(<BriefDeck data={d} builtAt={BUILT} appUrl={APP} />))
      })
    }
  }

  it('every header but the cover links to its page in the app, against the app\'s address; on screen, relative', () => {
    const d = octoberFixture('leadership')
    const pdf = render(<BriefDeck data={d} builtAt={BUILT} print appUrl={APP} />)
    expect(pdf).toContain(`href="${APP}/dashboard/voices?month=2026-10"`)
    expect(pdf).toContain(`href="${APP}/dashboard/market?period=month&amp;month=2026-10#long-run"`)
    const screen = render(<BriefDeck data={d} builtAt={BUILT} />)
    expect(screen).toContain('href="/dashboard/voices?month=2026-10"')
  })

  it('a brief stored before the October canvas links nowhere', () => {
    for (const role of BRIEF_ROLES) expect(render(<BriefDeck data={briefFixture(role)} builtAt={BUILT} appUrl={APP} />)).not.toContain('<a ')
  })
})

describe('Leadership: Where the market stands (Brief-Leadership-03)', () => {
  it('each subject, linked, its bar and level, its headline and the first sentence of what it means; the panel; the foot', () => {
    const p = page(octoberFixture('leadership'), 'Where the market stands')
    const t = text(p)
    expect(t).toContain('Share of the 902 videos in your market in October · each subject in Market’s own words')
    expect(t).toContain('Community & encouragement 24% Visible independence earns the encouragement around a prosthetic leg Here, a prosthetic leg is taken for granted.')
    expect(t).not.toContain('The response turns on visible independence')
    expect(p).toContain(`href="${APP}/dashboard/market/subjects/da5bd724-d336-4756-8d1a-0ad648766b2e?period=month&amp;month=2026-10"`)
    expect(p).toContain('data-copy="stored" data-slot="week_read"')
    expect(t).toContain('What people do in the comments')
    expect(t).toContain('Open October on Market →')
  })
})

describe('Leadership: Who is in your market (Brief-Leadership-04)', () => {
  it('every group, its count of the market\'s videos, its line and the subject it talks about most; no share, no change', () => {
    const p = page(octoberFixture('leadership'), 'Who is in your market')
    const t = text(p)
    expect(t).toContain('Caretaker 100 of 902')
    expect(t).toContain('Talks most about Community & encouragement 22 of their 100 videos')
    expect(t).toContain('Each update describes the groups afresh, so no count is set against September.')
    expect(t).not.toMatch(/\d+%/)
    expect(p).toContain(`href="${APP}/dashboard/voices/groups/caretaker?month=2026-10"`)
    expect(p).toContain('data-copy="subject" data-slot="pass_e_persona"')
  })
})

describe('Leadership: Your moves (Brief-Leadership-07)', () => {
  it('the advice waiting by its stored title and what it would move, the dated move with its months and its one sentence, the record; no controls', () => {
    const p = page(octoberFixture('leadership'), 'Your moves')
    const t = text(p)
    expect(t).toContain('Waiting for a decision 4')
    expect(t).toContain('01 Create an Össur Access Navigator for new amputees and caregivers')
    expect(t).toContain('First raised 12 Oct · would move Where can I get one, 41 of 902 videos in October')
    expect(t).toContain('Moves you dated · 1')
    expect(t).toContain('Dated 5 Oct · Done · read on Cost and affordability frustration')
    expect(t).toContain('August Left off the line')
    expect(t).toContain('October 31 of 902 the month of the move')
    expect(t).toContain('Share of market videos: 3% (31 of 902) in October, the last full month.')
    expect(t).toContain('65 pieces of advice since 13 June: 1 decided, 4 waiting.')
    expect(p).toContain('data-copy="stored" data-slot="pass_d_b_recommendation"')
    expect(p).not.toMatch(/<button|<form|<input/)
    expect(t).not.toMatch(/Accept|Not for us/)
  })

  it('the move\'s sentence is Your moves\' own (`MoveSentence`), word for word', () => {
    const reading = { month: '2026-10-01', label: 'the last full month' }
    for (const card of MOVE_CARDS) {
      const page = renderText(<MoveSentence card={card} reading={reading} />)
      expect(page.startsWith(moveSentence(card, reading))).toBe(true)
    }
  })
})

describe('Sales: Who is buying (Brief-Sales-05, -06)', () => {
  it('two groups a sheet, what they want, what stops them, what tips them, and what is in their videos; the fifth named', () => {
    const d = octoberFixture('sales')
    const first = text(page(d, 'Who is buying'))
    expect(first).toContain('Five groups comment in your market in October, as Voices describes them. The four in the most videos are here.')
    expect(first).toContain('Caretaker 100 of 902 videos in October')
    expect(first).toContain('What tips them')
    expect(first).toContain('In their videos Talks most about Community & encouragement, 22 of their 100 videos. None of your products came up in them. Open in Voices →')
    expect(first).toContain('Your products in them: Pro-Flex Terra and Direct Socket.')
    const second = text(page(d, 'Who is buying, continued'))
    expect(second).toContain('Also in your market: Long-term user, in 50 of October’s videos.')
    expect(second).toContain('Open Long-term user in Voices →')
    expect(second).not.toContain('For a sale')
  })

  it('Sealand: products off, so no products line', () => {
    expect(text(page(octoberFixture('sales', { tenant: 'sealand' }), 'Who is buying'))).not.toMatch(/Your products in them|None of your products/)
  })
})

describe('Marketing: Your products in the conversation (Brief-Marketing-05) and Who gets named without being asked (-06)', () => {
  it('Össur: each category, its videos, yours named, the products that came up, first-time marks, what stands out', () => {
    const t = text(page(octoberFixture('marketing'), 'Your products'))
    expect(t).toContain('5 of your 65 products came up by name in October, and 151 of your market’s 902 videos were about them or their categories, a product named or not.')
    expect(t).toContain('Feet 30 6 Pro-Flex Terra 3 · Pro-Flex XC 2 · Pro-Flex LP Align 1 First time')
    expect(t).toContain('Hands 48 0 None by name')
    expect(t).toContain('Praise in the comments Liners 13 of the 26 videos about liners have praise in their comments.')
    expect(t).not.toMatch(/Praised in/)
  })

  it('Sealand: each counted brand named unprompted with its verdict, praised and complained, what it is talked about for, the notes', () => {
    const p = page(octoberFixture('marketing', { tenant: 'sealand' }), 'Named without being asked')
    const t = text(p)
    expect(t).toContain('The North Face 11 of 941 too few to compare 15 · 9 of 31 Comfort 9 of 31')
    expect(t).toContain('Sealand (you) 2 of 941')
    expect(t).toContain('Not named without being asked in October: Freedom of Movement.')
    expect(t).toContain('The North Face and Cotopaxi were named most without being asked: in 11 and 8 of the 941 videos.')
    expect(p).toMatch(/data-copy="verdict"[^>]*>too few to compare/)
  })

  it('a verdict beside one row never shortens that row\'s bar: every row keeps one slot of the same width, so the longest bar is the largest count', () => {
    const d = octoberFixture('marketing', { tenant: 'sealand' })
    const rows = d.fromApp!.find((s) => s.key === 'marketing.named')!.named!.rows
    expect(rows.filter((r) => r.verdict).length).toBe(1)
    const slots = [...page(d, 'Named without being asked').matchAll(/<span[^>]*data-verdict-slot=""[^>]*>/g)].map((m) => /width:(\d+)px/.exec(m[0])?.[1])
    expect(slots).toHaveLength(rows.length)
    expect(new Set(slots).size).toBe(1)
    expect(Number(slots[0])).toBe(verdictSlotWidth(rows.map((r) => r.verdict)))
    // No verdict in the table: no slot.
    const none = octoberFixture('marketing', { app: { ...SEALAND_APP, named: { ...SEALAND_APP.named!, rows: rows.map((r) => ({ ...r, verdict: null })) } } })
    expect(page(none, 'Named without being asked')).not.toContain('data-verdict-slot')
  })

  it('Össur, brands not counted: no named page; Sealand, no catalogue: no products page', () => {
    expect(deckPages(octoberFixture('marketing')).map((x) => x.eyebrow)).not.toContain('Named without being asked')
    expect(deckPages(octoberFixture('marketing', { tenant: 'sealand' })).map((x) => x.eyebrow)).not.toContain('Your products')
  })
})

describe('Content: What to post next (Brief-Content-04) and Hooks and formats (-05)', () => {
  it('each idea: its title, its four weeks beside its month, who asks, your posts, what they want to know, its chips, the medical line ONCE under every idea; Also asked; Worth a reply', () => {
    const d = octoberFixture('content')
    const p = page(d, 'What to post next')
    const t = text(p)
    expect(t).toContain('From questions people asked 4 to 31 October that none of your posts since August had touched on, the most videos first. 1× is a typical market video on the question.')
    expect(t).toContain('23 of 841 videos, 4 to 31 Oct · 26 of 902 in October')
    expect(t).toContain('Who\'s asking Long-term user, New amputee')
    expect(t).toContain('None of your 15 posts since August touched on it')
    expect(t).toContain('What they want to know · of 14 videos')
    expect(t).toContain('Story 1.3×')
    expect(t).toContain('No format stands out on this question yet')
    const ideas = d.fromApp!.find((s) => s.key === 'content.ideas')!.ideas!.ideas.length
    expect(t.split(MEDICAL_LINE)).toHaveLength(ideas + 1)
    expect(t).toContain('Also asked in October, and not yet in your posts')
    expect(p).toContain(`href="${APP}/dashboard/content/replies?period=month"`)
    expect(p).toContain(`href="${APP}/dashboard/content/ideas/b1"`)
  })

  it('Sealand: not a medical market, no medical line', () => {
    expect(text(page(octoberFixture('content', { tenant: 'sealand' }), 'What to post next'))).not.toContain(MEDICAL_LINE)
  })

  it('Hooks and formats: the category\'s share, your posts and the rival\'s, the response; your posts in the month, the best by its kind and day', () => {
    const t = text(page(octoberFixture('content'), 'Hooks and formats'))
    expect(t).toContain('Shares of 1,024 category videos · counts of 15 Össur posts and 182 Ottobock videos')
    expect(t).toContain('Story 40.1% 1 41 1.3×')
    expect(t).toContain('Your posts in October')
    expect(t).toContain('posts on your own accounts · Instagram 7, TikTok 4, YouTube 4')
    expect(t).toContain('Your testimonial on TikTok, 5 Oct')
    expect(t).toContain('Response is each kind’s median against the market’s median video; Reddit is left out of response.')
  })
})

describe('no ideas, no moves, no groups: those pages are left out and the rest prints', () => {
  it('each role with nothing read from the app still draws its writer\'s pages', () => {
    const none = { ...OSSUR_APP, subjectReads: null, people: null, named: null, products: null, ideas: null, hooks: null, moves: null }
    for (const role of BRIEF_ROLES as readonly BriefRole[]) {
      const d = octoberFixture(role, { app: none, subjects: null })
      const markup = render(<BriefDeck data={d} builtAt={BUILT} />)
      assertCopyContract(markup)
      expect(deckPages(d).length).toBeGreaterThan(2)
    }
    void SEALAND_APP
  })
})
