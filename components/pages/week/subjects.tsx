import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockRanked } from '@/components/blocks/bars'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, longMonth } from '@/lib/format'
import { type SubjectWeekRow, type WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'

// WK §2 · This week in your subjects (the mock's §3; OV2 at update length).
//
// A MONTH-TO-DATE READING WITH THIS UPDATE'S CONTRIBUTION MARKED INSIDE IT, and
// that composition is the whole point. The subjects table on Overview answers
// "how are we seen on this subject this month"; the same table here answers
// "and what did the update you are looking at put into it". Printing the week
// alone would be a period figure computed over a week, which the design's own
// non-negotiable forbids; printing the month alone would make This week a copy
// of Overview.
//
// So every row is `k of n` FOR THE MONTH — the level, with its denominator, as
// rule (b) requires — and carries "+N videos since the last update" beside it.
// The second number is a count and not a share: it is what arrived, and a share
// of a window would invite the reader to compare it with the month's share,
// which is two different denominators.
//
// WHEN NOTHING IS RECORDED IT SAYS SO. Subjects are M4 and the table does not
// exist on production yet. A block that drew an empty table there would be
// saying this workspace cares about nothing.

export const weekSubjects: Block<WeekData> = {
  key: 'week.subjects',
  title: 'This week in your subjects',
  question: 'What did this update add to what you told us you care about?',

  render(data, mode = 'app', ctx) {
    const s = data.subjects
    const email = mode === 'email'
    const empty = weekSubjects.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/subjects`
    const max = Math.max(1, ...s.rows.map((r) => r.monthVideos))

    return (
      <BlockFrame
        title={weekSubjects.title}
        question={weekSubjects.question}
        mode={mode}
        meta={`${longMonth(s.month)} so far${data.monthStatus === 'filling' ? ' · still filling' : ''}`}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Subjects →</a>
          : <Link href={href} className="hover:underline">Open Subjects →</Link>}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {s.rows.length > 0 ? (
          <>
            <BlockRanked
              mode={mode}
              rows={s.rows.map((r) => ({
                label: r.label,
                pct: (r.monthVideos / max) * 100,
                color: 'var(--you)',
                count: <Level row={r} />,
                badge: <Added row={r} />,
              }))}
            />
            <p
              className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
              style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 } : undefined}
            >
              Videos in your own audience carrying each subject this month, with what this update added.
            </p>
          </>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    for (const r of data.subjects.rows) {
      out[`subject_${r.id}_videos`] = { value: r.monthVideos, unit: 'videos', label: `${r.label} — videos this month` }
      if (r.addedVideos != null) {
        out[`subject_${r.id}_added`] = { value: r.addedVideos, unit: 'videos', label: `${r.label} — videos this update added` }
      }
    }
    return out
  },

  emptyState(data) {
    return data.subjects.unread
  },
}

/** The level, with the denominator it is a level of. A calibrated count on its
 *  own is a score, and this product shows no scores (copy contract rule (b)). */
function Level({ row }: { row: SubjectWeekRow }) {
  return (
    <span data-copy="level">
      {fmtInt(row.monthVideos)} of {fmtInt(row.monthOf)} videos
      {row.monthOf > 0 ? ` · ${fmtPct((row.monthVideos / row.monthOf) * 100, 0)}` : ''}
    </span>
  )
}

/**
 * What THIS update put in.
 *
 * A COUNT, MARKED AS A VERDICT, AND NOT A DIRECTION. "+14 videos since the last
 * update" says what arrived; it does not say the subject is growing, because
 * one update against one update is two readings of an incompletely filled
 * month. The marker is there because the plus sign is movement vocabulary to a
 * reader's eye even when it is not to the scrubber's.
 */
function Added({ row }: { row: SubjectWeekRow }) {
  if (row.addedVideos == null) return null
  return <span data-copy="verdict">+{fmtInt(row.addedVideos)} this update</span>
}
