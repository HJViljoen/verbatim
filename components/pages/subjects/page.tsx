import type { ReactNode } from 'react'
import Link from 'next/link'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { quoteCite, type SubjectPaneView, type SubjectsRow, type SubjectsView } from '@/lib/pages/subjects-view'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { translationLabel, translationNote } from '@/components/quote-block'
import { AddSubjectButton, EditSubjectButton, SubjectRowMenu, type EditableSubject } from './editor'

// Subjects (pages rebuild, 1 Oct; Page-Subjects.dc.html). Built to the
// artboard: the list of every subject you follow on the left, with its editor;
// the open subject on the right (its standing in your market, what the week's
// read says about it, the conversations inside it and one quote), then what
// people say about it beside the questions they ask on it.
//
// PALETTE A, LOCALLY. The app's tokens are still the old brand (`--border`
// #DCDFE3, `--muted-foreground` #6B7075, `--inner` #F6F7F8), and the app-wide
// colour swap is a separate task, so the artboard's values are written here:
// ink #26292C, muted #5F656B, hair #E4E2DC, ground #F7F6F2, track #ECEAE4,
// yellow #FFD43B.
//
// NO EXPORT, NO CONTEXT LINE, NO VOICES (the artboard, and the owner's review
// of 1 Oct). The page module stays in the registry for stored snapshots
// (`subjectsPage`, ./index).

const CARD = 'flex flex-col rounded-[16px] bg-white'
const HAIR = 'border-[#E4E2DC]'

/** A bar against 100%, never against the top row. */
function Bar({ width, height }: { width: number; height: 8 | 10 }) {
  return (
    <div className={`min-w-0 flex-grow overflow-hidden bg-[#ECEAE4] ${height === 10 ? 'h-2.5 rounded-[5px]' : 'h-2 rounded-[4px]'}`}>
      <div className={`bg-[#FFD43B] ${height === 10 ? 'h-2.5' : 'h-2'}`} style={{ width: `${Math.max(0, Math.min(100, width))}%` }} />
    </div>
  )
}

function editable(r: Pick<SubjectsRow, 'id' | 'name' | 'description' | 'status'>): EditableSubject {
  return { id: r.id, name: r.name, description: r.description, status: r.status }
}

/** "Your subjects": every subject you follow, in one list. */
export function SubjectsList({ view }: { view: SubjectsView }) {
  return (
    <section aria-label="Your subjects" className={`${CARD} gap-3 px-5 pt-5 pb-[22px]`}>
      <h2 className="m-0 text-[17px] font-bold text-[#26292C]">Your subjects</h2>
      {view.rows.length > 0 ? (
        <ul className="m-0 -mx-2 flex list-none flex-col gap-0.5 p-0">
          {view.rows.map((r) => (
            <li
              key={r.id}
              className={`flex h-[42px] items-center justify-between gap-2 rounded-[8px] pr-1.5 pl-3 ${r.selected ? 'bg-[rgba(38,41,44,0.07)] font-bold' : 'font-medium'}`}
            >
              {r.href ? (
                <Link href={r.href} aria-current={r.selected ? 'true' : undefined} className="min-w-0 truncate text-[14px] text-[#26292C] no-underline hover:text-[#26292C]">
                  {r.name}
                </Link>
              ) : (
                <span className={`min-w-0 truncate text-[14px] ${r.status === 'proposed' ? 'text-[#5F656B]' : 'text-[#26292C]'}`}>{r.name}</span>
              )}
              {view.canEdit ? <SubjectRowMenu subject={editable(r)} /> : null}
            </li>
          ))}
        </ul>
      ) : view.canEdit ? null : (
        <p className="m-0 text-[14px] text-[#5F656B]">No subjects named yet.</p>
      )}
      {view.canEdit ? (
        <div className="pt-1">
          <AddSubjectButton activeCount={view.activeCount} />
        </div>
      ) : null}
    </section>
  )
}

/** The open subject: its name and what it covers, its standing, the read's
 *  sentence, the conversations inside it and one quote. */
