import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageFrame, PageBar } from '@/components/shell/page-grid'
import { SETTINGS_SUBPAGES, type RailCounts, type SettingsSection } from '@/lib/settings/rail'
import { cn } from '@/lib/utils'

// The settings area (Phase 1 WP16, design item 29, revision 3): a rail of
// seven sub-pages and a content pane, shared by everything under
// /dashboard/settings plus Team and Billing, so the account pages read as one
// place. The rail's labels and addresses come from lib/settings/rail.ts — this
// file draws them and decides nothing.
//
// ONE GROUP, NOT TWO. The rail carried a "Workspace" / "Help" split when the
// Guide was a page of its own; the Guide is now the seventh sub-page and the
// mock's rail is flat. A group label over a single group is furniture.
//
// FORMS, NOT TILES (revision 3). The vocabulary below is the whole of it:
// SettingsCard is an inner block with a title and a line of explanation,
// FactRow is label-left value-right, ConnectionRow is name · what · status.
// None of them is the elevated `bg-tile shadow-tile` card the reading pages
// use, and nothing in a sub-page should introduce one.
//
// NEITHER IS THE FRAME ITSELF, AS OF THE ARTBOARD PORT (Block D wave 2,
// E-settings). The rail and the content pane were each an elevated
// `bg-tile shadow-tile` card with a `PaneHeader` eyebrow, and that spent the
// system's two nesting levels — tile, then flat inner block — on the furniture,
// leaving every `SettingsCard` on a third and every field on a fourth. The
// artboard draws a BARE 224px nav on white beside a flat column: no card, no
// eyebrow over the rail, 40px rail items at 13.5px, and a sub-page header that
// is a 15px/600 `h2` with a mono meta beside it and one sentence of rule under
// it. That header is deliberately NOT `PaneHeader`: `PaneHeader`'s 10.5px
// uppercase eyebrow is what the artboard uses for a SECTION head inside the
// page (components/settings/chrome.tsx SectionHead), and one component cannot
// hold both type scales without one of them being wrong.
//
// The pane no longer scrolls inside a fixed height either. The artboard's
// Tracking page is 2,460px tall and the shell's <main> already scrolls; an
// inner scroller here meant the rail scrolled away from its own save-state
// strip and the page had two scrollbars.

export type { SettingsSection }

export function SettingsFrame({
  active, title, context, contentTitle, contentMeta, contentRule, children, controls, counts, railFooter,
}: {
  /** Which rail entry is lit. `null` lights none — the parked Initiatives
   *  page is inside this frame and is not one of the seven, and lighting
   *  Tracking from it would tell a reader they were somewhere they are not. */
  active: SettingsSection | null
  title: string
  context?: ReactNode
  contentTitle?: ReactNode
  contentMeta?: ReactNode
  /** The one sentence under the sub-page title: what this page is for, and
   *  what changing it costs. */
  contentRule?: ReactNode
  controls?: ReactNode
  /** Rail counts, where the page that drew the rail happens to know them. A
   *  key that is absent prints nothing rather than a zero. */
  counts?: RailCounts
  /** Under the rail: the save-state strip, on the pages that have one. */
  railFooter?: ReactNode
  children: ReactNode
}) {
  return (
    <PageFrame className="min-h-0 flex-1">
      <PageBar title={title} context={context}>{controls}</PageBar>
      <div className="flex min-h-0 flex-col items-start gap-6 md:flex-row md:gap-8">
        <nav aria-label="Settings" className="flex w-full shrink-0 flex-col gap-0.5 md:w-[224px]">
          <p className="flex h-[26px] items-center px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">Settings</p>
          {SETTINGS_SUBPAGES.map((s) => {
            const count = counts?.[s.key] ?? null
            return (
              <Link
                key={s.key}
                href={s.href}
                aria-current={active === s.key ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center gap-2 rounded-[4px] px-3 text-[13.5px] transition-colors',
                  active === s.key
                    ? 'bg-inner font-semibold text-foreground'
                    : 'text-secondary-foreground hover:bg-inner hover:text-foreground',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {count != null && (
                  <span className={cn('shrink-0 font-mono text-[10.5px] tabular-nums', active === s.key ? 'text-muted-foreground' : 'text-muted-foreground')}>{count}</span>
                )}
              </Link>
            )
          })}
          {railFooter && <div className="mt-4">{railFooter}</div>}
        </nav>
        <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
          {contentTitle && (
            <header className="flex flex-col gap-1 pb-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="shrink-0 text-[15px] font-semibold">{contentTitle}</h2>
                {contentMeta && <span className="min-w-0 font-mono text-[11px] text-muted-foreground">{contentMeta}</span>}
              </div>
              {contentRule && <p className="text-[12.5px] text-muted-foreground">{contentRule}</p>}
            </header>
          )}
          {children}
        </section>
      </div>
    </PageFrame>
  )
}

/** A settings card: an inner block with a title, a one-line description and
 *  its fields — the nesting level under the content pane. */
export function SettingsCard({ title, description, children, className, action }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-md bg-inner px-4 py-3.5 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {action}
      </div>
      {description && <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** A read-only fact row inside a card: label · value. */
export function FactRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border/70 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-[12.5px]">{children}</span>
    </div>
  )
}

/** A connection row: name · what it does · status. Status is a word, never a
 *  toggle that does nothing (honest empties). */
export function ConnectionRow({ name, what, status, action }: { name: ReactNode; what: ReactNode; status: 'connected' | 'not-connected' | 'coming-soon' | 'in-development' | 'paused'; action?: ReactNode }) {
  const label = status === 'connected' ? 'Connected' : status === 'not-connected' ? 'Not connected' : status === 'in-development' ? 'In development' : status === 'paused' ? 'Paused' : 'Coming soon'
  const cls = status === 'connected' ? 'bg-accent text-accent-foreground' : status === 'not-connected' ? 'bg-warning/15 text-warning' : status === 'paused' ? 'bg-inner text-muted-foreground' : 'bg-tile text-muted-foreground ring-1 ring-border'
  return (
    <div className="flex items-center gap-3 border-t border-border/70 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{name}</p>
        <p className="text-[11.5px] text-muted-foreground">{what}</p>
      </div>
      {action}
      <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-px text-[10.5px] font-medium ${cls}`}>{label}</span>
    </div>
  )
}

/** A row of a settings table: the mock's idiom for the Rivals, Communities and
 *  recipient blocks. Cells are supplied by the caller; the grid is one place so
 *  five tables cannot drift apart. */
export function SettingsTable({ head, children, empty }: { head: readonly string[]; children: ReactNode; empty?: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.flat().filter(Boolean).length > 0 : Boolean(children)
  if (!hasRows && empty) return <p className="text-[12px] text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-border/70">
            {head.map((h, i) => (
              <th key={h} className={`pb-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** One row of a SettingsTable. The first cell reads left, the rest read right
 *  and set tabular figures, because every one of them is a count. */
export function SettingsRow({ cells }: { cells: readonly ReactNode[] }) {
  return (
    <tr className="border-b border-border/50 last:border-b-0">
      {cells.map((c, i) => (
        <td key={i} className={`py-1.5 align-top ${i === 0 ? 'pr-3 text-left' : 'pl-3 text-right tabular-nums'}`}>{c}</td>
      ))}
    </tr>
  )
}
