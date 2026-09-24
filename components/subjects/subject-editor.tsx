'use client'

import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  confirmSubjectAction,
  EMPTY_STATE,
  nameSubjectAction,
  retireSubjectAction,
  type SubjectFormState,
} from '@/lib/actions/subjects'
import { MovementBadge } from '@/components/delta-badge'
import { fmtInt, fmtPct, fullDate } from '@/lib/format'
import { SUBJECTS_UNREADABLE_WHY, SUPERSEDE_RULE } from '@/lib/pages/subjects'
import type { Verdict } from '@/lib/reading/verdicts'
import { SUBJECT_WRITE_REFUSED, SUBJECTS_MAX, SUBJECTS_MIN } from '@/lib/subjects/types'

/**
 * The subjects editor (design §3 SU1, and §4's "the same editor as SU1").
 *
 * ONE COMPONENT, TWO ADDRESSES. The Subjects page draws it as the left rail and
 * Settings › Subjects (WP16) imports it as a section; the design says in as
 * many words that they are the same editor, and the reason is that they carry
 * the same dangerous sentence — renaming or adding a subject starts a NEW line
 * and keeps the old one. Two copies of this form would be two chances to word
 * that rule differently, and the rule is the whole identity model.
 *
 * WHAT THE FORM CANNOT DO IS WHAT MAKES IT HONEST. There is no "edit" control
 * on a name or a description, because the database grants no UPDATE on either:
 * both are read by the judge and both feed the phrase vector, so editing one in
 * place would re-decide membership under an unchanged judge version and quietly
 * change what every frozen month was about. Renaming is therefore a NEW subject
 * that supersedes the old one, and the form says so before it is used rather
 * than after.
 *
 * AND NAMING IS HALF THE ACT. A named subject is `proposed` and nothing counts
 * it; confirming is the write that starts the counting (decision E). The rail
 * shows the difference rather than hiding it, because a client who names six
 * subjects and sees no numbers for a fortnight deserves to know which of the
 * two things happened.
 */

export interface SubjectEditorRow {
  id: string
  name: string
  description: string | null
  namedAt: string
  status: 'proposed' | 'active' | 'retired'
  /** Where it came from, in the client's words. */
  because: string
  /** Your own level this month, where there is one to show. */
  level?: { pct: number | null; k: number; n: number } | null
  /** Why no level is shown. */
  note?: string | null
  /** The banded change on your own side, printed as the row's badge. */
  verdict?: Verdict | null
  selected?: boolean
  href?: string
}

export interface SubjectEditorProps {
  rows: readonly SubjectEditorRow[]
  /** The line above the list — "6 named", or why nothing is counted. */
  setLine: string
  /** Said instead of the list where M4 is not applied here. */
  notRecorded?: string | null
  /** Settings shows the description and the origin under each row; the page's
   *  rail is a rail and shows the name, the date and the level. */
  variant?: 'rail' | 'settings'
  /**
   * Whether this reader may change the set. Default true, which is the
   * Subjects page: naming a subject is the client saying what it wants to be
   * measured on, and the column grants already decide what may be written
   * (`name` and `description` carry no UPDATE at all).
   *
   * AND THE GATE IS NOT HERE. Settings passes `canManageTenant(role)`, the
   * write path refuses the same set of calls server-side
   * (`lib/actions/subjects.ts`), and M4's two write policies now key on
   * `get_my_role()` as well as on client_id, so the database refuses a
   * member's PATCH too. This flag is the affordance.
   *
   * DEFAULTS CLOSED. A permission flag whose default is true puts the burden on
   * every future caller to remember. Both call sites pass it; a forgotten prop
   * is now a missing button rather than an offered write.
   */
  canEdit?: boolean
  /**
   * The rail's chrome moved into the tile (wave 2, the mock's rail tile).
   *
   * `false` drops the two lines the TILE now draws — the "6 named" set line,
   * which is the block's header-right meta, and the "Add a subject →" control,
   * which is the block's footer. The editor keeps everything a control needs to
   * work: the sheets, the pending state and the sentence a failed write says.
   * Settings has no tile around it and keeps both, which is why this is a prop
   * and not a variant.
   */
  chrome?: boolean
}

// The mock's rail row: 4px radius, 4px/10px padding, one pixel between its
// lines, and a 2px green mark down the left of the selected one. Dense — six
// subjects fit a 380px tile beside the rule and the footer.
const cls = {
  row: 'relative flex flex-col gap-px rounded-[4px] px-2.5 py-1 text-left transition-colors',
  name: 'text-[12.5px] font-medium text-foreground',
  meta: 'font-mono text-[10.5px] tabular-nums text-muted-foreground',
}

