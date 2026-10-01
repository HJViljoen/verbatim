import Link from 'next/link'
import { History } from 'lucide-react'
import type { PastIssue } from '@/lib/pages/studio'
import { buttonClass, Card, CardTitle } from './ui'
import { ShareLinkButton } from './share-link-button'

// Past issues: every issue that went out, newest first, to open in the
// viewer, download as a PDF or share by link. Only issues ON THE PLATFORM reach
// this list: sent, or published without their email (`onPlatform`,
// lib/schedules/platform-state.ts; a held or unreviewed build is its
// reviewer's, lib/reports/held.ts), and the card is not drawn until there is
// one. Each prints the day it reached the platform and nothing about how: that
// a build was not emailed is the operator's to know (the workbench's history),
// never a client's (§0a.1).
//
// THE ARTBOARD DOES NOT DRAW THIS CARD: Sealand had no sent issue when it was
// made. It is the "Your reports" card's idiom (the same title, head and rows)
// so the two read as one page.

const COLS = 'grid grid-cols-[minmax(0,2.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,2fr)] gap-5'

export function PastIssues({ issues, openHref }: { issues: readonly PastIssue[]; openHref: (snapshotId: string) => string }) {
  if (issues.length === 0) return null
  return (
    <Card className="gap-4 px-[30px] pt-[26px] pb-[22px]">
      <CardTitle icon={History}>Past issues</CardTitle>
      <div className="-mx-1 overflow-x-auto px-1">
        <div role="table" aria-label="Past issues" className="flex min-w-[760px] flex-col">
          <div role="row" className={`${COLS} pb-2.5`}>
            {['Issue', 'Report', 'Sent'].map((h) => (
              <div key={h} role="columnheader" className="text-[12px] font-semibold text-[#5F656B]">{h}</div>
            ))}
            <div role="columnheader" aria-label="Open" />
          </div>
          {issues.map((i) => (
            <div key={i.id} id={`issue-${i.id}`} role="row" className={`${COLS} items-center border-t border-[#E4E2DC] py-[18px]`}>
              <div role="cell" className="text-[15px] font-semibold">{i.title}</div>
              <div role="cell" className="text-[14px]">{i.report}</div>
              <div role="cell" className="text-[14px]">{i.sentOn}</div>
              <div role="cell" className="flex flex-wrap items-start justify-end gap-2">
                {i.snapshotId ? <Link href={openHref(i.snapshotId)} scroll={false} className={buttonClass('secondary', 'small')}>Open</Link> : null}
                {i.artifactId ? <a href={`/api/artifacts/${i.artifactId}`} className={buttonClass('secondary', 'small')}>PDF</a> : null}
                {i.snapshotId ? <ShareLinkButton snapshotId={i.snapshotId} /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
