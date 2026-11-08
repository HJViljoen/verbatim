import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card } from '@/components/pages/studio/ui'
import { EMPTY, TBL, TD, TH } from '@/components/v2/look'
import { AddSubjectButton, SubjectRowMenu } from '@/components/pages/subjects/editor'
import { fmtInt } from '@/lib/format'
import { SUBJECTS_NOT_APPLIED } from '@/lib/subjects/moves'
import { SUBJECT_WRITE_REFUSED } from '@/lib/subjects/types'
import { SUBJECTS_HELD } from '@/lib/tenant-locks'
import type { FollowedSubject, SuggestedSubject, YourSubjectsView } from '@/lib/settings/your-subjects'
import { cn } from '@/lib/utils'
import { ConfirmSubject } from './confirm'

// Settings › Your subjects (depth redesign v2, T10c). There is no board for
// this tab; it is drawn in the E8 board's idiom (the note, a white card with a
// ruled table and the actions at the head) around the editor that lived on the
// Subjects page until Design v2 folded that page into Market: the "…" on every
// row (Confirm on a suggestion, Rename, Stop following) and "Add a subject",
// with their sheets, exactly as they were (components/pages/subjects/editor.tsx).
//
// THE GATE IS THE WRITE PATH'S (lib/actions/subjects.ts: `canManageTenant`
// on the three subject writes, M4's policies under it, then the tenant lock).
// The page draws the controls for owners and admins only; everyone else reads
// the lists. SINCE DECISION 7 (13 Oct) THE TENANT LOCK HOLDS SUBJECTS TOO: a
// locked tenant's owner or admin (Sealand during its trial) sees the lock's
// line (`SUBJECTS_HELD`) and every control disabled before anything is
// submitted, as Settings › Your products does; the operator is not held.
//
// SETTINGS, NOT READINGS: a subject's level and its months are Market's, and a
// followed subject's name links there.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings-Subjects.dc.html): the note a plain
// tile with no icon; each list a real table (Subject, What it covers, and a
// visible "Change" head over the controls), stacked below 1024 as the div
// grid was (decision 14); the name an underlined link; "Rename or stop" a
// white button in words; the empty and not-applied lines in the dashed box.

const LEAD = 'm-0 mt-1.5 text-[15px] leading-[1.55] text-secondary-foreground'
// The table's own stacking point (lg, as the div grid before it): below it a
// row is a grid, the name and its controls on the first line, what it covers
// under them.
const T_ROW = 'max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-4 max-lg:gap-y-1.5 max-lg:border-t max-lg:border-track max-lg:py-3.5'
const T_CELL = 'max-lg:border-0 max-lg:p-0'

function Note({ children }: { children: ReactNode }) {
  return <Card className="px-6 py-[18px] text-[15px] leading-[1.6] text-secondary-foreground max-sm:px-[18px]"><p className="m-0">{children}</p></Card>
}

function Head({ title, sub, action }: { title: string; sub: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="m-0 text-[21px] font-semibold leading-[1.3]">{title}</h2>
        <p className={LEAD}>{sub}</p>
      </div>
      {action}
    </div>
  )
}

/** A list of subjects: a real table, its "Change" head visible where there
 *  are controls under it. */
function SubjectTable({ label, canEdit, children }: { label: string; canEdit: boolean; children: ReactNode }) {
  return (
    <table aria-label={label} className={cn(TBL, 'mt-[18px] max-lg:block')}>
      <thead className="max-lg:hidden">
        <tr>
          <th scope="col" className={cn(TH, 'w-[26%]')}>Subject</th>
          <th scope="col" className={TH}>What it covers</th>
          {canEdit ? <th scope="col" className={cn(TH, 'w-[150px] pr-0 text-right')}>Change</th> : null}
        </tr>
      </thead>
      <tbody className="max-lg:block">{children}</tbody>
    </table>
  )
}

/** One subject's row: its name, what it covers (and, for a suggestion, where
 *  it came from), and its controls. */
