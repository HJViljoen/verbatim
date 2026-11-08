import { TAG, TAG_TONE } from '@/components/v2/look'
import { commaCite } from '@/components/v2/words'
import { OWNER_LABEL, STATUS_LABEL, type ReadinessRow, type ReadinessStatus } from '@/lib/readiness/types'
import { cn } from '@/lib/utils'

// The readiness rows (Phase 0 WP10, design item 18), on the client's
// Settings › Readiness and the operator's /dashboard/ops/readiness.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings-Readiness.dc.html): the title and
// its line, then one ruled `article` a row in two columns: on the left the
// block as a heading, the input under it, the detail, its notes as a list and
// "{Next}: …"; on the right who changes it, in grey, and the status as a
// tag. No " · ", no mono, no capitals. The table draws no card of its own:
// Settings puts it in a tile, the ops console in its pane.
//
// Colour carries meaning only where it is a verdict: the status tag. "In
// place" and "Partly" are the board's quiet outlined tag (the operator pass,
// 8 Nov: "Partly" was the grey track); "Missing", which no board draws, takes
// the kit's caution tone.
//
// THE WORDS ARE COMPOSED IN lib/ (`lib/readiness/compute.ts`,
// `lib/settings/readiness-view.ts`), some joined with " · " and each row's
// line under its heading in lower case: this screen says them in commas
// (`commaCite`) and in sentence case, as the board writes them, and lib's
// strings do not move (T11.4's way).

const STATUS_TAG: Record<ReadinessStatus, string> = {
  exists: 'border border-control bg-card text-foreground',
  partial: 'border border-control bg-card text-foreground',
  missing: TAG_TONE.hi,
}

/** "the rival accounts we read" as the board writes it: "The rival accounts
 *  we read". */
const sentenceCase = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function StatusTag({ status }: { status: ReadinessStatus }) {
  return <span className={cn(TAG, 'h-[26px] shrink-0 px-2.5 text-[13.5px]', STATUS_TAG[status])}>{STATUS_LABEL[status]}</span>
}

/** A row, plus what the client view adds to it (Phase 1 WP16): the owner in
 *  the client's words, and a date where one genuinely exists. Both optional —
 *  the operator page passes neither and reads exactly as it did. */
export type ReadinessTableRow = ReadinessRow & { ownerWords?: string; by?: string | null }

function Row({ row, nextLabel }: { row: ReadinessTableRow; nextLabel: string }) {
  const owner = row.ownerWords ?? OWNER_LABEL[row.owner]
  return (
    <article className="grid grid-cols-1 gap-x-7 gap-y-2 border-t border-track py-[22px] sm:grid-cols-[minmax(0,1fr)_150px]">
      <div className="min-w-0">
        <h3 className="m-0 text-[17px] font-semibold leading-[1.3]">{row.block}</h3>
        <p className="m-0 mt-0.5 text-[14.5px] text-muted-foreground">{sentenceCase(row.input)}</p>
        <p className="m-0 mt-2.5 text-[15.5px] leading-[1.55]">{commaCite(row.detail)}</p>
        {/* Keyed by position, not by text: two notes on one row are identical
            whenever two updates share a day and an outcome, which is live today
            (three updates finished on 17 Aug 2026 on the trial workspace). A
            duplicate key makes React drop or mis-reuse a line on re-render, and
            a silently missing line is the one thing this row must never do. */}
        {row.notes.length > 0 && (
          <ul className="m-0 mt-2.5 list-none p-0 py-1 text-[14.5px] leading-[1.7] text-secondary-foreground">
            {row.notes.map((note, index) => (
              <li key={`${row.id}-${index}`}>{commaCite(note)}</li>
            ))}
          </ul>
        )}
        <p className="m-0 mt-2.5 text-[14.5px] leading-[1.55] text-secondary-foreground">
          <span className="font-semibold text-foreground">{nextLabel}:</span>{' '}
          {commaCite(row.unlocks)}
          {row.by && <span> By {commaCite(row.by)}.</span>}
        </p>
      </div>
      <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] sm:flex-col sm:items-start">
        <span className="text-secondary-foreground">{owner}</span>
        <StatusTag status={row.status} />
      </div>
    </article>
  )
}

/** `nextLabel`: the word before each row's last line. The operator page keeps
 *  "Unlocks"; the client's Settings › Readiness says "Next" (sw-2 item 6). */
export function ReadinessTable({ rows, title, description, nextLabel = 'Unlocks' }: { rows: readonly ReadinessTableRow[]; title: string; description: string; nextLabel?: string }) {
  return (
    <section className="flex min-w-0 flex-col">
      <h2 className="m-0 text-[21px] font-semibold leading-[1.3]">{title}</h2>
      <p className="m-0 mt-1.5 mb-[18px] text-[15px] leading-[1.55] text-secondary-foreground">{description}</p>
      {rows.map((row) => <Row key={row.id} row={row} nextLabel={nextLabel} />)}
    </section>
  )
}
