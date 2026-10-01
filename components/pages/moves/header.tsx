import Link from 'next/link'
import { FileUp } from 'lucide-react'

import { DateMove } from '@/components/pages/market-surface/date-move'
import { PageBar } from '@/components/shell/page-grid'
import { canDate, type MoveDating } from '@/lib/pages/date-move'
import { BTN_SECONDARY } from './parts'
import { CHECK_A_PLAN, CHECK_A_PLAN_HREF, PAGE_TITLE } from './words'

// The page head, as the artboard draws it: the shared bar's 26px title and two
// secondary buttons at the right. "Check a plan" opens the Agent, where a plan
// is uploaded; "Date a move" opens the existing sheet. No month line, no "as
// at" (rule 1) and no Export (U12).

export function MovesHeader({ dating }: { dating?: MoveDating | null }) {
  return (
    <PageBar title={PAGE_TITLE}>
      <Link href={CHECK_A_PLAN_HREF} data-print-hide className={BTN_SECONDARY}>
        <FileUp className="size-4" aria-hidden />
        {CHECK_A_PLAN}
      </Link>
      {canDate(dating) ? <DateMove dating={dating} place="head" /> : null}
    </PageBar>
  )
}
