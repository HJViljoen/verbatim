import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
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
// THE ARTBOARD'S GRID, PORTED (block D wave 2). 150px of label · a bar · the
// figure in its own right-hand column, with the row's second line carrying what
// the mock puts under the label and under the bar. What it printed before was
// three sides wrapped into one sentence at body scale, so the subject a reader
// came for and the number they came for had the same weight as the punctuation
// between them.
//
// THE LEADING FIGURE IS THE MONTH SHARE (mock-gap §6 D6). The mock's row is a
// WEEK COUNT against a typical week — 31, typical week 22, "above typical" —
// and the per-subject week count needs M3's `window_denominators`, which is not
// applied. A week count is also not what this artefact measures: every share
// here is the month so far, and the week is how much of it arrived since the
// last update. So the column carries the category's share with its "of N", and
// the bar is drawn from that share.
//
// THERE IS NO TYPICAL-WEEK TICK, and the mock's is the one thing on this row
// nothing computes. `typicalTag` (lib/pages/week.ts) tags a row on the This
// week PAGE from a windowed read this artefact does not load; drawing a mark
// with nothing behind it would be the only unmeasured pixel on the artefact.
// The legend under the rows says what the bar IS instead, which is the fact a
// reader needs to read it.
//
// WHAT WR2 ADDS IS THE CONTRIBUTION, AND IT IS NEVER A FIGURE OF ITS OWN.
// "+7 videos since the last update" is one reading with a note inside it about
// how much of it is new — which is the whole reason a weekly report may exist
// at all. A weekly SHARE would be the run-indexed reading the design exists to
// remove: one update holds ~117 videos and ~7 of your own.
//
// WHERE THE CONTRIBUTION IS NOT RECORDED the block says so ONCE, under the
// table, rather than printing "+0 videos" per row — a zero there is a claim
// about the conversation, and the true claim is about our own bookkeeping
// (M3's window function is not applied).

function Side({ side, mode }: { side: SideReading | null; mode: RenderMode }): ReactNode {
  if (!side || !side.observed || side.pct == null) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.faint }}>— not tracked</span>
      : <span className="text-[11px] text-muted-foreground">— not tracked</span>
  }
  const body = <><span data-copy="figure">{fmtPct(side.pct)}</span>{' '}<span data-copy="figure">{fmtInt(side.k ?? 0)} of {fmtInt(side.n ?? 0)}</span></>
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.ink2 }}>{body}</span>
    : <span className="font-mono text-[11px] tabular-nums text-secondary-foreground">{body}</span>
}

function Contribution({ videos, mode }: { videos: number | undefined; mode: RenderMode }): ReactNode {
  if (videos == null) return null
  const body = `+${fmtInt(videos)} ${videos === 1 ? 'video' : 'videos'} since the last update`
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.faint, marginTop: 3 }}>{body}</div>
    : <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{body}</div>
}

/** The bar, scaled against the largest share in the table — a ranked list is
 *  about order and relative size, and scaling six subjects against 100% of the
 *  category draws six stubs. The mock's own bars are scaled the same way. */
function Bar({ share, mode }: { share: number; mode: RenderMode }) {
  const w = Math.max(2, Math.min(100, Math.round(share)))
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
        <tbody>
          <tr>
            <td width={`${w}%`} height={10} style={{ background: EMAIL.cat, height: 10, fontSize: 1, lineHeight: '10px', borderRadius: 10 }}>&nbsp;</td>
            {w < 100 ? <td style={{ background: EMAIL.hairline, height: 10, fontSize: 1, lineHeight: '10px', borderRadius: 10 }}>&nbsp;</td> : null}
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <span className="block h-[10px] w-full overflow-hidden rounded-full bg-border/60">
      <span className="block h-full rounded-full bg-cat" style={{ width: `${w}%` }} />
    </span>
  )
}

