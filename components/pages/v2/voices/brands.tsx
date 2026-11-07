import Link from 'next/link'
import { BrandChip } from '@/components/colour-roles'
import { MovementBadge } from '@/components/delta-badge'
import type { CSSProperties } from 'react'
import { CARD, commaCite, GoLink, SectionHead } from '@/components/v2'
import { ROW, TBL, TD, TD_NUM, TH } from '@/components/v2/look'
import { fmtInt, longMonth } from '@/lib/format'
import { brandTable, type VoicesBrandRow, type VoicesBrands } from '@/lib/pages/v2/voices'
import type { Verdict } from '@/lib/reading/verdicts'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { Fig, LevelText } from './parts'

// THE BRANDS (the audit design, 7 Nov: Voices.dc.html's "Brands in your
// market"; since 17 Oct each row opens the brand's own page, and nothing
// opens in place).
//
// TWO BASES, EACH SAID. "Named without being asked" is named unprompted
// (`k_organic` of `n_organic`), with its `Verdict` beside it. "Videos naming
// it", "Praised it", "Complained" and "Talked about most for" read every
// video naming the brand this month (`k_any`, the row's own "Videos naming
// it", so the counts beside it are bare): a brand's unprompted month is a
// handful of videos, too few to say how it is treated. Those cells carry no
// verdict, and the note under the table says so.

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

/** A state's words in a cell, in sentence case ("Not counted yet"). */
const cellWords = (w: string): string => commaCite(w.charAt(0).toUpperCase() + w.slice(1))

const R = cn(TD, TD_NUM, 'pr-0 pl-3.5')
const COLS = 6

/** One brand's row. `pending`: nothing in the table is counted, and the line
 *  at the table's head says so; a row then prints its name alone. */
function BrandRow({ row, pending }: { row: VoicesBrandRow; pending: boolean }) {
  const name = (
    <td className={cn(TD, 'font-semibold')}>
      <Link href={row.href} className={ROW}>{row.label}</Link>
      {row.you ? <> <BrandChip who="you" plain className="ml-1.5 text-[13px] font-semibold text-you">You</BrandChip></> : null}
    </td>
  )
  if (row.state !== 'counted') {
    return (
      <tr data-brand={row.brandKey}>
        {name}
        <td colSpan={COLS - 1} className={cn(TD, 'text-muted-foreground')}>{!pending && row.stateWords ? cellWords(row.stateWords) : null}</td>
      </tr>
    )
  }
  const named = row.named
  const videos = row.any?.k ?? row.praised?.n ?? null
  const crossed = row.praised && row.complained
  return (
    <tr data-brand={row.brandKey}>
      {name}
      <td className={TD}>
        {named ? (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <LevelText k={named.k} n={named.n} unit="videos" />
            <VerdictNote verdict={row.verdict} you={row.you} />
          </span>
        ) : null}
      </td>
      <td className={R}>{videos != null ? <Fig>{fmtInt(videos)}</Fig> : null}</td>
      {crossed ? (
        <>
          <td className={R}><Fig>{fmtInt(row.praised!.k)}</Fig></td>
          <td className={R}><Fig>{fmtInt(row.complained!.k)}</Fig></td>
        </>
      ) : <td colSpan={2} className={cn(R, 'text-muted-foreground')}>Not read</td>}
      <td className={cn(TD, 'pl-7')}>
        {row.topSubject ? (
          <>{row.topSubject.label}, <Fig>{fmtInt(row.topSubject.k)}</Fig></>
        ) : (
          // Ruling U6: with subjects not measured yet, "no subject" would be
          // a claim about a membership nobody has checked. A subject being
          // re-described is not measured either (14 Oct): the cell names no
          // subject, so it says the one constant for both.
          <span className="text-muted-foreground">{(row.subjectsPending ?? 0) > 0 || (row.subjectsNotMeasured?.length ?? 0) > 0 ? SUBJECT_NOT_MEASURED : 'No subject yet'}</span>
        )}
      </td>
    </tr>
  )
}

