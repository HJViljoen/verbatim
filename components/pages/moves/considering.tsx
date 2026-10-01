import { Lightbulb } from 'lucide-react'
import { adviceAnchor, type AdviceRow } from '@/lib/pages/market-surface'
import { ConsiderActions } from './consider-actions'
import { Card, SectionHead } from './parts'
import { CONSIDERING_MAX, CONSIDERING_SUB, CONSIDERING_TITLE, priorityLabel, typeLabel, whyLead } from './words'

// "Moves worth considering" (the artboard; page review: kept from "The advice
// and what you decided" without its Repeated, Grounded and Afterwards columns).
// The current advice, one row per idea (`adviceShortlist`), the undecided ones
// only: an accepted piece is a dated move and lives under Your moves, a piece
// marked "Not for us" is gone. At most five.
//
// The title and the argument are Pass D-b's prose, stored and scrubbed under
// its own slot at write time; the chip and the type are code's.
//
// THE PRIORITY CHIP CARRIES THE COLOUR ROLES (colour pass, 1 Oct): high is an
// attention mark, the orange fill with ink on it (4.6:1); medium the pale
// yellow of a tag; low stays on the ground, muted.

const CHIP: Record<string, string> = {
  'High priority': 'bg-orange font-semibold text-brand-foreground',
  'Medium priority': 'bg-accent text-accent-foreground',
  'Low priority': 'bg-[#F7F6F2] text-[#5F656B]',
}

/** The rows the block draws, in the short list's order. */
export function consideringRows(rows: readonly AdviceRow[] | null | undefined): AdviceRow[] {
  return (rows ?? []).filter((r) => r.status === 'new').slice(0, CONSIDERING_MAX)
}

export function MovesWorthConsidering({ rows }: { rows: readonly AdviceRow[] }) {
  if (rows.length === 0) return null
  return (
    <Card pad="px-7 pt-6 pb-2" gap="gap-[10px]">
      <SectionHead icon={Lightbulb} title={CONSIDERING_TITLE} sub={CONSIDERING_SUB} />
      <div className="flex flex-col">
        {rows.map((r) => {
          const chip = priorityLabel(r.priority)
          const type = typeLabel(r.kind)
          const why = whyLead(r.why)
          return (
            <div key={r.lineageId} id={adviceAnchor(r.lineageId)} className="grid grid-cols-1 items-start gap-4 border-t border-[#E4E2DC] py-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8">
              <div className="flex max-w-[860px] flex-col gap-2">
                {chip || type ? (
                  <div className="flex items-center gap-2">
                    {chip ? <span className={`inline-flex items-center rounded-full px-2.5 py-[5px] text-[12px] leading-[1.3] ${CHIP[chip]}`}>{chip}</span> : null}
                    {type ? <span className="text-[13px] text-[#5F656B]">{type}</span> : null}
                  </div>
                ) : null}
                <div data-copy="stored" data-slot="pass_d_b_recommendation" className="text-[17px] font-bold leading-[1.35] text-[#26292C]">{r.title}</div>
                {why ? <p data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 text-[14px] leading-[1.55] text-[#5F656B]">{why}</p> : null}
              </div>
              <ConsiderActions lineageId={r.lineageId} recommendationId={r.recommendationId} title={r.title.slice(0, 120)} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
