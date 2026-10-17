import Link from 'next/link'
import { ChartColumn } from 'lucide-react'
import { BrandChip } from '@/components/colour-roles'
import { MovementBadge } from '@/components/delta-badge'
import type { CSSProperties } from 'react'
import { CARD, CardHead, TickBar } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { brandTable, type VoicesBrandRow, type VoicesBrands } from '@/lib/pages/v2/voices'
import type { Verdict } from '@/lib/reading/verdicts'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { CAPS, Fig, LevelText, RowChevron } from './parts'

// THE BRANDS (board E3-Voices, "Brands in your market"; since 17 Oct
// G3-Voices: each row opens the brand's own page and ends in the
// leave-the-page chevron, and nothing opens in place).
//
// TWO BASES, EACH SAID. "Named in" is named unprompted (`k_organic` of
// `n_organic`), this month and last, with its `Verdict` beside it (the board's
// "no clear change" and "▲ from 28"). "Praised · complained" and "Talked about
// for" read every video naming the brand this month (`k_any`): a brand's
// unprompted month is a handful of videos, too few to say how it is treated.
// Those cells carry no verdict, and the card says so where the board would
// read a change into them.

const DOT = { you: 'bg-you', rival: 'bg-comp' } as const

/** The verdict beside a level: its own node, the only place a movement word
 *  may stand. Nothing where the comparison was refused or not drawn. */
export function VerdictNote({ verdict, you }: { verdict: Verdict | null; you: boolean }) {
  if (!verdict || verdict.state === 'refused') return null
  return (
    <span data-copy="verdict" className="whitespace-nowrap">
      <MovementBadge verdict={verdict} unit="pts" good={you ? 'up' : 'neutral'} bandTip />
    </span>
  )
}

function BrandName({ row }: { row: VoicesBrandRow }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-[15px] font-semibold leading-[1.3]">
      <span aria-hidden className={cn('mt-[6px] size-[9px] shrink-0 rounded-full', row.you ? DOT.you : DOT.rival)} />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Link href={row.href} className="min-w-0 text-foreground no-underline hover:underline hover:underline-offset-[3px]">
        {row.label}
      </Link>
      {row.you ? <BrandChip who="you" className="text-[12px]">You</BrandChip> : null}
      </span>
    </div>
  )
}

/** A cell with nothing counted in it: the board's track, drawn faint and
 *  empty, so a thin row keeps the table's rhythm without a number it does
 *  not have (the parity pass). Decoration: the words say why, once. */
export function EmptyTrack({ className }: { className?: string }) {
  return <span aria-hidden data-empty-track="" className={cn('block h-2.5 rounded-full border border-dashed border-foreground/20', className)} />
}

function Treat({ row }: { row: VoicesBrandRow }) {
  if (!row.praised || !row.complained) {
    // Counted, and its crosses not read: say so. Not counted: the faint track.
    return row.state === 'counted' ? <span className="text-[12.5px] text-muted-foreground">not read</span> : <EmptyTrack className="w-4/5" />
  }
  const n = row.praised.n
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5" role="img" aria-label={`Praised in ${row.praised.k} and complained in ${row.complained.k} of its ${n} videos`}>
        {row.praised.k > 0 ? <span className={cn('h-2.5 rounded-[3px]', row.you ? 'bg-you' : 'bg-comp')} style={{ width: `${Math.max(2, (100 * row.praised.k) / n) * 0.6}%` }} /> : null}
        {row.complained.k > 0 ? <span className="h-2.5 rounded-[3px] bg-negative/85" style={{ width: `${Math.max(2, (100 * row.complained.k) / n) * 0.6}%` }} /> : null}
      </div>
      <span data-copy="level" className="font-mono text-[12px] tabular-nums text-muted-foreground">
        {fmtInt(row.praised.k)} · {fmtInt(row.complained.k)} of {fmtInt(n)}
      </span>
    </div>
  )
}

/** One brand's row. `pending`: nothing in the table is counted, and the
 *  line under its head says so; a row then prints no words of its own. */
function BrandRow({ row, max, pending }: { row: VoicesBrandRow; max: number; pending: boolean }) {
  const named = row.named
  return (
    <div
      data-brand={row.brandKey}
      className="relative grid grid-cols-2 items-center gap-x-[18px] gap-y-3 border-t border-track py-4 pr-6 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.6fr)]"
    >
      <BrandName row={row} />
      <div className="flex min-w-0 flex-col gap-1">
        {named ? (
          <>
            <TickBar pct={max > 0 ? (100 * named.k) / max : 0} tone={row.you ? 'you' : 'rival'} size="lg" label={`${row.label}: named unprompted in ${named.k} of ${named.n} videos`} />
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-[12.5px] text-muted-foreground">
              <LevelText k={named.k} n={named.n} unit="videos" />
              <VerdictNote verdict={row.verdict} you={row.you} />
            </div>
          </>
        ) : (
          <>
            <EmptyTrack />
            {/* The caption's line, kept so a thin row stands as tall as a
                counted one: its state where the rest of the table is
                counted, else empty (the line under the head said it). */}
            <span className="min-h-[18px] text-[12.5px] text-muted-foreground">{!pending && row.stateWords ? row.stateWords : null}</span>
          </>
        )}
      </div>
      <Treat row={row} />
      <div className="min-w-0 text-[13px] leading-[1.4]">
        {row.topSubject ? (
          <>
            {row.topSubject.label} <span className="whitespace-nowrap text-muted-foreground">· <LevelText k={row.topSubject.k} n={row.topSubject.n} /></span>
          </>
        ) : row.state === 'counted'
          // Ruling U6: with subjects not measured yet, "no subject" would be
          // a claim about a membership nobody has checked.
          // A subject being re-described is not measured either (14 Oct): the
          // cell names no subject, so it says the one constant for both.
          ? <span className="text-muted-foreground">{(row.subjectsPending ?? 0) > 0 || (row.subjectsNotMeasured?.length ?? 0) > 0 ? SUBJECT_NOT_MEASURED : 'no subject yet'}</span>
          : <EmptyTrack className="w-3/5" />}
      </div>
      {/* The row opens the brand's page (board decision 8): its chevron
          rides at the row's right-hand end, centred on the row. */}
      <RowChevron href={row.href} className="absolute top-1/2 right-0 -translate-y-1/2" />
    </div>
  )
}

