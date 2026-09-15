'use client'

import { useActionState, useState } from 'react'

import {
  addSubject, confirmSubject, stopSubject, type SubjectState,
} from '@/app/dashboard/settings/subjects/actions'
import type { SubjectOrigin, SubjectStatus } from '@/lib/subjects/types'

/**
 * SU1 — the subject editor (design item 4, decision E).
 *
 * MINIMAL, AND SAID SO IN THE OPEN. WP12 owns this component; WP16 needs it for
 * Settings › Subjects and WP12 had not landed when this was written, so this is
 * the smallest editor that does every write SU1 asks for — name, confirm, stop,
 * rename — against the functions WP4 already shipped. It is deliberately at the
 * path WP12 will use, so the merge is a replacement and not a second editor.
 * Nothing here decides anything: every rule is in lib/subjects/moves.ts.
 *
 * A RENAME IS TWO ROWS, NOT AN EDIT, and the form says so before it is used.
 * `nameSubject(supersedes)` inserts the new subject and retires the old one
 * pointing at it, because name and description are both read by the judge and
 * both feed the phrase vector: editing either in place would quietly change
 * what every frozen month was about.
 */

export interface EditorSubject {
  id: string
  name: string
  description: string | null
  origin: SubjectOrigin
  status: SubjectStatus
  namedAt: string
  /** 'ready' | 'calibrating' — a subject whose precision has not been measured
   *  under the current judge prints its share to nobody. */
  calibration: 'ready' | 'calibrating'
}

const initial: SubjectState = { ok: false, message: '' }

const ORIGIN_WORDS: Record<SubjectOrigin, string> = {
  own_claims: 'from what your own videos say',
  category_theme: 'from what the category keeps talking about',
  client: 'in your words',
}

const BUTTON =
  'shrink-0 rounded-[3px] text-[11.5px] font-medium text-secondary-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50'

function OneButtonForm({
  action, id, label, busy,
}: { action: typeof confirmSubject; id: string; label: string; busy: string }) {
  const [state, formAction, pending] = useActionState(action, initial)
  return (
    <form action={formAction} className="flex items-baseline gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={BUTTON}>{pending ? busy : label}</button>
      {state.message && (
        <span className={`text-[11px] ${state.ok ? 'text-muted-foreground' : 'text-negative'}`}>{state.message}</span>
      )}
    </form>
  )
}

function NameForm({
  supersedes, name, description, onDone,
}: { supersedes?: string; name?: string; description?: string | null; onDone?: () => void }) {
  const [state, action, pending] = useActionState(addSubject, initial)
  return (
    <form action={action} className="flex flex-col gap-2">
      {supersedes && <input type="hidden" name="supersedes" value={supersedes} />}
      <input
        name="name"
        defaultValue={name ?? ''}
        maxLength={60}
        required
        placeholder="What you want to be known for, in your words"
        className="w-full rounded-[4px] border border-input bg-tile px-2.5 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <textarea
        name="description"
        defaultValue={description ?? ''}
        maxLength={400}
        rows={2}
        placeholder="One sentence saying what counts as this subject, and what does not."
        className="w-full rounded-[4px] border border-input bg-tile px-2.5 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-[4px] bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-accent-foreground disabled:opacity-50"
        >
          {pending ? 'Saving…' : supersedes ? 'Save as a new subject' : 'Add it'}
        </button>
        {onDone && <button type="button" onClick={onDone} className="rounded-[3px] text-[12px] text-muted-foreground hover:underline">Cancel</button>}
        {state.message && (
          <span className={`text-[11.5px] ${state.ok ? 'text-muted-foreground' : 'text-negative'}`}>{state.message}</span>
        )}
      </div>
      {supersedes && (
        <p className="text-[11px] text-muted-foreground">
          Renaming starts a new line and keeps the old one. The months already counted stay as they are, under the
          old name — they were counted against a different sentence, and we will not pretend otherwise.
        </p>
      )}
    </form>
  )
}

function SubjectRow({ subject, canEdit }: { subject: EditorSubject; canEdit: boolean }) {
  const [renaming, setRenaming] = useState(false)
  return (
    <li className={`border-t border-border/70 py-2.5 first:border-t-0 first:pt-0 last:pb-0 ${subject.status === 'retired' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">
            {subject.name}
            <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
              {subject.status === 'active' ? 'counted' : subject.status === 'proposed' ? 'not counted yet' : 'stopped'}
            </span>
          </p>
          {subject.description && <p className="mt-0.5 text-[12px] text-secondary-foreground">{subject.description}</p>}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {ORIGIN_WORDS[subject.origin]} · named {subject.namedAt}
            {subject.status === 'active' && subject.calibration === 'calibrating' && (
              <> · we are still checking how accurately we can spot this one, so its share is not shown yet</>
            )}
          </p>
        </div>
        {canEdit && subject.status !== 'retired' && (
          <div className="flex shrink-0 items-baseline gap-3">
            {subject.status === 'proposed' && (
              <OneButtonForm action={confirmSubject} id={subject.id} label="Confirm it" busy="Confirming…" />
            )}
            <button type="button" onClick={() => setRenaming((r) => !r)} className={BUTTON}>
              {renaming ? 'Cancel' : 'Rename'}
            </button>
            <OneButtonForm action={stopSubject} id={subject.id} label="Stop tracking" busy="Stopping…" />
          </div>
        )}
      </div>
      {renaming && (
        <div className="mt-2">
          <NameForm supersedes={subject.id} name={subject.name} description={subject.description} onDone={() => setRenaming(false)} />
        </div>
      )}
    </li>
  )
}

export function SubjectEditor({
  subjects, canEdit,
}: { subjects: EditorSubject[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      {subjects.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Nothing is named yet. A subject is something you want to be known for, in your own words — we read the
          conversation against it and count it exactly the way we count a theme.
        </p>
      ) : (
        <ul className="flex flex-col">
          {subjects.map((s) => <SubjectRow key={s.id} subject={s} canEdit={canEdit} />)}
        </ul>
      )}

      {canEdit && (adding ? (
        <div className="border-t border-border/70 pt-3">
          <NameForm onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${BUTTON} self-start`}>Add a subject</button>
      ))}
    </div>
  )
}
