import Link from 'next/link'
import { DocumentDeck } from '@/components/print/document-deck'
import { ReportDeck } from '@/components/print/report-deck'
import { FitWidth } from '@/components/reports/fit-width'
import { ViewerEscape } from '@/components/reports/report-viewer-close'
import { isDocumentData } from '@/lib/reports/documents/types'
import type { ViewerSnapshot } from '@/lib/reports/viewer'
import type { ReportSnapshotData } from '@/lib/reports/types'

// Read a build in the app (Heinrich, 2026-09-09): the pages the PDF prints,
// on a panel over the page, with the sidebar still showing and still working.
// Server-rendered from the frozen snapshot; opening and closing are Links, so
// none of it needs hydration. The deck components are the ones the PDF is
// printed from, under the same print root, scaled to the panel by FitWidth.
//
// Geometry: the backdrop starts where the sidebar ends, so the sidebar is
// never covered and stays clickable; the panel leaves a hair of the page
// showing on the other three sides. On a phone the sidebar is off canvas, so
// the panel takes the screen with a small inset.

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const PILL = 'inline-flex h-8 items-center rounded-full bg-tile px-3 text-[12px] font-medium text-secondary-foreground ring-1 ring-border transition-colors hover:bg-inner'

export function ReportViewer({ snapshot, closeHref }: { snapshot: ViewerSnapshot; closeHref: string }) {
  const { data, title, builtAt, pageCount, artifactId, reportId } = snapshot
  const date = fmtDate(builtAt)
  const deck = isDocumentData(data)
    ? <DocumentDeck data={data} date={date} />
    : <ReportDeck data={data as ReportSnapshotData} date={date} />

  return (
    <>
      <Link
        href={closeHref}
        scroll={false}
        aria-label="Close the report"
        className="fixed inset-0 z-30 bg-foreground/30 md:left-(--sidebar-width)"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report viewer"
        className="fixed inset-2 z-40 flex flex-col overflow-hidden rounded-lg bg-card shadow-tile-hover md:inset-y-4 md:right-4 md:left-[calc(var(--sidebar-width)+1rem)]"
      >
        {/* pl-14 on a phone: the floating navigation trigger sits in the shell
            above this panel, and the title has to start clear of it. */}
        <header className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-border/70 py-3 pr-5 pl-14 md:pl-5">
          <h2 className="min-w-0 truncate text-[15px] font-semibold leading-[1.3] tracking-[-0.005em]">{title}</h2>
          <p className="font-mono text-[11px] text-muted-foreground">built {date} · {pageCount} {pageCount === 1 ? 'page' : 'pages'}</p>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {artifactId && <a href={`/api/artifacts/${artifactId}`} className={PILL}>Download PDF</a>}
            {reportId && <Link href={`/dashboard/studio?item=${reportId}`} className={PILL}>Open in the Studio</Link>}
            <Link href={closeHref} scroll={false} className={PILL}>Close</Link>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-inner px-3 py-3 md:px-6 md:py-5">
          <FitWidth base={1123}>
            <div className="vb-print vb-preview" data-print-variant="b">{deck}</div>
          </FitWidth>
        </div>
      </div>
      <ViewerEscape closeHref={closeHref} />
    </>
  )
}
