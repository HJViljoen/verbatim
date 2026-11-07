import Link from 'next/link'
import type { StudioRow } from '@/lib/pages/studio'
import { GoLink } from '@/components/v2'
import { ROW, STACK, STACK_CELL, STACK_HEAD, STACK_ROW, TBL, TD, TH } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import { Card, CardTitle } from './ui'
import { RecipientsEditor } from './recipients-editor'

// "Your reports" (Page-Studio artboard; since the audit design, 7 Nov,
// Studio.dc.html): the weekly and the four monthly briefs, one row each, a
// real table. Who it is for, how often, who gets it (names, one a line), the
// latest issue, and Recipients for an owner or admin. The report's name and
// its latest issue open that issue in the viewer where there is one
// (decision 16). The privacy line closes the card, once.
//
// ON A PHONE (decision 14) each report stacks, every cell under its head's
// words, so nothing is cut off at the card's edge.

/** A cell's head, said over its value on a phone, where the table's head is
 *  hidden. */
export const PHONE_HEAD = 'block text-[13px] font-medium text-muted-foreground sm:hidden'

export function YourReports({ rows, canEdit, privacy, openHref }: {
  rows: readonly StudioRow[]
  canEdit: boolean
  privacy: string
  /** The viewer's address for a snapshot (`?view=`). */
  openHref: (snapshotId: string) => string
}) {
  return (
    <Card className="gap-3.5 p-[26px] max-sm:p-[18px]">
      <CardTitle>Your reports</CardTitle>
      <div className="min-w-0 overflow-x-auto">
        <table className={cn(TBL, STACK, 'sm:min-w-[820px]')}>
          <thead className={STACK_HEAD}>
            <tr>
              <th scope="col" className={TH}>Report</th>
              <th scope="col" className={cn(TH, 'w-[120px]')}>For</th>
              <th scope="col" className={cn(TH, 'w-[170px]')}>How often</th>
              <th scope="col" className={cn(TH, 'w-[170px]')}>Who gets it</th>
              <th scope="col" className={cn(TH, 'w-[120px]')}>Latest issue</th>
              <th scope="col" className={cn(TH, 'w-[120px] pr-0 text-right')}><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody className={STACK}>
            {rows.map((r) => (
              <tr key={r.artefact} data-report={r.artefact} className={STACK_ROW}>
                <td className={cn(TD, STACK_CELL)}>
                  {r.latestSnapshotId
                    ? <Link href={openHref(r.latestSnapshotId)} className={cn(ROW, 'text-[16px]')}>{r.name}</Link>
                    : <span className="text-[16px] font-semibold">{r.name}</span>}
                  <p className="m-0 mt-1 max-w-[440px] text-[14.5px] leading-[1.5] text-secondary-foreground">{r.what}</p>
                </td>
                <td className={cn(TD, STACK_CELL)}><span className={PHONE_HEAD}>For</span>{r.forWho}</td>
                <td className={cn(TD, STACK_CELL)}><span className={PHONE_HEAD}>How often</span>{r.howOften}</td>
                <td className={cn(TD, STACK_CELL, r.people.length === 0 && 'max-sm:hidden')}>
                  <span className={PHONE_HEAD}>Who gets it</span>
                  {r.people.map((p) => <span key={p.email} className="block">{p.name}</span>)}
                </td>
                <td className={cn(TD, STACK_CELL, r.latest == null && 'max-sm:hidden')}>
                  <span className={PHONE_HEAD}>Latest issue</span>
                  {r.latestSnapshotId && r.latest ? <GoLink href={openHref(r.latestSnapshotId)} className="text-[15px] font-normal">{r.latest}</GoLink> : r.latest}
                </td>
                <td className={cn(TD, 'pr-0 text-right', STACK_CELL, 'max-sm:pt-1')}>
                  {canEdit ? <RecipientsEditor artefact={r.artefact} name={r.name} recipients={r.recipients} active={r.active || !r.scheduled} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{privacy}</p>
    </Card>
  )
}
