import { describe, expect, it } from 'vitest'

import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { VoiceSurfacePage } from './index'
import { KindCard } from './conversation'
import { allAccountsVoiceFixture, ossurVoiceFixture, refusedVoiceFixture } from './fixture'
import { conversationFixture, SEALAND_KINDS } from './fixture-conversation'
import VoiceLoading from '@/app/dashboard/voice/loading'

// Conversation, drawn to the approved artboard (Page-Conversation.dc.html,
// the pages build of 1 Oct). Each block: the artboard's words and order, the
// copy contract, no em dash, no left stripe.

/** Rendered text with the spaces element boundaries add before punctuation
 *  and inside brackets taken out. */
const flat = (t: string) => t.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ ([),.])/g, '$1')
const page = (data = conversationFixture(), params: Record<string, string | undefined> = {}) => <VoiceSurfacePage data={data} params={params} />
const NAMES = { client: 'Sealand', market: { long: 'Other bags in your market', short: 'other bags' } }

/** The design bans, on rendered markup: no left stripe, no highlight. */
function bans(markup: string): string[] {
  const out: string[] = []
  if (/border-l-(?!0\b)|border-left\s*:/.test(markup)) out.push('left stripe')
  if (/<mark\b/.test(markup)) out.push('highlight')
  if (markup.includes('—')) out.push('em dash')
  return out
}

describe('the Conversation page, as the artboard draws it', () => {
  it('prints its blocks in the artboard’s order, under the title alone', () => {
    const text = renderText(page())
    const order = ['Conversation', 'Every conversation in September', 'A conversation in full', 'Where your market talks', 'Who is talking', 'The market’s words']
    let at = -1
    for (const word of order) {
      const i = text.indexOf(word, at + 1)
      expect(i, word).toBeGreaterThan(at)
      at = i
    }
    // No page-bar line, no month chip, no "as at", no footnote.
    expect(text).not.toContain('as at the')
    expect(text).not.toContain('updates paused')
    expect(text).not.toContain('The market in September')
  })

  it('passes the copy contract and the design bans for Sealand, Össur and before MF1', () => {
    for (const data of [conversationFixture(), ossurVoiceFixture(), refusedVoiceFixture(), allAccountsVoiceFixture()]) {
      const markup = render(page(data))
      expect(copyViolations(markup), data.brand).toEqual([])
      expect(bans(markup), data.brand).toEqual([])
    }
  })
})

describe('Every conversation in {Month}', () => {
  it('states its base once, lists every row with its share, who it is about, subject and makers', () => {
    const data = conversationFixture()
    const text = renderText(page(data))
    const makers = data.board.makers ?? []
    expect(text).toContain(`${data.board.rows.length + makers.length} conversations on 10 or more videos · share of the category’s 625 videos in September`)
    for (const t of data.board.rows) expect(text, t.label).toContain(t.label)
    expect(text).toContain('Other bags in your market · Buying & delivery · a third on makers’ posts')
    expect(text).toContain('Patagonia 2 · The North Face 2 · other bags 7 · Comfort')
    expect(text).toContain('Price · a fifth on makers’ posts')
  })

  it('opens the pane’s row as the selected pill and links each row to its conversation', () => {
    const markup = render(page())
    expect(markup).toContain('bg-[rgba(38,41,44,0.07)]')
    expect(markup).toMatch(/href="\/dashboard\/voice\?theme=22e2445c#theme"/)
  })

  it('sets makers’ own talk apart in one line, with a share only at 3% or more', () => {
    const text = flat(renderText(page()))
    expect(text).toContain('Makers’ own talk, set apart: Love for creative upcycling (12%), Admiration for handmade craftsmanship (10%)')
    // Under 3%, the name alone.
    expect(text).toContain('Need for exact measurements, Tutorial praised as easy to follow, Requests for the sewing pattern.')
  })
})

describe('A conversation in full', () => {
  it('prints its share of the category, who it is about, its subject, what people did, voices and the Agent', () => {
    const text = renderText(page())
    expect(text).toContain('A conversation in full')
    expect(text).toContain('Price and sale questions')
    expect(text).toContain('3% of the category’s 625 videos in September')
    expect(text).toContain('Part of Price')
    expect(text).toContain('A fifth of its videos are makers’ own posts.')
    expect(text).toContain('What people did in it Of its 18 videos')
    expect(text).toContain('Said they want to buy')
    expect(text).toContain('TikTok · 6 Sep · Other bags in your market')
    expect(text).toContain('Ask the Agent about this')
  })

  it('is not drawn where no conversation is open', () => {
    const data = conversationFixture()
    const text = renderText(page({ ...data, theme: { ...data.theme, state: 'none' } }))
    expect(text).not.toContain('A conversation in full')
  })
})

