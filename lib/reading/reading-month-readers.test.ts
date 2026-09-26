import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// THE READERS OFF THE PAGES READ THE PAGES' MONTH (decision A; default M-f).
//
// WP1.2 moved every reading page onto the reading month and left five readers
// on the calendar's: the content brief, an Ask thread and Ask's movement block,
// Settings › Tracking, and Settings › The record (moved first, 91af44f5). On 1 to
// 15 Oct each read October, a day or two of it, where every page read
// September. Each now takes its month from `loadReadingMonth`, off the reads
// the pages make, and keeps the calendar month only as the fallback where
// nothing has been delivered. A SOURCE SWEEP, because the readers are I/O glue
// (AGENTS.md: the rule itself, `readingViewFrom`, is tested in
// reading-view.test.ts): it pins that none of them goes back to the clock.

const ROOT = join(__dirname, '..', '..')
const READERS: [string, RegExp][] = [
  // [file, the clock-month line it had]
  ['lib/pages/content-brief.ts', /const month = monthStartOf\(readingAt\)/],
  ['lib/pages/agent-thread.ts', /const thisMonth = monthStartOf\(measuredAt\)/],
  ['lib/agent/movement.ts', /const to = monthStartOf\(now\.toISOString\(\)\)/],
  ['lib/settings/tracking-load.ts', /const censusMonth = monthStartOf\(new Date\(\)\.toISOString\(\)\)/],
]

describe('the readers off the reading pages read the reading month', () => {
  for (const [file, clock] of READERS) {
    it(file, () => {
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(src).toMatch(/loadReadingMonth\(/)
      expect(src).not.toMatch(clock)
    })
  }

  it('Settings › Tracking is handed the reading handle by its page', () => {
    const page = readFileSync(join(ROOT, 'app/dashboard/settings/page.tsx'), 'utf8')
    expect(page).toMatch(/loadTrackingPage\(.*readingHandle\(clientId\)\)/)
  })

  it('Settings › The record reads it through the same loader (91af44f5)', () => {
    const load = readFileSync(join(ROOT, 'lib/settings/what-we-changed-load.ts'), 'utf8')
    expect(load).toMatch(/export function loadRecordReadingMonth[\s\S]*?return loadReadingMonth\(/)
    const page = readFileSync(join(ROOT, 'app/dashboard/settings/record/page.tsx'), 'utf8')
    expect(page).toMatch(/loadRecordReadingMonth\(/)
    expect(page).not.toMatch(/const month = nowIso\.slice\(0, 7\)/)
  })
})