/** Brand names, each a link to its page: "Proteor, Old School". */
function NameLinks({ names }: { names: readonly { label: string; href: string }[] }) {
  return (
    <>
      {names.map((b, i) => (
        <span key={b.label}>
          {i > 0 ? ', ' : null}
          <Link href={b.href} className="text-inherit underline decoration-foreground/25 underline-offset-[3px] hover:decoration-foreground">{b.label}</Link>
        </span>
      ))}
    </>
  )
}

/** The note: Pass C's weightiest finding, with its brand's page a click
 *  away (any tracked brand opens, printed as a row or not). */
function Note({ note }: { note: NonNullable<VoicesBrands['note']> }) {
  return (
    <p className="m-0 rounded-[10px] bg-inner px-3.5 py-3 text-[13.5px] leading-[1.5] text-foreground">
      <b className="font-semibold">{note.rival}:</b>{' '}
      <span data-copy="stored" data-slot="pass_c_finding">{note.title}</span>{' '}
      <Link href={note.href} className="whitespace-nowrap font-semibold text-orange-text no-underline hover:underline">Open {note.rival} →</Link>
    </p>
  )
}

/** "Brands in your market" (the board's left card of the pair): the table
 *  in the board's shape in every state (`brandTable`). */
export function BrandsCard({ brands, monthWords, style }: { brands: VoicesBrands; monthWords: string; style?: CSSProperties }) {
  const table = brandTable(brands)
  const max = Math.max(0, ...table.rows.map((r) => r.named?.k ?? 0))
  const prev = longMonth(brands.prevMonth)
  const month = longMonth(brands.month)
  // The one base every "Named in" level shares: the market's videos this
  // month that our searches for a brand did not find (`n_organic`).
  const unsearched = table.rows.find((r) => r.named)?.named?.n ?? null
  const counted = table.rows.some((r) => r.state === 'counted')
  return (
    <article aria-labelledby="voices-brands" style={style} className={CARD}>
      <CardHead
        icon={ChartColumn}
        id="voices-brands"
        title="Brands in your market"
        sub={`Videos that named each brand without being asked, ${monthWords}, and how people treat it in every video naming it`}
      />
      <div>
        {/* The board's header: four columns at lg, and below it two rows of
            two, over the rows' own two-by-two cells. Drawn in every state. */}
        <div className={cn(CAPS, 'grid grid-cols-2 gap-x-[18px] gap-y-1 border-b border-border pr-6 pb-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.6fr)]')}>
          <span>Brand</span><span>Named in</span><span>Praised · complained</span><span>Talked about for</span>
        </div>
        {table.line ? (
          <p className="m-0 border-b border-track py-2 text-[12px] leading-[1.45] text-muted-foreground">{table.line}</p>
        ) : unsearched != null ? (
          <p className="m-0 border-b border-track py-2 text-[12px] leading-[1.45] text-muted-foreground">
            Named in: of the <Fig>{fmtInt(unsearched)}</Fig> videos in {month} we did not find by searching for a brand, so a brand named in them was named without being asked.
          </p>
        ) : null}
        {table.rows.length > 0 ? (
          <div role="list">
            {table.rows.map((r) => <div key={r.brandKey} role="listitem"><BrandRow row={r} max={max} pending={table.pending} /></div>)}
          </div>
        ) : brands.state === 'ready' ? (
          <p className="m-0 py-4 text-[13.5px] leading-[1.5] text-muted-foreground">No brand you track was named without being asked in {monthWords}.</p>
        ) : null}
      </div>
      {/* The key names the bars' colours, so it is drawn only where a bar is
          (the fresh check, 13 Oct: never over a table of empty cells). */}
      {counted || table.notNamed.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
          {counted ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span><i aria-hidden className="mr-1.5 inline-block h-2 w-2.5 rounded-[2px] bg-comp align-[0.05em]" />videos where people praised</span>
              <span><i aria-hidden className="mr-1.5 inline-block h-2 w-2.5 rounded-[2px] bg-negative/85 align-[0.05em]" />complained</span>
            </span>
          ) : null}
          {table.notNamed.length > 0 ? <span>Not named without being asked in {monthWords}: <NameLinks names={table.notNamed} /></span> : null}
        </div>
      ) : null}
      {counted ? (
        <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">
          Praised, complained and talked about are {month}’s alone: each brand’s videos are too few to set against {prev}.
        </p>
      ) : null}
      {table.notCounted.length > 0 ? (
        <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">
          {table.notCounted.map((b, i) => (
            <span key={b.label}>
              {i > 0 ? ' · ' : null}
              <Link href={b.href} className="text-inherit underline decoration-foreground/25 underline-offset-[3px] hover:decoration-foreground">{b.label}</Link>: {b.words}
            </span>
          ))}
        </p>
      ) : null}
      {brands.note ? <Note note={brands.note} /> : null}
    </article>
  )
}
