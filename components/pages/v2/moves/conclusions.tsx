import Link from 'next/link'
import { Lightbulb } from 'lucide-react'

import { CARD, CardHead, InPlacePanel, PanelTitle } from '@/components/v2'
import { typeLabel } from '@/components/pages/moves/words'
import { fmtInt, shortDate } from '@/lib/format'
import {
  CONCLUSIONS_SUB, CONCLUSIONS_TITLE, GROUNDED_BASIS, MOVES_PATH, NO_ADVICE_YET, RECORD_HREF, RECORD_PANEL_ID,
  adviceHref, conclusionAnchor, type MovesPageData, type RecordRow,
} from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'
import { MONO, OLINK, TAG_CHIP } from './parts'

// "What we concluded" (board E6-Moves): the latest update's conclusions about
// the market, each with the videos behind it (all time: a conclusion is the
// update's reading of everything read, never one month's) and the current
// advice built on it, or "No advice yet". Under them, the advice record:
// every piece of advice and what you decided, opened in place as a list
// (`?advice=all`).
//
// The conclusion and the advice are stored model prose (`pass_d_a_insight`,
// `pass_d_b_recommendation`); a tag is the advice's own title, cut to the
// tag's width on screen and whole in the markup.

function RecordLink({ total }: { total: number }) {
  return (
    <Link href={RECORD_HREF} scroll={false} className={OLINK}>
      The advice record: all <span data-copy="figure">{fmtInt(total)}</span> {total === 1 ? 'piece' : 'pieces'} of advice and what you decided →
    </Link>
  )
}

function RecordPanel({ rows, acted, total }: { rows: RecordRow[]; acted: number; total: number }) {
  return (
    <InPlacePanel
      id={RECORD_PANEL_ID}
      notchAt={0.12}
      closeHref={MOVES_PATH}
      labelledBy="record-title"
      closeLabel="Close the advice record"
      head={(
        <>
          <p className={cn(MONO, 'm-0 text-[12px] text-muted-foreground')}>
            <span data-copy="level">you have decided on {fmtInt(acted)} of {fmtInt(total)}</span>
          </p>
          <PanelTitle id="record-title">The advice record</PanelTitle>
        </>
      )}
    >
      <ol className="m-0 flex list-none flex-col p-0">
        {rows.map((r, i) => (
          <li key={r.lineageId} className={cn('grid grid-cols-1 gap-x-5 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto]', i > 0 ? 'border-t border-track' : null)}>
            <div className="min-w-0">
              <Link href={adviceHref(r.lineageId)} scroll={false} className="text-[14.5px] font-medium leading-[1.4] text-foreground no-underline hover:underline underline-offset-2">
                <span data-copy="stored" data-slot="pass_d_b_recommendation">{r.title}</span>
              </Link>
              <p className={cn(MONO, 'm-0 mt-0.5 text-[12px] text-muted-foreground')}>
                {[typeLabel(r.kind), r.firstMade ? `first suggested ${shortDate(r.firstMade)}` : null, `${fmtInt(r.updates)} ${r.updates === 1 ? 'update' : 'updates'}`, r.current ? 'raised by the latest update' : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className={cn('self-center whitespace-nowrap text-[12.5px]', r.status === 'new' ? 'text-muted-foreground' : 'font-semibold text-foreground')}>
              {r.status === 'new' ? 'not decided' : `${r.statusLabel}${r.decidedAt ? ` since ${shortDate(r.decidedAt)}` : ''}`}
            </span>
          </li>
        ))}
      </ol>
    </InPlacePanel>
  )
}

export function ConclusionsSection({ data }: { data: MovesPageData }) {
  const { conclusions, record } = data
  const total = data.advice.total
  return (
    <>
      {conclusions.length > 0 ? (
        <section aria-labelledby="conclusions-title" className={CARD}>
          <CardHead icon={Lightbulb} id="conclusions-title" title={CONCLUSIONS_TITLE} sub={CONCLUSIONS_SUB} />
          <div className="flex flex-col">
            {conclusions.map((c, i) => (
              <div key={c.id} id={conclusionAnchor(c.id)} className={cn('grid scroll-mt-6 grid-cols-1 items-center gap-x-4 gap-y-1.5 py-[13px] text-[14px] sm:grid-cols-[minmax(0,1fr)_auto_auto]', i > 0 ? 'border-t border-track' : null)}>
                <span data-copy="stored" data-slot="pass_d_a_insight" className="min-w-0 text-foreground">{c.title}</span>
                {/* A conclusion resting on rival findings alone resolves to no
                    video: it prints no count rather than "0 videos". */}
                <span className={cn(MONO, 'whitespace-nowrap text-[12.5px] text-muted-foreground')}>
                  {c.videos > 0 ? <><span data-copy="figure">{fmtInt(c.videos)}</span> {c.videos === 1 ? 'video' : 'videos'}, {GROUNDED_BASIS}</> : null}
                </span>
                <span className="flex min-w-0 flex-wrap gap-1.5 sm:justify-end">
                  {c.advice.length > 0
                    ? c.advice.map((a) => (
                        <Link key={a.lineageId} href={adviceHref(a.lineageId)} scroll={false} title={a.title} className={cn(TAG_CHIP, 'max-w-[220px] truncate no-underline hover:underline underline-offset-2')}>
                          <span data-copy="stored" data-slot="pass_d_b_recommendation">{a.title}</span>
                        </Link>
                      ))
                    : <span className={cn(TAG_CHIP, 'bg-inner text-muted-foreground')}>{NO_ADVICE_YET}</span>}
                </span>
              </div>
            ))}
          </div>
          {total > 0 ? <RecordLink total={total} /> : null}
        </section>
      ) : total > 0 ? (
        <p className="m-0 px-0.5"><RecordLink total={total} /></p>
      ) : null}
      {record.open ? <RecordPanel rows={record.rows} acted={data.advice.acted} total={total} /> : null}
    </>
  )
}
