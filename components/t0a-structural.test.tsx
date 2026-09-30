import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { markupText, render } from '@/lib/test/render'

import { FRONT_PAGE_BLOCKS, OVERVIEW_BLOCKS } from '@/components/pages/overview'
import { SUBJECT_BLOCKS } from '@/components/pages/subjects'
import { WEEKLY_BLOCKS } from '@/components/blocks/weekly'
import { ALL_MONTHLY_BLOCKS } from '@/components/blocks/monthly'
import { QUARTERLY_BLOCKS } from '@/components/blocks/quarterly'
import { VOICE_BLOCKS } from '@/components/pages/voice-surface'
import { MARKET_BLOCKS } from '@/components/pages/market-surface'
import { COMPETITIVE_BLOCKS } from '@/components/pages/competitive-surface'
import { WEEK_BLOCKS } from '@/components/pages/week'
import { WeekBars } from '@/components/charts/week-bars'

import {
  calibrationOverviewFixture, marketArrivalsFixture, marketFrontFixture, overviewFixture, refusedFixture as overviewRefused,
} from '@/components/pages/overview/fixture'
import { calibrationFixture, marketSubjectsFixture, refusedFixture as subjectsRefused, subjectsFixture } from '@/components/pages/subjects/fixture'
import { voiceFixture } from '@/components/pages/voice-surface/fixture'
import { marketFixture, sealandMovesFixture } from '@/components/pages/market-surface/fixture'
import { brandsFixture, ossurBrandsFixture } from '@/components/pages/competitive-surface/brands/fixture'
import { competitiveFixture } from '@/components/pages/competitive-surface/fixture'
import { marketWeekFixture, ossurWeeksFixture, weekFixture } from '@/components/pages/week/fixture'
import { weeklyFixture } from '@/components/blocks/weekly/fixture'
import { filledSlotsFixture, monthlyFixture } from '@/components/blocks/monthly/fixture'
import { calibratedQuarterFixture, quarterlyFixture } from '@/components/blocks/quarterly/fixture'
import { weekVolumesBlock } from '@/lib/pages/overview-market/weeks'
import { changesFromLog } from '@/lib/reading/comparability'
import { SEALAND_NEXT_UPDATE, STAGING_CHANGES, STAGING_RIVALS, STAGING_UPDATES, STAGING_WEEK_VOLUMES } from '@/lib/test/week-fixture'
import { WEEK_LINE } from '@/lib/week-line-config'
import { SEALAND_CLIENT_ID } from '@/lib/config'

// T0a's STRUCTURAL CHECKS (research/T0-inventory.md, "Structural checks"):
// what a phrase list cannot see. Each walks the client block registries in
// every mode, so a block that grows a new chip, a new month-before cell or a
// new figure on a subject that is not ready fails here whether or not its own
// test thought to look.
//
//  1. No `[data-pair-chip]` node in any rendered client block.
//  2. A fixture whose month pair is REFUSED (Sealand, September against
//     August: we changed our searches in September) renders no previous-month
//     node: no "Aug of N" head, no August level or trail month, no "the month
//     before", no "against k of n", no "at this point last month".
//  3. A fixture with a PROVISIONAL subject renders no `figure` or `level` node
//     in that subject's row.
//  4. The week bars render no "Our changes" row and no "none gathered" label,
//     and their axis starts after the last rule change.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

type Renderish = { key: string; render: (d: never, m: RenderMode, c: typeof ctx) => ReactNode }
const listOf = (g: unknown): Renderish[] =>
  Array.isArray(g) ? (g as Renderish[]) : Object.entries(g as Record<string, Omit<Renderish, 'key'>>).map(([key, r]) => ({ key, ...r }))

/** Every client registry, with the states its package ships. */
const REGISTRIES: [string, Renderish[], unknown[]][] = [
  ['overview', listOf(OVERVIEW_BLOCKS), [overviewFixture(), overviewRefused(), marketFrontFixture(), marketArrivalsFixture(), calibrationOverviewFixture()]],
  ['subjects', listOf(SUBJECT_BLOCKS), [subjectsFixture(), subjectsRefused(), calibrationFixture(), marketSubjectsFixture()]],
  ['voice-surface', listOf(VOICE_BLOCKS), [voiceFixture()]],
  ['market-surface', listOf(MARKET_BLOCKS), [marketFixture(), sealandMovesFixture()]],
  ['competitive-surface', listOf(COMPETITIVE_BLOCKS), [competitiveFixture(), brandsFixture(), ossurBrandsFixture()]],
  ['week', listOf(WEEK_BLOCKS), [weekFixture(), marketWeekFixture(), ossurWeeksFixture()]],
  ['weekly', listOf(WEEKLY_BLOCKS), [weeklyFixture()]],
  ['monthly', listOf(ALL_MONTHLY_BLOCKS), [monthlyFixture(), filledSlotsFixture()]],
  ['quarterly', listOf(QUARTERLY_BLOCKS), [quarterlyFixture(), calibratedQuarterFixture()]],
]

