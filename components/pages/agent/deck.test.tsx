import { describe, expect, it } from 'vitest'
import { agentPage } from './index'
import { agentFixture, followUpFixture, refusedFixture } from './fixture'
import { renderText } from '@/lib/test/render'
import type { AgentThreadData } from '@/lib/pages/agent-thread'

// What leaves the building (Block D wave 2, E-ask · fix pass).
//
// `app/dashboard/agent/[id]/page.tsx` states in its own header that "what
// leaves as a PDF is what is on screen", and this package mounted Export on the
// shell — so the two now have to agree about one answer's figures. The deck
// printed `GroundedPoint.conversationCount` as "130 conversations": a retrieval
// count with no denominator, in the noun AGENTS.md reserves for the legacy
// pages, and the exact figure `AnswerFooter`'s docstring forbids.

const slide = (d: AgentThreadData, key: string) => {
  const r = agentPage.renderables[key]
  expect(r, `no renderable for ${key}`).toBeTruthy()
  return renderText(r!.render(d, 'print'))
}

describe('the deck in the screen’s order, with no quotes (1 Oct)', () => {
  // Heinrich: "What I'd do" under the answer and above "What people said", and
  // no quotes register. The deck and the PNG card follow the screen.
  const d = agentFixture()

  it('opens on the question and the answer, with "What I’d do" on the same sheet when both are short', () => {
    const slides = agentPage.slides(d, 'default')
    expect(slides[0].keys).toEqual(['agent.turn:0:lead', 'agent.turn:0:do'])
    expect(slides[1].keys).toEqual(['agent.turn:0:0'])
    expect(slide(d, 'agent.turn:0:lead')).toContain('Durability')
    expect(slide(d, 'agent.turn:0:do')).toContain('What I’d do')
    expect(slide(d, 'agent.turn:0:do')).toContain('Based on finding 1.')
  })

  it('gives "What I’d do" a sheet of its own when the two are long', () => {
    const long = agentFixture({
      turns: [{ ...d.turns[0], answer: { ...d.turns[0].answer!, judgement: [1, 2, 3].map(() => ({ text: 'x'.repeat(500), basedOn: ['G1'] })) } }],
    })
    expect(agentPage.slides(long, 'default').slice(0, 2).map((s) => s.keys)).toEqual([['agent.turn:0:lead'], ['agent.turn:0:do']])
  })

  it('prints no quote, no appendix of them and no update line', () => {
    const all = agentPage.slides(d, 'default').flatMap((s) => s.keys).map((k) => slide(d, k)).join(' ')
    expect(all).not.toContain('Three winters on the bike')
    expect(agentPage.slides(d, 'default').flatMap((s) => s.keys).some((k) => k.startsWith('agent.citations'))).toBe(false)
    expect(all).not.toMatch(/update of|Answered against/)
    // The PNG card too.
    const card = slide(d, 'agent.answer:0')
    expect(card).not.toContain('Three winters on the bike')
    expect(card.indexOf('What I’d do')).toBeGreaterThan(card.indexOf('Durability'))
    expect(card.indexOf('What people said')).toBeGreaterThan(card.indexOf('What I’d do'))
  })
})

describe('the deck prints the screen’s figures', () => {
  const measured = agentFixture()

  it('prints the level with its denominator, never a bare conversation count', () => {
    const text = slide(measured, 'agent.turn:0:0')
    expect(text).toContain('130 of 1,388 videos')
    expect(text).not.toContain('130 conversations')
    expect(text).not.toMatch(/\d+ conversations?\b/)
  })

  it('prints no count where nothing measured a point, and no line about it (§0a)', () => {
    const text = slide(refusedFixture(), 'agent.turn:0:0')
    expect(text).not.toContain('no month reading')
    expect(text).not.toMatch(/\d+ conversations?\b/)
  })

  it('prints each level’s base as the screen does', () => {
    expect(slide(measured, 'agent.turn:0:0')).toContain('in your market in September, not counting the videos about brands you track')
  })

  it('resolves a follow-up’s level by its OWN turn', () => {
    // The same defect as the screen's footer: `findings[0]` is turn 0's on
    // every turn, so a follow-up about "Recycled materials" (k = 194) would
    // print the wet-commute finding's 130.
    const text = slide(followUpFixture(), 'agent.turn:1:0')
    expect(text).toContain('194 of 1,388 videos')
    expect(text).not.toContain('130 of 1,388 videos')
  })

  it('carries no figure on a nearest point, which nothing measured', () => {
    const near = agentFixture({
      turns: [{
        ...measured.turns[0],
        answer: {
          ...measured.turns[0].answer!,
          nearest: [{ text: 'What people say about the zips, which is close but not it.', conversationCount: 41, insightIds: ['i9'] }],
        },
      }],
    })
    const text = slide(near, 'agent.turn:0:more')
    expect(text).toContain('which is close but not it')
    expect(text).not.toContain('41')
  })
})
