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
 * would be a line of "nothing → nothing". And where it is printed it is printed
 * WHOLE: it is the change itself, so a row that wraps to two lines is better
 * than a row that hides half of what moved.
 *
 * "MADE BY" PRINTS A PERSON, NOT A ROLE (mock-gap §6 D14). The artboard's column
 * is captioned "a role, never a name" and prints "digital director" on all four
 * rows; nothing in the product maps a user to a job title, and `actorWords`
 * resolves the actor to "You", a teammate's address, or "Verbatim". Inventing a
 * role would be a claim about state the product does not hold — so the person
 * stays and the deviation is recorded.
 *
 * TITLE ALONE (25 Sep rulings, the whole Record tab from WP1.6). The count and
 * the boundary sentence that sat beside the title are gone: the table is the
 * count, and the reconstructed rows say what they are under their own heading
 * and in their "made by" cell ("Reconstructed, not recorded").
 */

// THE TRACKS ARE PROPORTIONAL, AND THE TABLE ONLY GOES WIDE WHERE THERE IS
// ROOM. The artboard's `100px │ 1fr │ 300px │ 150px` was ported literally at
// `md:` — and inside SettingsFrame the content pane is the viewport less the
// 220px rail, less the shell's own 24px each side, so at a 768px viewport the
// pane is about 496px and four fixed tracks asking for 586px cannot fit. The
// grid did not scroll: `minmax` maxima starved the one `1fr` track to ZERO and
// the columns painted over each other (design review finding 1, measured at
// 768 and still colliding at 900).
//
// So two changes, and both are about never being able to overflow again: every
// track's MINIMUM is 0 and the three wide ones are FRACTIONS, so they divide
// whatever is there instead of demanding a width; and the breakpoint is `lg`
// (1024px viewport, a pane of about 744px), under which the row stacks. The
// fractions are the artboard's own widths at 1440: a 1160px pane less the
// 100px date and three 12px gaps leaves 1024px, and 1.9 : 1 : 0.5 of it is
// 570 │ 300 │ 150 — the mock's three columns to the pixel.
// Each row is padded like the tab's other tables (The record's, above), with
// its cells on the first line's top, so a three-line note does not press its
// rules against its words.
// AND THE BREAKPOINT IS NOW `xl` (fresh design check, 26 Sep): as a tile the
// section lost 64px to its inset, so at 1024 the four tracks got 165 │ 87 │
// 43px and "Verbatim" broke mid-word. From 1280 they get 330 │ 174 │ 87.
const ROW = 'grid grid-cols-1 gap-x-3 gap-y-1 border-b border-border/60 py-3 last:border-b-0 xl:grid-cols-[100px_minmax(0,1.9fr)_minmax(0,1fr)_minmax(0,0.5fr)] xl:items-start xl:py-3.5'

export function ChangeLogBlock({
  log, rows, showing, now, unavailable, title = 'The change log',
}: {
  /** The section's title. Settings › What we changed (market-first WP1.6)
   *  prints the changes of ours in its own dated list, and this block the
   *  rest, as "Other settings changes", so no change prints twice. */
  title?: string
  log: ChangeLogView
  /** How many recorded rows the table draws. */
  rows: number
  showing: string | null
  now: string
  /** The sentence to print instead of a table where `config_changes` is not
   *  applied here. A missing table is not an empty log. */
  unavailable?: string | null
}) {
  if (unavailable) {
    return (
      <RecordSection title={title}>
        <p className="m-0 text-[15px] text-muted-foreground">{unavailable}</p>
      </RecordSection>
    )
  }
  const shown = log.recorded.slice(0, rows)
  return (
    <RecordSection title={title}>
      {shown.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">No change has been recorded yet.</p>
      ) : (
        <div className="flex flex-col">
          {/* The column heads in the tab's one voice (The record's, above):
              13px, sentence case, over the table's rule. */}
          <div className="hidden grid-cols-[100px_minmax(0,1.9fr)_minmax(0,1fr)_minmax(0,0.5fr)] gap-x-3 border-b border-border pb-2 text-[13px] font-medium leading-[1.35] text-muted-foreground xl:grid">
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
      {showing ? <p className="m-0 text-[13px] text-muted-foreground">{showing}</p> : null}
      {log.prehistory.length > 0 ? <Prehistory log={log} rows={rows} now={now} /> : null}
    </RecordSection>
  )
}

function ChangeRow({ change, now }: { change: ClientChange; now: string }) {
  return (
    <div className={ROW}>
      <span className="font-mono text-[13px] leading-[1.5] text-secondary-foreground">{change.dateShort}</span>
      <span className="min-w-0 text-[13px] leading-[1.5]">
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{change.said}</span>
          {madeThisMonth(change, now) ? <MonthFlag>this month</MonthFlag> : null}
        </span>
        {/* NOT TRUNCATED. On the rows that have it the before→after IS the
            change, and `truncate` hid it with no title, no wrap and no way to
            see the rest: at 1440 six named subjects read "nothing → fit,
            comfort, delivery, price, ser…" and at 960 a rival rename read
            "Freitag → Fre…" (design review finding 6). A record whose own rule
            is "added to, never edited" cannot hide the edit; the line wraps
            instead, and only on the rows that carry one. */}
        {change.before && change.after ? (
          <span className="mt-0.5 block break-words font-mono text-[12px] leading-[1.45] text-muted-foreground">
            {change.before} → {change.after}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 break-words text-[13px] leading-[1.5] text-muted-foreground">{change.breaks}</span>
      {/* BREAKS LIKE ITS SIBLING (Block D wave 3, RC3). `minmax(0, 0.5fr)`
          stops the TRACK demanding width; it does not stop the CONTENT
          escaping it. The prehistory rows' actor is "Reconstructed, not
          recorded", whose first token is an unbreakable 85px word, and this
          cell had no `break-words` where the one beside it did: measured on
          the 0.5fr track, 1024 → track 53px and 32px of overflow, with the
          document's `scrollWidth` 1032 against a `clientWidth` of 1024; 1100 →
          21px over; 1220 → 3px over; 1280 and up clean. In the shell the word
          was clipped with no indication, on the one row whose whole purpose is
          to say the entry was inferred rather than recorded. */}
      <span className="min-w-0 break-words text-[13px] leading-[1.5] text-secondary-foreground">{change.who}</span>
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
      {/* A sub-heading with its count, as the preview heads a group of rows
          ("What we search"); each row's "made by" says what the entries are. */}
      <h3 className="m-0 text-[15px] font-semibold">
        Before the record began · {fmtInt(log.prehistory.length)} {log.prehistory.length === 1 ? 'entry' : 'entries'}
      </h3>
      <div className="flex flex-col">
        {log.prehistory.slice(0, rows).map((c) => (
          <ChangeRow key={c.id} change={c} now={now} />
        ))}
      </div>
      {showing ? <p className="m-0 text-[13px] text-muted-foreground">{showing}</p> : null}
    </div>
  )
}
