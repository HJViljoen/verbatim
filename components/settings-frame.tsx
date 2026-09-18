import type { ReactNode } from 'react'
import { PageFrame, PageBar } from '@/components/shell/page-grid'
import { PaneHeader, PaneBody, RailGroup, RailLink } from '@/components/shell/master-list'
import { SETTINGS_SUBPAGES, type RailCounts, type SettingsSection } from '@/lib/settings/rail'

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

export type { SettingsSection }

export function SettingsFrame({
  active, title, context, contentTitle, contentMeta, children, controls, counts, railFooter,
}: {
  /** Which rail entry is lit. `null` lights none — the parked Initiatives
   *  page is inside this frame and is not one of the seven, and lighting
   *  Tracking from it would tell a reader they were somewhere they are not. */
  active: SettingsSection | null
  title: string
  context?: ReactNode
  contentTitle?: ReactNode
  contentMeta?: ReactNode
  controls?: ReactNode
  /** Rail counts, where the page that drew the rail happens to know them. A
   *  key that is absent prints nothing rather than a zero. */
  counts?: RailCounts
  /** Under the rail, below the seven links: the mock's save-state strip
   *  (`SettingsRecord.dc.html`, and the same block on the Tracking artboard).
   *  It belongs to the AREA rather than to a sub-page — the thing it says is
   *  "you have unsaved edits somewhere in Settings, and the last save broke
   *  this" — and a sub-page that drew it inside its own pane would be saying it
   *  about itself. Optional, so a page that has not composed one draws no
   *  empty box. */
  railFooter?: ReactNode
  children: ReactNode
}) {
  return (
    <PageFrame className="min-h-0 flex-1">
      <PageBar title={title} context={context}>{controls}</PageBar>
      <div className="flex min-h-0 flex-col gap-3 md:h-[calc(100dvh_-_6.75rem)] md:flex-none md:flex-row">
        <section className="flex shrink-0 flex-col overflow-hidden rounded-lg bg-tile shadow-tile md:w-[220px]">
          <PaneHeader title="Settings" />
          <PaneBody>
            <RailGroup>
              {SETTINGS_SUBPAGES.map((s) => (
                <RailLink key={s.key} href={s.href} active={active === s.key} count={counts?.[s.key] ?? null}>
                  {s.label}
                </RailLink>
              ))}
            </RailGroup>
            {railFooter ? <div className="px-2 pb-3">{railFooter}</div> : null}
          </PaneBody>
        </section>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-tile shadow-tile">
          {contentTitle && <PaneHeader title={contentTitle} meta={contentMeta} />}
          <PaneBody className="px-5 py-4">{children}</PaneBody>
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
