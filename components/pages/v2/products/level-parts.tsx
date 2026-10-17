import Link from 'next/link'
import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { BoxGlyph } from '@/components/shell/level-glyphs'
import { CARD, MiniBars, TickBarRow } from '@/components/v2'
import { fmtInt, fmtPct, longMonth } from '@/lib/format'
import { catalogueBreak, sharePct, type Crosses, type LineBar } from '@/lib/pages/v2/products'
import type { GroupsBlock, PlatformsBlock, SubjectRow } from '@/lib/pages/v2/products-levels'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { GroupRows } from '@/components/pages/v2/market/panel'
import { ASK } from '@/components/pages/v2/market/panel'
import { Label, OLINK } from '@/components/pages/v2/market/parts'

// THE LEVEL PAGES' SHARED PARTS (G4, 17 Oct): the pieces a category's page
// and a product's both draw, in the kit's tokens and Market's level pages'
// measures (F3), so the four pages read as one system. Every count is a figure
// node; every level reads "of N"; a subject whose check has not passed is
// named with SUBJECT_NOT_MEASURED and never counted (ruling U6).

/** The boards' `.pcard`: a page card's padding and rhythm. */
export const PAGE_CARD = cn(CARD, 'gap-[26px] sm:px-[34px] sm:pt-[30px] sm:pb-8 max-sm:gap-5 max-sm:px-[18px] max-sm:py-5')
/** The boards' `.listcard`. */
export const LIST_CARD = cn(CARD, 'gap-3.5 px-[26px] pt-[22px] pb-5 max-sm:px-[18px] max-sm:py-4')
/** A state said in one line inside its card. */
export const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-muted-foreground'
/** A quiet line inside a section. */
export const QUIETLINE = 'm-0 text-[13px] leading-[1.45] text-muted-foreground'

/** A section's head on the page (F3's `.sec`). */
export function SectionHead({ id, title, note }: { id?: string; title: string; note?: ReactNode }) {
  return (
    <div className="mt-3.5 flex items-baseline justify-between gap-3 px-0.5 max-sm:mt-2.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
      <h2 id={id} className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">{title}</h2>
      {note ? <span className="text-[13px] leading-[1.4] text-muted-foreground">{note}</span> : null}
    </div>
  )
}

/** A product's small tile (G4's `.ptile`): the single box on the neutral. */
export function ProductTile({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-track text-secondary-foreground', className)}>
      <BoxGlyph className="size-3.5" />
    </span>
  )
}

/** A quiet product's mark: a short rule, never a dash character (G4's `.qd`). */
export function QuietMark() {
  return <span role="img" aria-label="no videos" data-quiet-mark="" className="inline-block h-[1.5px] w-[9px] rounded-[1px] bg-muted-foreground/60 align-middle" />
}

/** "of 52" as a level. */
export const of = (n: number) => <span data-copy="level">of {fmtInt(n)}</span>

/** Month by month, as bars: the page's month last and outlined while it is
 *  still filling (MASTER), each bar's share over it and its "k of n" under.
 *  `share`: a category's whole percent; a product's one decimal (a product's
 *  share is small). Where the list of products changed between two of the
 *  months, a footnote says so. */
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
            display: mode === 'category' ? sharePct(b.k, b.n) : b.k === 0 ? '0%' : pct < 0.05 ? 'under 0.1%' : fmtPct(pct, 1),
            sub: `${mode === 'category' && b.filling && b.current ? 'so far · ' : ''}${fmtInt(b.k)} of ${fmtInt(b.n)}`,
            filling: b.filling && b.current,
          }
        })}
      />
      {changed ? <p className={QUIETLINE}>Your product list changed before {longMonth(changed)}: the months before it were read on the earlier list.</p> : null}
    </>
  )
}

/** A subject not measured yet (U6): its name, the words where its bar and
 *  count go; one being re-described says why under its name. */
function PendingRow({ label, failed }: { label: string; failed: boolean }) {
  if (failed) {
    return (
      <div data-subject-failed="" className="flex flex-col gap-0.5 text-[13.5px]">
        <span className="text-foreground">{label}</span>
        <span className="text-[12.5px] leading-[1.4] text-muted-foreground">{FAILED_EXPLAINED}</span>
      </div>
    )
  }
  return (
    <div data-subject-pending="" className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-2.5 text-[13.5px]">
      <span className="min-w-0 text-foreground">{label}</span>
      <span className="text-[12.5px] text-muted-foreground">{SUBJECT_NOT_MEASURED}</span>
    </div>
  )
}

/** What it's about: the READY subjects on its videos (each opening its page
 *  on Market), those on none of them named on one line, then the ones not
 *  measured yet by name. */