function Row({ name, href, covers, because, controls }: { name: string; href?: string; covers: string | null; because?: string; controls?: ReactNode }) {
  return (
    <tr className={T_ROW}>
      <th scope="row" className={cn(TD, T_CELL, 'text-left text-[16px] font-semibold lg:py-[18px] max-lg:col-start-1 max-lg:row-start-1 max-lg:self-center')}>
        {href ? <Link href={href} className="text-foreground underline decoration-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground max-sm:inline-block max-sm:min-h-11 max-sm:content-center">{name}</Link> : name}
      </th>
      <td className={cn(TD, T_CELL, 'leading-[1.6] text-secondary-foreground lg:py-[18px] max-lg:col-span-2 max-lg:row-start-2')}>
        {covers ? covers : <span className="text-muted-foreground">No description.</span>}
        {because ? <span className="mt-1 block text-[14px] text-muted-foreground">Suggested because {because}.</span> : null}
      </td>
      {controls ? (
        <td className={cn(TD, T_CELL, 'pr-0 text-right max-lg:col-start-2 max-lg:row-start-1')}>
          <div className="flex items-center justify-end gap-2">{controls}</div>
        </td>
      ) : null}
    </tr>
  )
}

function editable(s: FollowedSubject | SuggestedSubject) {
  return { id: s.id, name: s.name, description: s.description, status: s.status }
}

function Following({ view }: { view: YourSubjectsView }) {
  const n = view.activeCount
  return (
    <Card className="min-w-0 p-[30px] max-sm:p-[18px]">
      <Head
        title="Subjects you follow"
        sub={<><span data-copy="figure">{fmtInt(n)}</span> {n === 1 ? 'subject' : 'subjects'} you follow, up to <span data-copy="figure">{fmtInt(view.max)}</span></>}
        action={view.canEdit ? <AddSubjectButton activeCount={n} locked={view.locked} /> : null}
      />
      {view.following.length > 0 ? (
        <SubjectTable label="Subjects you follow" canEdit={view.canEdit}>
          {view.following.map((s) => (
            <Row key={s.id} name={s.name} href={s.href} covers={s.description} controls={view.canEdit ? <SubjectRowMenu subject={editable(s)} locked={view.locked} /> : null} />
          ))}
        </SubjectTable>
      ) : (
        <p className={cn(EMPTY, 'm-0 mt-[18px]')}>
          {view.canEdit ? 'You follow no subject yet. Add one, or confirm a suggestion below.' : 'No subject is followed yet.'}
        </p>
      )}
      {!view.canEdit ? <p className="m-0 mt-4 text-[14px] leading-[1.5] text-muted-foreground">{SUBJECT_WRITE_REFUSED}</p> : null}
    </Card>
  )
}

function Waiting({ view }: { view: YourSubjectsView }) {
  if (view.waiting.length === 0) return null
  const n = view.waiting.length
  return (
    <Card className="min-w-0 p-[30px] max-sm:p-[18px]">
      <Head
        title="Waiting for you"
        sub={<><span data-copy="figure">{fmtInt(n)}</span> {n === 1 ? 'suggestion' : 'suggestions'}. A suggestion is not counted until you confirm it.</>}
      />
      <SubjectTable label="Suggested subjects" canEdit={view.canEdit}>
        {view.waiting.map((s) => (
          <Row
            key={s.id}
            name={s.name}
            covers={s.description}
            because={s.because}
            controls={view.canEdit ? <><ConfirmSubject id={s.id} name={s.name} locked={view.locked} /><SubjectRowMenu subject={editable(s)} locked={view.locked} /></> : null}
          />
        ))}
      </SubjectTable>
    </Card>
  )
}

/** The tab. `view` null: the subjects tables are not there yet. */
export function YourSubjectsTab({ view }: { view: YourSubjectsView | null }) {
  if (!view) {
    return (
      <Card className="max-w-[720px] gap-3 p-[26px] max-sm:p-[18px]">
        <h2 className="m-0 text-[21px] font-semibold leading-[1.3]">Your subjects</h2>
        <p className={cn(EMPTY, 'm-0')}>{SUBJECTS_NOT_APPLIED}</p>
      </Card>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-5 text-foreground">
      <Note>
        <b className="font-semibold text-foreground">A subject is something your market talks about that you chose to follow.</b>{' '}
        {/* A locked tenant's owner or admin reads the lock's line in place of
            how to rename, before anything is submitted (decision 7). */}
        {view.locked ? SUBJECTS_HELD : 'Renaming one starts a fresh subject from today; what was already reported about it stays as it was.'}
      </Note>
      <Following view={view} />
      <Waiting view={view} />
    </div>
  )
}
