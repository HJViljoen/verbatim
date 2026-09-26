import type { ReactNode } from 'react'

import { openLink } from '@/components/blocks/open-link'
import { TokenProse } from '@/components/blocks/prose'
import { pairChipWords } from '@/lib/calibration'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { pairOnVerdict } from '@/lib/reading/comparability'
import { nextPairParts, readTheSameWay, rowMeasuresPair, whyNotCompared, type ChangeBlock, type CompareRule, type LedgerLine, type WhyCell } from '@/lib/pages/overview-market/change'
import { cellReadWith, monthHead, type RecordCell, type RecordGroup, type RecordView, type SearchAside } from '@/lib/settings/what-we-changed'
import { settingsSubPage } from '@/lib/settings/rail'
import { cn } from '@/lib/utils'

import { RecordSection } from './frame'

// Settings › What we changed (market-first WP1.6, plan §2.10 D2): the three
// pieces that ship with deploy 2. The month pair in one sentence and the first
// pair read the same way; "Why September is not compared", as the measured
// figures behind the refusal; the dated list of our changes, each once, with
// the months it touched and how much of each it brought in, grouped as the
// preview groups it ("What we search", "How we check, mark and file videos")
// with what each change stops (Heinrich's default of 26 Sep, R-a); and the
// four rules of decision D with how the page's pair stands on each. "Searches
// held still until January" and "What the pages can say, and when" join with
// deploy 5 (WP3.10).
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
  if (readTheSameWay(pair)) return `${longMonth(pair.prevMonth)} and ${longMonth(pair.month)} were read the same way.`
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

/** One of "Why September is not compared"'s cells. The update it was read
 *  with prints under it only where the cells were not all read with one
 *  (then it is said once, beside the section's heading: R-a, the preview
 *  prints no "read with" in a cell). */
function WhyStat({ cell, said }: { cell: WhyCell; said: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Counted figure={cell.figure} word={cell.base.word} base={cell.base.value} size="stat" />
      <span className="text-[15px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">{cell.caption}</span>
      {cell.readWith && cell.readWith !== said ? <span className="font-mono text-[12px] leading-[1.4] text-muted-foreground">read with the {shortDate(cell.readWith)} update</span> : null}
    </div>
  )
}

/** The one update every cell was read with, or null where they differ. */
export function oneReadWith(cells: readonly Pick<WhyCell, 'readWith'>[]): string | null {
  const dates = new Set(cells.map((c) => c.readWith))
  const [only] = [...dates]
  return dates.size === 1 && only ? only : null
}