/** Brand names, each a link to its page: "Proteor, Old School". */
function NameLinks({ names }: { names: readonly { label: string; href: string }[] }) {
  return (
    <>
      {names.map((b, i) => (
        <span key={b.label}>
          {i > 0 ? ', ' : null}
          <Link href={b.href} className="text-inherit underline decoration-control underline-offset-4 hover:decoration-foreground">{b.label}</Link>
        </span>
      ))}
    </>
  )
}

/** The note: Pass C's weightiest finding, with its brand's page a click
 *  away (any tracked brand opens, printed as a row or not). The link names
 *  the brand, so the finding's title stands alone. */
function Note({ note }: { note: NonNullable<VoicesBrands['note']> }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 border-t border-track pt-4">
      <p className="m-0 text-[16px] font-medium leading-[1.5] text-foreground">
        <span data-copy="stored" data-slot="pass_c_finding">{note.title}</span>
      </p>
      <GoLink href={note.href}>Open {note.rival}</GoLink>
    </div>
  )
}

/** "Brands in your market": the section head outside, then the table in the
 *  board's shape in every state (`brandTable`). */
export function BrandsCard({ brands, monthWords, style }: { brands: VoicesBrands; monthWords: string; style?: CSSProperties }) {
  const table = brandTable(brands)
  const prev = longMonth(brands.prevMonth)
  const month = longMonth(brands.month)
  // The one base every "Named without being asked" level shares: the
  // market's videos this month that our searches for a brand did not find
  // (`n_organic`).
  const unsearched = table.rows.find((r) => r.named)?.named?.n ?? null
  const counted = table.rows.some((r) => r.state === 'counted')
  const line = table.line ?? (table.rows.length === 0 && brands.state === 'ready' ? `No brand you track was named without being asked in ${monthWords}.` : null)
  return (
    <>
      <SectionHead id="voices-brands" title="Brands in your market" note={monthWords} />
      <section aria-labelledby="voices-brands" style={style} className={CARD}>
        <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">Videos that named each brand without being asked, and how people treat it in every video naming it.</p>
        {/* The board's table at every width: on a phone it scrolls inside
            its card, as the board's own phone rule does. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <table className={cn(TBL, 'min-w-[640px]')}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Brand</th>
                <th scope="col" className={TH}>Named without being asked</th>
                <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Videos naming it</th>
                <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Praised it</th>
                <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Complained</th>
                <th scope="col" className={cn(TH, 'pl-7')}>Talked about most for</th>
              </tr>
            </thead>
            <tbody>
              {line ? <tr><td colSpan={COLS} className={cn(TD, 'text-[14.5px] text-muted-foreground')}>{line}</td></tr> : null}
              {table.rows.map((r) => <BrandRow key={r.brandKey} row={r} pending={table.pending} />)}
            </tbody>
          </table>
        </div>
        {(!table.line && unsearched != null) || counted || table.notNamed.length > 0 || table.notCounted.length > 0 ? (
          <div className="flex flex-col gap-1.5 text-[13.5px] leading-[1.5] text-muted-foreground">
            {(!table.line && unsearched != null) || counted ? (
              <p className="m-0">
                {!table.line && unsearched != null ? <>Named without being asked counts the <Fig>{fmtInt(unsearched)}</Fig> videos in {month} we did not find by searching for a brand, so a brand named in them was named without being asked.</> : null}
                {!table.line && unsearched != null && counted ? ' ' : null}
                {counted ? <>Praised, complained and talked about are {month}’s alone: each brand’s videos are too few to set against {prev}.</> : null}
              </p>
            ) : null}
            {table.notNamed.length > 0 ? <p className="m-0">Not named without being asked in {monthWords}: <NameLinks names={table.notNamed} /></p> : null}
            {table.notCounted.length > 0 ? (
              <p className="m-0">
                {table.notCounted.map((b, i) => (
                  <span key={b.label}>
                    {i > 0 ? ', ' : null}
                    <Link href={b.href} className="text-inherit underline decoration-control underline-offset-4 hover:decoration-foreground">{b.label}</Link>: {commaCite(b.words)}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}
        {brands.note ? <Note note={brands.note} /> : null}
      </section>
    </>
  )
}
