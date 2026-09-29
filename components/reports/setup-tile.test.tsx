import { describe, expect, it } from 'vitest'

import { renderText } from '@/lib/test/render'
import type { BriefCard } from '@/lib/reports/briefs'
import { ReportsSetupTile, briefCardsFor } from './setup-tile'

// Finish-list item 16: a client met three "Never built … Building one takes a
// few minutes" cards with no way to build one.

const card = (role: BriefCard['role'], built: boolean): BriefCard => ({
  role,
  artefact: 'brief:sales',
  label: role,
  what: 'x',
  reportId: null,
  latest: built ? { snapshotId: `s-${role}`, title: 't', readingLine: 'r' } : null,
  cadence: null,
  recipients: [],
  sending: false,
  scheduleKnown: true,
  everBuilt: built,
  poolCappedAt: null,
  reader: null,
  monthChip: null,
  figures: [],
  pdf: null,
  stamp: null,
})

describe('briefCardsFor', () => {
  const cards = [card('sales_brief', false), card('market_brief', true), card('content_brief', false)]

  it('shows a client only the briefs with a build behind them', () => {
    expect(briefCardsFor(cards, false).map((c) => c.role)).toEqual(['market_brief'])
    expect(briefCardsFor([card('sales_brief', false)], false)).toEqual([])
  })

  it('shows the operator all three', () => {
    expect(briefCardsFor(cards, true)).toHaveLength(3)
  })
})

describe('ReportsSetupTile', () => {
  it('says reports are being set up with Heinrich, and who to write to, with no build promise', () => {
    const t = renderText(<ReportsSetupTile />)
    expect(t).toContain('Reports for your team are being set up with Heinrich')
    expect(t).toContain('heinrichviljoen@verbatimintel.com')
    expect(t).not.toMatch(/Never built|takes a few minutes|Studio/)
  })
})
