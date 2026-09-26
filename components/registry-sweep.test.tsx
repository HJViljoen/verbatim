import { describe, expect, it } from 'vitest'
import { isValidElement, type ReactNode } from 'react'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render } from '@/lib/test/render'

import { PAGES } from '@/components/pages/registry'
import { WEEKLY_BLOCKS } from '@/components/blocks/weekly'
import { ALL_MONTHLY_BLOCKS, MONTHLY_BLOCKS } from '@/components/blocks/monthly'
import { QUARTERLY_BLOCKS } from '@/components/blocks/quarterly'
import { CONTENT_BRIEF_BLOCKS } from '@/components/blocks/content-brief'
import { VOICE_BLOCKS } from '@/components/pages/voice-surface'
import { MARKET_BLOCKS } from '@/components/pages/market-surface'
import { COMPETITIVE_BLOCKS } from '@/components/pages/competitive-surface'
import { WEEK_BLOCKS } from '@/components/pages/week'

import { makersMarkedFixture, marketArrivalsFixture, marketBeforeMakersFixture, marketFrontFixture, marketSizeFixture, ossurArrivalsFixture, ossurFrontFixture, overviewFixture, refusedFixture as overviewRefused } from '@/components/pages/overview/fixture'
import { FRONT_PAGE_BLOCKS } from '@/components/pages/overview'
import { BlockFrame } from '@/components/blocks/frame'
import { subjectsFixture, refusedFixture as subjectsRefused } from '@/components/pages/subjects/fixture'
import { voiceFixture } from '@/components/pages/voice-surface/fixture'
import { marketFixture, deepLinkFixture, unrecordedFixture } from '@/components/pages/market-surface/fixture'
import { competitiveFixture, quietRivalFixture } from '@/components/pages/competitive-surface/fixture'
import { marketWeekFixture, weekFixture } from '@/components/pages/week/fixture'
import { weekSubjects } from '@/components/pages/week/subjects'
import { weeklyFixture } from '@/components/blocks/weekly/fixture'
import { filledSlotsFixture, monthlyFixture, ossurMonthlyFixture, unmeasuredMonthlyFixture } from '@/components/blocks/monthly/fixture'
import { quarterlyFixture } from '@/components/blocks/quarterly/fixture'
import {
  contentBriefFixture,
  emptyContentBriefFixture,
  refusedContentBriefFixture,
  thinContentBriefFixture,
} from '@/components/blocks/content-brief/fixture'

// THE REGISTRY SWEEP (Block D wave 3, the merge).
//
// Every block in the product, in every state its package ships a fixture for,
// in all three modes, through the copy contract — in ONE place, over the
// registries themselves rather than over a list somebody maintains.
//
// WHY, GIVEN EVERY BLOCK ALREADY HAS ITS OWN RENDER TEST. Two things a
// per-block test cannot see. The first is a block that is REGISTERED and has
// no test — the per-block tier is a convention, and a convention is checked by
// whoever remembers it; this walks the registries, so a new key is swept the
// moment it is registered whether or not anyone wrote its test. The second is
// a KEY COLLISION: an arranged artefact is composed over block keys across
// three registries plus the page ones, and two blocks answering to one key
// print one block's tile where another's belongs. Collisions across the
// registries are zero and AGENTS.md says they must stay zero; this is the
// thing that says so.
//
// THE LEGACY PAGES IN `PAGES` ARE NOT SWEPT and are named below rather than
// skipped silently: `voice`, `market`, `competitive`, `content`, `dashboard`,
// `profile` and `agent` there are the pre-Phase-1 pages, with their own data
// types and their own tests. The Phase 1 surfaces of those names are the block
// arrays imported above, which ARE swept.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

/** A registered page whose renderables take a Phase 1 fixture. */
const PAGE_STATES: Record<string, unknown[]> = {
  overview: [
    overviewFixture(), overviewRefused(), marketSizeFixture(), makersMarkedFixture(),
    // Your market (market-first WP1.6): the front page as deploy 2 builds it.
    marketFrontFixture(), marketBeforeMakersFixture(), ossurFrontFixture(),
    // "With this update" (WP2.7, deploy 3).
    marketArrivalsFixture(), ossurArrivalsFixture(),
  ],
  subjects: [subjectsFixture(), subjectsRefused()],
}

const LEGACY = ['dashboard', 'voice', 'profile', 'competitive', 'market', 'content', 'agent']

interface Renderish { render: (d: never, m: RenderMode, c: typeof ctx) => ReactNode }