const renderOf = (r: Renderish, data: unknown, mode: RenderMode): string => render(r.render(data as never, mode, ctx))

describe('T0a structural check 1: no pair chip in any client block', () => {
  it('renders no [data-pair-chip] node, in any registry, state or mode', () => {
    const bad: string[] = []
    let renders = 0
    for (const [name, blocks, states] of REGISTRIES) {
      for (const block of blocks) {
        for (const data of states) {
          for (const mode of MODES) {
            renders++
            if (renderOf(block, data, mode).includes('data-pair-chip')) bad.push(`${name}/${block.key} [${mode}]`)
          }
        }
      }
    }
    expect(bad).toEqual([])
    expect(renders).toBeGreaterThan(300)
  })
})

/**
 * A previous-month node, in any of the forms the product has printed one: a
 * month-before column head ("Aug of 351"), an August level or trail month
 * ("Aug 10% of 377", "August 11%", "Aug 38 of 351"), the words "the month
 * before", "against k of n", "at this point last month / in August", and a
 * "vs Aug" column.
 */
const PREV_MONTH_NODE: RegExp[] = [
  /\bAug(?:ust)?\s+of\s+[\d,]+/,
  /\bAug(?:ust)?:?\s+[\d.]+%/,
  /\bAug(?:ust)?:?\s+[\d,]+\s+of\s+[\d,]+/,
  /the month before/i,
  /\bagainst [\d,]+ of [\d,]+/,
  /at this point (?:last month|in August)/i,
  /\bvs\.? Aug/i,
]

describe('T0a structural check 2: a refused month pair prints no month before', () => {
  // Sealand's September, read on the fixtures' clocks: the market and themes
  // pairs are refused (we changed our searches in September).
  const REFUSED: [string, Renderish[], unknown[]][] = [
    ['your market', listOf(FRONT_PAGE_BLOCKS), [marketFrontFixture(), marketArrivalsFixture()]],
    ['subjects (refused)', listOf(SUBJECT_BLOCKS), [subjectsRefused(), marketSubjectsFixture()]],
    ['the monthly', listOf(ALL_MONTHLY_BLOCKS), [monthlyFixture(), filledSlotsFixture()]],
    ['this week', listOf(WEEK_BLOCKS), [marketWeekFixture()]],
  ]

  it('renders no previous-month node on any block, in any mode', () => {
    const bad: string[] = []
    for (const [name, blocks, states] of REFUSED) {
      for (const block of blocks) {
        for (const data of states) {
          for (const mode of MODES) {
            const text = markupText(renderOf(block, data, mode))
            for (const re of PREV_MONTH_NODE) {
              const hit = re.exec(text)
              if (hit) bad.push(`${name}/${block.key} [${mode}] ${JSON.stringify(hit[0])}`)
            }
          }
        }
      }
    }
    expect(bad).toEqual([])
  })
})

/** The markup of the row a label sits in: the nearest enclosing `<tr>` or
 *  `role="row"` element, balanced. Null where the label is in no row. */
function rowAround(markup: string, at: number): string | null {
  const tr = markup.lastIndexOf('<tr', at)
  const roleAttr = markup.lastIndexOf('role="row"', at)
  const div = roleAttr >= 0 ? markup.lastIndexOf('<', roleAttr) : -1
  const start = Math.max(tr, div)
  if (start < 0) return null
  const tag = start === tr ? 'tr' : markup.slice(start + 1, markup.indexOf(' ', start))
  let depth = 0
  const open = new RegExp(`<${tag}[\\s>]`, 'g')
  const close = `</${tag}>`
  let i = start
  while (i < markup.length) {
    open.lastIndex = i
    const nextOpen = open.exec(markup)
    const nextClose = markup.indexOf(close, i)
    if (nextClose < 0) return null
    if (nextOpen && nextOpen.index < nextClose) {
      depth++
      i = nextOpen.index + 1
    } else {
      depth--
      i = nextClose + close.length
      if (depth === 0) return markup.slice(start, i)
    }
  }
  return null
}

