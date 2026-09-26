import { TokenProse } from '@/components/blocks/prose'
import { pairChipWords } from '@/lib/calibration'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { pairOnVerdict } from '@/lib/reading/comparability'
import { nextPairLine, whyNotCompared, type ChangeBlock, type CompareRule, type LedgerLine } from '@/lib/pages/overview-market/change'
import { ledgerMonths, monthHead, reachCell } from '@/lib/settings/what-we-changed'
import { cn } from '@/lib/utils'

import { RecordSection } from './frame'

// Settings › What we changed (market-first WP1.6, plan §2.10 D2): the three
// pieces that ship with deploy 2. The month pair in one sentence and the first
// pair read the same way; "Why September is not compared", in the front page's
// own sentence; the dated list of our changes, each once, with the months it
// touched and how much of each it brought in; and the four rules of decision
// D with how the page's pair stands on each. "Searches held still until
// January", "How we check, mark and file videos" and "What the pages can say,
// and when" join with deploy 5 (WP3.10).
//
// THE 25 SEP RULINGS HOLD HERE TOO (§5.12): each section's header is its title
// alone (no meta, no note), and nothing explains itself under a table.

/** The anchor the front page's "What we changed, and when →" opens. */
export const WHAT_WE_CHANGED_ID = 'what-we-changed'

/** "August and September sit side by side, not read as a change: we changed
 *  our searches in September." The preview's headline, from the pair's words. */
export function sideBySide(block: ChangeBlock): string | null {
  const pair = block.pair
  if (!pair || !block.prevMonth) return null
  if (pair.mode === 'comparable') return `${longMonth(pair.prevMonth)} and ${longMonth(pair.month)} were read the same way.`
  const note = pairOnVerdict(pair).note
  const words = note ? pairChipWords(note) : 'not compared yet'
  return `${longMonth(pair.prevMonth)} and ${longMonth(pair.month)} sit side by side, ${words}.`
}

export function WhatWeChangedLead({ block }: { block: ChangeBlock }) {
  const head = sideBySide(block)
  const next = nextPairLine(block)
  const why = whyNotCompared(block)
  return (
    <RecordSection title="What we changed" className="scroll-mt-6">
      <div id={WHAT_WE_CHANGED_ID} className="flex max-w-[720px] flex-col gap-3">
        {head ? <p className="m-0 text-[22px] font-medium leading-[1.3] tracking-[-0.01em] [text-wrap:balance]">{head}</p> : null}
        {next ? <p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]">{next}</p> : null}
      </div>
      {why ? (
        <div className="flex max-w-[720px] flex-col gap-1.5 border-t border-border/70 pt-4">
          <h4 className="m-0 text-[13px] font-semibold">{why.title}</h4>
          <TokenProse body={why.body} figures={why.figures} mode="app" figureFace="mono" figureClassName="font-semibold text-foreground" className="m-0 text-[15px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]" />
        </div>
      ) : null}
    </RecordSection>
  )
}

type Line = LedgerLine & { items?: { added: string[]; removed: string[] } | null }

export function TheRecord({ lines, month, prevMonth }: { lines: readonly Line[]; month: string; prevMonth: string | null }) {
  if (lines.length === 0) {
    return (
      <RecordSection title="The record">
        <p className="m-0 text-[12.5px] text-muted-foreground">No change of ours is on record for this workspace yet.</p>
      </RecordSection>
    )
  }
  const months = ledgerMonths(lines, month, prevMonth)
  const cols = months.length === 2
    ? 'lg:grid-cols-[88px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'
    : 'lg:grid-cols-[88px_minmax(0,2fr)_minmax(0,1fr)]'
  return (
    <RecordSection title="The record">
      <div role="table" className="flex flex-col">
        <div role="row" className={cn('hidden gap-x-6 pb-2 text-[12px] font-medium text-muted-foreground lg:grid', cols)}>
          <span role="columnheader">Date</span>
          <span role="columnheader">What we changed</span>
          {months.map((m) => <span key={m} role="columnheader" className="text-right">{monthHead(m)}</span>)}
        </div>
        {lines.map((l) => (
          <div key={l.changeId} role="row" className={cn('grid grid-cols-1 gap-x-6 gap-y-1 border-t border-border/70 py-3', cols)}>
            <span className="font-mono text-[12px] leading-[1.6] tabular-nums text-secondary-foreground">{shortDate(l.date)}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] font-medium leading-[1.5]">{l.words}</span>
              {l.items && (l.items.added.length > 0 || l.items.removed.length > 0) ? (
                <span className="font-mono text-[12px] leading-[1.6] text-secondary-foreground">
                  {l.items.added.length > 0 ? <>in: {l.items.added.join(', ')}</> : null}
                  {l.items.added.length > 0 && l.items.removed.length > 0 ? ' · ' : null}
                  {l.items.removed.length > 0 ? <>out: {l.items.removed.join(', ')}</> : null}
                </span>
              ) : null}
            </span>
            {months.map((m) => {
              const cell = reachCell(l, m)
              const measure = (l.months ?? []).find((x) => x.month === m)
              return (
                <span key={m} className="flex flex-col gap-0.5 lg:items-end lg:text-right">
                  {cell ? (
                    <>
                      <span data-copy="level" className="font-mono text-[13px] font-semibold leading-[1.5] tabular-nums">{cell}</span>
                      <span className="text-[12px] leading-[1.45] text-muted-foreground [text-wrap:balance]">of {monthHead(m)}’s videos, read with the {shortDate(measure?.readWith ?? '')} update</span>
                    </>
                  ) : (
                    <span className="text-[12px] leading-[1.6] text-muted-foreground">{m === l.date.slice(0, 7) + '-01' ? 'not measured yet' : '·'}</span>
                  )}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </RecordSection>
  )
}

const STATE_MARK: Record<CompareRule['state'], string> = { held: '✓', not_held: '⊘', unmeasured: '○' }

export function WhenCompared({ rules, block, asAt }: { rules: readonly CompareRule[]; block: ChangeBlock; asAt: string | null }) {
  const pair = block.pair
  const column = pair ? `${longMonth(pair.prevMonth)} against ${longMonth(pair.month)}${asAt ? `, as at ${shortDate(asAt)}` : ''}` : null
  return (
    <RecordSection title="When two months are compared">
      <p className="m-0 text-[15px] font-medium">Only when both were read the same way. All four must hold.</p>
      <div role="table" className="flex flex-col">
        <div role="row" className="hidden gap-x-6 pb-2 text-[12px] font-medium text-muted-foreground lg:grid lg:grid-cols-[24px_minmax(0,1.6fr)_minmax(0,1fr)]">
          <span role="columnheader" />
          <span role="columnheader">The rule</span>
          <span role="columnheader">{column}</span>
        </div>
        {rules.map((r) => (
          <div key={r.n} role="row" className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-6 gap-y-1 border-t border-border/70 py-3 lg:grid-cols-[24px_minmax(0,1.6fr)_minmax(0,1fr)]">
            <span className="font-mono text-[13px] font-semibold leading-[1.5] text-muted-foreground">{fmtInt(r.n)}</span>
            <span className="text-[13px] leading-[1.5]">{r.rule}</span>
            {pair ? (
              <span className="col-start-2 inline-flex items-baseline gap-2 text-[13px] lg:col-start-auto">
                <span aria-hidden className={cn('font-mono', r.state === 'held' ? 'text-positive' : 'text-muted-foreground')}>{STATE_MARK[r.state]}</span>
                <span data-copy={/\bof\b/.test(r.answer) ? 'level' : undefined}>{r.answer}</span>
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </RecordSection>
  )
}