export function SubjectLead({ pane, monthWords, canEdit, status }: { pane: SubjectPaneView; monthWords: string; canEdit: boolean; status: 'active' | 'proposed' }) {
  const left = pane.standing || pane.sentence || pane.contents.length > 0
  const body = left || pane.quote
  const note = pane.quote ? translationNote({ lang: pane.quote.lang, english: pane.quote.english }) : null
  const label = note ? translationLabel(note) : null
  const cite = pane.quote ? quoteCite(pane.quote) : ''
  return (
    <section aria-label={pane.name} className={`${CARD} gap-4 px-[30px] pt-[26px] pb-7`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex max-w-[760px] min-w-0 flex-col gap-1.5">
          <h2 className="m-0 text-[26px] font-bold text-[#26292C]">{pane.name}</h2>
          {pane.covers ? <p className="m-0 text-[14px] leading-[1.5] text-[#5F656B]">{pane.covers}</p> : null}
        </div>
        {canEdit ? <EditSubjectButton subject={{ id: pane.id, name: pane.name, description: pane.description, status }} /> : null}
      </div>
      {body ? (
        <div className={`grid grid-cols-1 items-start gap-8 border-t pt-1.5 ${HAIR} ${left && pane.quote ? 'xl:grid-cols-2' : ''}`}>
          {left ? (
            <div className="flex min-w-0 flex-col gap-3 pt-4">
              {pane.standing ? (
                <>
                  <div className="flex items-baseline gap-2.5">
                    <span data-copy="figure" className="shrink-0 font-mono text-[34px] font-medium text-[#26292C]">{pane.standing.value}</span>
                    <span className="min-w-0 text-[14px] text-[#5F656B]">
                      of the <span data-copy="figure">{fmtInt(pane.standing.n)}</span> videos in your market in {monthWords}
                      {pane.standing.rank ? `, ${pane.standing.rank} subject` : ''}
                    </span>
                  </div>
                  <div className="flex"><Bar width={pane.standing.width} height={10} /></div>
                </>
              ) : null}
              {pane.sentence ? (
                <p data-copy="stored" data-slot="week_read" className="m-0 mt-1 text-[16px] leading-[1.6] text-[#26292C]">{pane.sentence}</p>
              ) : null}
              {pane.contents.length > 0 ? (
                <div className="flex flex-col gap-2 pt-1">
                  <div className="text-[12px] font-semibold text-[#5F656B]">Conversations inside it</div>
                  <div className="flex flex-wrap gap-1.5">
                    {pane.contents.map((c) => (
                      <span key={c} data-copy="subject" data-slot="pass_b_theme" className="inline-flex items-center rounded-full bg-[#F7F6F2] px-2.5 py-[5px] text-[13px] leading-[1.3] text-[#26292C]">{c}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {pane.quote ? (
            <div className="min-w-0 pt-4">
              <figure className="m-0 flex flex-col gap-2 rounded-[12px] bg-[#F7F6F2] px-[18px] py-4">
                <blockquote data-copy="quote" className="m-0 font-serif text-[16px] leading-[1.5] text-[#26292C] italic">“{pane.quote.text}”</blockquote>
                {label ? <div className="text-[12px] text-[#5F656B]">{label}</div> : null}
                {note?.english ? <p data-copy="quote" className="m-0 font-serif text-[14px] leading-[1.5] text-[#5F656B]">{note.english}</p> : null}
                {cite ? <figcaption className="text-[12px] text-[#5F656B]">{cite}</figcaption> : null}
              </figure>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function CardHead({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="m-0 text-[20px] font-bold text-[#26292C]">{title}</h3>
      <div className="text-[13px] text-[#5F656B]">{sub}</div>
    </div>
  )
}

/** "What people say about it": the kinds, on the subject's own videos. */
export function SubjectSays({ pane, monthWords }: { pane: SubjectPaneView; monthWords: string }) {
  const k = pane.kinds
  if (!k || k.rows.length === 0) return null
  return (
    <section aria-label="What people say about it" className={`${CARD} min-w-0 gap-3 px-7 pt-6 pb-5`}>
      <CardHead
        title="What people say about it"
        sub={<>{k.share ? 'Share of' : 'Of'} its <span data-copy="figure">{fmtInt(k.of)}</span> videos in {monthWords}</>}
      />
      <div className="flex flex-col">
        {k.rows.map((r) => (
          <div key={r.kind} className={`flex items-center gap-3.5 border-t py-2 ${HAIR}`}>
            <div className="w-[200px] shrink-0 text-[14px] text-[#26292C] max-sm:w-[150px]">{r.label}</div>
            <Bar width={r.width} height={8} />
            <div data-copy="figure" className="w-10 shrink-0 text-right font-mono text-[14px] font-medium text-[#26292C]">{r.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** "Questions people ask on it", named by the conversation they belong to. */
export function SubjectAsks({ pane }: { pane: SubjectPaneView }) {
  const q = pane.questions
  if (!q || q.rows.length === 0) return null
  return (
    <section aria-label="Questions people ask on it" className={`${CARD} min-w-0 gap-3 px-7 pt-6 pb-5`}>
      <CardHead
        title="Questions people ask on it"
        sub={<><span data-copy="figure">{fmtInt(q.videos)}</span> of its videos carry a question. Asked most:</>}
      />
      <div className="flex flex-col">
        {q.rows.map((r) => (
          <div key={r.id} className={`flex justify-between gap-3 border-t py-2.5 text-[14px] ${HAIR}`}>
            <span data-copy="subject" data-slot="pass_b_theme" className="font-semibold text-[#26292C]">{r.label}</span>
            <span className="shrink-0 text-[#5F656B]">
              <span data-copy="figure" className="font-mono text-[#26292C]">{fmtInt(r.videos)}</span> {r.videos === 1 ? 'video' : 'videos'}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** U2: a workspace with nothing read yet gets one neutral line. */
export const SUBJECTS_FIRST_RUN = 'Your market’s first month will appear here.'

export function SubjectsPage({ view }: { view: SubjectsView | null }) {
  const title = surface('subjects').label
  if (!view) {
    return (
      <PageFrame className="gap-[22px]">
        <PageBar title={title} />
        <section className={`${CARD} px-5 pt-5 pb-[22px]`}>
          <p className="m-0 text-[14px] text-[#5F656B]">{SUBJECTS_FIRST_RUN}</p>
        </section>
      </PageFrame>
    )
  }
  const pane = view.pane
  const status = pane ? view.rows.find((r) => r.id === pane.id)?.status ?? 'active' : 'active'
  const says = pane?.kinds && pane.kinds.rows.length > 0 ? <SubjectSays pane={pane} monthWords={view.monthWords} /> : null
  const asks = pane?.questions && pane.questions.rows.length > 0 ? <SubjectAsks pane={pane} /> : null
  return (
    <PageFrame className="gap-[22px]">
      <PageBar title={title} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        <SubjectsList view={view} />
        {pane ? (
          <div className="flex min-w-0 flex-col gap-5">
            <SubjectLead pane={pane} monthWords={view.monthWords} canEdit={view.canEdit} status={status} />
            {says || asks ? (
              <div className={`grid grid-cols-1 items-start gap-5 ${says && asks ? 'xl:grid-cols-2' : ''}`}>
                {says}
                {asks}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </PageFrame>
  )
}
