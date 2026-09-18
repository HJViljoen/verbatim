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
    <div className="flex flex-col gap-1.5 rounded-[4px] bg-inner p-3">
      <span className="font-mono text-[10.5px] leading-[1.4] text-muted-foreground">
        {state.pending.length === 0
          ? `${NOTHING_PENDING}.`
          : `${state.pending.length} change${state.pending.length === 1 ? '' : 's'} waiting to be saved.`}
      </span>
      <span className="font-mono text-[10.5px] leading-[1.4] text-muted-foreground">
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
 */
export function ScopeStatement({ text, why }: { text: string; why: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[11.5px] text-muted-foreground">{why}</p>
      <div className="whitespace-pre-wrap rounded-[4px] bg-inner px-3 py-2.5 font-mono text-[11.5px] leading-[1.6] text-secondary-foreground ring-1 ring-border">
        {text}
      </div>
    </div>
  )
}
