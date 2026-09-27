import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ONLY THE FRONT PAGE PAYS FOR THE FRONT PAGE'S READS (market-first WP1.6
// review). `loadOverview` builds "Your market" (the board, the hero and its
// voices, the asks, the change block: about 8 to 11 PostgREST pages) only
// when asked (`LoadOverviewOptions.marketFront`). The route, its export and
// snapshots, the two scripts that measure the page, and the monthly ask
// (WP2.1: "September in your market" prints the front page's blocks on the
// month that has ended); the quarterly and the briefs (until WP3.11) print the
// Phase 1 blocks and must not, or they spend reads on blocks nothing renders.

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

describe('who builds the Overview as "Your market"', () => {
  it('the route, the page module (export, report sections, render-page), the two loader scripts and the monthly', () => {
    for (const p of ['app/dashboard/page.tsx', 'components/pages/overview/page.tsx', 'scripts/loader-dump.ts', 'scripts/reading-timing.ts', 'lib/pages/monthly.ts']) {
      expect(read(p), p).toMatch(/loadOverview\(.*\{\s*marketFront:\s*true\s*\}\)/)
    }
  })

  it('never the quarterly, the weekly or the briefs', () => {
    for (const p of ['lib/pages/quarterly.ts', 'lib/pages/weekly.ts', 'lib/reports/documents/load-reading.ts']) {
      expect(read(p), p).not.toContain('marketFront')
    }
  })
})
