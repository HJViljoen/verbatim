import type { ReactNode } from 'react'

import { openLink } from '@/components/blocks/open-link'
import { TokenProse } from '@/components/blocks/prose'
import { pairChipWords } from '@/lib/calibration'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { pairOnVerdict } from '@/lib/reading/comparability'
import { nextPairParts, whyNotCompared, type ChangeBlock, type CompareRule, type LedgerLine, type WhyCell } from '@/lib/pages/overview-market/change'
import { ledgerMonths, monthHead, reachCell } from '@/lib/settings/what-we-changed'
import { settingsSubPage } from '@/lib/settings/rail'
import { cn } from '@/lib/utils'

import { RecordSection } from './frame'

// Settings › What we changed (market-first WP1.6, plan §2.10 D2): the three
// pieces that ship with deploy 2. The month pair in one sentence and the first
// pair read the same way; "Why September is not compared", as the measured
// figures behind the refusal; the dated list of our changes, each once, with
// the months it touched and how much of each it brought in; and the four rules
// of decision D with how the page's pair stands on each. "Searches held still
// until January", "How we check, mark and file videos" and "What the pages can
// say, and when" join with deploy 5 (WP3.10).
//
// THE APPROVED PREVIEW'S LOOK (Heinrich's default, 26 Sep; `SettingsRecord`
// artboard): each section a tile, the pair at 28px, "Why September is not
// compared" as three stat cells, and the tables on Your market's scale (a
// row at 15px, a column head and a cell's apparatus at 13px, figures in mono).
//
// THE 25 SEP RULINGS HOLD HERE TOO (§5.12): each section's header is its title
// alone, its footer a link, and nothing explains itself under a table.

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

const MONO_FIGURE = 'font-mono font-semibold tabular-nums text-foreground'

/** A figure and its base, set as the preview sets them: the count in weight,
 *  "of 654" beside it in mono, or "against 21" with the older month's median
 *  in grey. `size` is the figure's; the base is always 15px or 13px. */
function Counted({ figure, word, base, size }: { figure: number; word: 'of' | 'against'; base: number; size: 'stat' | 'row' }) {
  const fig = size === 'stat' ? 'text-[28px] leading-none tracking-[-0.03em]' : 'text-[15px]'
  const baseSize = size === 'stat' ? 'text-[15px]' : 'text-[13px]'
  if (word === 'of') {
    return (
      <span data-copy="level" className="inline-flex items-baseline gap-2 whitespace-nowrap">
        <span className={cn(MONO_FIGURE, fig)}>{fmtInt(figure)}</span>
        <span className={cn('font-mono font-medium tabular-nums text-secondary-foreground', baseSize)}>of {fmtInt(base)}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span data-copy="figure" className={cn(MONO_FIGURE, fig)}>{fmtInt(figure)}</span>
      <span className="text-[15px] text-muted-foreground">against</span>
      <span data-copy="figure" className="font-mono text-[15px] font-medium tabular-nums text-muted-foreground">{fmtInt(base)}</span>
    </span>
  )
}

/** One of "Why September is not compared"'s cells. */
function WhyStat({ cell }: { cell: WhyCell }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Counted figure={cell.figure} word={cell.base.word} base={cell.base.value} size="stat" />
      <span className="text-[15px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">{cell.caption}</span>
      {cell.readWith ? <span className="font-mono text-[12px] leading-[1.4] text-muted-foreground">read with the {shortDate(cell.readWith)} update</span> : null}
    </div>
  )
}