/** The block arrays and records that are not in `PAGES`, with their states. */
const GROUPS: [string, Record<string, Renderish> | readonly (Renderish & { key: string })[], unknown[]][] = [
  ['voice-surface', VOICE_BLOCKS as never, [voiceFixture()]],
  ['market-surface', MARKET_BLOCKS as never, [marketFixture(), deepLinkFixture(), unrecordedFixture()]],
  ['competitive-surface', COMPETITIVE_BLOCKS as never, [competitiveFixture(), quietRivalFixture()]],
  ['week', WEEK_BLOCKS as never, [weekFixture(), marketWeekFixture()]],
  ['weekly', WEEKLY_BLOCKS as never, [weeklyFixture()]],
  // Two states here (the stubbed skeleton and every slot filled); the monthly's
  // own test sweeps all four through the contract (components/blocks/monthly).
  ['monthly', MONTHLY_BLOCKS as never, [monthlyFixture(), filledSlotsFixture()]],
  ['quarterly', QUARTERLY_BLOCKS as never, [quarterlyFixture()]],
  ['content-brief', CONTENT_BRIEF_BLOCKS as never, [
    contentBriefFixture(), thinContentBriefFixture(), refusedContentBriefFixture(), emptyContentBriefFixture(),
  ]],
]

const entriesOf = (g: Record<string, Renderish> | readonly (Renderish & { key: string })[]): [string, Renderish][] =>
  Array.isArray(g) ? g.map((b) => [(b as { key: string }).key, b as Renderish]) : Object.entries(g as Record<string, Renderish>)

describe('the registry sweep', () => {
  it('names every block key exactly once, across every registry', () => {
    const keys: string[] = []
    for (const [pageKey, page] of Object.entries(PAGES)) {
      for (const tile of Object.keys(page?.renderables ?? {})) keys.push(`${pageKey}.${tile}`)
    }
    for (const [, group] of GROUPS) for (const [key] of entriesOf(group)) keys.push(key)
    expect(keys.length).toBeGreaterThan(60)
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
  })

  it('renders every block in every state in every mode, green against the copy contract', () => {
    const bad: string[] = []
    let renders = 0
    const sweep = (name: string, r: Renderish, states: unknown[]) => {
      for (const data of states) {
        for (const mode of MODES) {
          renders++
          let markup: string
          // A THROW IS A FAILURE OF THIS SWEEP, not an excuse to skip. A block
          // that cannot render one of its own package's fixtures is the defect
          // the arranged artefacts meet at build time.
          try { markup = render(r.render(data as never, mode, ctx)) }
          catch (e) { bad.push(`${name} [${mode}] THREW ${(e as Error).message}`); continue }
          try { assertCopyContract(markup) }
          catch { bad.push(`${name} [${mode}] ${JSON.stringify(copyViolations(markup))}`) }
        }
      }
    }
    for (const [pageKey, page] of Object.entries(PAGES)) {
      const states = PAGE_STATES[pageKey]
      if (!states) { expect(LEGACY, `${pageKey} is registered with no fixture wired`).toContain(pageKey); continue }
      for (const [tile, r] of Object.entries(page?.renderables ?? {})) sweep(`${pageKey}.${tile}`, r as Renderish, states)
    }
    for (const [name, group, states] of GROUPS) {
      for (const [key, r] of entriesOf(group)) sweep(`${name}/${key}`, r, states)
    }
    expect(bad).toEqual([])
    expect(renders).toBeGreaterThan(300)
  })
})

// THE 25 SEP RULINGS, SWEPT (market-first WP1.6, plan §5.12). On a page a
// package has rebuilt, a block's header is its title alone and its footer
// holds links alone: no block passes `BlockFrame` its `meta` (the top-right
// note) or its `footerNote` (the bottom-right note). Checked on the element a
// block returns, so a stored artefact's markup (and the weekly's, whose
// preview must stay byte for byte) is untouched by the check. Your market is
// rebuilt at deploy 2; Subjects, Conversation and the monthly join it at
// deploy 3 (§5.12), and are added here by the package that rebuilds each.
const REBUILT: [string, readonly { key: string; render: (d: never, m: RenderMode, c: typeof ctx) => ReactNode }[], unknown[]][] = [
  ['your market', FRONT_PAGE_BLOCKS as never, [marketFrontFixture(), marketBeforeMakersFixture(), ossurFrontFixture(), marketArrivalsFixture(), ossurArrivalsFixture()]],
  // "September in your market" (market-first WP2.1, deploy 3).
  ['the monthly', ALL_MONTHLY_BLOCKS as never, [monthlyFixture(), unmeasuredMonthlyFixture(), ossurMonthlyFixture(), filledSlotsFixture()]],
  // This week's blocks rebuilt on the market at deploy 3 (WP2.7); the rest of
  // the page is rebuilt at deploy 5 (WP3.7).
  ['this week', [weekSubjects] as never, [marketWeekFixture()]],
]

describe('the 25 Sep rulings on rebuilt pages', () => {
  it('no block passes BlockFrame a meta or a footer note, in any mode or state', () => {
    const bad: string[] = []
    for (const [page, blocks, states] of REBUILT) {
      for (const block of blocks) {
        for (const data of states) {
          for (const mode of MODES) {
            const el = block.render(data as never, mode, ctx)
            if (!isValidElement(el) || el.type !== BlockFrame) { bad.push(`${page} ${block.key} [${mode}] is not drawn in a BlockFrame`); continue }
            const props = el.props as { meta?: unknown; footerNote?: unknown }
            if (props.meta != null) bad.push(`${page} ${block.key} [${mode}] passes meta`)
            if (props.footerNote != null) bad.push(`${page} ${block.key} [${mode}] passes footerNote`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })
})
