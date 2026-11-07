'use client'

import { useActionState, useState, useTransition } from 'react'

import { BTN_PRIMARY, BTN_SECONDARY, BTN_SM, INPUT, LBL } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  confirmSubjectAction,
  nameSubjectAction,
  retireSubjectAction,
  type SubjectFormState,
} from '@/lib/actions/subjects'
import { EMPTY_STATE } from '@/lib/subjects/form-state'
import { SUBJECTS_MAX } from '@/lib/subjects/types'
import { SUBJECTS_HELD } from '@/lib/tenant-locks'

// The subjects editor, moved in from Settings (pages rebuild, 1 Oct;
// Page-Subjects.dc.html): add, rename and stop lived on the Subjects page, on
// the list they change. Design v2 folded that page into Market, and the
// editor went back to Settings › Your subjects (T10c,
// components/pages/settings/subjects), unchanged; the Subjects page module
// stays registered for stored snapshots. Three controls, as the design draws
// them:
//  · the "..." on every row (Rename, Stop; Confirm on a subject that was named
//    and not confirmed yet);
//  · "Add a subject" under the list;
//  · "Edit" on the open subject (its name and what it covers).
//
// THE GATE IS THE WRITE PATH'S (`lib/actions/subjects.ts`: `canManageTenant`
// on every subject write, M4's policies under it, then the tenant lock since
// decision 7). The page passes `canEdit` and `locked` as the affordance only,
// and draws no control a reader may not use.
//
// A SUBJECT YOU ADD HERE IS ONE YOU FOLLOW. Naming writes a `proposed` row and
// confirming is what starts the counting (decision E); on this page the person
// adding it is the person who confirms, so Add (and a rename of a subject you
// already follow) names and confirms in one act. A rename is a new subject
// that supersedes the old one (the database grants no UPDATE on a name or a
// description), and everything already reported about the old one stays.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings-Subjects.dc.html): the row's menu
// opens from a white button that says "Rename or stop"; Add a subject and
// Edit the white button with no icon; the sheets' fields the kit's input and
// their act the yellow button (the sheet's one primary). Styles from
// components/v2/look.ts (import-free, the client-bundle guard).

const SMALL = cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')
const SUBMIT = cn(BTN_PRIMARY, BTN_SM, 'max-sm:h-11')

export interface EditableSubject {
  id: string
  name: string
  description: string | null
  status: 'active' | 'proposed'
}

/** The "..." on a row: Rename and Stop, and Confirm on a subject waiting for it.
 *  `locked`: the tenant lock holds the subjects (decision 7), so the menu is
 *  drawn disabled under the tab's lock line. */
