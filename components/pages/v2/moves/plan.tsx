import Link from 'next/link'
import { FileText } from 'lucide-react'

import { CARD, CardHead } from '@/components/v2'
import { PLAN_EMPTY, type PlanCheckCard, type PlanClaimRow } from '@/lib/ask/plan-cards'
import { fmtInt, shortDate } from '@/lib/format'
import { CHECK_A_PLAN_HREF, PLAN_TITLE, READ_FAILED, leadClaims } from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'
import { MONO, OLINK } from './parts'

// "Your plan, checked against the market" (board E6-Moves): the newest plan
// the Agent has re-read, its claims supported out of all of them, the three
// counts as one bar (a partition: every claim carries exactly one verdict),
// what changed since it was uploaded, and its lead claims.
//
// A CLAIM IS THE CLIENT'S OWN DOCUMENT (`quote`). Its count is a FLOOR, never
// a share (lib/ask/plan-cards.ts `PLAN_CLAIM_BASIS`): at least this many videos
// we can show a comment from. The board's per-claim figures ("44% new
// amputees and caregivers", "22 of 38 knee videos are about paying") are
// computed nowhere: what moved is stored as the verdict it moved from and to,
// and the date. No quote here (no quotes at level 1).

const SEG = [
  { key: 'supported', label: 'supported', fill: 'bg-you' },
  { key: 'contradicted', label: 'contradicted', fill: 'bg-negative' },
  { key: 'untested', label: 'untested', fill: 'bg-track' },
] as const

/** What changed since upload, printed here; the rest are claim by claim. */
export const PLAN_MOVED_SHOWN = 3

const VERDICT_TONE: Record<string, string> = {
  echoes: 'font-semibold text-foreground',
  contradicts: 'font-semibold text-negative',
  silent: 'font-medium text-muted-foreground',
}

/** "uploaded 28 Sep · re-read 5 Oct", the plan's one line after its name. */
export function planDates(plan: Pick<PlanCheckCard, 'uploadedOn' | 'checkedOn'>): string {
  return [`uploaded ${shortDate(plan.uploadedOn)}`, plan.checkedOn ? `re-read ${shortDate(plan.checkedOn)}` : 'not re-read since upload'].join(' · ')
}

function ClaimRow({ c, first }: { c: PlanClaimRow; first: boolean }) {
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 text-[14px] sm:grid-cols-[minmax(0,1fr)_auto_auto]', first ? null : 'border-t border-track')}>
      <span data-copy="quote" className="min-w-0 text-foreground">“{c.claim}”</span>
      <span className={cn('text-[12.5px]', VERDICT_TONE[c.verdict] ?? 'text-foreground')}>{c.verdictLabel}</span>
      <span className={cn(MONO, 'col-span-2 text-[12px] text-muted-foreground sm:col-span-1')}>
        {c.verdict === 'silent' ? 'nobody raises it' : <>at least <span data-copy="figure">{fmtInt(c.value.k)}</span> {c.value.k === 1 ? 'video' : 'videos'}</>}
      </span>
    </div>
  )
}

/** The three counts' key, with or without their figures. */
function Key({ counts }: { counts: PlanCheckCard['summary'] | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 text-[12px] text-muted-foreground">
      {SEG.map((x) => (
        <span key={x.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('inline-block h-2 w-2.5 rounded-[2px]', x.fill)} />
          {x.label}{counts ? <> <span data-copy="figure" className={MONO}>{fmtInt(counts[x.key])}</span></> : null}
        </span>
      ))}
    </div>
  )
}

/**
 * THE BOARD'S PLAN CARD WITH NO PLAN TO DRAW: its head, its bar as the empty
 * track it fills from, its key, and ONE line for the one gap: none checked
 * (the Agent's own words, `PLAN_EMPTY`, with the way to check one at its
 * foot), or the read failed on this load (never "none checked" beside a
 * count of plans). No count is drawn: nothing was read, which is not zero.
 */
