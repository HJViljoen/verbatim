import { describe, expect, it } from 'vitest'

import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { allAccountsVoiceFixture, ossurVoiceFixture, refusedVoiceFixture } from '../fixture'
import { conversationFixture } from '../fixture-conversation'
import { HairlineConversation, HairlineEmpty, HairlineTopbar } from './body'
import { withLook } from './look'

// DESIGN TEST (Hairline look). The variant is drawn from the shipped page's
// data, so it is held to the shipped page's contract: the copy rules, no em
// dash, no left stripe, no highlight; and every link inside it keeps the look.

const page = (data = conversationFixture(), params: Record<string, string | undefined> = { look: 'hairline' }) => (
  <div data-look="hairline">
    <HairlineTopbar data={data} params={params} />
    <HairlineConversation data={data} params={params} />
  </div>
)

function bans(markup: string): string[] {
  const out: string[] = []
  if (/border-l-(?!0\b)|border-left\s*:/.test(markup)) out.push('left stripe')
  if (/<mark\b/.test(markup)) out.push('highlight')
  if (markup.includes('—')) out.push('em dash')
  return out
}

describe('the look on a link', () => {
  it('is kept, before the anchor', () => {
    expect(withLook('/dashboard/voice')).toBe('/dashboard/voice?look=hairline')
    expect(withLook('/dashboard/voice?theme=x#theme')).toBe('/dashboard/voice?theme=x&look=hairline#theme')
  })
})

describe('Conversation in the Hairline look', () => {
  it('passes the copy contract and the design bans for Sealand, Össur and before MF1', () => {
    for (const data of [conversationFixture(), ossurVoiceFixture(), refusedVoiceFixture(), allAccountsVoiceFixture()]) {
      const markup = render(page(data))
      expect(copyViolations(markup), data.brand).toEqual([])
      expect(bans(markup), data.brand).toEqual([])
    }
    expect(copyViolations(render(<div data-look="hairline"><HairlineEmpty /></div>))).toEqual([])
  })

  it('prints the shipped page’s blocks in its order, under the hero', () => {
    const text = renderText(page())
    const order = ['Everything your market', 'Every conversation in September', 'A conversation in full', 'Where your market talks', 'Who is talking', 'The market’s words']
    let at = -1
    for (const word of order) {
      const i = text.indexOf(word, at + 1)
      expect(i, word).toBeGreaterThan(at)
      at = i
    }
  })

  it('keeps the look on every link back to this page, and the way out drops it', () => {
    const markup = render(page())
    const own = [...markup.matchAll(/href="(\/dashboard\/voice[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
    expect(own.length).toBeGreaterThan(3)
    const out = own.filter((h) => !h.includes('look=hairline'))
    expect(out).toEqual(['/dashboard/voice'])
    expect(own).toContain('/dashboard/voice?theme=22e2445c&look=hairline#theme')
  })
})
