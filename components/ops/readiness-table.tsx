import { SettingsCard } from '@/components/settings-frame'
import { OWNER_LABEL, STATUS_LABEL, type ReadinessRow, type ReadinessStatus } from '@/lib/readiness/types'

// The readiness rows (Phase 0 WP10, design item 18). The anatomy is the one
// `components/settings-frame.tsx` already uses — a tile holding one flat tinted
// card, rows inside it, a rounded status pill on the right — so this page reads
// as part of the product rather than as an operator console bolted to its side.
//
// Two nesting levels only (design system §tiles): the page's tile, then this
// card. A row is not a third level — it has no ground and no border of its own
// beyond the hairline that separates it from the one above.
//
// Colour carries meaning only where it is a verdict: the pill, and nothing
// else on the page.

const PILL: Record<ReadinessStatus, string> = {
  exists: 'bg-accent text-accent-foreground',
  partial: 'bg-warning/15 text-warning',
  missing: 'bg-negative/12 text-negative',
}

function StatusPill({ status }: { status: ReadinessStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-px text-[10.5px] font-medium ${PILL[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

function Row({ row }: { row: ReadinessRow }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border/70 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-baseline gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">
            {row.block}
            <span className="text-muted-foreground"> · {row.input}</span>
          </p>
          <p className="mt-0.5 text-[12.5px] text-secondary-foreground">{row.detail}</p>
        </div>
        <span className="hidden shrink-0 font-mono text-[10.5px] text-muted-foreground sm:inline">
          {OWNER_LABEL[row.owner]}
        </span>
        <StatusPill status={row.status} />
      </div>

      {/* Keyed by position, not by text: two notes on one row are identical
          whenever two updates share a day and an outcome, which is live today
          (three updates finished on 17 Aug 2026 on the trial workspace). A
          duplicate key makes React drop or mis-reuse a line on re-render, and
          a silently missing line is the one thing this row must never do. */}
      {row.notes.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-3">
          {row.notes.map((note, index) => (
            <li key={`${row.id}-${index}`} className="font-mono text-[11px] leading-[1.45] text-muted-foreground">{note}</li>
          ))}
        </ul>
      )}

      <p className="text-[11.5px] text-muted-foreground">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em]">Unlocks</span>{' '}
        {row.unlocks}
        <span className="sm:hidden"> · {OWNER_LABEL[row.owner]}</span>
      </p>
    </div>
  )
}

export function ReadinessTable({ rows, title, description }: { rows: ReadinessRow[]; title: string; description: string }) {
  return (
    <SettingsCard title={title} description={description}>
      {rows.map((row) => <Row key={row.id} row={row} />)}
    </SettingsCard>
  )
}
