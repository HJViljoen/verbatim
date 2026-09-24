import type { ReactNode } from 'react'

import { NOTHING_PENDING, type SaveState } from '@/lib/settings/save-state'
import { shortDate } from '@/lib/format'

/**
 * The sub-page header, the save-state strip and the scope statement.
 *
 * THE HEADER IS THE ARTBOARD'S, NOT `PaneHeader`'S. The artboard sets "The
 * record" at 15px/600 in sentence case with the whole delivery sentence beside
 * it in mono and a second line stating what the page is and what the record's
 * rule is ("Written as the work happens; it is added to, never edited"). The
 * shared pane header sets its title at 10.5px uppercase, which is right for a
 * list pane and wrong for the head of a document. So this page passes no
 * `contentTitle` and draws its own head — the shared component is untouched.
 */
export function RecordHeader({ meta, children }: { meta: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 pb-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="m-0 text-[15px] font-semibold">The record</h2>
        <span className="min-w-0 font-mono text-[11px] text-muted-foreground">{meta}</span>
      </div>
      <p className="m-0 text-[12.5px] text-muted-foreground">{children}</p>
    </div>
  )
}

/**
 * The save-state strip (`record.savestate`).
 *
 * Settings is the one surface where a reader can break a series, and the
 * product said so nowhere: both forms carried their own inline "Saved." and
 * nothing aggregated them. `saveState` (wave 1) composes the strip; this draws
 * it.
 *
 * THE "BROKE" HALF IS ABSENT, NOT EMPTY, UNTIL M1. `config_changes
 * .affects_audiences` / `.affects_months` arrive with the competitors
 * migration, and `SaveState.recorded` is what says whether they could be read.
 * "This save broke nothing" and "we did not write down what this save broke"
 * are different sentences, and 91 of the 93 stored rows are the second — so
 * where the columns are absent the strip says that rather than printing a
 * reassuring silence.
 *
 * ON THE RECORD PAGE THE PENDING HALF IS ALWAYS EMPTY, because this page edits
 * nothing. That is the quiet case and it is the one worth showing here: the
 * strip's job on a read-only page is to say when the last save was and what it
 * moved.
 */
export function SaveStrip({ state, note }: { state: SaveState; note?: string | null }) {
  return (
    // THE SMALLEST TYPE ON THE PAGE TAKES THE DARKER INK (Block D wave 3,
    // RC8). Both lines were `text-muted-foreground` on `bg-inner`, which is
    // 4.46:1 — the strip is 10.5px mono, the smallest thing this page sets,
    // and it is the rail's only content below the seven links. SH7 lifts the
    // token itself to 4.66:1 for every surface that paints muted ink on a
    // tint; this block takes `text-secondary-foreground` (6.4:1 on the same
    // ground) as well, which is what `ScopeStatement` below — the other
    // `bg-inner` block on this page — already does.
    <div className="flex flex-col gap-1.5 rounded-[4px] bg-inner p-3">
      <span className="font-mono text-[10.5px] leading-[1.4] text-secondary-foreground">
        {state.pending.length === 0
          ? `${NOTHING_PENDING}.`
          : `${state.pending.length} change${state.pending.length === 1 ? '' : 's'} waiting to be saved.`}
      </span>
      <span className="font-mono text-[10.5px] leading-[1.4] text-secondary-foreground">
        {state.lastSavedAt
          ? `Last save ${shortDate(state.lastSavedAt)}${note ? ` — ${note.replace(/\.$/, '')}.` : '.'}`
          : 'Nothing has been saved on this workspace yet.'}
        <br />
        {!state.recorded
          ? 'What a save breaks is not written down here yet.'
          : state.breaks.length === 0
            ? 'Broke: nothing recorded.'
            : `Broke: ${state.breaks.map((b) => b.line).join(' · ')}.`}
      </span>
    </div>
  )
}

/**
 * The scope statement, in place of the artboard's "Export the record" button
 * (`record.export`).
 *
 * THE BUTTON IS BLOCKED BY THE REGISTRY, NOT BY EFFORT, AND THE PAGE SAYS SO.
 * `/api/export` renders a REGISTERED PAGE KEY through headless Chrome, and
 * `components/pages/registry.ts` has no `settings` module — `pageModule
 * ('settings')` is null, although `lib/nav.ts` names the key. Registering one
 * would mean building a renderable module whose tiles are a settings FORM, and
 * the export pipeline's tiles are readings. A button that produced nothing
 * would be worse than a block that can be selected and pasted, so the record
 * exports as text and the page states the reason in one sentence.
 *
 * THAT SENTENCE IS NOT WRITTEN IN THE IMPLEMENTER'S NOUNS (Block D wave 3,
 * RC4). It used to read "Export renders a registered page, and Settings has no
 * page module", and `ScopeStatement` renders `why` as a visible `<p>`, not a
 * tooltip — so a client read "a registered page" and "page module", which are
 * the export route's internals and this file's business, not theirs. mock-gap
 * element 21 asks the page to SAY WHY there is no export button; it does not
 * ask it to say so in our nouns. The paragraph above is where the mechanism
 * belongs.
 */

/**
 * The sentence the page prints where the artboard draws "Export the record".
 *
 * Exported so the route and the render tier say the same thing: the tier used
 * to assert on a stand-in of its own ("no registered page module"), which is
 * how the jargon survived a copy lens on a passing test.
 */
export const NO_EXPORT_WHY =
  'There is no file to download here — what we turn into a document are the reading pages, and this is a settings page. So the record is printed below instead, to select and paste.'

export function ScopeStatement({ text, why }: { text: string; why?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {why ? <p className="m-0 text-[11.5px] text-muted-foreground">{why}</p> : null}
      <div className="whitespace-pre-wrap rounded-[4px] bg-inner px-3 py-2.5 font-mono text-[11.5px] leading-[1.6] text-secondary-foreground ring-1 ring-border">
        {text}
      </div>
    </div>
  )
}