export function WhatWeChangedLead({ block }: { block: ChangeBlock }) {
  const head = sideBySide(block)
  const next = nextPairParts(block)
  const why = whyNotCompared(block)
  return (
    <RecordSection title="What we changed" id={WHAT_WE_CHANGED_ID}>
      <div className="flex max-w-[720px] flex-col gap-4">
        {head ? <p className="m-0 text-[22px] font-medium leading-[1.3] tracking-[-0.02em] [text-wrap:balance] sm:text-[28px]">{head}</p> : null}
        {next ? (
          <p className="m-0 max-w-[620px] text-[17px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]">
            {next.lead}<span className="font-semibold text-foreground">{next.pair}</span>{next.tail}
          </p>
        ) : null}
      </div>
      {why ? (
        <div className="flex max-w-[720px] flex-col gap-4 border-t border-border/60 pt-6">
          <h3 className="m-0 text-[15px] font-semibold">{why.title}</h3>
          {why.cells.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-x-8">
              {why.cells.map((c) => <WhyStat key={c.key} cell={c} />)}
            </div>
          ) : !block.pair?.row ? (
            // NOTHING MEASURED YET (MF1 not applied, or a month refused before
            // its row): the rules table's own state, never a zero. Not the
            // refusal's sentence again (fresh design check, 26 Sep): the
            // headline above is that sentence, word for word, so printing it
            // here said the same thing twice and answered nothing.
            <p className="m-0 flex items-start gap-2 text-[15px] leading-[1.6] text-secondary-foreground">
              <RuleMark state="unmeasured" />
              <span>not measured yet</span>
            </p>
          ) : (
            // MEASURED, BUT NO MEASURE FAILS (the month refused for its own
            // reason, such as not being over): the refusal in its own words.
            <TokenProse body={why.body} figures={why.figures} mode="app" figureFace="mono" figureClassName="font-semibold text-foreground" className="m-0 text-[15px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]" />
          )}
        </div>
      ) : null}
    </RecordSection>
  )
}

type Line = LedgerLine & { items?: { added: string[]; removed: string[] } | null }

/** The list of what a change took in and out, the names in mono. */
function Items({ items }: { items: { added: string[]; removed: string[] } }) {
  const list = (names: string[]): ReactNode => names.map((n, i) => (
    <span key={n}>{i > 0 ? ', ' : ''}<span className="font-mono text-[14px]">{n}</span></span>
  ))
  return (
    <span className="text-[15px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">
      {items.added.length > 0 ? <>in: {list(items.added)}</> : null}
      {items.added.length > 0 && items.removed.length > 0 ? ' · ' : null}
      {items.removed.length > 0 ? <>out: {list(items.removed)}</> : null}
    </span>
  )
}

/** The tracking page, where what we search now is listed. */
const TRACKING_HREF = settingsSubPage('tracking').href
/** Settings › How to read. */
const HOW_TO_READ_HREF = settingsSubPage('guide').href