describe('Where your market talks', () => {
  it('lists five accounts and links to all of them', () => {
    const data = conversationFixture()
    const text = renderText(page(data))
    expect(text).toContain('Accounts with 3 or more of the category’s videos in September')
    expect(text).toContain(`All ${data.where!.listed} accounts →`)
    expect(text).not.toContain('Set aside as off-topic')
    expect(text).not.toContain('Mike Ritland')
  })

  it('lists every account once a reader asks for all', () => {
    const data = allAccountsVoiceFixture()
    const text = renderText(page(data, { accounts: 'all' }))
    for (const a of data.where!.rows) expect(text).toContain(a.name.replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '').trim().split(' ')[0])
    expect(text).not.toContain('accounts →')
  })
})

describe('Who is talking', () => {
  it('prints each group by videos, all comments to date, with what they want and what stops them', () => {
    const data = conversationFixture()
    const text = renderText(page(data))
    expect(text).toContain('Who is talking Videos each group comments on, all comments to date')
    expect(text).toContain('What they want')
    expect(text).toContain('What stops them')
    const first = [...data.cast.personas].sort((a, b) => b.videos - a.videos)[0]
    expect(text).toContain(first.name)
  })

  it('is not drawn where nobody was described', () => {
    expect(renderText(page(refusedVoiceFixture()))).not.toContain('Who is talking')
  })
})

describe('The market’s words, kind by kind', () => {
  it('draws the six kinds in the artboard’s pairs and words', () => {
    const text = renderText(page())
    let at = -1
    for (const word of ['Praised a bag', 'Said they want to buy', 'Asked a question', 'Complained about something', 'Wished for something', 'Pushed back']) {
      const i = text.indexOf(`${word}`, at + 1)
      expect(i, word).toBeGreaterThan(at)
      at = i
    }
    expect(text).toContain('What people said most in September, by what they were doing. Makers’ own talk is set apart.')
  })

  it('prints a card as the artboard does: the market’s videos and split, said most, the brands’ own, one quote', () => {
    const question = SEALAND_KINDS.find((k) => k.kind === 'question')!
    const markup = render(<KindCard k={question} names={NAMES} />)
    const text = renderText(<KindCard k={question} names={NAMES} />)
    expect(text).toContain('Asked a question 449 videos')
    expect(text).toContain('other bags 426 · Patagonia 8 · Cotopaxi 7')
    expect(text).toContain('Said most Videos')
    expect(text).toContain('Seeking brand and model recommendations')
    expect(text).toContain('Cotopaxi 2 · Patagonia 2 · other bags 16')
    expect(text).toContain('On videos about Sealand and its rivals')
    expect(text).toContain('Questions about bag size and brand')
    expect(text).toContain('YouTube · 15 Sep · Other bags in your market')
    expect(copyViolations(markup)).toEqual([])
    expect(bans(markup)).toEqual([])
  })

  it('names the client in its gold and leaves a card with no quote without one', () => {
    const praise = SEALAND_KINDS.find((k) => k.kind === 'praise')!
    const markup = render(<KindCard k={praise} names={NAMES} />)
    expect(markup).toContain('text-[#9A6B00]')
    expect(renderText(<KindCard k={praise} names={NAMES} />)).not.toContain('“')
  })

  it('is not drawn where the analysis was not read', () => {
    const data = conversationFixture()
    expect(renderText(page({ ...data, conversation: null }))).not.toContain('The market’s words')
  })
})

describe('the empty workspace and the skeleton', () => {
  it('says one neutral line with no machinery', () => {
    const text = renderText(<VoiceSurfacePage data={null} params={{}} />)
    expect(text).toContain('Your market’s first month will appear here.')
  })

  it('the skeleton draws the title and the artboard’s cards', () => {
    const markup = render(<VoiceLoading />)
    expect(markup).toContain('Loading Conversation')
    expect(markup.match(/data-card=""/g)?.length).toBe(6)
  })
})
