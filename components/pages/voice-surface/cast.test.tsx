import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { voiceCast } from './cast'
import { refusedVoiceFixture, voiceFixture } from './fixture'

// VO4 · the cast, current state only (Phase 1 WP13, decision W).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceCast.render(data, mode, ctx))

describe('voiceCast', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceCast.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('prints each group against the month it was read in', () => {
    expect(draw()).toContain('The one-bag commuter 38% 527 of 1,388')
  })

  it('says the group floor on the block rather than implying it', () => {
    expect(draw()).toContain('A group is named only where at least 3 videos carry it · this month as it stands, never compared with another month')
  })

  it('dates the cast by the update that wrote it — this block is the one exception on the page', () => {
    expect(draw()).toContain('Who is talking, as read on')
  })

  it('says when a later update has landed since the profile was written', () => {
    const base = voiceFixture()
    expect(draw({ ...base, cast: { ...base.cast, stale: true } })).toContain('a later update has landed since')
  })

  it('names the share no group was named on', () => {
    expect(draw()).toContain('No group was named on 16% of this audience’s videos')
  })

  it('keeps the crowd figure — decoration the owner chose, once per group', () => {
    const markup = render(voiceCast.render(voiceFixture(), 'app', ctx))
    expect(markup.match(/<svg/g)).toHaveLength(1)
  })

  it('does not rebuild "how the mix has moved", here or anywhere (cut #79)', () => {
    const text = draw()
    expect(text).not.toMatch(/how the mix/i)
    expect(text).not.toMatch(/over time/i)
  })

  it('omits the dropped-groups line rather than stubbing it (decision W)', () => {
    // `consumer_profiles.dropped` is unpopulated; a line saying "0 groups were
    // just below the floor" would be a false statement about the data.
    expect(draw()).not.toMatch(/below the floor this month/i)
  })

  it('tells "not switched on" apart from "too little conversation"', () => {
    expect(voiceCast.emptyState(refusedVoiceFixture()))
      .toBe('Reading who is talking is not switched on for this workspace yet.')
    const base = voiceFixture()
    const thin = {
      ...base,
      cast: { ...base.cast, state: 'no_personas' as const, personas: [], empty: 'Too little conversation in this update to describe who is talking.' },
    }
    expect(voiceCast.emptyState(thin)).toBe('Too little conversation in this update to describe who is talking.')
  })

  it('still prints the floor note when it has nothing to show — the floor is why', () => {
    expect(draw(refusedVoiceFixture())).toContain('A group is named only where at least 3 videos carry it')
  })

  it('declares one figure — the cast is a description, not a ladder', () => {
    const table = blockAnswers(voiceCast, voiceFixture()).figures
    expect(Object.keys(table)).toEqual(['cast_lead_share'])
    expect(table.cast_lead_share.value).toBe(38)
  })

  it('declares no verdicts at all: current state carries no comparison', () => {
    expect(blockAnswers(voiceCast, voiceFixture()).verdicts).toEqual([])
  })

  it('hands its voices up as refs', () => {
    expect(blockAnswers(voiceCast, voiceFixture()).quotes).toEqual(['e:9'])
  })

  it('keeps its key, which is a stored contract', () => {
    expect(voiceCast.key).toBe('voice.cast')
  })
})