export function SubjectRowMenu({ subject, locked = false }: { subject: EditableSubject; locked?: boolean }) {
  const [renaming, setRenaming] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const confirm = () => start(async () => {
    const result = await confirmSubjectAction(subject.id)
    setSaid(result.ok ? null : result.message)
  })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Rename or stop ${subject.name}`}
          disabled={pending || locked}
          className={SMALL}
        >
          Rename or stop
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          {subject.status === 'proposed' ? <DropdownMenuItem onSelect={confirm}>Confirm</DropdownMenuItem> : null}
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setStopping(true)}>Stop following</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {said ? <span className="sr-only" role="alert">{said}</span> : null}
      <SubjectSheet open={renaming} onOpenChange={setRenaming} subject={subject} />
      <StopSheet open={stopping} onOpenChange={setStopping} subject={subject} />
    </>
  )
}

/** "Add a subject", under the list; drawn disabled under the tenant lock
 *  (decision 7). */
export function AddSubjectButton({ activeCount, locked = false }: { activeCount: number; locked?: boolean }) {
  const [open, setOpen] = useState(false)
  const atCeiling = activeCount >= SUBJECTS_MAX
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={atCeiling || locked}
        title={locked ? SUBJECTS_HELD : atCeiling ? `You follow ${SUBJECTS_MAX} subjects. Stop one before you add another.` : undefined}
        className={SMALL}
      >
        Add a subject
      </button>
      <SubjectSheet open={open} onOpenChange={setOpen} subject={null} />
    </>
  )
}

/** "Edit" on the open subject: its name and what it covers. */
export function EditSubjectButton({ subject }: { subject: EditableSubject }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(SMALL, 'shrink-0')}>
        Edit
      </button>
      <SubjectSheet open={open} onOpenChange={setOpen} subject={subject} />
    </>
  )
}

/** Name a subject, or rename one (a new subject that supersedes it). */
function SubjectSheet({ open, onOpenChange, subject }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The subject being renamed, or null to add one. */
  subject: EditableSubject | null
}) {
  // Adding here is following: what was just named is confirmed in the same
  // act. A rename confirms only where the subject it replaces was followed.
  const follow = subject == null || subject.status === 'active'
  const [state, action, pending] = useActionState(async (prev: SubjectFormState, form: FormData): Promise<SubjectFormState> => {
    const named = await nameSubjectAction(prev, form)
    if (!named.ok || !named.id) return named
    if (follow) {
      const confirmed = await confirmSubjectAction(named.id)
      if (!confirmed.ok) return { ok: false, message: confirmed.message, id: named.id }
    }
    onOpenChange(false)
    return { ok: true, message: '', id: named.id }
  }, EMPTY_STATE)

  const message = state.ok ? null : state.message || null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 bg-white p-0 data-[side=right]:sm:max-w-[26rem]">
        <SheetHeader className="border-b border-border px-5 py-4 pr-12">
          <SheetTitle className="text-[17px] font-bold text-foreground">{subject ? `Edit ${subject.name}` : 'Add a subject'}</SheetTitle>
          <SheetDescription className="text-[14px] text-muted-foreground">
            {subject
              ? 'A changed name or description starts a fresh subject from today. What was already reported about this one stays as it was.'
              : 'Something your market talks about that you want to follow, named the way a buyer would say it.'}
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {subject ? <input type="hidden" name="supersedes" value={subject.id} /> : null}
          <input type="hidden" name="origin" value="client" />
          <fieldset disabled={pending} className="space-y-4">
            <label className="block space-y-1.5">
              <span className={cn(LBL, 'block')}>The subject</span>
              <input name="name" defaultValue={subject?.name} maxLength={60} required autoComplete="off" className={cn(INPUT, 'w-full max-sm:h-11')} />
            </label>
            <label className="block space-y-1.5">
              <span className={cn(LBL, 'block')}>What it covers</span>
              <textarea
                name="description"
                defaultValue={subject?.description ?? undefined}
                maxLength={400}
                rows={4}
                className={cn(INPUT, 'block h-auto w-full resize-y py-2 leading-[1.5]')}
              />
            </label>
            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={pending} className={SUBMIT}>{pending ? 'Saving…' : subject ? 'Save' : 'Add it'}</button>
              {message ? <span className="text-[13px] text-caution" aria-live="polite">{message}</span> : null}
            </div>
          </fieldset>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** Stop following a subject: asked once, because it cannot be undone. */
function StopSheet({ open, onOpenChange, subject }: { open: boolean; onOpenChange: (open: boolean) => void; subject: EditableSubject }) {
  const [said, setSaid] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const stop = () => start(async () => {
    const result = await retireSubjectAction(subject.id)
    if (result.ok) onOpenChange(false)
    else setSaid(result.message)
  })
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 bg-white p-0 data-[side=right]:sm:max-w-[26rem]">
        <SheetHeader className="border-b border-border px-5 py-4 pr-12">
          <SheetTitle className="text-[17px] font-bold text-foreground">Stop following {subject.name}?</SheetTitle>
          <SheetDescription className="text-[14px] text-muted-foreground">
            It leaves your subjects from today. What was already reported about it stays as it was.
          </SheetDescription>
        </SheetHeader>
        <div className="flex items-center gap-3 px-5 py-4">
          <button type="button" disabled={pending} onClick={stop} className={SUBMIT}>
            {pending ? 'Stopping…' : 'Stop following'}
          </button>
          <button type="button" disabled={pending} onClick={() => onOpenChange(false)} className={SMALL}>
            Cancel
          </button>
          {said ? <span className="text-[13px] text-caution" role="alert">{said}</span> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
