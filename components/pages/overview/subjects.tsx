import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { Sparkline } from '@/components/charts/sparkline'
import { fmtInt, fmtPct } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { Direction } from '@/lib/reading/bands'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { OverviewData, SideReading, SubjectRow } from '@/lib/pages/overview'
import { candidateLine, monthlyLineLabel } from '@/lib/pages/overview'

// OV2 · Your subjects — the hero (design §3 OV2).
//
// THE CATEGORY COLUMN IS PROMOTED, and that is the block's whole argument: on
// the paying tenant your own audience carries 84 videos in a month and the
// category carries 1,388, so the only side of the three that can carry a
// monthly change is the category — and a hero that printed only your own side
// would print "too few to compare" every month for ever. Your side is still
// shown, as a LEVEL with its count, because the level is real; what it may not
// carry is a change.

/**
 * The direction word, and the only node allowed to print one.
 *
 * `Direction` is earned by `directionWord` (lib/reading/bands.ts) over three
 * consecutive months in one clustering regime, each clearing both floors — it
 * is not read off a single comparison, and it is not the `RUN_INDEXED` word the
 * direction map gates. Marked `verdict` so the copy contract can see that the
 * word has a reading behind it (rule (c)).
 */
export function DirectionWord({ direction, mode = 'app' }: { direction: Direction | null; mode?: RenderMode }) {
  if (!direction) return null
  if (mode === 'email') {
    return <span data-copy="verdict" style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted }}>{direction}, 3 months</span>
  }
  return <span data-copy="verdict" className="text-[11px] text-muted-foreground">{direction}, 3 months</span>
}

/** One side's level: the share and the count it rests on, or the honest
 *  absence. Never a 0% for a side nothing was read for. */
function Side({ side, mode = 'app' }: { side: SideReading | null; mode?: RenderMode }): ReactNode {
  if (!side || !side.observed || side.pct == null) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>— not tracked</span>
      : <span className="text-[12px] text-muted-foreground">— not tracked</span>
  }
  const body = (
    <>
      <span data-copy="figure">{fmtPct(side.pct)}</span>{' '}
      <span data-copy="figure">{fmtInt(side.k ?? 0)} of {fmtInt(side.n ?? 0)}</span>
    </>
  )
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.ink }}>{body}</span>
    : <span className="font-mono text-[12px] tabular-nums">{body}</span>
}

function Row({ row, mode }: { row: SubjectRow; mode: RenderMode }) {
  return (
    <tr>
      <td className="py-1.5 pr-3 align-top text-[12.5px] font-medium">
        <Link href={row.href} className="underline-offset-2 hover:underline">{row.label}</Link>
      </td>
      <td className="py-1.5 pr-3 align-top"><Side side={row.you} mode={mode} /></td>
      <td className="py-1.5 pr-3 align-top"><Side side={row.rival} mode={mode} /></td>
      <td className="py-1.5 pr-3 align-top"><Side side={row.category} mode={mode} /></td>
      <td className="py-1.5 pr-3 align-top"><BlockMovement verdict={row.you.verdict} unit="pts" mode={mode} /></td>
      <td className="py-1.5 pr-3 align-top">
        <span className="flex flex-wrap items-center gap-1.5">
          <BlockMovement verdict={row.category.verdict} unit="pts" mode={mode} />
          <DirectionWord direction={row.direction} mode={mode} />
        </span>
      </td>
      <td className="py-1.5 align-top">
        {/* TWO READINGS ARE NOT A TREND. Sparkline normalises to the min and
            max of what it is handed, so 19.0% → 19.2% and 5% → 40% draw the
            same full-amplitude climb — a claim the row has not earned, under a
            column headed "Monthly line". The mock refuses the case in words
            and so does this (lib/pages/overview.ts monthlyLineLabel). */}
        {monthlyLineLabel(row.spark, row.sparkMonths) ? (
          <span className="font-mono text-[10.5px] text-muted-foreground">{monthlyLineLabel(row.spark, row.sparkMonths)}</span>
        ) : (
          <Sparkline values={row.spark} color="var(--cat)" width={72} height={20} animate={false} />
        )}
      </td>
    </tr>
  )
}

export const overviewSubjects: Block<OverviewData> = {
  key: 'overview.subjects',
  title: 'Your subjects',
  question: 'How are we seen on the things we chose to be known for?',

  render(data, mode = 'app', ctx) {
    const s = data.subjects
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/subjects`
    const footer = email
      ? <a href={href} style={{ color: EMAIL.ink }}>Open Subjects →</a>
      : <Link href={href} className="hover:underline">Open Subjects →</Link>
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={overviewSubjects.title}
        question={overviewSubjects.question}
        mode={mode}
        meta={s.rows.length > 0 ? `${fmtInt(s.rows.length)} named · share of videos where the subject came up` : undefined}
        footer={footer}
      >
        {children}
      </BlockFrame>
    )

    const empty = overviewSubjects.emptyState(data)
    if (empty) {
      return frame(
        <>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
          {s.candidates.length > 0 ? (
            <ul className={email ? undefined : 'm-0 flex list-none flex-col gap-1 p-0'}>
              {s.candidates.map((c) => (
                <li key={c.name} className={email ? undefined : 'text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
                  {c.name} — <span className={email ? undefined : 'text-muted-foreground'} style={email ? { color: EMAIL.muted } : undefined}>{c.because}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>,
      )
    }

    if (email) {
      return frame(
        <div>
          {s.rows.map((r) => (
            <div key={r.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
              <strong>{r.label}</strong>
              <div style={{ marginTop: 2 }}>
                you <Side side={r.you} mode={mode} /> · {s.rivalLabel ?? 'rival'} <Side side={r.rival} mode={mode} /> · {s.categoryLabel.toLowerCase()} <Side side={r.category} mode={mode} />
              </div>
              <div style={{ marginTop: 2 }}>
                <BlockMovement verdict={r.category.verdict} unit="pts" mode={mode} /> <DirectionWord direction={r.direction} mode={mode} />
              </div>
            </div>
          ))}
          {s.note ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 }}>{s.note}</div> : null}
        </div>,
      )
    }

    return frame(
      <>
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <th className="py-1 pr-3 font-semibold">Subject</th>
                <th className="py-1 pr-3 font-semibold">You</th>
                <th className="py-1 pr-3 font-semibold">{s.rivalLabel ?? 'Lead rival'}</th>
                <th className="py-1 pr-3 font-semibold">{s.categoryLabel}</th>
                <th className="py-1 pr-3 font-semibold">Your change</th>
                <th className="py-1 pr-3 font-semibold">Category change</th>
                <th className="py-1 font-semibold">Monthly line</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {s.rows.map((r) => <Row key={r.id} row={r} mode={mode} />)}
            </tbody>
          </table>
        </div>
        {s.note ? <p className="m-0 text-[11.5px] text-muted-foreground">{s.note}</p> : null}
      </>,
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    // The hero's own numbers: each subject's category share, which is the side
    // that carries the month. The other two sides are levels on the row and are
    // not figures a model may cite about movement.
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
