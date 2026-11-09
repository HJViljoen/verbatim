import type { ReactNode } from 'react'
import { DocumentDeck } from '@/components/print/document-deck'
import { ReportDeck } from '@/components/print/report-deck'
import { FitWidth } from '@/components/reports/fit-width'
import { isDocumentData } from '@/lib/reports/documents/types'
import { isWeeklyData } from '@/lib/reports/weekly-build'
import { isMonthlyData } from '@/lib/reports/monthly-build'
import { isQuarterlyData } from '@/lib/reports/quarterly-build'
import { WeeklyDeck } from '@/components/print/weekly-deck'
import { MonthlyDeck } from '@/components/print/monthly-deck'
import { QuarterlyDeck } from '@/components/print/quarterly-deck'
import { isWeeklyReadData, isWeeklyV3, staleWeeklyReadSnapshot } from '@/lib/reports/weekly-read-build'
import { WeeklyReadPage } from '@/components/email/weekly-read'
import { WeeklyV3Page } from '@/components/email/weekly-read-v3'
import { printsMedicalLine } from '@/lib/post-ideas/medical'
import type { ViewerSnapshot } from '@/lib/reports/viewer'
import type { ReportSnapshotData } from '@/lib/reports/types'
import { BriefDeck } from '@/components/briefs/brief-deck'
import { briefWordmarkFace } from '@/components/briefs/wordmark-face'
import { isMonthlyBriefData } from '@/lib/reports/briefs/types'
import { appDay } from '@/lib/format'
import { ViewerFrame } from './viewer-frame'

export { viewerHead, viewerStats } from './viewer-frame'

// Read a build in the app (Heinrich, 2026-09-09): the pages the PDF prints,
// server-rendered from the frozen snapshot, the deck components the PDF is
// printed from under the same print root, scaled to the column by FitWidth.
//
// SINCE THE AUDIT DESIGN (7 Nov, Studio-Weekly.dc.html and Studio-Brief.dc.
// html): the viewer is A PAGE, drawn in place of the Studio's lists at the
// same address (`?view=`), not a panel over them. Its title block is the
// crumb "Studio / {it}", the h1, the links (Download PDF where there is one,
// Open in the Studio for the operator, Back to the Studio), and the figures
// row (`viewerStats`); the body is the deck, untouched. The weekly read is a
// responsive page of its own (the share page's), so it flows in the column
// rather than being scaled to a slide's width. Esc still goes back
// (`ViewerEscape`), and a held build is still refused before this is drawn
// (the Studio route's `mayReadHeld`).

// showStudio: the caller has already asked canSeeStudio (lib/studio-visibility.ts).
// The viewer itself is untouched by the gate — a client still reads the pages
// and downloads the PDF; only the way back into the Studio goes.
export function ReportViewer({ snapshot, closeHref, showStudio = false }: { snapshot: ViewerSnapshot; closeHref: string; showStudio?: boolean }) {
  const { data, builtAt } = snapshot
  const date = appDay(builtAt)

  let body: ReactNode
  if (isMonthlyBriefData(data)) {
    // A monthly brief is its own deck of 1280-wide sheets (the canvas's), not
    // the print root's 297mm slides.
    body = (
      <div className="rounded-[12px] bg-inner p-3 md:p-5">
        <FitWidth base={1280}>
          <div className={briefWordmarkFace.variable}><BriefDeck data={data} builtAt={builtAt} gap={20} /></div>
        </FitWidth>
      </div>
    )
  } else if (isWeeklyReadData(data) && isWeeklyV3(data) && !staleWeeklyReadSnapshot(data)) {
    // The share page's own responsive page, in the column, FRAMED: this page
    // already carries its title, figures row and way back, so the sheet
    // starts at the week (WeeklyReadPage's own version-3 route, plus that).
    body = <WeeklyV3Page data={data} appUrl="" medical={printsMedicalLine(snapshot.clientId)} framed />
  } else {
    const deck = isDocumentData(data)
      ? <DocumentDeck data={data} date={date} />
      : isWeeklyData(data)
        ? <WeeklyDeck data={data} date={date} />
        : isMonthlyData(data)
          ? <MonthlyDeck data={data} date={date} />
          : isQuarterlyData(data)
            ? <QuarterlyDeck data={data} date={date} />
            : isWeeklyReadData(data)
              ? <WeeklyReadPage data={data} appUrl="" medical={printsMedicalLine(snapshot.clientId)} />
              : <ReportDeck data={data as ReportSnapshotData} date={date} />
    body = (
      <div className="rounded-[12px] bg-inner p-3 md:p-5">
        <FitWidth base={1123}>
          <div className="vb-print vb-preview" data-print-variant="b">{deck}</div>
        </FitWidth>
      </div>
    )
  }

  return <ViewerFrame snapshot={snapshot} closeHref={closeHref} showStudio={showStudio}>{body}</ViewerFrame>
}