/**
 * A control on a rail row: a REAL TARGET, and it can be reached by keyboard.
 *
 * The row's controls were set to 10.5px, then to 10px at `gap-x-1`, which
 * bought two lines of rail density and left "Stop" — the one state this
 * product cannot undo — as a roughly 28 x 13px hit area 4px from Rename, with
 * no focus treatment of its own. WCAG 2.2's 24px target size fails twice over
 * at that size. The text stays small, because the rail is 240px and six rows
 * have to fit; the TARGET is padded out to 24px high and the padding is pulled
 * back out of the line with a negative margin, so the row costs no extra
 * height for it.
 */
const CONTROL = 'inline-flex min-h-6 items-center rounded-[3px] px-1 -my-1 font-sans underline-offset-2 ' +
  'transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export function SubjectEditor({ rows, setLine, notRecorded = null, variant = 'rail', canEdit = false, chrome = true }: SubjectEditorProps) {
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<SubjectEditorRow | null>(null)
  /** Which row has been asked to stop, and has not answered yet. */
  const [stopping, setStopping] = useState<string | null>(null)
  const [said, setSaid] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, start] = useTransition()

  const live = rows.filter((r) => r.status !== 'retired')
  const atCeiling = live.filter((r) => r.status === 'active').length >= SUBJECTS_MAX

  const run = (fn: () => Promise<SubjectFormState>) => {
    start(async () => {
      const result = await fn()
      setSaid({ ok: result.ok, message: result.message })
    })
  }

  if (notRecorded) {
    return (
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[12px] text-muted-foreground">{notRecorded}</p>
        {/* THE MISSING BUTTON, EXPLAINED. The tile drops "Add a subject →" in
            this state because a write would fail, and an absent control with
            no sentence beside it reads as "you have not named any" — which is
            the opposite of what happened. */}
        <p className="m-0 text-[11.5px] text-muted-foreground">{SUBJECTS_UNREADABLE_WHY}</p>
        <p className="m-0 text-[11px] text-muted-foreground">{SUPERSEDE_RULE}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {chrome ? <p className="m-0 font-mono text-[11px] text-muted-foreground">{setLine}</p> : null}

      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {rows.map((r) => (
          <li key={r.id}>
            <div className={`${cls.row} ${r.selected ? 'bg-inner' : 'hover:bg-inner/60'}`}>
              {r.selected ? (
                <span aria-hidden className="absolute inset-y-[5px] left-0 w-0.5 rounded-full bg-primary" />
              ) : null}
              <span className="flex items-baseline justify-between gap-2">
                {r.href ? (
                  <Link href={r.href} className={`${cls.name} underline-offset-2 hover:underline`}>{r.name}</Link>
                ) : (
                  <span className={cls.name}>{r.name}</span>
                )}
                {r.level && r.level.pct != null ? (
                  <span data-copy="figure" className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-foreground">
                    {fmtPct(r.level.pct)}
                  </span>
                ) : null}
              </span>

              {r.level && r.level.pct != null ? (
                // THE COUNT AND THE BADGE ON ONE LINE, the mock's "26 of 84 ·
                // too few to compare". The row used to lead with "of your
                // videos" and carry no comparison at all — a level with no
                // statement about whether it moved, on the one tile a reader
                // scans six of.
                <span className="flex min-w-0 items-baseline gap-1.5">
                  {/* THE LEVEL NEVER BREAKS (shell R3). It is the badge that
                      may truncate in this 224px rail, never the count: a level
                      without its "of N" is a score, which this product does not
                      show, and "26 / of / 84" across three lines is that rule
                      failing quietly. The badge's own row is `min-w-0 truncate`
                      below, so the flex line has a shrinkable member and this
                      one does not have to be it. */}
                  <span data-copy="level" className={`${cls.meta} flex-none whitespace-nowrap`}>
                    {fmtInt(r.level.k)} of {fmtInt(r.level.n)}
                  </span>
                  {r.verdict ? (
                    <>
                      <span aria-hidden className={cls.meta}>·</span>
                      <span data-copy="verdict" className="min-w-0 truncate">
                        <MovementBadge verdict={r.verdict} unit="pts" />
                      </span>
                    </>
                  ) : null}
                </span>
              ) : (
                // A PROPOSED ROW SAYS WHERE IT CAME FROM, not that it is not
                // counted: the chip on the line below already says that, and
                // the same sentence twice on one row reads as a rendering bug.
                // What the client actually has to decide is whether to keep it,
                // and the origin is the argument for keeping it.
                <span className={cls.meta}>
                  {r.status === 'proposed'
                    ? r.because
                    : r.status === 'retired'
                      // NOT "no reading yet", WHICH IS THE OPPOSITE OF TRUE. A
                      // stopped subject carries every month it was read in,
                      // frozen at the instant it was stopped, and they are the
                      // record. Settings passes no `level` for any row, so
                      // every stopped subject read "no reading yet".
                      ? 'stopped · the months it carries are closed'
                      : r.note ?? 'no reading yet'}
                </span>
              )}

              {variant === 'settings' && r.status !== 'proposed' && r.description ? (
                <span className="text-[11.5px] text-muted-foreground">{r.description}</span>
              ) : null}

              {/* THE DATE AND THE CONTROLS ON ONE LINE. A 240px rail carries
                  six of these; at `gap-x-2` with 12.5px separators the line
                  wrapped and every row cost three lines instead of two, which
                  is two subjects' worth of tile.

                  AND ON THE RAIL THE VERB GOES (fix pass). That was still not
                  one line: measured at 1440 the row has 188px of room and
                  "named 19 Aug 2026 · Rename · Stop" wants ~212, so every row
                  read "named 19 Aug 2026 · Rename ·" / "Stop" — a dangling
                  separator with the one irreversible control orphaned under
                  it, at 1024 as well. The six characters of "named " are the
                  cheapest thing on the line and the least load-bearing: the
                  pane one tile over states "named 19 Aug 2026" in full above
                  the subject it belongs to, the artboard's rail carries no
                  date at all, and its tile footer prints the bare "19 Aug".
                  The YEAR stays — `fullDate`'s own rule, two Augusts on one
                  screen. Settings is a full-width section and keeps the
                  verb. */}
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground">
                <span className="font-mono">{variant === 'settings' ? `named ${fullDate(r.namedAt)}` : fullDate(r.namedAt)}</span>
                {variant === 'settings' ? <span>· {r.because}</span> : null}
                {r.status === 'retired' ? (
                  // A STOPPED SUBJECT IS MARKED AND CARRIES NO CONTROLS. It
                  // rendered with the same name, the same Rename and Stop
                  // buttons and "no reading yet" — presenting the one state
                  // this product cannot undo as if it were live.
                  <span className="rounded-full bg-inner px-1.5 py-px font-medium text-secondary-foreground">
                    stopped
                  </span>
                ) : null}
                {r.status === 'proposed' ? (
                  <>
                    <span className="rounded-full bg-inner px-1.5 py-px font-medium text-secondary-foreground">
                      not counted yet
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => confirmSubjectAction(r.id))}
                        className={`${CONTROL} font-medium text-foreground`}
                      >
                        Confirm
                      </button>
                    ) : null}
                  </>
                ) : null}
                {canEdit && r.status !== 'retired' ? (
                  stopping === r.id ? (
                    // STOPPING IS THE ONE THING THIS PRODUCT CANNOT UNDO, and
                    // it fired on a single click of a 13px-high word 4px from
                    // Rename — which opens a sheet. It asks now. Two controls
                    // in the row rather than a dialog: the row is the object,
                    // and a modal over a 240px rail hides the set the reader is
                    // deciding about.
                    <>
                      <span className="font-sans">Stop counting this subject?</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => { setStopping(null); run(() => retireSubjectAction(r.id)) }}
                        className={`${CONTROL} font-medium text-negative`}
                      >
                        Yes, stop
                      </button>
                      <span aria-hidden>·</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setStopping(null)}
                        className={`${CONTROL} text-muted-foreground hover:text-foreground`}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                  <>
                    <span aria-hidden>·</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setRenaming(r)}
                      className={`${CONTROL} text-muted-foreground hover:text-foreground`}
                    >
                      Rename
                    </button>
                    <span aria-hidden>·</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setStopping(r.id)}
                      className={`${CONTROL} text-muted-foreground hover:text-foreground`}
                    >
                      Stop
                    </button>
                  </>
                  )
                ) : null}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className="m-0 text-[11px] text-muted-foreground">{SUPERSEDE_RULE}</p>

      {said?.message ? (
        <p className={`m-0 text-[11.5px] ${said.ok ? 'text-positive' : 'text-negative'}`} aria-live="polite">
          {said.message}
        </p>
      ) : null}

      {/* THE REFUSAL STAYS IN THE BODY WHATEVER THE CHROME DOES. A reader who
          may not change the set needs the sentence, not the absence of a
          button; only the AFFORDANCE moves to the tile's footer. */}
      {canEdit ? null : <p className="m-0 text-[11px] text-muted-foreground">{SUBJECT_WRITE_REFUSED}</p>}

      {chrome && canEdit ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={atCeiling}
          title={atCeiling ? `You are already tracking ${SUBJECTS_MAX}. Stop one before you add another.` : undefined}
          className="self-start rounded-[3px] text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          Add a subject →
        </button>
      ) : null}

      {chrome ? (
        <SubjectSheet
          open={adding}
          onOpenChange={setAdding}
          title="Add a subject"
          description={`Name it the way a buyer would say it. ${SUPERSEDE_RULE} Between ${SUBJECTS_MIN} and ${SUBJECTS_MAX} subjects is the set this reads well at.`}
        />
      ) : null}
      <SubjectSheet
        open={renaming != null}
        onOpenChange={(v) => setRenaming(v ? renaming : null)}
        title={renaming ? `Rename “${renaming.name}”` : 'Rename'}
        description={`${SUPERSEDE_RULE} The old one stops being counted from today and everything already reported about it stays exactly as it was.`}
        supersedes={renaming?.id}
        defaultName={renaming?.name}
        defaultDescription={renaming?.description ?? undefined}
      />
    </div>
  )
}

