import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { BoxGlyph } from '@/components/shell/level-glyphs'
import { BTN_PRIMARY, CARD, GoLink, MiniBars, TickBar, toMax } from '@/components/v2'
import { ROW, TBL, TD, TD_NUM, TH } from '@/components/v2/look'
import { fmtInt, fmtPct, longMonth } from '@/lib/format'
import { catalogueBreak, sharePct, type Crosses, type LineBar } from '@/lib/pages/v2/products'
import type { GroupsBlock, PlatformsBlock, SubjectRow } from '@/lib/pages/v2/products-levels'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { GroupRows } from '@/components/pages/v2/market/panel'

// THE LEVEL PAGES' SHARED PARTS (G4, 17 Oct; since the audit design, 7 Nov,
// drawn to Products-Category.dc.html and Products-Product.dc.html): the
// pieces a category's page and a product's both draw, in the kit's tokens, so
// the pages read as one system. Every count is a figure node; every level
// reads "of N"; a list's bars are drawn against its largest row (decision 5);
// a subject whose check has not passed is named with SUBJECT_NOT_MEASURED and
// never counted (ruling U6).

export { SectionHead } from '@/components/v2'

/** A page's tile. */
export const PAGE_CARD = cn(CARD, 'sm:p-[30px]')
/** A list's tile. */
export const LIST_CARD = cn(CARD, 'gap-3.5')
/** A state said in one line inside its card. */
export const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-muted-foreground'
/** A quiet line inside a section. */
export const QUIETLINE = 'm-0 text-[13.5px] leading-[1.45] text-muted-foreground'

/** A product's small tile (G4's `.ptile`): the single box on the neutral.
 *  The product page's until its own task (T5.3). */
export function ProductTile({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-track text-secondary-foreground', className)}>
      <BoxGlyph className="size-3.5" />
    </span>
  )
}

/** A quiet product's mark: a short rule, never a dash character (G4's `.qd`).
 *  The product page's until its own task (T5.3). */
export function QuietMark() {
  return <span role="img" aria-label="no videos" data-quiet-mark="" className="inline-block h-[1.5px] w-[9px] rounded-[1px] bg-muted-foreground/60 align-middle" />
}

/** "of 52" as a level. */
export const of = (n: number) => <span data-copy="level">of {fmtInt(n)}</span>

/** A month's words in a table: "September", "October so far". */
const monthCell = (b: LineBar): string => `${longMonth(b.month)}${b.filling && b.current ? ' so far' : ''}`

/** A share as the page prints it: a category's whole percent; a product's
 *  one decimal (a product's share is small). */
const shareOf = (b: LineBar, mode: 'category' | 'product'): string => {
  if (mode === 'category') return sharePct(b.k, b.n)
  const pct = b.n > 0 ? (100 * b.k) / b.n : 0
  return b.k === 0 ? '0%' : pct < 0.05 ? 'under 0.1%' : fmtPct(pct, 1)
}

/**
 * Month by month, as the boards' TABLE (the audit design, 7 Nov): each month,
 * its videos of the market's ("54 of 595"), and its share. `mode`: a
 * category's "Videos" and "Share of your market"; a product's "Naming it"
 * and "Share". Where the list of products changed between two of the months,
 * a footnote says so.
 */