export function SubjectsBlock({ rows, crosses, n, rail = false }: { rows: readonly SubjectRow[]; crosses: Crosses | null; n: number; rail?: boolean }) {
  const counted = rows.filter((r) => r.k > 0)
  const none = rows.filter((r) => r.k === 0)
  const pending = crosses?.pending ?? []
  if (counted.length === 0 && none.length === 0 && pending.length === 0) return <p className={QUIETLINE}>No subject read for these videos yet.</p>
  return (
    <>
      {counted.map((r) => (
        <TickBarRow
          key={r.id}
          name={<Link href={r.href} className="text-foreground no-underline underline-offset-[3px] hover:underline">{r.label}</Link>}
          value={fmtInt(r.k)}
          pct={n > 0 ? (100 * r.k) / n : 0}
          valueWidth="narrow"
          label={`${fmtInt(r.k)} of ${fmtInt(n)}`}
          className={rail ? 'text-[13px]' : undefined}
        />
      ))}
      {none.length > 0 ? <p className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground">On none of its videos: {none.map((r) => r.label).join(', ')}</p> : null}
      {pending.map((r) => <PendingRow key={r.id} label={r.label} failed={r.state === 'failed'} />)}
      {counted.length > 0 && !rail ? <span className="text-[12px] text-muted-foreground">Each opens its subject in Market</span> : null}
    </>
  )
}

/** What people did: the six commonest kinds of comment on its videos. */
export function KindsBlock({ crosses, rail = false }: { crosses: Crosses | null; rail?: boolean }) {
  const rows = crosses?.kinds.slice(0, 6) ?? []
  if (!crosses || rows.length === 0) return <p className={QUIETLINE}>Not read for these videos yet.</p>
  return (
    <>
      {rows.map((r) => (
        <TickBarRow key={r.id} name={r.label} value={fmtInt(r.k)} pct={crosses.n > 0 ? (100 * r.k) / crosses.n : 0} valueWidth="narrow" label={`${fmtInt(r.k)} of ${fmtInt(crosses.n)}`} className={rail ? 'text-[13px]' : undefined} />
      ))}
    </>
  )
}

/** Who's talking: Voices' groups among its videos, each opening in Voices. */
export function GroupsBlockView({ block, when }: { block: GroupsBlock; when: string }) {
  if (block.state === 'unread') return <p className={QUIETLINE}>Who is talking could not be read just now.</p>
  if (block.state === 'none') return <p className={QUIETLINE}>Reading who is talking is not switched on for this workspace yet.</p>
  if (block.rows.length === 0) return <p className={QUIETLINE}>No group in Voices commented on these videos {when}.</p>
  return <GroupRows groups={block.rows.slice(0, 4).map((g) => ({ key: g.key, name: g.name, href: g.href, videos: g.k }))} n={block.n} />
}

/** Where: its videos by platform. */
export function PlatformsBlockView({ block, rail = false }: { block: PlatformsBlock | null; rail?: boolean }) {
  if (!block) return <p className={QUIETLINE}>No video counted by platform yet.</p>
  return (
    <>
      {block.rows.map((r) => (
        <TickBarRow key={r.platform} name={r.label} value={fmtInt(r.k)} pct={(100 * r.k) / block.n} tone="ink" valueWidth="narrow" label={`${fmtInt(r.k)} of ${fmtInt(block.n)}`} className={rail ? 'text-[13px]' : undefined} />
      ))}
    </>
  )
}

/** A labelled block (G4's `.dsec` with its `.dlabel`). */
export function Block({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[9px]', className)}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

/** The Agent, and Settings beside it (G4's `.askcard`); on a phone the Agent
 *  closes the page full width, Settings under it. */
export function AskCard({ line, ask, askHref, settings, settingsHref }: { line: string; ask: string; askHref: string; settings: string; settingsHref: string }) {
  return (
    <>
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-3.5 px-[26px] py-5 max-sm:hidden')}>
        <p className="m-0 text-[14.5px] text-secondary-foreground">{line}</p>
        <div className="flex flex-wrap items-center gap-5">
          <Link href={settingsHref} className={OLINK}>{settings} →</Link>
          <Link href={askHref} className={ASK}><Sparkles className="size-3.5" aria-hidden />{ask}</Link>
        </div>
      </section>
      <div className="flex flex-col items-center gap-3 sm:hidden">
        <Link href={askHref} className={cn(ASK, 'w-full justify-center')}><Sparkles className="size-3.5" aria-hidden />{ask}</Link>
        <Link href={settingsHref} className={OLINK}>{settings} →</Link>
      </div>
    </>
  )
}