function SubjectSheet({
  open, onOpenChange, title, description, supersedes, defaultName, defaultDescription,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  supersedes?: string
  defaultName?: string
  defaultDescription?: string
}) {
  const [state, action, pending] = useActionState(nameSubjectAction, EMPTY_STATE)

  // Close on a save that worked; a failed one stays open with its reason.
  // Keyed on the id written, not on `state.ok` — `ok` latches true after the
  // first save and a second subject named from the same sheet would leave it
  // open with the first one's message still showing (the initiative-sheet
  // precedent, and the same bug).
  const [lastSaved, setLastSaved] = useState<string | undefined>(undefined)
  if (state.ok && state.id && state.id !== lastSaved) {
    setLastSaved(state.id)
    if (open) onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 bg-tile p-0 data-[side=right]:sm:max-w-[26rem]">
        <SheetHeader className="border-b border-border/70 px-5 py-4 pr-12">
          <SheetTitle className="text-[15px] font-semibold">{title}</SheetTitle>
          <SheetDescription className="text-[12px]">{description}</SheetDescription>
        </SheetHeader>
        <form action={action} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {supersedes ? <input type="hidden" name="supersedes" value={supersedes} /> : null}
          <input type="hidden" name="origin" value="client" />
          <fieldset disabled={pending} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">The subject</span>
              <Input name="name" defaultValue={defaultName} maxLength={60} required autoComplete="off" />
              <span className="block text-[11px] text-muted-foreground/70">
                A noun phrase a buyer would say out loud — “durability”, not “product longevity perception”.
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">What you mean by it (optional)</span>
              <Input name="description" defaultValue={defaultDescription} maxLength={400} autoComplete="off" />
              <span className="block text-[11px] text-muted-foreground/70">
                We read this when we decide what counts. Changing it later starts a new line too.
              </span>
            </label>
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Add it'}</Button>
              {state.message && !(state.ok && state.id === lastSaved) ? (
                <span className={`text-[11.5px] ${state.ok ? 'text-positive' : 'text-negative'}`} aria-live="polite">
                  {state.message}
                </span>
              ) : null}
            </div>
          </fieldset>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/**
 * "Add a subject →", on the tile's FOOTER rail (the mock's rail tile).
 *
 * A SECOND MOUNTING OF ONE CONTROL, NOT A SECOND CONTROL. `BlockFrame`'s footer
 * is a sibling of the block's body, so the trigger cannot be lifted out of
 * `SubjectEditor`'s tree and still be inside it; this is the trigger and the
 * sheet, and the sheet is the same component the editor opens. The ceiling and
 * the permission are the caller's — both are read from the same list the rail
 * is drawn from, so a tile cannot offer a write the rows below it refuse.
 */
export function AddSubjectFooter({ canEdit, activeCount }: { canEdit: boolean; activeCount: number }) {
  const [adding, setAdding] = useState(false)
  if (!canEdit) return null
  const atCeiling = activeCount >= SUBJECTS_MAX
  return (
    <>
      <button
        type="button"
        onClick={() => setAdding(true)}
        disabled={atCeiling}
        title={atCeiling ? `You are already tracking ${SUBJECTS_MAX}. Stop one before you add another.` : undefined}
        className="text-[12px] font-medium text-foreground underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
      >
        Add a subject →
      </button>
      <SubjectSheet
        open={adding}
        onOpenChange={setAdding}
        title="Add a subject"
        description={`Name it the way a buyer would say it. ${SUPERSEDE_RULE} Between ${SUBJECTS_MIN} and ${SUBJECTS_MAX} subjects is the set this reads well at.`}
      />
    </>
  )
}
