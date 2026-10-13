import Link from 'next/link'
import type { ReactNode } from 'react'
import { Info, List } from 'lucide-react'
import { IconTile } from '@/components/colour-roles'
import { Card } from '@/components/pages/studio/ui'
import { AddSubjectButton, SubjectRowMenu } from '@/components/pages/subjects/editor'
import { fmtInt } from '@/lib/format'
import { SUBJECTS_NOT_APPLIED } from '@/lib/subjects/moves'
import { SUBJECT_WRITE_REFUSED } from '@/lib/subjects/types'
import type { FollowedSubject, SuggestedSubject, YourSubjectsView } from '@/lib/settings/your-subjects'
import { ConfirmSubject } from './confirm'

// Settings › Your subjects (depth redesign v2, T10c). There is no board for
// this tab; it is drawn in the E8 board's idiom (the note, a white card with a
// ruled table and the actions at the head) around the editor that lived on the
// Subjects page until Design v2 folded that page into Market: the "…" on every
// row (Confirm on a suggestion, Rename, Stop following) and "Add a subject",
// with their sheets, exactly as they were (components/pages/subjects/editor.tsx).
//
// THE GATE IS THE WRITE PATH'S, UNCHANGED (lib/actions/subjects.ts:
// `canManageTenant` on the three subject writes, M4's policies under it). The
// page draws the controls for owners and admins only; everyone else reads the
// lists. No tenant lock: subject writes never had one.
//
// SETTINGS, NOT READINGS: a subject's level and its months are Market's, and a
// followed subject's name links there.

const MUTED = 'text-[#5F656B]'
// The controls' column is a fixed width, the same in both cards, so the
// header and every row (each its own grid) share one set of columns.
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_140px]'

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] bg-[#F7F6F2] px-4 py-3.5 text-[14px] leading-[1.5] text-[#26292C]">
      <IconTile icon={Info} className="my-0 mt-px self-start" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Head({ title, sub, action }: { title: string; sub: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="m-0 text-[19px] font-semibold leading-[1.3] tracking-[-0.005em]">{title}</h2>
        <p className={`m-0 mt-0.5 text-[13px] leading-[1.4] ${MUTED}`}>{sub}</p>
      </div>
      {action}
    </div>
  )
}

function TableHead({ canEdit, second }: { canEdit: boolean; second: string }) {
  return (
    <div role="row" className={`${GRID} hidden border-b border-[#E4E2DC] pb-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] lg:grid ${MUTED}`}>
      <span role="columnheader">Subject</span>
      <span role="columnheader">{second}</span>
      <span role="columnheader">{canEdit ? <span className="sr-only">Change</span> : null}</span>
    </div>
  )
}

/** One subject's row: its name, what it covers (and, for a suggestion, where
 *  it came from), and its controls. */
function Row({ name, href, covers, because, controls }: { name: string; href?: string; covers: string | null; because?: string; controls?: ReactNode }) {
  return (
    <div role="row" className={`${GRID} gap-y-1.5 border-t border-[#ECEAE4] py-3.5 first:border-t-0 lg:items-center`}>
      <span role="rowheader" className="col-start-1 row-start-1 min-w-0 self-center text-[14.5px] font-semibold">
        {href ? <Link href={href} className="text-[#26292C] no-underline hover:underline hover:underline-offset-[3px]">{name}</Link> : name}
      </span>
      <div role="cell" className="col-span-2 col-start-1 row-start-2 min-w-0 text-[13.5px] leading-[1.45] lg:col-span-1 lg:col-start-2 lg:row-start-1">
        {covers ? <span className="text-[#26292C]">{covers}</span> : <span className={MUTED}>No description.</span>}
        {because ? <span className={`block text-[12.5px] ${MUTED}`}>Suggested because {because}.</span> : null}
      </div>
      <div role="cell" className="col-start-2 row-start-1 flex items-center justify-end gap-2 lg:col-start-3">{controls}</div>
    </div>
  )
}

function editable(s: FollowedSubject | SuggestedSubject) {
  return { id: s.id, name: s.name, description: s.description, status: s.status }
}

function Following({ view }: { view: YourSubjectsView }) {
  const n = view.activeCount
  return (
    <Card className="min-w-0 gap-4 px-[26px] py-6 max-sm:px-5">
      <Head
        title="Subjects you follow"
        sub={<><span data-copy="figure">{fmtInt(n)}</span> {n === 1 ? 'subject' : 'subjects'} you follow, up to <span data-copy="figure">{fmtInt(view.max)}</span></>}
        action={view.canEdit ? <AddSubjectButton activeCount={n} /> : null}
      />
      {view.following.length > 0 ? (
        <div role="table" aria-label="Subjects you follow" className="flex min-w-0 flex-col">
          <TableHead canEdit={view.canEdit} second="What it covers" />
          <div role="rowgroup">
            {view.following.map((s) => (
              <Row key={s.id} name={s.name} href={s.href} covers={s.description} controls={view.canEdit ? <SubjectRowMenu subject={editable(s)} /> : null} />
            ))}
          </div>
        </div>
      ) : (
        <p className={`m-0 text-[14px] ${MUTED}`}>
          {view.canEdit ? 'You follow no subject yet. Add one, or confirm a suggestion below.' : 'No subject is followed yet.'}
        </p>
      )}
      {!view.canEdit ? <p className={`m-0 text-[12.5px] ${MUTED}`}>{SUBJECT_WRITE_REFUSED}</p> : null}
    </Card>
  )
}

function Waiting({ view }: { view: YourSubjectsView }) {
  if (view.waiting.length === 0) return null
  const n = view.waiting.length
  return (
    <Card className="min-w-0 gap-4 px-[26px] py-6 max-sm:px-5">
      <Head
        title="Waiting for you"
        sub={<><span data-copy="figure">{fmtInt(n)}</span> {n === 1 ? 'suggestion' : 'suggestions'}. A suggestion is not counted until you confirm it.</>}
      />
      <div role="table" aria-label="Suggested subjects" className="flex min-w-0 flex-col">
        <TableHead canEdit={view.canEdit} second="What it covers" />
        <div role="rowgroup">
          {view.waiting.map((s) => (
            <Row
              key={s.id}
              name={s.name}
              covers={s.description}
              because={s.because}
              controls={view.canEdit ? <><ConfirmSubject id={s.id} name={s.name} /><SubjectRowMenu subject={editable(s)} /></> : null}
            />
          ))}
        </div>
      </div>
    </Card>
  )
}

/** The tab. `view` null: the subjects tables are not there yet. */
export function YourSubjectsTab({ view }: { view: YourSubjectsView | null }) {
  if (!view) {
    return (
      <Card className="max-w-[720px] gap-2 px-[26px] py-6 max-sm:px-5">
        <div className="flex items-center gap-2.5">
          <IconTile icon={List} />
          <h2 className="m-0 text-[17px] font-semibold leading-[1.3]">Your subjects</h2>
        </div>
        <p className={`m-0 text-[14px] leading-[1.5] ${MUTED}`}>{SUBJECTS_NOT_APPLIED}</p>
      </Card>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-5 text-[#26292C]">
      <Note>
        <b className="font-semibold">A subject is something your market talks about that you chose to follow.</b>{' '}
        Renaming one starts a fresh subject from today; what was already reported about it stays as it was.
      </Note>
      <Following view={view} />
      <Waiting view={view} />
    </div>
  )
}