function Row({ row, contribution, rivalLabel, share, mode, appUrl }: {
  row: SubjectRow
  contribution: number | undefined
  rivalLabel: string | null
  /** 0–100, the bar's width against the table's largest share. */
  share: number
  mode: RenderMode
  appUrl: string
}) {
  const label = mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 13.5, color: EMAIL.ink }}>{row.label}</span>
    : <Link href={`${appUrl}${row.href}`} className="text-[13.5px] underline-offset-2 hover:underline">{row.label}</Link>
  const figure = (
    <FigureCell
      mode={mode}
      align="right"
      value={row.category.pct == null ? '—' : fmtPct(row.category.pct)}
      of={row.category.pct == null ? undefined : `${fmtInt(row.category.k ?? 0)} of ${fmtInt(row.category.n ?? 0)}`}
    />
  )
  // EVERY WORD IN THE EMAIL ARM CARRIES ITS OWN FONT. "you" and the rival's
  // name went in as BARE TEXT NODES inside a `<td>` that declared none, and
  // `<body>` sets a family with no size — so in an email, where nothing
  // inherits past an explicit rule, both fell to the client's default: 16px in
  // most webmail and 11pt Calibri in Outlook, beside 11px mono figures and a
  // 13.5px label. The row shouted the two words carrying no measurement and
  // whispered the four that do, and how loudly depended on the client. The app
  // arm wrapped the identical fragment at `text-[11px]`, which is why only the
  // email was wrong.
  const sides = mode === 'email'
    ? (
        <span style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted }}>
          you <Side side={row.you} mode={mode} /> · {rivalLabel ?? 'rival'} <Side side={row.rival} mode={mode} />
        </span>
      )
    : (
        <>
          you <Side side={row.you} mode={mode} /> · {rivalLabel ?? 'rival'} <Side side={row.rival} mode={mode} />
        </>
      )
  // `good="neutral"` — A SHARE OF THE CATEGORY HAS NO FAVOURABLE DIRECTION.
  // The badge coloured by sign, so Price at "−3.1 pts" was painted red and a
  // rise in anything was painted green; fewer people arguing about price is
  // not self-evidently bad news, and this product does not decide that for a
  // reader (components/delta-badge.tsx, "THE COLOUR IS THE JUDGEMENT").
  const movement = (
    <>
      <BlockMovement verdict={row.category.verdict} unit="pts" mode={mode} good="neutral" /> <DirectionWord direction={row.direction} mode={mode} />
    </>
  )
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, marginTop: 14 }}>
        <tbody>
          <tr>
            <td width={150} style={{ width: 150, verticalAlign: 'middle' }}>{label}</td>
            <td style={{ verticalAlign: 'middle', padding: '0 12px' }}><Bar share={share} mode={mode} /></td>
            <td align="right" width={78} style={{ width: 78, verticalAlign: 'middle' }}>{figure}</td>
          </tr>
          <tr>
            <td style={{ verticalAlign: 'top' }}><Contribution videos={contribution} mode={mode} /></td>
            <td colSpan={2} style={{ padding: '5px 0 0 12px', verticalAlign: 'top' }}>
              <div>{movement}</div>
              <div style={{ marginTop: 3 }}>{sides}</div>
            </td>
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <div className="mt-3.5 grid grid-cols-[150px_minmax(0,1fr)_78px] items-center gap-x-3 gap-y-1.5">
      <span className="col-start-1">{label}</span>
      <span className="col-start-2"><Bar share={share} mode={mode} /></span>
      <span className="col-start-3 justify-self-end">{figure}</span>
      <span className="col-start-1"><Contribution videos={contribution} mode={mode} /></span>
      <span className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {movement}
        <span className="text-[11px] text-muted-foreground">{sides}</span>
      </span>
    </div>
  )
}

/** What the bar is, said once — the mock's legend, with the fact it can stand
 *  behind in place of the typical-week mark it draws. */
const BAR_LEGEND = 'the bar is each subject’s share of the category this month, against the largest of them'

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
          : <Link href={href} className="hover:underline">Open Subjects →</Link>}
        // THE ARTBOARD'S QUIET MONO NOTE, in the slot P0 built for it: what
        // these numbers are a share of, where the eye can skip it until it
        // wants it.
        footerNote={s.rows.length > 0 ? 'mentions in your audience' : undefined}
      >
        {children}
      </BlockFrame>
    )

    const empty = weeklySubjects.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const note = [s.note, data.contributions ? null : data.contributionsNote].filter(Boolean).join(' ')
    const top = Math.max(0.1, ...s.rows.map((r) => r.category.pct ?? 0))
    return frame(
      <div>
        {s.rows.map((r) => (
          <Row
            key={r.id}
            row={r}
            contribution={data.contributions?.[r.id]}
            rivalLabel={s.rivalLabel}
            share={((r.category.pct ?? 0) / top) * 100}
            mode={mode}
            appUrl={ctx.appUrl}
          />
        ))}
        <div
          style={mode === 'email' ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.faint, marginTop: 14 } : undefined}
          className={mode === 'email' ? undefined : 'mt-3.5 font-mono text-[10.5px] text-muted-foreground'}
        >
          {BAR_LEGEND}
        </div>
        {note
          ? mode === 'email'
            ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: 1.5, color: EMAIL.muted, marginTop: 6 }}>{note}</div>
            : <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{note}</p>
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
