import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ONLY THE FRONT PAGE PAYS FOR THE FRONT PAGE'S READS (market-first WP1.6
// review). `loadOverview` builds "Your market" (the board, the hero and its
// voices, the asks, the change block: about 8 to 11 PostgREST pages) only
// when asked (`LoadOverviewOptions.marketFront`). The route, its export and
// snapshots, and the two scripts that measure the page ask; so do the briefs
// since WP3.11 (their market sections draw the board and the asks, and the
// first In short tile is the hero's lead) and Ask since WP3.9 (its starter
// questions are written from the same objects). The monthly (until WP2.1),
// the quarterly and the weekly print the Phase 1 blocks and must not, or they
// spend reads on blocks nothing renders.

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

describe('who builds the Overview as "Your market"', () => {
  it('the route, the page module (export, report sections, render-page), the two loader scripts, the briefs and Ask', () => {
    for (const p of ['app/dashboard/page.tsx', 'components/pages/overview/page.tsx', 'scripts/loader-dump.ts', 'scripts/reading-timing.ts', 'lib/reports/documents/load-reading.ts', 'lib/pages/agent-thread.ts']) {
      expect(read(p), p).toMatch(/loadOverview\(.*\{\s*marketFront:\s*true\s*\}\)/)
    }
  })

  it('never the monthly, the quarterly or the weekly', () => {
    for (const p of ['lib/pages/monthly.ts', 'lib/pages/quarterly.ts', 'lib/pages/weekly.ts']) {
      expect(read(p), p).not.toContain('marketFront')
    }
  })
})