describe('T0a structural check 3: a provisional subject prints no figure in its row', () => {
  // Each: a block, a fixture with at least one provisional subject, and the
  // provisional subjects' labels as the block prints them.
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')
  // Each case: the block, the fixture, its provisional labels, and every
  // subject label the block may print (to bound a row).
  const cases: [string, Renderish, unknown, string[], string[]][] = (() => {
    const front = marketFrontFixture()
    const unchecked = calibrationOverviewFixture({ unchecked: ['water'] })
    const rail = calibrationFixture()
    const monthly = monthlyFixture()
    const quarter = calibratedQuarterFixture()
    const labelsOf = <R extends { calibration?: string | null }>(rows: readonly R[], label: (r: R) => string) =>
      [rows.filter((r) => r.calibration === 'provisional').map(label), rows.map(label)] as [string[], string[]]
    const find = (list: Renderish[], key: string) => list.find((b) => b.key === key)!
    return [
      ['your market / the market by subject', find(listOf(FRONT_PAGE_BLOCKS), 'overview.subjects'), front, ...labelsOf(front.subjects.rows, (r) => r.label)],
      ['overview OV2', find(listOf(OVERVIEW_BLOCKS), 'overview.subjects'), unchecked, ['Waterproofing'], unchecked.subjects.rows.map((r) => r.label)],
      ['subjects rail', find(listOf(SUBJECT_BLOCKS), 'subjects.list'), rail, ...labelsOf(rail.list.rows, (r) => r.name)],
      ['weekly subjects', find(listOf(WEEKLY_BLOCKS), 'weekly.subjects'), { ...weeklyFixture(), subjects: unchecked.subjects }, ['Waterproofing'], unchecked.subjects.rows.map((r) => r.label)],
      ['monthly subjects', find(listOf(ALL_MONTHLY_BLOCKS), 'monthly.subjects'), monthly, ...labelsOf(monthly.overview.subjects.rows, (r) => r.label)],
      ['quarterly subjects', find(listOf(QUARTERLY_BLOCKS), 'quarterly.subjects'), quarter, ...labelsOf(quarter.subjects.rows, (r) => r.label)],
    ]
  })()

  it('has a provisional subject to check in every case', () => {
    for (const [name, , , labels] of cases) expect(labels.length, name).toBeGreaterThan(0)
  })

  /** A label's row: its `<tr>` or `role="row"` element where that holds no
   *  other subject; otherwise (an email's stacked rows) the markup from the
   *  label to the next subject's label. */
  const rowOf = (markup: string, at: number, label: string, all: readonly string[]): string => {
    const others = all.filter((l) => l !== label).map((l) => escape(l))
    const row = rowAround(markup, at)
    if (row != null && !others.some((o) => row.includes(o))) return row
    const next = Math.min(...others.map((o) => markup.indexOf(o, at + 1)).filter((i) => i > at), markup.length)
    return markup.slice(at, next)
  }

  it('renders no figure or level node in a provisional subject’s row, in any mode', () => {
    const bad: string[] = []
    let checked = 0
    for (const [name, block, data, labels, all] of cases) {
      for (const mode of MODES) {
        const markup = renderOf(block, data, mode)
        for (const label of labels) {
          const at = markup.indexOf(escape(label))
          if (at < 0) continue
          checked++
          if (/data-copy="(?:figure|level)"/.test(rowOf(markup, at, label, all))) bad.push(`${name} [${mode}] ${label}`)
        }
      }
    }
    expect(bad).toEqual([])
    expect(checked).toBeGreaterThan(20)
  })
})

describe('T0a structural check 4: the week bars never span our changes', () => {
  // HYPOTHETICAL: staging's changes (search 9, 13 and 17 Sep; relevance
  // 26 Sep) with weeks gathered after them, every video checked.
  const block = weekVolumesBlock({
    reading: { month: '2026-09-01' },
    now: '2026-10-14T06:00:00.000Z',
    updates: [...STAGING_UPDATES, '2026-10-04T08:00:00.000Z', '2026-10-11T08:00:00.000Z'],
    rows: [
      ...STAGING_WEEK_VOLUMES.map((r) => ({ ...r, unchecked: 0 })),
      ...(['2026-09-28', '2026-10-05', '2026-10-12'] as const).map((week) => ({ ...STAGING_WEEK_VOLUMES[2], week, unchecked: 0 })),
    ],
    rivalAudiences: STAGING_RIVALS,
    changes: changesFromLog(STAGING_CHANGES),
    cfg: WEEK_LINE[SEALAND_CLIENT_ID],
    nextUpdateAfter: SEALAND_NEXT_UPDATE,
  })

  it('renders no "Our changes" row and no "none gathered" label, and starts after the last rule change', () => {
    const lastChange = block.rules.map((r) => r.week).sort().pop()!
    for (const variant of ['front', 'week'] as const) {
      for (const mode of MODES) {
        const markup = render(<WeekBars block={block} mode={mode} variant={variant} surface="inner" />)
        const text = markupText(markup)
        expect(text, `${variant} ${mode}`).not.toContain('Our changes')
        expect(text, `${variant} ${mode}`).not.toContain('none gathered')
        // The first week drawn is after the week of the last change.
        const email = markupText(render(<WeekBars block={block} mode="email" variant={variant} surface="inner" />))
        expect(email).toMatch(/^Week of\s*28 Sep/)
        expect(lastChange < '2026-09-28').toBe(true)
      }
    }
  })

  it('draws nothing on staging’s own weeks, where no week is left one way', () => {
    const staging = weekVolumesBlock({
      reading: { month: '2026-09-01' },
      now: '2026-10-11T06:00:00.000Z',
      updates: STAGING_UPDATES,
      rows: STAGING_WEEK_VOLUMES,
      rivalAudiences: STAGING_RIVALS,
      changes: changesFromLog(STAGING_CHANGES),
      cfg: WEEK_LINE[SEALAND_CLIENT_ID],
      nextUpdateAfter: SEALAND_NEXT_UPDATE,
    })
    for (const mode of MODES) expect(render(<WeekBars block={staging} mode={mode} variant="front" surface="inner" />)).toBe('')
  })
})
