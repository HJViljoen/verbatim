import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
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
    // A heading that said "Growing" would make the claim before a row earned
    // it; rule (c) refuses a direction word outside a verdict node, and the
    // copy-contract test above is what actually holds the line. The artboard's
    // two column headings are the one element of this block not ported.
    expect(text).not.toMatch(/Growing · /)
  })

  it('does not draw a second column when only one arm has rows', () => {
    // Össur's September is that state. The grid drew an empty half and ruled a
    // hairline down the middle of it, against nothing.
    const markup = render(voiceMovers.render(refusedVoiceFixture(), 'app', ctx))
    expect(markup).not.toContain('xl:grid-cols-2')
  })

  it('sets the two banded arms side by side, the way the artboard does', () => {
    // PORTED (wave 2): growing and fading are two readings of ONE axis, so
    // they are two ruled columns rather than two stacked lists — the fading
    // arm used to begin below the fold.
    const markup = render(voiceMovers.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('xl:grid-cols-2')
    const text = draw()
    expect(text.indexOf('a larger share than last month')).toBeLessThan(text.indexOf('a smaller share than last month'))
  })

  it('prints the month a banded row moved FROM, with that month\u2019s own n', () => {
    // `Mover.verdict.baseline` has carried the other side since WP3 and
    // nothing rendered it. Not the mock's bare "Aug 6.8%": the two months have
    // different denominators, which is the whole reason the change is banded.
    const text = draw()
    expect(text).toContain('9.4% · 130 of 1,388 · Aug 6.8% of 1,200')
    expect(text).toContain('5.1% · 71 of 1,388 · Aug 3.2% of 1,200')
  })

  it('prints a new theme as a level with a flag and draws no change on it', () => {
    const text = draw()
    expect(text).toContain('New Second-hand resale value 1.9% · 26 of 1,388 first heard Sep 2026')
  })

  it('carries gone quiet with the month it was last heard in, in the one flags row', () => {
    const text = draw()
    expect(text).toContain('Gone quiet Festival season packs last heard Jun 2026')
    // ONE flags row, the mock's — not two more arms with their own headings.
    expect(text).not.toContain('No longer being said')
    expect(text).not.toContain('First heard this month ·')
  })

  it('says "nothing else moved" beside a populated list, and only while it is true', () => {
    const base = voiceFixture()
    expect(draw()).toContain('Nothing else moved clearly this month.')
    const many = Array.from({ length: 9 }, (_, i) =>
      mover({ id: `g${i}`, label: `Growing ${i}`, verdict: { changePts: 3 - i / 10 } }))
    // Three rows below the cut DID move, and the expander one line to the
    // right is offering to show them.
    expect(draw({ ...base, movers: { ...base.movers, growing: many, shown: 6 } })).not.toContain('Nothing else moved clearly')
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
    expect(text).toContain('Admiration for personal resilience ▼ 5.1 pts · band 4 8.8% · 34 of 388 · Aug 13.9% of 402')
    expect(text).not.toContain('Inside the band')
    // A minus under "a larger share than last month" is the one-axis failure
    // this block's header describes; the row is in the arm its verdict names.
    expect(text).toContain('a smaller share than last month')
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

  it('rules the two-column comparison off before the neutral arm', () => {
    // "Inside the band" lands directly under "a larger share than last month",
    // at the same width, with the columns' own rule stopping just above it: a
    // scan attributes a no-clear-change row to the larger-share arm. The rule
    // runs the full width of the block, so it reads as the end of the
    // comparison rather than as a divider inside one column of it.
    const markup = render(voiceMovers.render(voiceFixture(), 'app', ctx))
    const flat = markup.indexOf('Inside the band')
    expect(flat).toBeGreaterThan(-1)
    expect(markup.slice(0, flat)).toContain('<div class="border-t border-border/70"></div>')
    // No rule where there is no neutral arm to separate.
    expect(render(voiceMovers.render(refusedVoiceFixture(), 'app', ctx))).not.toContain('<div class="border-t border-border/70"></div>')
  })

  it('names no audience in its heading — the audience is the switch\u2019s, and it travels on the meta', () => {
    // The artboard was drawn in the category and "Movers · category themes"
    // was ported as a constant. Read in the client's own brand the block then
    // printed that heading directly above a meta line naming a different
    // population — a label contradicting the figure beside it on every
    // audience but one.
    const base = voiceFixture()
    const client = {
      ...base,
      audience: { ...base.audience, selected: 'client', label: 'Your own brand', videos: 212 },
    }
    const text = draw(client)
    expect(voiceMovers.title).toBe('Movers')
    expect(text).not.toContain('category themes')
    expect(text).toContain('share of 212 videos in this audience · Sep 2026 vs Aug 2026')
  })

  it('keeps its key, which is a stored contract', () => {
    expect(voiceMovers.key).toBe('voice.moved')
  })
})
