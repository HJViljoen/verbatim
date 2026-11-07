import { describe, expect, it, vi } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { StatStrip } from '@/components/v2'
import { storedBrief } from '@/lib/reports/briefs/types'
import { ossurSnapshot } from '@/lib/test/weekly-read-v3-fixture'
import { briefFixture } from '@/components/briefs/fixture'
import type { ViewerSnapshot } from '@/lib/reports/viewer'
import { ReportViewer, viewerHead, viewerStats } from './report-viewer'

// The Studio's viewer as a page (the audit design, 7 Nov, Studio-Weekly and
// Studio-Brief): its crumb, title, links and figures row, over the body the
// share page and the PDF also draw (untouched). Render tier: what it PRINTS.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))
// The brief's wordmark face is next/font's, which only Next's compiler runs.
vi.mock('@/components/briefs/wordmark-face', () => ({ briefWordmarkFace: { variable: 'wordmark-face' } }))

const weekly: ViewerSnapshot = {
  id: 'snap-w', kind: 'weekly_read', data: ossurSnapshot(), title: 'Össur · This week in your market',
  builtAt: '2026-10-18T06:00:00.000Z', pageCount: 1, artifactId: null, reportId: 'r-1', clientId: 'c-1',
}
const brief: ViewerSnapshot = {
  id: 'snap-s', kind: 'monthly_brief', data: storedBrief({ ...briefFixture('sales'), company: 'Össur' }), title: 'brief',
  builtAt: '2026-10-04T05:30:00.000Z', pageCount: 7, artifactId: null, pdfHref: '/api/briefs/snap-s/pdf', reportId: null, clientId: 'c-1',
}
const text = (node: React.ReactNode) => renderText(node).replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1')

describe('the viewer, a page of its own', () => {
  it('a weekly read: "Studio / The weekly, {day}", its title, the way back, and its week, its numbers and when it was read', () => {
    expect(viewerHead(weekly)).toEqual({ crumb: 'The weekly, 18 Oct', title: 'This week in your market', sub: null })
    const strip = <StatStrip items={viewerStats(weekly)} />
    expect(text(strip)).toBe('Week 12 to 18 October This week 146 videos, 4,180 comments October so far 434 videos, 11,178 comments Read 18 Oct 2026, 1 page')
    assertCopyContract(strip)
    const m = render(<ReportViewer snapshot={weekly} closeHref="/dashboard/studio" />)
    expect(m).toContain('data-level-block="audit"')
    expect(m).toMatch(/<h1[^>]*>This week in your market<\/h1>/)
    expect(m).toMatch(/<a[^>]*href="\/dashboard\/studio"[^>]*>Back to the Studio<\/a>/)
    // A page, not a panel over the Studio: no backdrop, no dialog.
    expect(m).not.toMatch(/role="dialog"|aria-modal|fixed inset-0/)
    // No stored file: no Download; a client is not offered the Studio's workbench.
    expect(m).not.toContain('Download PDF')
    expect(m).not.toContain('Open in the Studio')
    // The body is the share page's own, flowing in the column (no slide scaling).
    expect(m).toContain('class="w3')
    expect(m).not.toMatch(/data-viewer-body=""[^>]*><div class="rounded-\[12px\] bg-inner/)
  })

  it('a monthly brief: "Studio / Monthly briefs", its name, the brand and month under it, Download PDF, and who it is for, its market, when it was written and its length', () => {
    expect(viewerHead(brief)).toEqual({ crumb: 'Monthly briefs', title: 'Sales brief', sub: 'Össur, September 2026' })
    expect(text(<StatStrip items={viewerStats(brief)} />)).toBe('For Sales September 2026 852 videos in your market Written 4 Oct 2026 Length 7 pages')
    const m = render(<ReportViewer snapshot={brief} closeHref="/dashboard/studio?item=r-9" showStudio />)
    expect(m).toMatch(/<a href="\/api\/briefs\/snap-s\/pdf" class="[^"]*underline[^"]*">Download PDF<\/a>/)
    expect(m).toMatch(/href="\/dashboard\/studio\?item=r-9"[^>]*>Back to the Studio</)
    expect(m).toContain('data-level-sub=""')
    // The slides stay slides (decision 7A), scaled into the column.
    expect(m).toMatch(/data-viewer-body=""[^>]*><div class="rounded-\[12px\] bg-inner/)
  })

  it('any other build: its own title, when it was built, its length', () => {
    const doc = { ...weekly, kind: 'report' as const, data: { kind: 'other' } as never, title: 'Sealand: what changed', pageCount: 3 }
    expect(viewerHead(doc)).toEqual({ crumb: 'Sealand: what changed', title: 'Sealand: what changed', sub: null })
    expect(text(<StatStrip items={viewerStats(doc)} />)).toBe('Built 18 Oct 2026 Length 3 pages')
  })
})
