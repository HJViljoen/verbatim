import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import type { QuarterlyData, SubjectQuarterRow } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Figure, Note, Row } from './parts'

// QR3 · Your subjects, quarter on quarter (mock page 3).
//
// FOUR COLUMNS, TWO PERIODS, AND THE PAGE SAYS WHICH IS WHICH. The month
// columns are a level — this month's share with its denominator — and the
// quarter columns are a banded comparison of this quarter against the one
// before it. The mock prints them side by side, which is right, and is exactly
// the arrangement that would let a reader take a month figure for a quarter
// figure if the header did not say so. It does.
//
// A QUARTER COLUMN BELOW SIX READINGS IS `baseline_forming`, not blank and not
// zero. `quarterChange` returns that state itself; the badge prints its word,
// and the gate sentence is printed once under the table rather than once per
// row.

function Side({ side, mode }: { side: SubjectQuarterRow['you']; mode: RenderMode }): ReactNode {
  if (!side) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>— not read</span>
      : <span className="text-[12px] text-muted-foreground">— not read</span>
  }
  return <Figure mode={mode} value={side.pct == null ? '—' : fmtPct(side.pct)} of={`${fmtInt(side.k)} of ${fmtInt(side.n)}`} />
}

/** Which side a quarter badge belongs to. Code's word, so it is not marked. */
function Side2({ children, mode }: { children: ReactNode; mode: RenderMode }): ReactNode {
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{children}</span>
    : <span className="text-[11.5px] text-muted-foreground">{children}</span>
}

export const quarterlySubjects: Block<QuarterlyData> = {
  key: 'quarterly.subjects',
  title: QUARTER_PAGE_TITLE.subjects,
  question: QUARTER_PAGE_QUESTION.subjects,

  render(data, mode = 'app') {
    const s = data.subjects
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlySubjects.title}
        question={quarterlySubjects.question}
        mode={mode}
        meta={`${quarterLabel(data.quarter, false)} against ${quarterLabel(data.prior, false)}`}
      >
        {children}
      </BlockFrame>
    )
    const empty = quarterlySubjects.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    return frame(
      <div>
        {/* AND WHETHER THAT MONTH IS EVEN IN THE QUARTER. Under a heading
            reading "Q3 2026 against Q2 2026", naming October is not the same
            as saying October falls outside Q3 — which is what a reader takes
            two month-level columns to mean. `monthOutsideNote` is the same
            sentence the cover and the category page print. */}
        <Note mode={mode} tone="body">
          The first two columns are {s.monthLabel} on its own. The last two are this quarter against the one before it.
          {s.monthNote ? ` ${s.monthNote}` : ''}
        </Note>
        {s.rows.map((row) => (
          <Row
            key={row.id}
            mode={mode}
            label={row.label}
            // EACH BADGE SAYS WHOSE IT IS, IN THE ROW'S OWN ORDER. Two
            // unlabelled badges in the opposite order to the body ("you … the
            // category …") leave the reader to guess which side moved.
            aside={
              row.youQuarter || row.categoryQuarter ? (
                <>
                  <Side2 mode={mode}>you</Side2>{' '}
                  {row.youQuarter ? <BlockMovement verdict={row.youQuarter} unit="pts" mode={mode} /> : <Side2 mode={mode}>— not read</Side2>}{' '}
                  <Side2 mode={mode}>the category</Side2>{' '}
                  {row.categoryQuarter ? <BlockMovement verdict={row.categoryQuarter} unit="pts" mode={mode} /> : <Side2 mode={mode}>— not read</Side2>}
                </>
              ) : undefined
            }
          >
            you <Side side={row.you} mode={mode} /> · the category <Side side={row.category} mode={mode} />
          </Row>
        ))}
        {s.note ? <Note mode={mode}>{s.note}</Note> : null}
        {s.quarterNote ? <Note mode={mode}>{s.quarterNote}</Note> : null}
        {s.gate ? <Note mode={mode}>{s.gate} Until then the quarter columns say so rather than printing a change.</Note> : null}
      </div>,
    )
  },

  verdicts(data) {
    return data.subjects.rows.flatMap((r) => [r.youQuarter, r.categoryQuarter].filter((v): v is NonNullable<typeof v> => v != null))
  },

  emptyState(data) {
    const s = data.subjects
    if (s.notRecorded) return s.notRecorded
    if (s.rows.length === 0) return 'No subject has been named for this workspace yet, so there is nothing to compare quarter on quarter.'
    return null
  },
}