export function TheRecord({ lines, month, prevMonth }: { lines: readonly Line[]; month: string; prevMonth: string | null }) {
  const footer = openLink('app', TRACKING_HREF, 'What we search now →')
  if (lines.length === 0) {
    return (
      <RecordSection title="The record" footer={footer}>
        <p className="m-0 text-[15px] text-muted-foreground">No change of ours is on record for this workspace yet.</p>
      </RecordSection>
    )
  }
  const months = ledgerMonths(lines, month, prevMonth)
  // THE PREVIEW'S COLUMNS, as tracks that divide the pane: the settings rail
  // leaves 688px of tile at 1280, so the figure columns are fixed and the
  // words take the rest. FROM `xl`, NOT `lg` (fresh design check, 26 Sep):
  // at 1024 the tile's inside is 432px, the fixed tracks and gaps take 420,
  // and the words were left 12px, one word to a line. Below `xl` a change
  // stacks, each month cell under its own head, as on a phone.
  const cols = months.length === 2
    ? 'xl:grid-cols-[104px_minmax(0,1fr)_128px_128px]'
    : 'xl:grid-cols-[104px_minmax(0,1fr)_128px]'
  return (
    <RecordSection title="The record" footer={footer}>
      <div role="table" className="flex flex-col">
        <div role="row" className={cn('hidden items-end gap-x-5 border-b border-border pb-2 text-[13px] font-medium leading-[1.35] text-muted-foreground xl:grid', cols)}>
          <span role="columnheader">Date</span>
          <span role="columnheader">What we changed</span>
          {months.map((m) => <span key={m} role="columnheader" className="text-right">{monthHead(m)}</span>)}
        </div>
        {lines.map((l) => (
          <div key={l.changeId} role="row" className={cn('grid grid-cols-1 gap-x-5 gap-y-1.5 border-b border-border/60 py-5 last:border-b-0 xl:gap-y-0', cols)}>
            <span role="cell" className="font-mono text-[15px] font-medium leading-[22px] tabular-nums text-foreground">{shortDate(l.date)}</span>
            <span role="cell" className="flex min-w-0 flex-col gap-1">
              <span className="text-[15px] font-semibold leading-[22px] [text-wrap:pretty]">{l.words}</span>
              {l.items && (l.items.added.length > 0 || l.items.removed.length > 0) ? <Items items={l.items} /> : null}
            </span>
            {months.map((m) => {
              const cell = reachCell(l, m)
              const measure = (l.months ?? []).find((x) => x.month === m)
              const own = m === l.date.slice(0, 7) + '-01'
              // A month the change did not touch prints a quiet dot under its
              // column head, and nothing on a phone, where there is no head.
              if (!cell && !own) return <span key={m} role="cell" className="hidden text-right text-[13px] leading-[22px] text-muted-foreground xl:block">·</span>
              return (
                <span key={m} role="cell" className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 xl:flex-col xl:items-end xl:text-right">
                  <span className="text-[13px] text-muted-foreground xl:hidden">{monthHead(m)}</span>
                  {cell && measure ? (
                    <>
                      <Counted figure={measure.touched} word="of" base={measure.of} size="row" />
                      {measure.readWith ? <span className="text-[13px] leading-[1.45] text-muted-foreground">read with the {shortDate(measure.readWith)} update</span> : null}
                    </>
                  ) : (
                    <span className="text-[13px] leading-[22px] text-muted-foreground">not measured yet</span>
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

/** The rule's mark: the preview's ⊘ where it does not hold, a tick where it
 *  does, an open ring where it is not measured yet. */
function RuleMark({ state }: { state: CompareRule['state'] }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (state === 'held') return <svg {...common} stroke="currentColor" className="mt-[4px] shrink-0 text-positive"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  if (state === 'not_held') return <svg {...common} stroke="currentColor" className="mt-[4px] shrink-0 text-muted-foreground"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>
  return <svg {...common} stroke="currentColor" className="mt-[4px] shrink-0 text-muted-foreground"><circle cx="12" cy="12" r="5" /></svg>
}

const STATE_WORDS: Record<CompareRule['state'], string> = { held: 'holds', not_held: 'does not hold', unmeasured: 'not measured yet' }

export function WhenCompared({ rules, block, asAt }: { rules: readonly CompareRule[]; block: ChangeBlock; asAt: string | null }) {
  const pair = block.pair
  const column = pair ? `${longMonth(pair.prevMonth)} against ${longMonth(pair.month)}${asAt ? `, as at ${shortDate(asAt)}` : ''}` : null
  const cols = 'lg:grid-cols-[24px_minmax(0,1.5fr)_minmax(0,1fr)]'
  return (
    <RecordSection title="When two months are compared" footer={openLink('app', HOW_TO_READ_HREF, 'How to read →')}>
      <p className="m-0 max-w-[620px] text-[17px] font-medium leading-[1.5] tracking-[-0.01em] [text-wrap:pretty]">Only when both were read the same way. All four must hold.</p>
      <div role="table" className="flex flex-col">
        <div role="row" className={cn('hidden items-end gap-x-4 border-b border-border pb-2 text-[13px] font-medium leading-[1.35] text-muted-foreground lg:grid', cols)}>
          <span role="columnheader" />
          <span role="columnheader">The rule</span>
          <span role="columnheader">{column}</span>
        </div>
        {rules.map((r) => (
          <div key={r.n} role="row" className={cn('grid grid-cols-[24px_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-border/60 py-4 last:border-b-0', cols)}>
            <span role="cell" className="font-mono text-[15px] font-semibold leading-[1.55] text-muted-foreground">{fmtInt(r.n)}</span>
            <span role="cell" className="text-[15px] leading-[1.55] [text-wrap:pretty]">{r.rule}</span>
            {pair ? (
              <span role="cell" className="col-start-2 flex items-start gap-2 text-[15px] leading-[1.5] lg:col-start-auto">
                <RuleMark state={r.state} />
                <span className="sr-only">{STATE_WORDS[r.state]}: </span>
                {r.counts ? <Counted figure={r.counts.figure} word={r.counts.word} base={r.counts.base} size="row" /> : <span>{r.answer}</span>}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </RecordSection>
  )
}
