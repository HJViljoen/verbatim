import Link from 'next/link'
import { FileText } from 'lucide-react'
import type { StudioBrief } from '@/lib/pages/studio-briefs'
import { briefPdfHref } from '@/lib/reports/viewer'
import { buttonClass, Card, CardTitle } from './ui'

// "Monthly briefs" (T8 wired): each month's four department briefs, newest
// month first, to open in the viewer or download as a PDF. On the platform as
// soon as the run that closes a month writes them; there is no email to hold.
//
// THE ARTBOARD DOES NOT DRAW THIS CARD (Page-Studio drew "Your reports" with
// the briefs' rows as email schedules, hidden until the briefs exist). It is
// the "Your reports" and "Past issues" cards' idiom, the same title, head and
// rows, so the three read as one page; a deviation listed for Heinrich.

const COLS = 'grid grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-5'

export function MonthlyBriefs({ briefs, openHref }: { briefs: readonly StudioBrief[]; openHref: (snapshotId: string) => string }) {
  if (briefs.length === 0) return null
  return (
    <Card className="gap-4 px-[30px] pt-[26px] pb-[22px]">
      <CardTitle icon={FileText}>Monthly briefs</CardTitle>
      <div className="-mx-1 overflow-x-auto px-1">
        <div role="table" aria-label="Monthly briefs" className="flex min-w-[820px] flex-col">
          <div role="row" className={`${COLS} pb-2.5`}>
            {['Brief', 'For', 'Month', 'Written'].map((h) => (
              <div key={h} role="columnheader" className="text-[12px] font-semibold text-[#5F656B]">{h}</div>
            ))}
            <div role="columnheader" aria-label="Open" />
          </div>
          {briefs.map((b) => (
            <div key={b.snapshotId} role="row" className={`${COLS} items-center border-t border-[#E4E2DC] py-[18px]`}>
              <div role="cell" className="flex flex-col gap-1">
                <div className="text-[16px] font-bold">{b.name}</div>
                <div className="text-[13px] leading-[1.45] text-[#5F656B]">{b.what}</div>
              </div>
              <div role="cell" className="text-[14px]">{b.forWho}</div>
              <div role="cell" className="text-[14px]">{b.monthLabel}</div>
              <div role="cell" className="text-[14px]">{b.writtenOn}</div>
              <div role="cell" className="flex flex-wrap items-start justify-end gap-2">
                <Link href={openHref(b.snapshotId)} scroll={false} className={buttonClass('secondary', 'small')}>Open</Link>
                <a href={briefPdfHref(b.snapshotId)} className={buttonClass('secondary', 'small')}>PDF</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
