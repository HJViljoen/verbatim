import { describe, expect, it } from 'vitest'

import { markupText, render } from '@/lib/test/render'
import { STALE_SECTION_LINE } from '@/lib/reports/stale'
import { DocumentDeck } from './document-deck'
import { marketingDeckFixture } from './fixture'

// An old brief (WP3.11, plan §2.9). The maps open on the market under NEW
// section ids; a brief built before keeps the ids, the blocks and the order it
// froze, and draws them. A section whose block this build no longer draws
// prints the stale section line, never "could not be read for this month"
// (which is a claim about the reading) and never a throw.

describe('an old brief', () => {
  it('draws the sections it was built with, under the ids it was built with', () => {
    const data = marketingDeckFixture()
    const old = { ...data, sections: (data.sections ?? []).filter((s) => !['mk.themes', 'mk.asks'].includes(s.id)) }
    const text = markupText(render(<DocumentDeck data={old} date="28 Sep 2026" />))
    expect(text).toContain('Your subjects')
    expect(text).not.toContain('What your market talked about')
  })

  it('prints its stale section line where a block it froze is no longer drawn', () => {
    const data = marketingDeckFixture()
    const sections = (data.sections ?? []).map((s) => (s.id === 'mk.rivals' ? { ...s, block: 'overview.standings-retired', empty: null } : s))
    const text = markupText(render(<DocumentDeck data={{ ...data, sections }} date="28 Sep 2026" />))
    expect(text).toContain(STALE_SECTION_LINE)
  })
})
