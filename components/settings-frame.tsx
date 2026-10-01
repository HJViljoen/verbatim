import Link from 'next/link'
import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { signOut } from '@/app/login/actions'
import { buttonClass, PageTitle } from '@/components/pages/studio/ui'
import type { ContextLineInput } from '@/lib/shell/bar'
import { settingsSubPage, settingsTabs, type SettingsSection } from '@/lib/settings/rail'
import { cn } from '@/lib/utils'

// The settings area (Phase 1 WP16, design item 29): one frame shared by
// everything under /dashboard/settings plus Team and Billing, so the account
// pages read as one place. The labels and addresses come from
// lib/settings/rail.ts; this file draws them and decides nothing.
//
// AS THE PAGE-SETTINGS ARTBOARD DRAWS IT (pages build, 1 Oct). The title, with
// Log out at the right of the page's own bar (it left the sidebar's foot);
// then the tabs as pills, the lit one on ink at 7% in weight 600, the others
// muted; then the sub-page. No context line under the title: the reading
// month and "as at the update" are process talk (rule 1), so `bar` and
// `context` are accepted and not printed.
//
// A ROW THAT SCROLLS SIDEWAYS ON ITS OWN. At a phone's width the tabs do not
// fit; the row scrolls inside itself and the page never does.
//
// SUB-PAGES THE ARTBOARD DOES NOT DRAW keep their own header (`contentMeta`,
// `contentRule`) above their content. Its title is dropped where it only
// repeats the lit tab.

export type { SettingsSection }

export function SettingsFrame({
  active, title, contentTitle, contentMeta, contentRule, children, controls, operator = false,
}: {
  /** Which tab is lit. `null` lights none (a parked page inside the frame). */
  active: SettingsSection | null
  title: string
  /** Not printed (rule 1); kept so callers need not change. */
  context?: ReactNode
  contentTitle?: ReactNode
  contentMeta?: ReactNode
  /** The one sentence under the sub-page title. */
  contentRule?: ReactNode
  controls?: ReactNode
  /** Not printed (rule 1); kept so callers need not change. */
  bar?: ContextLineInput | null
  /** The platform operator: Readiness, The record and How to read are tabs
   *  for them alone. */
  operator?: boolean
  children: ReactNode
}) {
  const heading = contentTitle && !(active && contentTitle === settingsSubPage(active).label) ? contentTitle : null
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[22px] text-[#26292C]">
      <PageTitle title={title}>
        {controls}
        <form action={signOut}>
          <button type="submit" className={buttonClass('secondary', 'normal')}>
            <LogOut aria-hidden className="size-4" strokeWidth={2} />
            Log out
          </button>
        </form>
      </PageTitle>
      <nav aria-label="Settings" className="flex gap-1 overflow-x-auto">
        {settingsTabs(operator).map((s) => (
          <Link
            key={s.key}
            href={s.href}
            aria-current={active === s.key ? 'page' : undefined}
            className={cn(
              'inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-lg px-4 text-[14px] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/40',
              active === s.key ? 'bg-[rgba(38,41,44,0.07)] font-semibold text-[#26292C]' : 'font-medium text-[#5F656B] hover:text-[#26292C]',
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        {heading || contentMeta || contentRule ? (
          <header className="flex flex-col gap-1 pb-4">
            {heading || contentMeta ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {heading ? <h2 className="shrink-0 text-[15px] font-semibold">{heading}</h2> : null}
                {contentMeta && <span className="min-w-0 font-mono text-[11px] text-muted-foreground">{contentMeta}</span>}
              </div>
            ) : null}
            {contentRule && <p className="text-[12.5px] text-muted-foreground">{contentRule}</p>}
          </header>
        ) : null}
        {children}
      </section>
    </div>
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