function NoPlan({ className, failed }: { className?: string; failed: boolean }) {
  return (
    <section aria-labelledby="plan-title" data-plan-empty="" className={cn(CARD, className)}>
      <CardHead icon={FileText} id="plan-title" title={PLAN_TITLE} />
      <div aria-hidden className="h-3.5 rounded-[5px] bg-track" />
      <Key counts={null} />
      <p className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">{failed ? `Your plan ${READ_FAILED}.` : PLAN_EMPTY}</p>
      {failed ? null : (
        <div className="mt-auto flex items-center justify-between gap-3" data-print-hide>
          <Link href={CHECK_A_PLAN_HREF} className={OLINK}>Check a plan →</Link>
        </div>
      )}
    </section>
  )
}

export function PlanCard({ plan, className, failed = false }: { plan: PlanCheckCard | null; className?: string; failed?: boolean }) {
  if (!plan || failed) return <NoPlan className={className} failed={failed} />
  const s = plan.summary
  const total = s.supported + s.contradicted + s.untested
  const claims = leadClaims(plan)
  return (
    <section aria-labelledby="plan-title" className={cn(CARD, className)}>
      <CardHead icon={FileText} id="plan-title" title={PLAN_TITLE} sub={<><span data-copy="quote">{plan.title}</span> · {planDates(plan)}</>} />
      {total > 0 ? (
        <>
          <div data-copy="level" className="flex items-baseline gap-2">
            <span className={cn(MONO, 'text-[30px] font-medium leading-none tracking-[-0.02em] text-foreground')}>{fmtInt(s.supported)}</span>
            <span className={cn(MONO, 'text-[12.5px] text-muted-foreground')}>of {fmtInt(total)} {total === 1 ? 'claim' : 'claims'} supported</span>
          </div>
          <div role="img" aria-label={`${fmtInt(s.supported)} supported, ${fmtInt(s.contradicted)} contradicted, ${fmtInt(s.untested)} untested`} className="flex h-3.5 gap-0.5 overflow-hidden rounded-[5px]">
            {SEG.map((x) => (s[x.key] > 0 ? <div key={x.key} className={x.fill} style={{ width: `${(100 * s[x.key]) / total}%` }} /> : null))}
          </div>
          <Key counts={s} />
        </>
      ) : (
        <>
          <div aria-hidden className="h-3.5 rounded-[5px] bg-track" />
          <Key counts={null} />
        </>
      )}
      {plan.moved.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] bg-inner px-4 py-3.5">
          <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.06em] text-orange-text">Changed since you uploaded it</p>
          {plan.moved.slice(0, PLAN_MOVED_SHOWN).map((m) => (
            <p key={`${m.claim}:${m.to}`} className="m-0 text-[14px] leading-[1.5] text-foreground">
              <span data-copy="quote">“{m.claim}”</span> is now <b>{m.to.toLowerCase()}</b>, from {m.from.toLowerCase()}{' '}
              <span className={cn(MONO, 'text-[12px] text-muted-foreground')}>({m.on})</span>
            </p>
          ))}
          {plan.moved.length > PLAN_MOVED_SHOWN ? (
            <p className="m-0 text-[13px] text-muted-foreground">
              And <span data-copy="figure">{fmtInt(plan.moved.length - PLAN_MOVED_SHOWN)}</span> more, claim by claim.
            </p>
          ) : null}
        </div>
      ) : null}
      {plan.empty ? <p className="m-0 text-[13.5px] text-muted-foreground">{plan.empty}</p> : null}
      {claims.length > 0 ? <div className="flex flex-col">{claims.map((c, i) => <ClaimRow key={`${c.claim}:${i}`} c={c} first={i === 0} />)}</div> : null}
      {plan.notice ? <p className="m-0 text-[12px] leading-[1.4] text-muted-foreground">{plan.notice}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-3">
        <Link href={plan.href} className={OLINK}>Claim by claim →</Link>
      </div>
    </section>
  )
}
