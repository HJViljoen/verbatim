import { Clapperboard } from 'lucide-react'
import { IconTile } from '@/components/colour-roles'
import { fmtInt, longMonth } from '@/lib/format'
import { marketLabel, multipleWords, sharePct, WORKS_TITLE, worksSentence, type WorksBlock, type WorksRow } from '@/lib/pages/brands'
import { Bar, BrandName, Card, Num, SubHead } from './ui'

// What works in your market's videos (the artboard's last block; This week's
// "What worked" folded in, read monthly): how the category's videos are made
// and how they open, each as a share of the videos carrying one, with its
// engagement against the month's median video beside it. The format the lead
// sentence names ("Story videos draw the strongest response") carries the
// orange attention dot (the colour roles), so its row is found at a glance;
// nothing else does, and no dot is drawn where there is no sentence.

/** Small bases print counts (pages build rule 4). */
const SMALL_BASE = 100

function ColHead() {
  return (
    <div aria-hidden className="flex justify-end gap-3.5 text-[12px] font-semibold text-muted-foreground">
      <span className="w-10 text-right">Share</span>
      <span className="w-16 text-right">Engagement</span>
    </div>
  )
}

function Row({ r, of, top }: { r: WorksRow; of: number; top: boolean }) {
  const pct = sharePct(r.k, of)
  return (
    <div className="flex items-center gap-3.5 border-t border-border py-2">
      <div className="w-[150px] min-w-0 shrink-0 text-[14px] text-foreground max-sm:w-[120px]">{r.label}</div>
      {/* Drawn at the printed percent, as the artboard draws it. */}
      <Bar pct={of > 0 ? pct : 0} className="grow" />
      <div className="w-10 shrink-0 text-right font-mono text-[14px] font-medium text-foreground">
        {of < SMALL_BASE ? <Num value={r.k} /> : <span data-copy="figure">{pct}%</span>}
      </div>
      <div className={`flex w-16 shrink-0 items-center justify-end gap-1.5 font-mono text-[13px] ${top ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
        {top ? <span aria-hidden data-attention="" className="size-1.5 shrink-0 rounded-full bg-orange" /> : null}
        {r.multiple != null ? <span data-copy="figure">{multipleWords(r.multiple)}×</span> : null}
      </div>
    </div>
  )
}

/** The row `worksSentence` names: the highest engagement, the more common
 *  format on a tie (the rows come in rank order). */
function topOf(rows: readonly WorksRow[]): WorksRow | null {
  let top: WorksRow | null = null
  for (const r of rows) if (r.multiple != null && (top?.multiple == null || r.multiple > top.multiple)) top = r
  return top
}

export function WorksCard({ works, noun }: { works: WorksBlock; noun: string | null }) {
  const lead = worksSentence(works)
  const month = longMonth(works.month)
  return (
    <Card className="gap-3 px-7 pt-6 pb-[22px]">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2.5">
          <IconTile icon={Clapperboard} />
          <h2 className="m-0 text-[20px] font-bold text-foreground">{WORKS_TITLE}</h2>
        </div>
        <div className="text-[12px] leading-[1.45]"><BrandName kind="market">{marketLabel(noun)}</BrandName></div>
      </div>
      {lead ? (
        <p className="-mt-1 mb-1 max-w-[860px] text-[15px] leading-[1.55] text-foreground">
          {lead.map((b, i) => (b.t === 'figure' ? <span key={i} data-copy="figure">{b.s}</span> : <span key={i}>{b.s}</span>))}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
        {works.formats.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-2">
            <SubHead title="How they are made" sub={<>Share of the <span data-copy="figure">{fmtInt(works.formatsOf)}</span> category videos posted in {month} with a recognisable format</>} />
            <ColHead />
            <div className="flex flex-col">{works.formats.map((r) => <Row key={r.key} r={r} of={works.formatsOf} top={lead != null && r === topOf(works.formats)} />)}</div>
          </div>
        ) : null}
        {works.hooks.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-2">
            <SubHead title="How they open" sub={<>Share of the <span data-copy="figure">{fmtInt(works.hooksOf)}</span> with a recognisable opening</>} />
            <ColHead />
            <div className="flex flex-col">{works.hooks.map((r) => <Row key={r.key} r={r} of={works.hooksOf} top={false} />)}</div>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
