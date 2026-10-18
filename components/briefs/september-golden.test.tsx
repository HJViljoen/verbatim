import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { render } from '@/lib/test/render'
import { deckPages } from '@/lib/reports/briefs/deck'
import { isMonthlyBriefData, type StoredBriefData } from '@/lib/reports/briefs/types'
import { BriefDeck } from './brief-deck'

// THE SEPTEMBER BRIEFS RENDER EXACTLY AS THEY DID (the October boards, 18 Oct:
// every snapshot stored before the October canvas draws as it always drew).
// Each file under lib/test/brief-golden/ is one of September's eight briefs as
// the second dry build saved it (`Briefs-2026-09-designed-v2`, the build that
// was stored): the stored brief (`storedBrief`: no `held`, no cost), its
// quotes resolved, every commenter's words replaced by filler of the SAME
// length (the deck fits a page by a voice's length, so the plan is the one the
// real words make, and no comment is kept in the repository). The `.html`
// beside each was rendered by the deck BEFORE the October canvas existed
// (commit 864050c3), for the printer and for the screen, and is never
// regenerated: a change that moves one byte of a stored September brief fails
// here.

const DIR = join(process.cwd(), 'lib/test/brief-golden')
const BUILT = '2026-10-12T18:24:30.202Z'

const read = (file: string): string => readFileSync(join(DIR, file), 'utf8')

describe('a September brief (stored before the October canvas) renders byte for byte as before', () => {
  for (const tenant of ['ossur', 'sealand']) {
    for (const role of ['sales', 'marketing', 'content', 'leadership']) {
      const name = `september-${tenant}-${role}`
      it(`${tenant} ${role}: the printed deck and the screen deck`, () => {
        const data = JSON.parse(read(`${name}.json`)) as StoredBriefData
        expect(isMonthlyBriefData(data)).toBe(true)
        // Stored before the October canvas: none of its marks.
        expect('fromApp' in data).toBe(false)
        expect(render(<BriefDeck data={data} builtAt={BUILT} print />)).toBe(read(`${name}.print.html`))
        expect(render(<BriefDeck data={data} builtAt={BUILT} gap={20} />)).toBe(read(`${name}.screen.html`))
      })
    }
  }

  // The pages each brief's `set.json` recorded (what `--from` holds a stored
  // brief to), so `--from` still accepts the September v2 folder.
  const SAVED_PAGES: Record<string, string[]> = {
    'september-ossur-sales': ['Cover', 'In short', 'Finding 1 of 2', 'Finding 2 of 2', 'Who is buying', 'What stops them', 'Language to handle with care'],
    'september-ossur-marketing': ['Cover', 'In short', 'The finding', 'In its own words'],
    'september-ossur-content': ['Cover', 'In short', 'The finding', 'The questions people ask', 'Hooks and formats', 'What viewers come for', 'What people want shown', 'Where the confusion starts'],
    'september-ossur-leadership': ['Cover', 'In short', 'Finding 1 of 2', 'Finding 2 of 2', 'The risks'],
    'september-sealand-sales': ['Cover', 'In short', 'Finding 1 of 2', 'Finding 2 of 2', 'Who is buying', 'Who is buying, continued', 'Language to handle with care'],
    'september-sealand-marketing': ['Cover', 'In short', 'Finding 1 of 2', 'Finding 2 of 2', 'In its own words', 'How rivals are heard'],
    'september-sealand-content': ['Cover', 'In short', 'The finding', 'The questions people ask', 'Hooks and formats', 'What people want shown'],
    'september-sealand-leadership': ['Cover', 'In short', 'Where the market stands', 'Where Sealand stands', 'The finding', 'The risks'],
  }
  it('the eight briefs draw the pages the stored build drew', () => {
    for (const [name, saved] of Object.entries(SAVED_PAGES)) {
      expect(deckPages(JSON.parse(read(`${name}.json`)) as StoredBriefData).map((p) => p.eyebrow || 'Cover'), name).toEqual(saved)
    }
  })
})