export function MonthTable({ line, mode, rail = false }: { line: readonly LineBar[]; mode: 'category' | 'product'; rail?: boolean }) {
  const changed = catalogueBreak(line)
  if (line.length === 0) return <p className={QUIETLINE}>No month read yet.</p>
  return (
    <>
      <table className={cn(TBL, rail ? 'text-[14.5px]' : null)}>
        <thead>
          <tr>
            <th scope="col" className={TH}>Month</th>
            <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>{mode === 'category' ? 'Videos' : 'Naming it'}</th>
            <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>{mode === 'category' ? 'Share of your market' : 'Share'}</th>
          </tr>
        </thead>
        <tbody>
          {line.map((b) => (
            <tr key={b.month} data-month-row={b.filling && b.current ? 'filling' : 'closed'}>
              <td className={TD}>{monthCell(b)}</td>
              <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5')}><span data-copy="level">{fmtInt(b.k)} of {fmtInt(b.n)}</span></td>
              <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 font-semibold')}><span data-copy="figure">{shareOf(b, mode)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {changed ? <p className={QUIETLINE}>Your product list changed before {longMonth(changed)}: the months before it were read on the earlier list.</p> : null}
    </>
  )
}

/** Month by month, as bars: the product page's until its own task (T5.3),
 *  which draws `MonthTable` in its place. */
export function MonthBars({ line, name, mode, size }: { line: readonly LineBar[]; name: string; mode: 'category' | 'product'; size: 'sm' | 'md' | 'lg' }) {
  const changed = catalogueBreak(line)
  if (line.length === 0) return <p className={QUIETLINE}>No month read yet.</p>
  return (
    <>
      <MiniBars
        size={size}
        highlight={null}
        label={mode === 'category' ? `${name} as a share of your market's videos, month by month` : `Share of your market's videos naming ${name}, month by month`}
        bars={line.map((b) => {
          const pct = b.n > 0 ? (100 * b.k) / b.n : 0
          return {
            label: mode === 'product' ? `${longMonth(b.month).slice(0, 3)}${b.filling && b.current ? ' so far' : ''}` : longMonth(b.month),
            value: pct,
            display: shareOf(b, mode),
            sub: `${fmtInt(b.k)} of ${fmtInt(b.n)}`,
            filling: b.filling && b.current,
          }
        })}
      />
      {changed ? <p className={QUIETLINE}>Your product list changed before {longMonth(changed)}: the months before it were read on the earlier list.</p> : null}
    </>
  )
}

/** A list's rows (the boards'): a name, a bar against the list's largest, a
 *  bare count; `rail` the facts column's narrower bar. */
export function BarRows({ rows, label, rail = false, bar = 'md' }: { rows: readonly { key: string; name: ReactNode; k: number }[]; label: (k: number) => string; rail?: boolean; bar?: 'sm' | 'md' | 'lg' }) {
  const at = toMax(rows.map((r) => r.k))
  const cols = rail ? 'grid-cols-[minmax(0,1fr)_80px_26px] text-[14.5px]' : bar === 'sm' ? 'grid-cols-[minmax(0,1fr)_70px_30px] text-[15px]' : bar === 'lg' ? 'grid-cols-[minmax(0,1fr)_130px_34px] text-[15px]' : 'grid-cols-[minmax(0,1fr)_96px_34px] text-[15px]'
  return (
    <div className={cn('grid items-center gap-x-3.5 gap-y-3', cols)}>
      {rows.map((r) => (
        <Fragment key={r.key}>
          <span className="min-w-0">{r.name}</span>
          <TickBar pct={at(r.k)} size="md" label={label(r.k)} />
          <span data-copy="figure" className="text-right tabular-nums">{fmtInt(r.k)}</span>
        </Fragment>
      ))}
    </div>
  )
}

/** A subject not measured yet (U6): its name, then the words where its bar
 *  and count go; one being re-described says why under its name. */
function PendingRow({ label, failed }: { label: string; failed: boolean }) {
  if (failed) {
    return (
      <div data-subject-failed="" className="flex flex-col gap-0.5 text-[15px]">
        <span className="text-foreground">{label}</span>
        <span className="text-[13.5px] leading-[1.45] text-muted-foreground">{FAILED_EXPLAINED}</span>
      </div>
    )
  }
  return (
    <div data-subject-pending="" className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px]">
      <span className="min-w-0 text-foreground">{label}</span>
      <span className="text-[13.5px] text-muted-foreground">{SUBJECT_NOT_MEASURED}</span>
    </div>
  )
}

/** What it's about: the READY subjects on its videos (each opening its page
 *  on Market), those on none of them named in one line, then the ones not
 *  measured yet by name. */
export function SubjectsBlock({ rows, crosses, n, rail = false }: { rows: readonly SubjectRow[]; crosses: Crosses | null; n: number; rail?: boolean }) {
  const counted = rows.filter((r) => r.k > 0)
  const none = rows.filter((r) => r.k === 0)
  const pending = crosses?.pending ?? []
  if (counted.length === 0 && none.length === 0 && pending.length === 0) return <p className={QUIETLINE}>No subject read for these videos yet.</p>
  return (
    <>
      {counted.length > 0 ? (
        <BarRows
          rail={rail}
          bar="lg"
          rows={counted.map((r) => ({ key: r.id, k: r.k, name: <Link href={r.href} className={cn(ROW, 'font-normal')}>{r.label}</Link> }))}
          label={(k) => `${fmtInt(k)} of ${fmtInt(n)}`}
        />
      ) : null}
      {none.length > 0 ? <p className={QUIETLINE}>On none of its videos: {none.map((r) => r.label).join(', ')}.</p> : null}
      {pending.map((r) => <PendingRow key={r.id} label={r.label} failed={r.state === 'failed'} />)}
      {counted.length > 0 && !rail ? <p className={QUIETLINE}>Each opens its subject in Market.</p> : null}
    </>
  )
}

/** What people did: the six commonest kinds of comment on its videos. */
export function KindsBlock({ crosses, rail = false }: { crosses: Crosses | null; rail?: boolean }) {
  const rows = crosses?.kinds.slice(0, 6) ?? []
  if (!crosses || rows.length === 0) return <p className={QUIETLINE}>Not read for these videos yet.</p>
  return <BarRows rail={rail} bar="sm" rows={rows.map((r) => ({ key: r.id, name: r.label, k: r.k }))} label={(k) => `${fmtInt(k)} of ${fmtInt(crosses.n)}`} />
}

/** Who's talking: Voices' groups among its videos, each opening in Voices
 *  (Market's `GroupRows`: bars against the largest, bare counts). */
export function GroupsBlockView({ block, when }: { block: GroupsBlock; when: string }) {
  if (block.state === 'unread') return <p className={QUIETLINE}>Who is talking could not be read just now.</p>
  if (block.state === 'none') return <p className={QUIETLINE}>Reading who is talking is not switched on for this workspace yet.</p>
  if (block.rows.length === 0) return <p className={QUIETLINE}>No group in Voices commented on these videos {when}.</p>
  return (
    <>
      <GroupRows groups={block.rows.slice(0, 4).map((g) => ({ key: g.key, name: g.name, href: g.href, videos: g.k }))} n={block.n} note={false} />
      <p className={QUIETLINE}>Each opens in Voices.</p>
    </>
  )
}

/** Where: its videos by platform. */
export function PlatformsBlockView({ block, rail = false }: { block: PlatformsBlock | null; rail?: boolean }) {
  if (!block) return <p className={QUIETLINE}>No video counted by platform yet.</p>
  return <BarRows rail={rail} rows={block.rows.map((r) => ({ key: r.platform, name: r.label, k: r.k }))} label={(k) => `${fmtInt(k)} of ${fmtInt(block.n)}`} />
}

/** A titled block (the boards' tile body: its 17px head, then its rows). */
export function Block({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3.5', className)}>
      <h3 className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">{label}</h3>
      {children}
    </div>
  )
}

/** A titled block in its own tile (the category page's numbers). */
export function BlockTile({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return <article className={cn(CARD, className)}><Block label={label}>{children}</Block></article>
}

/** The Agent's tile (the line, then the yellow button, no icon), and under
 *  it, outside the tile, Settings (the boards'). */
export function AskCard({ line, ask, askHref, settings, settingsHref }: { line: string; ask: string; askHref: string; settings: string; settingsHref: string }) {
  return (
    <>
      <section aria-label="Ask the Agent" className={cn(CARD, 'mt-[26px] flex-row flex-wrap items-center justify-between gap-5')}>
        <p className="m-0 text-[16px] leading-[1.5] text-foreground">{line}</p>
        <Link href={askHref} className={cn(BTN_PRIMARY, 'no-underline max-sm:w-full')}>{ask}</Link>
      </section>
      <p className="m-0 mx-0.5"><GoLink href={settingsHref}>{settings}</GoLink></p>
    </>
  )
}
