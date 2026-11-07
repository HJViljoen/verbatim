import Link from 'next/link'

import { CARD, CardHead, EmptyBox, GoLink, TBL, TD, TD_NUM, TH } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import {
  CONCLUSIONS_SUB, CONCLUSIONS_TITLE, GROUNDED_BASIS, NO_ADVICE_YET, NO_CONCLUSIONS, READ_FAILED, RECORD_HREF,
  adviceHref, conclusionAnchor, type MovesPageData,
} from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'

// "What we concluded" (board E6-Moves; since the audit design, 7 Nov,
// Moves.dc.html): the latest update's conclusions about the market as a
// table, each with the videos behind it (all time, said once in the column's
// head: a conclusion is the update's reading of everything read, never one
// month's) and the current advice built on it, each piece a whole link to its
// page, or "No advice yet". Under them, the way to the advice record, its own
// page since 17 Oct (`/dashboard/moves/advice`).
//
// The conclusion and the advice are stored model prose (`pass_d_a_insight`,
// `pass_d_b_recommendation`).

export function ConclusionsSection({ data }: { data: MovesPageData }) {
  const { conclusions } = data
  const total = data.advice.total
  // THE BOARD'S CARD, ALWAYS: with no conclusion it keeps its head, one calm
  // line in the dashed box in its rows' place (decision 4), and the record's
  // link at its foot.
  return (
    <section aria-labelledby="conclusions-title" className={cn(CARD, 'mt-[26px]')}>
      <CardHead id="conclusions-title" size="lg" title={CONCLUSIONS_TITLE} sub={CONCLUSIONS_SUB} />
      {/* A failed read says so; it is never "drew no conclusions". */}
      {data.failed?.conclusions
        ? <EmptyBox>The conclusions {READ_FAILED}.</EmptyBox>
        : conclusions.length === 0 ? <EmptyBox>{NO_CONCLUSIONS}</EmptyBox> : (
          <div className="min-w-0 overflow-x-auto">
            <table className={cn(TBL, 'min-w-[560px]')}>
              <thead>
                <tr>
                  <th scope="col" className={cn(TH, 'w-[38%]')}>Conclusion</th>
                  <th scope="col" className={cn(TH, 'w-[130px] text-right')}>Rests on, {GROUNDED_BASIS}</th>
                  <th scope="col" className={cn(TH, 'pl-7 pr-0')}>Advice built on it</th>
                </tr>
              </thead>
              <tbody>
                {conclusions.map((c) => (
                  <tr key={c.id} id={conclusionAnchor(c.id)} data-conclusion="" className="scroll-mt-6">
                    <td className={cn(TD, 'font-semibold')}><span data-copy="stored" data-slot="pass_d_a_insight">{c.title}</span></td>
                    {/* A conclusion resting on rival findings alone resolves to
                        no video: it prints no count rather than "0 videos". */}
                    <td className={cn(TD, TD_NUM, 'whitespace-nowrap')}>
                      {c.videos > 0 ? <><span data-copy="figure">{fmtInt(c.videos)}</span> {c.videos === 1 ? 'video' : 'videos'}</> : null}
                    </td>
                    <td className={cn(TD, 'pl-7 pr-0')}>
                      {c.advice.length > 0
                        ? c.advice.map((a) => (
                            <Link key={a.lineageId} href={adviceHref(a.lineageId)} className="block text-foreground underline decoration-control underline-offset-[3px] hover:decoration-foreground">
                              <span data-copy="stored" data-slot="pass_d_b_recommendation">{a.title}</span>
                            </Link>
                          ))
                        : <span className="text-muted-foreground">{NO_ADVICE_YET}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {total > 0 ? (
        <GoLink href={RECORD_HREF} className="self-start">
          The advice record: all <span data-copy="figure">{fmtInt(total)}</span> {total === 1 ? 'piece' : 'pieces'} of advice and what you decided
        </GoLink>
      ) : null}
    </section>
  )
}
