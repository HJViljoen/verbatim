import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { renderText } from '@/lib/test/render'
import { voiceMovers } from './movers'
import { mover, refusedVoiceFixture, voiceFixture } from './fixture'

// VO2 · what moved, on one axis (Phase 1 WP13).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, { audience: 'industry-other' })

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceMovers.render(data, mode, ctx))

describe('voiceMovers', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceMovers.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('names the arms by what was done to the number, never with a direction word', () => {
    const text = draw()
    expect(text).toContain('Cleared their band · a larger share than last month')
    expect(text).toContain('Cleared their band · a smaller share than last month')
    expect(text).toContain('Inside the band')
    expect(text).toContain('No longer being said')
    // A heading that said "Growing" would make the claim before a row earned
    // it; rule (c) refuses a direction word outside a verdict node, and the
    // copy-contract test above is what actually holds the line.
    expect(text).not.toMatch(/Growing · /)
  })

  it('prints a new theme as a level with a flag and draws no change on it', () => {
    const text = draw()
    expect(text).toContain('Second-hand resale value 1.9% 26 of 1,388 first heard this month')
  })

  it('carries gone quiet with the month it was last heard in', () => {
    expect(draw()).toContain('Festival season packs gone quiet · last heard Jun 2026')
  })

  it('says the re-read caveat once, for the list, not once per row', () => {
    const text = draw()
    const note = 'a change that is really a re-reading cannot be marked'
    expect(text.split(note)).toHaveLength(2)
  })

  it('keeps every arm inside the length the data asked for', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      mover({ id: `g${i}`, label: `Growing ${i}`, verdict: { changePts: 3 - i / 10 } }))
    const base = voiceFixture()
    const six = draw({ ...base, movers: { ...base.movers, growing: many, shown: 6 } })
    const ten = draw({ ...base, movers: { ...base.movers, growing: many, shown: 10, expanded: true } })
    expect(six.match(/Growing \d/g)).toHaveLength(6)
    expect(ten.match(/Growing \d/g)).toHaveLength(10)
  })

  it('offers the expanded list, and offers to close it again', () => {
    const base = voiceFixture()
    expect(draw()).toContain('Show 10 of each')
    expect(draw({ ...base, movers: { ...base.movers, expanded: true, shown: 10 } })).toContain('Show fewer')
  })

  it('declares at most two figures — one list may not spend the page budget', () => {
    const table = blockAnswers(voiceMovers, voiceFixture()).figures
    expect(Object.keys(table)).toHaveLength(2)
    expect(Object.values(table).every((f) => f.unit === 'pct')).toBe(true)
  })

  it('hands up every verdict behind every arm, including the flat and the new', () => {
    expect(blockAnswers(voiceMovers, voiceFixture()).verdicts).toHaveLength(5)
  })

  it('renders the one-mover month production is in without complaint', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).toContain('Admiration for personal resilience 8.8% 34 of 388')
    expect(text).not.toContain('Inside the band')
  })

  it('"Nothing moved clearly this month" is an answer, not a hole', () => {
    const base = voiceFixture()
    const bare = {
      ...base,
      movers: { ...base.movers, growing: [], fading: [], flat: [], newcomers: [], goneQuiet: [], note: 'Nothing moved clearly this month.' },
    }
    expect(voiceMovers.emptyState(bare)).toBe('Nothing moved clearly this month.')
    expect(draw(bare)).toContain('Nothing moved clearly this month.')
  })

  it('keeps its key, which is a stored contract', () => {
    expect(voiceMovers.key).toBe('voice.moved')
  })
})
