import Link from 'next/link'
import type { PastIssue } from '@/lib/pages/studio'
import { GO, ROW, STACK, STACK_CELL, STACK_HEAD, STACK_ROW, TBL, TD, TH } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import { Card, CardTitle } from './ui'
import { ShareLinkButton } from './share-link-button'
import { PHONE_HEAD } from './your-reports'

// Past issues: every issue that went out, newest first, to open in the
// viewer, download as a PDF or share by link. Only issues ON THE PLATFORM reach
// this list: sent, or published without their email (`onPlatform`,
// lib/schedules/platform-state.ts; a held or unreviewed build is its
// reviewer's, lib/reports/held.ts), and the card is not drawn until there is
// one. Each prints the day it reached the platform and nothing about how: that
// a build was not emailed is the operator's to know (the workbench's history),
// never a client's (§0a.1).
//
// Since the audit design (7 Nov, Studio.dc.html): a real table, the issue's
// title its link to the viewer, "Download PDF" a link where there is a stored
// file, "Share link" the small secondary button. On a phone each issue stacks
// (decision 14).

export function PastIssues({ issues, openHref }: { issues: readonly PastIssue[]; openHref: (snapshotId: string) => string }) {
  if (issues.length === 0) return null
  return (
    <Card className="gap-3.5 p-[26px] max-sm:p-[18px]">
      <CardTitle>Past issues</CardTitle>
      <div className="min-w-0 overflow-x-auto">
        <table className={cn(TBL, STACK, 'sm:min-w-[700px]')}>
          <thead className={STACK_HEAD}>
            <tr>
              <th scope="col" className={TH}>Issue</th>
              <th scope="col" className={cn(TH, 'w-[150px]')}>Report</th>
              <th scope="col" className={cn(TH, 'w-[110px]')}>Sent</th>
              <th scope="col" className={cn(TH, 'w-[250px] pr-0 text-right')}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className={STACK}>
            {issues.map((i) => (
              <tr key={i.id} id={`issue-${i.id}`} className={STACK_ROW}>
                <td className={cn(TD, STACK_CELL)}>
                  {i.snapshotId ? <Link href={openHref(i.snapshotId)} className={ROW}>{i.title}</Link> : <span className="font-semibold">{i.title}</span>}
                </td>
                <td className={cn(TD, STACK_CELL)}><span className={PHONE_HEAD}>Report</span>{i.report}</td>
                <td className={cn(TD, STACK_CELL)}><span className={PHONE_HEAD}>Sent</span>{i.sentOn}</td>
                <td className={cn(TD, 'pr-0 text-right', STACK_CELL, 'max-sm:pt-1')}>
                  <span className="inline-flex flex-wrap items-center justify-end gap-x-4 gap-y-2 max-sm:justify-start">
                    {i.artifactId ? <a href={`/api/artifacts/${i.artifactId}`} className={GO}>Download PDF</a> : null}
                    {i.snapshotId ? <ShareLinkButton snapshotId={i.snapshotId} /> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
