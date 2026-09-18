import { fmtInt } from '@/lib/format'
import type { ChangeLogView, ClientChange } from '@/lib/settings/change-log'
import { madeThisMonth, showingLine } from '@/lib/settings/change-log'

import { MonthFlag, RecordSection } from './frame'

/**
 * THE CHANGE LOG — the artboard's 4-column table (`record.changelog.*`).
 *
 * `100px │ 1fr │ 300px │ 150px`, one 12.5px line per change at `min-height:52px`,
 * with the short date in mono and an amber "this month" flag on a change made
 * inside the current calendar month. The build stacked three lines into the
 * "What changed" cell — the surface word, the note and a mono before→after —
 * which roughly doubled every row and broke the table's rhythm.
 *
 * ONE LINE, AND THE SECOND ONE ONLY WHERE IT SAYS SOMETHING. `said` is the row's
 * sentence and it is what a reader came for; `before → after` is printed under
 * it only where both sides render, because on the rows that have it ("nothing →
 * Poler") it is the whole content of the change and on the rows that do not it
 * would be a line of "nothing → nothing".
 *
 * "MADE BY" PRINTS A PERSON, NOT A ROLE (mock-gap §6 D14). The artboard's column
 * is captioned "a role, never a name" and prints "digital director" on all four
 * rows; nothing in the product maps a user to a job title, and `actorWords`
 * resolves the actor to "You", a teammate's address, or "Verbatim". Inventing a
 * role would be a claim about state the product does not hold — so the person
 * stays and the deviation is recorded.
 *
 * THE BOUNDARY MOVED INTO THE HEADER. `changeLogBoundary` is the artboard's
 * right-hand note ("a change breaks a series; the old line is kept") in the
 * product's own words, and it belongs beside the count rather than under the
 * table, where it read as a footnote to the last row.
 */

const ROW = 'grid grid-cols-1 gap-x-3 gap-y-1 border-t border-border/70 py-3 md:min-h-[52px] md:grid-cols-[100px_minmax(0,1fr)_300px_150px] md:items-center md:py-0'

export function ChangeLogBlock({
  log, rows, meta, boundary, showing, now, unavailable,
}: {
  log: ChangeLogView
  /** How many recorded rows the table draws. */
  rows: number
  /** "4 changes since 6 Apr · 1 this month". */
  meta: string
  /** The product's own sentence about where the record begins. */
  boundary: string
  showing: string | null
  now: string
  /** The sentence to print instead of a table where `config_changes` is not
   *  applied here. A missing table is not an empty log. */
  unavailable?: string | null
}) {
  if (unavailable) {
    return (
      <RecordSection title="The change log" meta="not recorded yet">
        <p className="m-0 text-[12.5px] text-muted-foreground">{unavailable}</p>
      </RecordSection>
    )
  }
  const shown = log.recorded.slice(0, rows)
  return (
    <RecordSection title="The change log" meta={meta} note={boundary}>
      {shown.length === 0 ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">No change has been recorded yet.</p>
      ) : (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[100px_minmax(0,1fr)_300px_150px] gap-x-3 pb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground md:grid">
            <span>Date</span>
            <span>What changed</span>
            <span>What it breaks</span>
            <span>Made by</span>
          </div>
          {shown.map((c) => (
            <ChangeRow key={c.id} change={c} now={now} />
          ))}
        </div>
      )}
      {showing ? <p className="m-0 text-[11.5px] text-muted-foreground">{showing}</p> : null}
      {log.prehistory.length > 0 ? <Prehistory log={log} rows={rows} now={now} /> : null}
    </RecordSection>
  )
}

function ChangeRow({ change, now }: { change: ClientChange; now: string }) {
  return (
    <div className={ROW}>
      <span className="font-mono text-[11.5px] text-secondary-foreground">{change.dateShort}</span>
      <span className="min-w-0 text-[12.5px]">
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{change.said}</span>
          {madeThisMonth(change, now) ? <MonthFlag>this month</MonthFlag> : null}
        </span>
        {change.before && change.after ? (
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
            {change.before} → {change.after}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 text-[12.5px] text-muted-foreground">{change.breaks}</span>
      <span className="min-w-0 text-[12.5px] text-secondary-foreground">{change.who}</span>
    </div>
  )
}

/**
 * The reconstructed rows, which the artboard has no counterpart for and which
 * are not deleted by this port: they are a label worked out afterwards from
 * what each update searched, and `changeLogBoundary` insists they are never
 * summed with the record. Kept, under their own heading, saying what they are.
 */
function Prehistory({ log, rows, now }: { log: ChangeLogView; rows: number; now: string }) {
  const showing = showingLine(rows, log.prehistory.length)
  return (
    <div className="flex flex-col gap-2 pt-2">
      <p className="m-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Before the record began</p>
      <p className="m-0 text-[11.5px] text-muted-foreground">
        {fmtInt(log.prehistory.length)} earlier {log.prehistory.length === 1 ? 'entry was' : 'entries were'} worked out
        afterwards from what each update searched, the oldest dated {log.prehistory[log.prehistory.length - 1].date}. They
        are a label, not a record, and are not counted above.
      </p>
      <div className="flex flex-col">
        {log.prehistory.slice(0, rows).map((c) => (
          <ChangeRow key={c.id} change={c} now={now} />
        ))}
      </div>
      {showing ? <p className="m-0 text-[11.5px] text-muted-foreground">{showing}</p> : null}
    </div>
  )
}
