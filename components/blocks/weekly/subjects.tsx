import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { DirectionWord } from '@/components/pages/overview/subjects'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import { candidateLine } from '@/lib/pages/overview'
import type { SideReading, SubjectRow } from '@/lib/pages/overview'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { WeeklyData } from '@/lib/pages/weekly'

// WR2 · Where things stand (design §3 WR section 2).
//
// OV2 AT REPORT WIDTH, OVER A STILL-FILLING MONTH — the same block, the same
// data, the same words. The report cannot say something the page cannot,
// because it is the page.
//
// WHAT WR2 ADDS IS THE CONTRIBUTION, AND IT IS NEVER A FIGURE OF ITS OWN.
// "category 24% (65 of 271) · +7 videos since the last update" is one reading
// with a note inside it about how much of it is new — which is the whole reason
// a weekly report may exist at all. A weekly SHARE would be the run-indexed
// reading the design exists to remove: one update holds ~117 videos and ~7 of
// your own, and nothing about a brand can be read weekly.
//
// WHERE THE CONTRIBUTION IS NOT RECORDED the row says so ONCE, under the table,
// rather than printing "+0 videos" per row — a zero there is a claim about the
// conversation, and the true claim is about our own bookkeeping (M4's window
// function is not applied).

function Side({ side, mode }: { side: SideReading | null; mode: RenderMode }): ReactNode {
  if (!side || !side.observed || side.pct == null) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>— not tracked</span>
      : <span className="text-[12px] text-muted-foreground">— not tracked</span>
  }
  const body = <><span data-copy="figure">{fmtPct(side.pct)}</span>{' '}<span data-copy="figure">{fmtInt(side.k ?? 0)} of {fmtInt(side.n ?? 0)}</span></>
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.ink }}>{body}</span>
    : <span className="font-mono text-[12px] tabular-nums">{body}</span>
}

function Contribution({ videos, mode }: { videos: number | undefined; mode: RenderMode }): ReactNode {
  if (videos == null) return null
  const body = `+${fmtInt(videos)} ${videos === 1 ? 'video' : 'videos'} since the last update`
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}> · {body}</span>
    : <span className="text-[11.5px] text-muted-foreground"> · {body}</span>
}

function Row({ row, contribution, rivalLabel, categoryLabel, mode }: {
  row: SubjectRow
  contribution: number | undefined
  rivalLabel: string | null
  categoryLabel: string
  mode: RenderMode
}) {
  const label = mode === 'email'
    ? <strong>{row.label}</strong>
    : <Link href={row.href} className="underline-offset-2 hover:underline">{row.label}</Link>
  const line = (
    <>
      you <Side side={row.you} mode={mode} /> · {rivalLabel ?? 'rival'} <Side side={row.rival} mode={mode} /> · {categoryLabel.toLowerCase()} <Side side={row.category} mode={mode} />
      <Contribution videos={contribution} mode={mode} />
    </>
  )
  const movement = (
    <>
      <BlockMovement verdict={row.category.verdict} unit="pts" mode={mode} /> <DirectionWord direction={row.direction} mode={mode} />
    </>
  )
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        {label}
        <div style={{ marginTop: 2 }}>{line}</div>
        <div style={{ marginTop: 2 }}>{movement}</div>
      </div>
    )
  }
  return (
    <div className="border-t border-border/70 py-1.5 text-[12.5px]">
      <span className="font-medium">{label}</span>
      <div className="mt-0.5">{line}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">{movement}</div>
    </div>
  )
}

export const weeklySubjects: Block<WeeklyData> = {
  key: 'weekly.subjects',
  title: 'Where things stand',
  question: 'How are we seen on the things we chose to be known for?',

  render(data, mode = 'app', ctx) {
    const s = data.subjects
    const href = `${ctx.appUrl}/dashboard/subjects`
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={weeklySubjects.title}
        question={weeklySubjects.question}
        mode={mode}
        meta={s.rows.length > 0 ? `${fmtInt(s.rows.length)} named · month to date` : undefined}
        footer={mode === 'email'
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Subjects →</a>
          : <Link href="/dashboard/subjects" className="hover:underline">Open Subjects →</Link>}
      >
        {children}
      </BlockFrame>
    )

    const empty = weeklySubjects.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const note = [s.note, data.contributions ? null : data.contributionsNote].filter(Boolean).join(' ')
    return frame(
      <div>
        {s.rows.map((r) => (
          <Row
            key={r.id}
            row={r}
            contribution={data.contributions?.[r.id]}
            rivalLabel={s.rivalLabel}
            categoryLabel={s.categoryLabel}
            mode={mode}
          />
        ))}
        {note
          ? mode === 'email'
            ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 }}>{note}</div>
            : <p className="m-0 mt-1.5 text-[11.5px] text-muted-foreground">{note}</p>
          : null}
      </div>,
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    for (const r of data.subjects.rows) {
      if (r.category.pct == null) continue
      out[`subject_${r.id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_share`] = {
        value: r.category.pct,
        unit: 'pct',
        label: `${r.label}, share of the category this month`,
      }
    }
    return out
  },

  verdicts(data): Verdict[] {
    return data.subjects.rows.flatMap((r) =>
      [r.you.verdict, r.rival?.verdict ?? null, r.category.verdict].filter((v): v is Verdict => v != null),
    )
  },

  emptyState(data) {
    const s = data.subjects
    if (s.state === 'not_recorded') return 'Your subjects are not recorded for this workspace yet.'
    if (s.state === 'candidates' || s.state === 'none') return candidateLine(s.candidates)
    return s.rows.length === 0 ? 'No subject carried a reading this month.' : null
  },
}
