import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render } from '@/lib/test/render'

import { PAGES } from '@/components/pages/registry'
import { WEEKLY_BLOCKS } from '@/components/blocks/weekly'
import { MONTHLY_BLOCKS } from '@/components/blocks/monthly'
import { QUARTERLY_BLOCKS } from '@/components/blocks/quarterly'
import { CONTENT_BRIEF_BLOCKS } from '@/components/blocks/content-brief'
import { VOICE_BLOCKS } from '@/components/pages/voice-surface'
import { MARKET_BLOCKS } from '@/components/pages/market-surface'
import { COMPETITIVE_BLOCKS } from '@/components/pages/competitive-surface'
import { WEEK_BLOCKS } from '@/components/pages/week'

import { overviewFixture, refusedFixture as overviewRefused } from '@/components/pages/overview/fixture'
import { subjectsFixture, refusedFixture as subjectsRefused } from '@/components/pages/subjects/fixture'
import { voiceFixture } from '@/components/pages/voice-surface/fixture'
import { marketFixture, deepLinkFixture, unrecordedFixture } from '@/components/pages/market-surface/fixture'
import { competitiveFixture, quietRivalFixture } from '@/components/pages/competitive-surface/fixture'
import { weekFixture } from '@/components/pages/week/fixture'
import { weeklyFixture } from '@/components/blocks/weekly/fixture'
import { monthlyFixture } from '@/components/blocks/monthly/fixture'
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
  overview: [overviewFixture(), overviewRefused()],
  subjects: [subjectsFixture(), subjectsRefused()],
}

const LEGACY = ['dashboard', 'voice', 'profile', 'competitive', 'market', 'content', 'agent']

interface Renderish { render: (d: never, m: RenderMode, c: typeof ctx) => ReactNode }

/** The block arrays and records that are not in `PAGES`, with their states. */
const GROUPS: [string, Record<string, Renderish> | readonly (Renderish & { key: string })[], unknown[]][] = [
  ['voice-surface', VOICE_BLOCKS as never, [voiceFixture()]],
  ['market-surface', MARKET_BLOCKS as never, [marketFixture(), deepLinkFixture(), unrecordedFixture()]],
  ['competitive-surface', COMPETITIVE_BLOCKS as never, [competitiveFixture(), quietRivalFixture()]],
  ['week', WEEK_BLOCKS as never, [weekFixture()]],
  ['weekly', WEEKLY_BLOCKS as never, [weeklyFixture()]],
  ['monthly', MONTHLY_BLOCKS as never, [monthlyFixture()]],
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
