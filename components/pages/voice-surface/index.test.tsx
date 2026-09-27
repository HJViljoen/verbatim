import { describe, expect, it } from 'vitest'

import { blockAnswers, figureConflicts, figureCount, mergeFigures, type RenderMode } from '@/lib/blocks/types'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { VOICE_BLOCKS, VoiceSurfacePage, voiceContext } from './index'
import { allAccountsVoiceFixture, ossurVoiceFixture, refusedVoiceFixture, voiceFixture } from './fixture'
import { BlockFrame } from '@/components/blocks/frame'
import VoiceLoading from '@/app/dashboard/voice/loading'

// Conversation — the page (market-first WP2.4, plan §2.4).

const MODES: RenderMode[] = ['app', 'print', 'email']
const STATES = () => [voiceFixture(), ossurVoiceFixture(), refusedVoiceFixture()]

describe('VOICE_BLOCKS', () => {
  it('is the six §2.4 names, in the order a reader asks: the market, every theme, one in full, who is talking, its words, where it talks', () => {
    expect(VOICE_BLOCKS.map((b) => b.key)).toEqual(['voice.audience', 'voice.board', 'voice.theme', 'voice.cast', 'voice.words', 'voice.where'])
  })

  // The 25 Sep rulings on a rebuilt page: a header is its title alone and a
  // footer holds links alone, so no block passes BlockFrame a meta or a footer
  // note (the registry sweep's check, run here for Conversation's blocks).
  it('no block passes BlockFrame a meta or a footer note, in any state or mode', () => {
    for (const block of VOICE_BLOCKS) {
      for (const data of [...STATES(), allAccountsVoiceFixture()]) {
        for (const mode of MODES) {
          const el = block.render(data, mode, voiceContext({})) as { type?: unknown; props?: { meta?: unknown; footerNote?: unknown } }
          expect(el?.type, `${block.key} ${data.brand} ${mode}`).toBe(BlockFrame)
          expect(el?.props?.meta ?? null, `${block.key} ${data.brand} ${mode}`).toBeNull()
          expect(el?.props?.footerNote ?? null, `${block.key} ${data.brand} ${mode}`).toBeNull()
        }
      }
    }
  })

  // Every block, in every state, in every mode: one case each, so a failure
  // names the block, the state and the mode it broke in.
  const CASES = VOICE_BLOCKS.flatMap((block) =>
    (['sealand', 'ossur', 'before MF1'] as const).flatMap((state) => MODES.map((mode) => [block.key, state, mode] as const)))
  const stateOf = (state: 'sealand' | 'ossur' | 'before MF1') =>
    state === 'sealand' ? voiceFixture() : state === 'ossur' ? ossurVoiceFixture() : refusedVoiceFixture()
  it.each(CASES)('%s renders in the %s state in %s with no copy violation', (key, state, mode) => {
    const block = VOICE_BLOCKS.find((b) => b.key === key)!
    expect(copyViolations(block.render(stateOf(state), mode, voiceContext({})))).toEqual([])
  })

  it('no two blocks print the same figure token with two different values', () => {
    for (const data of STATES()) {
      const tables = VOICE_BLOCKS.map((b) => blockAnswers(b, data).figures)
      expect(figureConflicts(tables), data.brand).toEqual([])
    }
  })

  it('keeps the page inside the 30-number budget', () => {
    for (const data of STATES()) {
      const tables = VOICE_BLOCKS.map((b) => blockAnswers(b, data).figures)
      expect(figureCount(tables), `${data.brand}: ${Object.keys(mergeFigures(tables)).join(', ')}`).toBeLessThanOrEqual(30)
    }
  })

  it('every block has an honest sentence for its own emptiness', () => {
    for (const block of VOICE_BLOCKS) {
      const empty = block.emptyState(refusedVoiceFixture())
      expect(typeof empty === 'string' || empty === null, block.key).toBe(true)
    }
  })
})

describe('nothing skipped (§5.9, WP2.4’s done-when)', () => {
  it('every theme at 10+ in the fixture’s month is on Conversation: 21 on staging’s September, against 7 before', () => {
    const data = voiceFixture()
    const text = renderText(<VoiceSurfacePage data={data} params={{}} />)
    const every = [...data.board.rows, ...(data.board.makers ?? []), ...(data.board.setAside ?? [])]
    expect(every).toHaveLength(data.board.atTen)
    expect(data.board.atTen).toBe(21)
    for (const t of every) expect(text, t.label).toContain(t.label)
  })
})

describe('the skeleton at app/dashboard/voice/loading.tsx', () => {
  it('draws the same six growing sections the page does, and asks for no row', () => {
    const markup = render(<VoiceLoading />)
    expect(markup.match(/data-tile=""/g)).toHaveLength(VOICE_BLOCKS.length)
    expect(markup).not.toMatch(/row-span-\d/)
    expect(markup).toContain('Loading Conversation')
  })
})

describe('VoiceSurfacePage', () => {
  it('draws six tiles under the bar, the theme pane at #theme and the accounts at #where', () => {
    const markup = render(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    expect(markup.match(/data-tile=""/g)).toHaveLength(6)
    expect(markup).toContain('id="theme"')
    expect(markup).toContain('id="board"')
    expect(markup).toContain('id="where"')
  })

  it('names the military-dog channel only under "set aside" on the whole page (WP3.8 done-when)', () => {
    for (const data of [voiceFixture(), allAccountsVoiceFixture()]) {
      const text = renderText(<VoiceSurfacePage data={data} params={{}} />)
      expect(text.split('Mike Ritland').length - 1).toBe(1)
      expect(text.indexOf('Mike Ritland')).toBeGreaterThan(text.indexOf('Set aside, off-topic'))
    }
  })

  it('gives no block a fixed height, so nothing on this page can be cut in silence', () => {
    const markup = render(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    expect(markup).not.toMatch(/data-row=/)
    expect(markup).not.toMatch(/row-span-/)
  })

  it('prints the bar’s one line and no horizon (25 Sep rulings; lib/nav.ts)', () => {
    const text = renderText(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    expect(text).toContain('Conversation')
    expect(text).toContain('as at the 20 Sep update · updates paused')
    expect(text).not.toContain('This month')
    expect(text).not.toContain('Last 3 months')
  })

  it('prints no footnote under a block, no "how sound" string, and keeps the legal privacy line', () => {
    const text = renderText(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    expect(text.toLowerCase()).not.toContain('how sound')
    expect(text).not.toContain('We did not record how themes were grouped')
    expect(text).toContain('Commenters are never identified; quotes carry platform and date only.')
  })

  it('takes the page bar’s right-hand control from its caller, never from a hook', () => {
    const text = renderText(<VoiceSurfacePage data={voiceFixture()} params={{}} controls={<span>How to read this page</span>} />)
    expect(text).toContain('How to read this page')
  })

  it('says the workspace has been read at all before it says anything else', () => {
    const text = renderText(<VoiceSurfacePage data={null} params={{}} />)
    expect(text).toContain('Nothing has been read for this workspace yet')
  })

  it('renders the whole page for Össur (paused, no maker rule) and before MF1', () => {
    expect(renderText(<VoiceSurfacePage data={ossurVoiceFixture()} params={{}} />)).toContain('Brand boycott over politics')
    expect(renderText(<VoiceSurfacePage data={refusedVoiceFixture()} params={{}} />)).toContain('Reading who is talking is not switched on for this workspace yet.')
  })
})
