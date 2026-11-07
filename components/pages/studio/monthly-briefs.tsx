import Link from 'next/link'
import type { StudioBrief } from '@/lib/pages/studio-briefs'
import { briefPdfHref } from '@/lib/reports/viewer'
import { GO, ROW, STACK, STACK_CELL, STACK_HEAD, STACK_ROW, TBL, TD, TH } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import { Card, CardTitle } from './ui'
import { PHONE_HEAD } from './your-reports'

// "Monthly briefs" (T8 wired): each month's four department briefs, newest
// month first, to open in the viewer or download as a PDF. On the platform as
// soon as the run that closes a month writes them; there is no email to hold.
// Since the audit design (7 Nov, Studio.dc.html): a real table, the brief's
// name its link to the viewer, "Download PDF" a link that says where it goes.
// On a phone each brief stacks (decision 14).

export function MonthlyBriefs({ briefs, openHref }: { briefs: readonly StudioBrief[]; openHref: (snapshotId: string) => string }) {
  if (briefs.length === 0) return null
  return (
    <Card className="gap-3.5 p-[26px] max-sm:p-[18px]">
      <CardTitle>Monthly briefs</CardTitle>
      <div className="min-w-0 overflow-x-auto">
        <table className={cn(TBL, STACK, 'sm:min-w-[760px]')}>
          <thead className={STACK_HEAD}>
            <tr>
              <th scope="col" className={TH}>Brief</th>
              <th scope="col" className={cn(TH, 'w-[190px]')}>For</th>
              <th scope="col" className={cn(TH, 'w-[140px]')}>Month</th>
              <th scope="col" className={cn(TH, 'w-[110px]')}>Written</th>
              <th scope="col" className={cn(TH, 'w-[130px] pr-0 text-right')}><span className="sr-only">PDF</span></th>
            </tr>
          </thead>
          <tbody className={STACK}>
            {briefs.map((b) => (
              <tr key={b.snapshotId} className={STACK_ROW}>
                <td className={cn(TD, STACK_CELL)}>
                  <Link href={openHref(b.snapshotId)} className={ROW}>{b.name}</Link>
                  <p className="m-0 mt-1 text-[14.5px] leading-[1.5] text-secondary-foreground">{b.what}</p>
                </td>
                <td className={cn(TD, STACK_CELL)}><span className={PHONE_HEAD}>For</span>{b.forWho}</td>
                <td className={cn(TD, STACK_CELL)}><span className={PHONE_HEAD}>Month</span>{b.monthLabel}</td>
                <td className={cn(TD, STACK_CELL)}><span className={PHONE_HEAD}>Written</span>{b.writtenOn}</td>
                <td className={cn(TD, 'pr-0 text-right whitespace-nowrap', STACK_CELL, 'max-sm:pt-1')}>
                  {/* A plain link, never a prefetching one: the PDF is printed
                      on its first download. */}
                  <a href={briefPdfHref(b.snapshotId)} className={GO}>Download PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
