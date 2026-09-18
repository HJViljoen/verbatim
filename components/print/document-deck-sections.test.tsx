import { describe, expect, it } from 'vitest'

import { render } from '@/lib/test/render'
import { overviewFixture } from '@/components/pages/overview/fixture'
import { documentSlides, sectionOfSlide } from '@/lib/reports/documents/compose'
import { documentViewerPages } from '@/lib/reports/viewer'
import type { DocumentSnapshotData } from '@/lib/reports/documents/types'
import { DocumentDeck } from './document-deck'

// "Deck pages that duplicate a block render the block in print mode" (WP19).
// The proof is here rather than in a lib test, because the claim is about the
// markup: the brief's sheet has to carry what the page's tile carries.

const base = (over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData => ({
  version: 1,
  kind: 'document',
  template: 'market_brief',
  reportId: 'r1',
  title: 'Marketing brief · Össur',
  audience: 'marketing',
  company: 'Össur',
  period: 'September 2026 · reading as at 16 Sep 2026',
  runId: null,
  figures: {},
  delta: null,
  pages: [{ id: 'method', kind: 'method', title: 'How this was read', blocks: [{ id: 'method.method', field: 'method', text: '', items: ['One paragraph.'] }] }],
  lens: { means: 'What it means', short: 'for it' },
  method: { conversations: 0, videos: 0, clientVideos: 0, competitorVideos: 0, period: 'x', sources: [], heldBack: 0, thin: false },
  notSureYet: [],
  generatedAt: '2026-09-16T05:00:00.000Z',
  model: 'm',
  promptVersion: 'market_brief_v1',
  reading: {
    month: '2026-09-01', monthLabel: 'September 2026', monthStatus: 'filling',
    readingAt: '2026-09-16T05:00:00.000Z',
    stamp: 'September 2026 · reading as at 16 Sep 2026 · still filling until 31 Oct 2026',
    denominators: [], platformMix: {}, crossesClustering: false,
  },
  sections: [
    { id: 'mk.month', block: 'overview.sentence', surface: 'overview', title: 'The month', framing: 'Where the month stands.', empty: null },
  ],
  surfaces: { overview: overviewFixture() },
  layout: [{ kind: 'section', id: 'mk.month' }, { kind: 'page', id: 'method' }],
  ...over,
})

describe('documentSlides over a layout', () => {
  it('paginates written pages and borrowed blocks in one order', () => {
    expect(documentSlides(base()).map((s) => s.keys[0])).toEqual(['section:mk.month', 'method'])
  })

  it('a brief built before the section maps paginates off its pages, as it did', () => {
    const old = base({ layout: undefined, sections: undefined, surfaces: undefined })
    expect(documentSlides(old).map((s) => s.keys[0])).toEqual(['method'])
  })

  it('a layout entry naming nothing is dropped rather than drawing a blank sheet', () => {
    const data = base({ layout: [{ kind: 'section', id: 'nope' }, { kind: 'page', id: 'gone' }, { kind: 'page', id: 'method' }] })
    expect(documentSlides(data).map((s) => s.keys[0])).toEqual(['method'])
  })

  it('sectionOfSlide resolves only section keys', () => {
    expect(sectionOfSlide(base(), 'section:mk.month')?.block).toBe('overview.sentence')
    expect(sectionOfSlide(base(), 'method')).toBeNull()
  })

  // THE HEADERS COUNT WHAT THE DECK PAGINATES. Both the viewer header and the
  // Studio bar counted `pages.length + 1` while DocumentDeck numbered
  // `documentSlides(data).length + 1`, so a brief's sheets were undercounted by
  // its borrowed blocks — roughly half of every one of the four briefs.
  it('documentViewerPages counts a borrowed block as a sheet', () => {
    expect(documentViewerPages(base())).toBe(documentSlides(base()).length + 1)
    expect(documentViewerPages(base())).toBe(3)
    const old = base({ layout: undefined, sections: undefined, surfaces: undefined })
    expect(documentViewerPages(old)).toBe(2)
  })
})

describe('the deck', () => {
  it('renders the borrowed block itself, not a summary of it', () => {
    const html = render(<DocumentDeck data={base()} date="16 Sep 2026" />)
    // The sentence block's own framing and the block's own markup, on the sheet.
    expect(html).toContain('Where the month stands.')
    expect(html).toContain('data-copy=')
  })

  // THE SHORT FORM, since the footer took `briefStampShort` (E-sales fix pass):
  // the long stamp is sixty characters and rode all eleven sheets, which put it
  // three times on the method sheet alone. Every sheet still names its month.
  it('stamps the month on every sheet', () => {
    const html = render(<DocumentDeck data={base()} date="16 Sep 2026" />)
    const stamps = html.split('September 2026 · as at 16 Sep · still filling').length - 1
    expect(stamps).toBeGreaterThanOrEqual(2)
  })

  it('prints the one line where a section could not be filled, and names who closes it', () => {
    const data = base({
      sections: [{ id: 'mk.month', block: 'overview.sentence', surface: 'overview', title: 'The month', framing: 'Where the month stands.', empty: 'The month could not be filled. We have not recorded the subjects. Client closes this — Name them. It is on Settings › Readiness.' }],
    })
    const html = render(<DocumentDeck data={data} date="16 Sep 2026" />)
    expect(html).toContain('Client closes this')
    expect(html).toContain('Settings › Readiness')
  })

  it('says so rather than drawing a hole when the surface was never frozen', () => {
    const data = base({ surfaces: {} })
    const html = render(<DocumentDeck data={data} date="16 Sep 2026" />)
    expect(html).toContain('could not be read for this month')
  })
})
