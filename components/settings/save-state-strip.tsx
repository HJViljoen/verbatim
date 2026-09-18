import { shortDate } from '@/lib/format'
import { NOTHING_PENDING, type SaveState } from '@/lib/settings/save-state'

// `settings.savestate` — the strip the artboard draws under the settings rail,
// on wave 1's pure `saveState`.
//
// WHY IT IS HERE AT ALL. Settings is the one surface where a reader can break a
// series, and the built page said so nowhere: two forms, each with its own
// inline "Saved.", and nothing telling a client that what they just changed
// moved the basis of a reading they will compare against next month.
//
// TWO TENSES, AND THEY ARE DRAWN IN THE TWO PLACES THAT HOLD THEM. What was
// last saved, and what that save broke, is a `config_changes` row the server
// read — so it is the RAIL's strip. What is waiting to be saved is the form's
// own state, which only the form knows — so it is the SAVE ROW's sentence. A
// rail strip that claimed "nothing waiting to be saved" while the reader had
// three unsaved edits would be the one sentence on this page that is checkable
// and wrong.
//
// THE THIRD LINE IS USUALLY AN ABSENCE. What a save broke is
// `config_changes.affects_audiences` / `affects_months`, which arrive with M1
// and are applied on neither tenant today. `saveState.recorded` tells "this
// save broke nothing" apart from "we did not write down what this save broke",
// and both are printed as themselves — never a blank, and never the cheerful
// one standing in for the honest one.

export const BREAK_NOT_RECORDED = 'What that save broke was not written down.'
export const BROKE_NOTHING = 'That save broke nothing that is read as a series.'
export const NEVER_SAVED = 'Nothing here has been changed since we started keeping the record.'
export const SAVE_BREAKS_RULE = 'A save names the series it breaks.'

/** What the last save was, and what it broke. The rail's strip. */
export function LastSaveStrip({ state, note }: {
  state: SaveState
  /** The logged change's own note, where it has one ("Poler was added…"). */
  note?: string | null
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[4px] bg-inner p-3">
      {state.lastSavedAt ? (
        <>
          <span className="font-mono text-[10.5px] leading-[1.4] text-muted-foreground">
            Last save {shortDate(state.lastSavedAt)}{note ? ` — ${note}` : ''}
          </span>
          <span className="font-mono text-[10.5px] leading-[1.4] text-cat">{breakWords(state)}</span>
        </>
      ) : (
        <span className="font-mono text-[10.5px] leading-[1.4] text-muted-foreground">{NEVER_SAVED}</span>
      )}
    </div>
  )
}

/** The sentence beside the save button: what is waiting, and what the last save
 *  broke. `pending` is the form's own, so this one is a client's to render. */
export function SaveStateLine({ state }: { state: SaveState }) {
  const pending = state.pending.length
  const names = state.recorded && state.breaks.length > 0
  return (
    <span className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
      {names ? `${SAVE_BREAKS_RULE} ` : ''}
      {pending === 0
        ? `${NOTHING_PENDING}`
        : `${pending} change${pending === 1 ? '' : 's'} waiting to be saved — ${state.pending.map((p) => p.field.toLowerCase()).join(', ')}`}
      {state.lastSavedAt ? <> · last saved <span className="font-mono text-[12px] text-secondary-foreground">{shortDate(state.lastSavedAt)}</span>, and {breakClause(state)}</> : '.'}
    </span>
  )
}

function breakWords(state: SaveState): string {
  if (!state.recorded) return BREAK_NOT_RECORDED
  return state.breaks.length > 0 ? `Broke: ${state.breaks.map((b) => b.line).join(' · ')}.` : BROKE_NOTHING
}

function breakClause(state: SaveState): string {
  if (!state.recorded) return 'what that save broke was not written down.'
  return state.breaks.length > 0
    ? `that save broke ${state.breaks.map((b) => b.line).join(' and ')}.`
    : 'that save broke nothing that is read as a series.'
}
