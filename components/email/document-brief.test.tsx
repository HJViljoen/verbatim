import { describe, expect, it } from 'vitest'
import { markupText, render } from '@/lib/test/render'
import { salesBriefFixture, salesBriefThinFixture } from '@/components/print/fixture'
import { overviewTiles } from '@/lib/reports/documents/overview'
import type { DocumentSnapshotData } from '@/lib/reports/documents/types'
import { DocumentBriefEmail } from './document-brief'

// The brief in an inbox, against the brief on paper (fix pass, reports-4).
//
// The two are one artefact read twice: `overviewTiles` is the single composer
// and the email and the deck both call it, so a tile that carries a verdict
// and a refusal on the sheet must carry them in the inbox. It did not — the
// email's cell took `value` and `label` only — so the printed brief could say
// "Too few to compare: 35 videos where a banded reading needs 100" and the
// email of the SAME snapshot show the counts and nothing else.

const body = (data: DocumentSnapshotData) =>
  render(<DocumentBriefEmail data={data} shareUrl="https://app.verbatimintel.com/r/tok" appUrl="https://app.verbatimintel.com" attached />)

const words = (data: DocumentSnapshotData) => markupText(body(data))

describe('the document brief email', () => {
  it('prints the refusal the FIGURE wrote, which is the half the inbox was losing', () => {
    const data = salesBriefThinFixture()
    const note = overviewTiles(data).map((t) => t.note).find(Boolean)
    // The fixture is production today: 35 own videos named a rival where a
    // banded reading needs 100.
    expect(note).toContain('Too few to compare')
    expect(words(data)).toContain(note as string)
  })

  it('prints the tile’s banded claim as a chip, in the deck’s own vocabulary', () => {
    const data = salesBriefFixture()
    const tiles = overviewTiles(data)
    expect(tiles.some((t) => t.verdict)).toBe(true)
    // `BlockMovement`'s email arm marks it, which is what rule (c) reads.
    expect(body(data)).toContain('data-copy="verdict"')
  })

  it('sets a refusal as a sentence rather than at the numeral’s size', () => {
    const data = salesBriefFixture({
      reading: { ...salesBriefFixture().reading!, denominators: [] },
      figures: { conversations: { label: 'comments read in September 2026', value: '0', kind: 'count' } },
    })
    const html = body(data)
    expect(markupText(html)).toContain('not read yet')
    // The 26px numeral is the figure's size; a refusal does not take it.
    expect(html).not.toMatch(/font-size:26px[^<]*>not read yet/)
  })
})
