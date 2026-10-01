import { describe, expect, it } from 'vitest'

import { blockAnswers, figureConflicts, figureCount, mergeFigures, type RenderMode } from '@/lib/blocks/types'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { VOICE_BLOCKS, VoiceSurfacePage, voiceContext } from './index'
import { allAccountsVoiceFixture, ossurVoiceFixture, refusedVoiceFixture, voiceFixture } from './fixture'
import { BlockFrame } from '@/components/blocks/frame'

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
  it('every conversation at 10+ in the fixture’s month is on Conversation, the makers’ in their one line', () => {
    const data = voiceFixture()
    const text = renderText(<VoiceSurfacePage data={data} params={{}} />)
    const every = [...data.board.rows, ...(data.board.makers ?? [])]
    expect(every).toHaveLength(21)
    for (const t of every) expect(text, t.label).toContain(t.label)
  })
})

describe('VoiceSurfacePage (the approved artboard; ./conversation.test.tsx has each block)', () => {
  it('draws the board, the pane at #theme and the accounts at #where, and no legacy tile', () => {
    const markup = render(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    expect(markup).toContain('id="theme"')
    expect(markup).toContain('id="where"')
    expect(markup).not.toMatch(/data-tile=""/)
  })

  it('never names the military-dog channel on the whole page', () => {
    for (const data of [voiceFixture(), allAccountsVoiceFixture()]) {
      const text = renderText(<VoiceSurfacePage data={data} params={{}} />)
      expect(text).not.toContain('Mike Ritland')
    }
  })

  it('prints the title alone: no "as at" line, no horizon, no footnote', () => {
    const text = renderText(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    expect(text).toContain('Conversation')
    expect(text).not.toContain('as at the')
    expect(text).not.toContain('This month')
    expect(text.toLowerCase()).not.toContain('how sound')
    expect(text).not.toContain('We did not record how themes were grouped')
  })

  it('takes the title row’s right-hand control from its caller, never from a hook', () => {
    const text = renderText(<VoiceSurfacePage data={voiceFixture()} params={{}} controls={<span>A control</span>} />)
    expect(text).toContain('A control')
  })

  it('says one neutral line where nothing has been read', () => {
    const text = renderText(<VoiceSurfacePage data={null} params={{}} />)
    expect(text).toContain('Your market’s first month will appear here.')
  })

  it('renders the whole page for Össur (paused, no maker rule) and before MF1', () => {
    expect(renderText(<VoiceSurfacePage data={ossurVoiceFixture()} params={{}} />)).toContain('Brand boycott over politics')
    expect(renderText(<VoiceSurfacePage data={refusedVoiceFixture()} params={{}} />)).toContain('Every conversation in September')
  })
})