export function WhatWeChangedLead({ block }: { block: ChangeBlock }) {
  const head = sideBySide(block)
  const next = nextPairParts(block)
  const why = whyNotCompared(block)
  const said = why ? oneReadWith(why.cells) : null
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
        <div className="flex max-w-[720px] flex-col gap-4 border-t border-border/60 pt-6 @container">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3 className="m-0 text-[15px] font-semibold">{why.title}</h3>
            {said ? <span className="font-mono text-[13px] text-muted-foreground">read with the {shortDate(said)} update</span> : null}
          </div>
          {why.cells.length > 0 ? (
            // THREE ACROSS ONLY WHERE THREE FIT (deploy 2 review): keyed to
            // the window's `sm`, at 768 the pane beside the sidebar and the
            // settings rail gave each cell about 60px, "376 of 625" printed
            // over "65 of 654" and the page scrolled sideways. The section's
            // own width decides (a container query): stacked below 560px.
            <div className="grid grid-cols-1 gap-6 @min-[560px]:grid-cols-3 @min-[560px]:gap-x-8">
              {why.cells.map((c) => <WhyStat key={c.key} cell={c} said={said} />)}
            </div>
          ) : !rowMeasuresPair(block.pair) ? (
            // NOTHING MEASURED YET (MF1 not applied, a month refused before
            // its row, or a row from an earlier update that no longer
            // measures the pair): the rules table's own state, never a zero. Not the
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

/** The names a change took in and out, in mono. Where it only added (or only
 *  took out) and its title says which, the names alone, as the preview sets
 *  the 13 Sep line ("handmade bag, sustainable fashion, travel gear and
 *  frtg"); "in: … · out: …" where it did both. */
function Items({ items, names: kind }: { items: { added: string[]; removed: string[] }; names: 'terms' | 'brands' }) {
  // Search terms and communities in mono, as the preview sets them; a
  // rival's name is a name, in the text face ("Rivals: The North Face, …").
  const face = kind === 'terms' ? 'font-mono text-[14px]' : ''
  const list = (names: string[]): ReactNode => names.map((n, i) => (
    <span key={n}>{i === 0 ? '' : i === names.length - 1 ? ' and ' : ', '}<span className={face}>{n}</span></span>
  ))
  const both = items.added.length > 0 && items.removed.length > 0
  return (
    <span className="max-w-[440px] text-[15px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">
      {both ? <>in: {list(items.added)} · out: {list(items.removed)}</> : list(items.added.length > 0 ? items.added : items.removed)}
    </span>
  )
}

/** The tracking page, where what we search now is listed. */
const TRACKING_HREF = settingsSubPage('tracking').href
/** Settings › How to read. */
const HOW_TO_READ_HREF = settingsSubPage('guide').href

// THE PREVIEW'S TABLE ON THIS PANE (`SettingsRecord` artboard, the record
// tile): Date │ What we changed │ August │ September │ Comparisons it stops,
// the search group's last column one aside for the group. The preview's pane
// is 1160px; beside the settings rail this tile's inside is 848px at 1440 and
// 688px at 1280, so the tracks are the preview's in proportion and the layout
// is keyed to the TABLE'S OWN WIDTH (a container query, `/rec`), never the
// window's:
//   - from 760px, the five columns (the comparisons column 240px);
//   - from 560px, four: what a line stops sits under its words, and the
//     search group's aside under its lines;
//   - under 560px, a line stacks, each month cell and the comparisons with
//     their own head, as on a phone.
// Every track's minimum is 0 or fixed and small, so nothing can scroll the
// page sideways.
const WIDE: Record<1 | 2, string> = {
  1: '@min-[760px]/rec:grid-cols-[76px_minmax(0,1fr)_104px_240px]',
  2: '@min-[760px]/rec:grid-cols-[76px_minmax(0,1fr)_104px_104px_240px]',
}
const LEFT: Record<1 | 2, string> = {
  1: '@min-[560px]/rec:grid-cols-[76px_minmax(0,1fr)_104px]',
  2: '@min-[560px]/rec:grid-cols-[76px_minmax(0,1fr)_104px_104px]',
}

/** The preview's mark before a change's date: a change of ours made. */
function ChangeMark() {
  return <svg width="9" height="8" viewBox="0 0 9 8" aria-hidden="true" className="shrink-0 text-foreground"><path d="M4.5 0 9 7.5H0z" fill="currentColor" /></svg>
}

/** The ⊘ before a comparison a change stops. */
function StopMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[4px] shrink-0 text-muted-foreground">
      <circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" />
    </svg>
  )
}

/** What a change stops, each comparison on its own line with the ⊘; "none"
 *  (and why, where a reader would ask) where it stops none. */
function Stops({ stops, noneNote }: { stops: readonly string[]; noneNote: string | null }) {
  if (stops.length === 0) {
    return (
      <span className="flex flex-col gap-1">
        <span className="text-[13px] leading-[22px] text-muted-foreground">none</span>
        {noneNote ? <span className="text-[13px] leading-[1.45] text-muted-foreground [text-wrap:pretty]">{noneNote}</span> : null}
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-1">
      {stops.map((s) => (
        <span key={s} className="flex items-start gap-2 text-[15px] leading-[22px] [text-wrap:pretty]">
          <StopMark />
          <span className="sr-only">Stops </span>
          <span>{s}</span>
        </span>
      ))}
    </span>
  )
}

/** One month's cell: the reach with its base, "none" for a measured zero,
 *  "not measured yet" in the month the change was made, a quiet dot under
 *  the head in a month it did not touch (nothing on a phone). */
function MonthCell({ cell, readWith }: { cell: RecordCell; readWith: string | null }) {
  if (cell.state === 'untouched' || cell.state === 'blank') {
    return <span role="cell" className="hidden text-right text-[13px] leading-[22px] text-muted-foreground @min-[560px]/rec:block">·</span>
  }
  return (
    <span role="cell" className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 @min-[560px]/rec:flex-col @min-[560px]/rec:items-end @min-[560px]/rec:text-right">
      <span className="text-[13px] text-muted-foreground @min-[560px]/rec:hidden">{monthHead(cell.month)}</span>
      {cell.state === 'measured' ? <Counted figure={cell.touched} word="of" base={cell.of} size="row" /> : null}
      {cell.state === 'none' ? <span className="text-[13px] leading-[22px] text-muted-foreground">none</span> : null}
      {cell.state === 'unmeasured' ? <span className="text-[13px] leading-[22px] text-muted-foreground">not measured yet</span> : null}
      {readWith ? <span className="text-[13px] leading-[1.45] text-muted-foreground">read with the {shortDate(readWith)} update</span> : null}
    </span>
  )
}

/** A line's date and its words, the first two cells of every row. */
function LineHead({ line }: { line: Line }) {
  return (
    <>
      <span role="cell" className="flex min-h-[22px] items-center gap-2">
        <ChangeMark />
        <span className="font-mono text-[15px] font-medium leading-[22px] tabular-nums text-foreground">{shortDate(line.date)}</span>
      </span>
      <span role="cell" className="flex min-w-0 flex-col gap-1 @min-[760px]/rec:pr-4">
        <span className="text-[15px] font-semibold leading-[22px] [text-wrap:pretty]">{line.words}</span>
        {line.detail ? <span className="max-w-[440px] text-[15px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">{line.detail}</span> : null}
        {line.items && (line.items.added.length > 0 || line.items.removed.length > 0) ? <Items items={line.items} names={line.surface === 'rivals' ? 'brands' : 'terms'} /> : null}
      </span>
    </>
  )
}

/** A group's heading, with the one update its cells were read with where
 *  that is said once (the preview's slot beside "How we check, mark and file
 *  videos"). */
function GroupHead({ group }: { group: RecordGroup }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-8 first:pt-6">
      <h3 className="m-0 text-[15px] font-semibold">{group.title}</h3>
      {group.readWith ? <span className="font-mono text-[13px] text-muted-foreground">read with the {shortDate(group.readWith)} update</span> : null}
    </div>
  )
}

/** The search group's aside: what its changes stop together, the month's one
 *  figure with the update it was read with, and since when nothing we search
 *  has changed. */
function SearchAsideBox({ aside }: { aside: SearchAside }) {
  return (
    <div className="flex flex-col gap-4 rounded-md bg-inner p-5 @min-[760px]/rec:p-6">
      {aside.stops ? (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium leading-[22px] text-muted-foreground">Together, these stop</span>
          {aside.stops.length > 0 ? <Stops stops={aside.stops} noneNote={null} /> : <span className="text-[15px] leading-[22px] text-muted-foreground">no comparison</span>}
        </div>
      ) : null}
      {aside.figure || aside.since ? (
        <div className={cn('flex flex-col gap-2', aside.stops ? 'border-t border-border pt-4' : '')}>
          {aside.figure ? (
            <span className="text-[13px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">
              <span data-copy="level" className="whitespace-nowrap font-mono tabular-nums"><span className="font-semibold text-foreground">{fmtInt(aside.figure.k)}</span> of {fmtInt(aside.figure.n)}</span>
              {' '}{aside.figure.words}{aside.figure.readWith ? `, read with the ${shortDate(aside.figure.readWith)} update` : ''}.
            </span>
          ) : null}
          {aside.since ? <span className="text-[13px] leading-[1.5] text-secondary-foreground">Since {shortDate(aside.since)} nothing we search has changed.</span> : null}
        </div>
      ) : null}
    </div>
  )
}

export function TheRecord({ view }: { view: RecordView }) {
  const footer = openLink('app', TRACKING_HREF, 'What we search now →')
  if (view.groups.length === 0) {
    return (
      <RecordSection title="The record" footer={footer}>
        <p className="m-0 text-[15px] text-muted-foreground">No change of ours is on record for this workspace yet.</p>
      </RecordSection>
    )
  }
  const n: 1 | 2 = view.months.length >= 2 ? 2 : 1
  const row = 'grid grid-cols-1 items-start gap-x-4 gap-y-2 border-b border-border/60 py-5 @min-[560px]/rec:gap-y-3 @min-[760px]/rec:gap-y-0 @min-[760px]/rec:py-6'
  return (
    <RecordSection title="The record" footer={footer}>
      <div role="table" aria-label="The record" className="@container/rec flex min-w-0 flex-col">
        <div role="row" className={cn('hidden items-end gap-x-4 border-b border-border pb-2 text-[13px] font-medium leading-[1.35] text-muted-foreground @min-[560px]/rec:grid', LEFT[n], WIDE[n])}>
          <span role="columnheader">Date</span>
          <span role="columnheader">What we changed</span>
          {view.months.map((m) => <span key={m} role="columnheader" className="text-right">{monthHead(m)}</span>)}
          <span role="columnheader" className="hidden pl-4 @min-[760px]/rec:block">Comparisons it stops</span>
        </div>
        {view.groups.map((group) => (
          <div key={group.key} role="rowgroup" className="flex min-w-0 flex-col">
            <GroupHead group={group} />
            {group.key === 'search' ? (
              // THE SEARCH GROUP: its lines, and one aside for them all.
              <div className="grid min-w-0 grid-cols-1 gap-x-4 @min-[760px]/rec:grid-cols-[minmax(0,1fr)_240px]">
                <div className="flex min-w-0 flex-col">
                  {group.lines.map((r) => (
                    <div key={r.line.changeId} role="row" className={cn(row, 'last:border-b-0', LEFT[n])}>
                      <LineHead line={r.line} />
                      {r.cells.map((c) => <MonthCell key={c.month} cell={c} readWith={cellReadWith(c, group, view.aside, group.key)} />)}
                    </div>
                  ))}
                </div>
                {view.aside ? (
                  <div role="note" aria-label="What these changes stop together" className="pb-2 pt-2 @min-[760px]/rec:pl-4 @min-[760px]/rec:pt-4">
                    <SearchAsideBox aside={view.aside} />
                  </div>
                ) : null}
              </div>
            ) : (
              group.lines.map((r) => (
                <div key={r.line.changeId} role="row" className={cn(row, 'last:border-b-0', LEFT[n], WIDE[n])}>
                  <LineHead line={r.line} />
                  {r.cells.map((c) => <MonthCell key={c.month} cell={c} readWith={cellReadWith(c, group, view.aside, group.key)} />)}
                  {r.stops ? (
                    <span role="cell" className="flex flex-col gap-1 @min-[560px]/rec:col-span-full @min-[560px]/rec:col-start-2 @min-[760px]/rec:col-span-1 @min-[760px]/rec:col-start-auto @min-[760px]/rec:pl-4">
                      <span className="text-[13px] text-muted-foreground @min-[760px]/rec:hidden">Comparisons it stops</span>
                      <Stops stops={r.stops} noneNote={r.noneNote} />
                    </span>
                  ) : null}
                </div>
              ))
            )}
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
