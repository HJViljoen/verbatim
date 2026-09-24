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

describe('the deck prints a voice’s English under it', () => {
  // Sweep 2026-09-24: the PDF printed a quote's raw words alone, so a
  // non-English voice read untranslated on paper and translated on screen.
  it('stamps the language and prints the English beneath the original', () => {
    const d = agentFixture()
    const q = d.turns[0].answer!.grounded[0].quotes[0]
    Object.assign(q, { text: '기내반입되나요??', lang: 'ko', english: 'Is it allowed as carry-on luggage??' })
    const text = slide(d, 'agent.turn:0:0')
    expect(text).toContain('기내반입되나요??')
    expect(text).toContain('Korean · machine translation')
    expect(text).toContain('Is it allowed as carry-on luggage??')
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

  it('says a point has no reading rather than printing a count instead', () => {
    const text = slide(refusedFixture(), 'agent.turn:0:0')
    expect(text).toContain('no month reading behind this')
    expect(text).not.toMatch(/\d+ conversations?\b/)
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
