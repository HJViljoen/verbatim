import { describe, it, expect } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render } from '@/lib/test/render'

import { overviewCategory } from '@/components/pages/overview/category'
import { overviewFixture } from '@/components/pages/overview/fixture'
import { voiceBoard } from '@/components/pages/voice-surface/board'
import { voiceTheme } from '@/components/pages/voice-surface/theme'
import { voiceFixture } from '@/components/pages/voice-surface/fixture'
import { weekRising } from '@/components/pages/week/rising'
import { weekFixture } from '@/components/pages/week/fixture'
import { weeklyThemes } from '@/components/blocks/weekly/themes'
import { forSales } from '@/components/blocks/weekly/sales'
import { weeklyFixture } from '@/components/blocks/weekly/fixture'

// RULE (c) AND THE PRODUCT'S OWN VOCABULARY (Block B fix pass).
//
// `PROSE_POLICY['pass_b_theme']` is 'none': a theme's label and description are
// the one model-written slot the pipeline never direction-scrubs, because a
// direction word in them is about the THING and not about a reading of it.
// WP13 marked the description and not the label, and every surface that ranks a
// theme prints the label — so rule (c), which sweeps unmarked markup, failed
// open on whichever theme happened to rank.
//
// These are real labels from the register, not invented ones:
//   "Concerns about declining quality"   (Sealand)
//   "Technology should improve access"   (Össur)
//   "Climbing safety and injury worries" (Sealand)
// declining / improve / climbing are all in DIRECTION_WORDS.
//
// The test substitutes one into each block that prints a label and asserts the
// block still keeps rule (c). It is the regression this pass exists for: the
// six blocks below all failed it before the labels were marked `subject`.

const LABEL = 'Concerns about declining quality'
const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

function directionWords(markup: string): string[] {
  return copyViolations(markup)
    .filter((v) => v.rule === 'direction-word')
    .map((v) => v.detail ?? v.text)
}

describe('a theme label never fails rule (c)', () => {
  it('OV3 · what moved most', () => {
    const data = overviewFixture()
    data.category.growing = data.category.growing.map((m) => ({ ...m, label: LABEL }))
    for (const mode of MODES) {
      expect(directionWords(render(overviewCategory.render(data, mode, ctx)))).toEqual([])
    }
  })

  it('C2 · Conversation’s board, every group’s rows (WP2.4)', () => {
    const data = voiceFixture()
    const relabel = <T extends { label: string }>(rows: T[]): T[] => rows.map((t) => ({ ...t, label: LABEL }))
    data.board = { ...data.board, rows: relabel(data.board.rows), makers: data.board.makers ? relabel(data.board.makers) : null }
    for (const mode of MODES) {
      expect(directionWords(render(voiceBoard.render(data, mode, ctx)))).toEqual([])
    }
  })

  it('VO3 · the theme card, label as well as description', () => {
    const data = voiceFixture()
    if (data.theme.state !== 'ready') throw new Error('fixture is not a ready theme')
    data.theme.label = LABEL
    for (const mode of MODES) {
      expect(directionWords(render(voiceTheme.render(data, mode, ctx)))).toEqual([])
    }
  })

  it('WK§3 · the riser, whose label sits inside a level node', () => {
    const data = weekFixture()
    data.rising.rows = data.rising.rows.map((r) => ({ ...r, label: LABEL }))
    for (const mode of MODES) {
      const markup = render(weekRising.render(data, mode, ctx))
      expect(directionWords(markup)).toEqual([])
      // Rule (b) still holds: the level node reads its whole text, marked
      // descendants included, so marking the word does not lose the "of N".
      expect(copyViolations(markup).filter((v) => v.rule === 'level-denominator')).toEqual([])
    }
  })

  it('WR3 · the weekly report’s new themes — a SENT artefact', () => {
    const data = weeklyFixture()
    data.heard = { ...data.heard!, rows: data.heard!.rows.map((t) => ({ ...t, label: LABEL })) }
    for (const mode of MODES) {
      expect(directionWords(render(weeklyThemes.render(data, mode, ctx)))).toEqual([])
    }
  })

  it('WR4 · the weekly report’s for-sales rows — a SENT artefact', () => {
    const data = weeklyFixture()
    // §4's groups are `ForSalesData.objections` since block D wave 2 — the
    // counted shape both artefacts read. The label under test is the same one:
    // a theme a model named, printed in a heading.
    data.sales.objections = data.sales.objections.map((g) => ({ ...g, label: LABEL }))
    for (const mode of MODES) {
      expect(directionWords(render(forSales.render(data, mode, ctx)))).toEqual([])
    }
  })
})
