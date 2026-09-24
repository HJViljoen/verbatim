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
import { CONTRIBUTIONS_NOT_RECORDED, subjectsLead } from '@/lib/reports/weekly'

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
      ? <span style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted }}>— not tracked</span>
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
    ? <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted, marginTop: 3 }}>{body}</div>
    : <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{body}</div>
}

/**
 * The bar, scaled against the largest share in the table — a ranked list is
 * about order and relative size, and scaling six subjects against 100% of the
 * category draws six stubs. The mock's own bars are scaled the same way, and
 * the legend under the table says so.
 *
 * ACHROMATIC ON PURPOSE, AND LEGIBLE BECAUSE OF IT. The artboard encodes state
 * in the FILL — amber above a typical week, grey about typical — and nothing
 * in this product computes a typical week (the same refusal as the tick). A
 * bar that carries no state has exactly one job left, which is to be seen: the
 * fill was `EMAIL.cat` #9AA1A9 on a #EBEDF0 track, well under the 3:1 a
 * graphic needs, so a row's only picture was nearly invisible in print and on
 * a phone. It is the muted ink now, which reads at ~3.9:1 against the track.
 */
function Bar({ share, mode }: { share: number; mode: RenderMode }) {
  const w = Math.max(2, Math.min(100, Math.round(share)))
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
        <tbody>
          <tr>
            <td width={`${w}%`} height={10} style={{ background: EMAIL.muted, height: 10, fontSize: 1, lineHeight: '10px', borderRadius: 10 }}>&nbsp;</td>
            {w < 100 ? <td style={{ background: EMAIL.hairline, height: 10, fontSize: 1, lineHeight: '10px', borderRadius: 10 }}>&nbsp;</td> : null}
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <span className="block h-[10px] w-full overflow-hidden rounded-full bg-border/60">
      <span className="block h-full rounded-full bg-muted-foreground" style={{ width: `${w}%` }} />
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
            {/* THE LABEL COLUMN IS A SHARE OF THE ROW, NOT 150 FIXED PIXELS.
                150px + the 78px figure column + 24px of gutter is 252 of a
                card whose content box is 544 on a desktop and 300 on a 390px
                phone — so the bar, which is the only picture a subject row
                has, was left 290px on one and 48px on the other. At 28% the
                column is 152 at 600 (the artboard's own 150, to the pixel a
                reader can see) and 84 on the phone, which gives the bar 114.
                The label wraps to two lines there; a 48px bar is not a bar.

                A PERCENTAGE BECAUSE THERE IS NO MEDIA QUERY TO BE HAD.
                design-system.md §4 is "Tables and inline styles only — no
                classes, no CSS variables, no flex/grid", and a media query
                cannot be an inline style, so proportional columns are the
                only responsive mechanism this artefact is allowed. */}
            <td width="28%" style={{ width: '28%', verticalAlign: 'middle' }}>{label}</td>
            <td style={{ verticalAlign: 'middle', padding: '0 12px' }}><Bar share={share} mode={mode} /></td>
            <td align="right" width={78} style={{ verticalAlign: 'middle' }}>{figure}</td>
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

export const weeklySubjects: Block<WeeklyData> = {
  key: 'weekly.subjects',
  // THE ARTBOARD'S OWN HEADING (`weekly.s2.header`). It read "Where things
  // stand", which names no thing and could head any of the six sections; the
  // mock heads it "Your subjects this week", which is what the table is. The
  // `Block.title` stays the generic one for registries and deck slides, and
  // the rendered heading takes the window's own word — Sealand's is thirty
  // days long, so "this week" is not true of it (`periodNounFor`).
  title: 'Your subjects',

  render(data, mode = 'app', ctx) {
    const s = data.subjects
    const href = `${ctx.appUrl}/dashboard/subjects`
    const lead = subjectsLead(s.rows)
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={data.section1.check.noun === 'week' ? 'Your subjects this week' : 'Your subjects in this update'}
        mode={mode}
        meta={s.rows.length > 0 ? `${fmtInt(s.rows.length)} named · month to date` : undefined}
        footer={mode === 'email'
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Subjects →</a>
          : <Link href={href} className="hover:underline">Open Subjects →</Link>}
        // ONE LEGEND, AND A CORRECT ONE (copy de-clutter, D56/D57). The block
        // printed two: "mentions in your audience" in the footer and a bar
        // legend saying the bar was the CATEGORY's share, which contradicted
        // it. Each cell prints its own "k of n"; what is left to say is what
        // the share is of and whose the bar is.
        footerNote={s.rows.length > 0 ? 'share of videos where the subject came up · the bar is the category’s' : undefined}
      >
        {children}
      </BlockFrame>
    )

    const empty = weeklySubjects.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const note = [s.note, data.contributions ? null : CONTRIBUTIONS_NOT_RECORDED].filter(Boolean).join(' ')
    const top = Math.max(0.1, ...s.rows.map((r) => r.category.pct ?? 0))
    return frame(
      <div>
        {/* WHAT THE SIX ROWS ADD UP TO, BEFORE ANY OF THEM (weekly.s2.lead).
            The artboard opens §2 with a sentence and the block opened cold on
            a table, so a reader had to read every row to learn whether any of
            them mattered. The mock's own line counts subjects "above a typical
            week"; nothing computes a typical week, so the count is of subjects
            whose MONTH reading cleared its band, which is the brief's own
            instruction for this slot under D6. */}
        {lead ? (
          <div
            style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.5, color: EMAIL.ink2, marginBottom: 4 } : undefined}
            className={mode === 'email' ? undefined : 'mb-1 text-[14px] leading-relaxed text-secondary-foreground'}
          >
            {lead.level ? <span data-copy="level">{lead.level}</span> : null}{lead.body}
          </div>
        ) : null}
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
