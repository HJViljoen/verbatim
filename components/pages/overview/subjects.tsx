import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { Sparkline } from '@/components/charts/sparkline'
import { fmtInt, fmtPct, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { Direction } from '@/lib/reading/bands'
import { gapBasisLine, gapLine, type Gap } from '@/lib/reading/gap'
import { TileBlock } from '@/components/shell/tile'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { OverviewData, SideReading, SubjectRow } from '@/lib/pages/overview'
import { candidateLine, monthlyLineLabel, sentLineFor } from '@/lib/pages/overview'
import { INDUSTRY_AUDIENCE } from '@/lib/rivals'

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
  // P0'S CELL, NOT A HAND-ROLLED PAIR (`main.subjects.col.*`). The artboard
  // stacks the share over its "n of N" — mono 13/600 at `line-height:1` with
  // the evidence in mono 10.5 muted one pixel under it — where this printed the
  // two inline on one line, which reads flatter and wider than the artboard and
  // is exactly how rule (b) has been broken every time a column fell off a
  // narrow layout. `FigureCell` stamps its own `data-copy`, so the level marker
  // comes with the primitive rather than with remembering to add it.
  //
  // LEFT-ALIGNED, which is the artboard's own answer: Main draws twenty of
  // these cells and right-aligns none (the count is in
  // components/blocks/frame.tsx).
  return <FigureCell mode={mode} value={fmtPct(side.pct)} of={`${fmtInt(side.k ?? 0)} of ${fmtInt(side.n ?? 0)}`} />
}

/**
 * "the report of 1 Oct read 19% · 264 of 1,388", or nothing at all (Phase 1
 * WP18, item 13).
 *
 * BESIDE THE LIVE FIGURE, NOT INSTEAD OF IT, and only where a still-filling
 * month has actually moved since the artefact went out. It is NOT a figure and
 * carries no `data-copy` mark of its own: it is the same reading, quoted from a
 * dated document, the way `AtLastMonth` above is a level beside a level. The
 * date is what makes it readable.
 */
function SentLine({ line, mode = 'app' }: { line: string | null; mode?: RenderMode }): ReactNode {
  if (!line) return null
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.faint }}>{line}</div>
    : <span className="block text-[11px] text-muted-foreground">{line}</span>
}

/** "at this point last month: 20.5% (264 of 1,290)", or nothing at all. */
function AtLastMonth({ at, mode = 'app' }: { at: SubjectRow['categoryAtLastMonth']; mode?: RenderMode }): ReactNode {
  if (!at || at.pct == null) return null
  const body = <>at this point last month <span data-copy="figure">{fmtPct(at.pct)} {fmtInt(at.k)} of {fmtInt(at.n)}</span></>
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted }}>{body}</div>
    : <span className="block text-[11px] text-muted-foreground">{body}</span>
}

/**
 * The gap headline the artboard puts above the table (`main.subjects.gapline`,
 * D1).
 *
 * THE MOCK'S SENTENCE IS "gap to Freitag narrowed to 13 points … from 19 in
 * June", AND "narrowed" IS NOT BUILT. `gapLine` prints both sides with their
 * counts, the difference and the band beside the word, so the claim is
 * checkable; `gapBasisLine` prints the earlier month as its OWN dated, banded
 * reading under it, so a reader can see the gap was larger and decide for
 * themselves. The product never says which way it went off two readings.
 *
 * AND ON THIS TENANT IT READS "too few to compare", which is the point rather
 * than a disappointment: your own audience carries 84 videos against a
 * 100-video floor, so the difference is refused — the same refusal the mock
 * prints one cell away in its own change column. Both levels and both
 * denominators still print.
 *
 * WHICH ROW. The FIRST row that has a gap at all, which is the block's own
 * ordering (largest category share first) — the headline is about the subject
 * the table leads with, never a second ranking computed here.
 */
export function leadGap(s: OverviewData['subjects']): Gap | null {
  for (const row of s.rows) {
    const gap = s.gaps[row.id]
    if (gap) return gap
  }
  return null
}

function GapHeadline({ gap, mode }: { gap: Gap; mode: RenderMode }) {
  const basis = gapBasisLine(gap)
  const body = (
    <>
      <span className={mode === 'email' ? undefined : 'text-[12.5px] font-medium'}>
        {gap.objectLabel} — <span data-copy="level" className={mode === 'email' ? undefined : 'font-mono tabular-nums'}>{gapLine(gap)}</span>
      </span>
      {basis ? (
        <span
          className={mode === 'email' ? undefined : 'shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground'}
          style={mode === 'email' ? { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted } : undefined}
        >
          {basis}
        </span>
      ) : null}
    </>
  )
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, background: EMAIL.inner, padding: '5px 12px', borderRadius: 4 }}>{body}</div>
  }
  return <TileBlock className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5">{body}</TileBlock>
}

function Row({ row, mode, appUrl = '', sentLine = null }: { row: SubjectRow; mode: RenderMode; appUrl?: string; sentLine?: string | null }) {
  return (
    <tr>
      <td className="py-1.5 pr-3 align-top text-[12.5px] font-medium">
        {/* THROUGH `ctx.appUrl`, like every other link this block draws. The
            row's own href was the one that was not: relative is right in the
            app (where appUrl is the empty string) and dead everywhere else,
            and this block is rendered into a PDF and an email by the monthly
            report (WP18). The same defect WP17 fixed on the weekly blocks. */}
        <Link href={`${appUrl}${row.href}`} className="underline-offset-2 hover:underline">{row.label}</Link>
      </td>
      <td className="py-1.5 pr-3 align-top"><Side side={row.you} mode={mode} /></td>
      <td className="py-1.5 pr-3 align-top"><Side side={row.rival} mode={mode} /></td>
      <td className="py-1.5 pr-3 align-top">
        <Side side={row.category} mode={mode} />
        {/* AND, WHILE THE MONTH IS STILL FILLING, THE SAME POINT LAST MONTH —
            on the category side only, because it is the only one of the three
            with the n to make the comparison mean anything (design §3 OV2,
            Time). It is a LEVEL beside a level, not a change: no band is drawn
            over a part-month against a part-month. */}
        <AtLastMonth at={row.categoryAtLastMonth} mode={mode} />
        <SentLine line={sentLine} mode={mode} />
      </td>
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

/**
 * "6 named 19 Aug · share of videos where the subject came up"
 * (`main.subjects.header`).
 *
 * THE DATE IS THE HALF THAT WAS MISSING. "6 named" says how many; the artboard
 * says how many AND since when, which is what tells a reader whether the rows
 * under it can carry a comparison at all. Absent where no row carries a
 * `named_at`, rather than invented.
 */
export function subjectsMeta(s: OverviewData['subjects']): string | undefined {
  if (s.rows.length === 0) return undefined
  const named = s.namedAt ? `${fmtInt(s.rows.length)} named ${shortDate(s.namedAt)}` : `${fmtInt(s.rows.length)} named`
  return `${named} · share of videos where the subject came up`
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
      ? null
      : openLink(mode, href, 'Open Subjects →')
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={overviewSubjects.title}
        question={overviewSubjects.question}
        mode={mode}
        meta={subjectsMeta(s)}
        footer={footer}
        // THE CAVEAT BELONGS IN THE FOOTER NOTE (`main.subjects.footer`). It
        // was a body paragraph under the table, where a sentence about what the
        // block CANNOT say reads as one of its findings. `BlockFrame`'s
        // right-hand mono slot is where the artboard puts it.
        footerNote={s.note}
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

    const gap = leadGap(s)
    if (email) {
      return frame(
        <div>
          {gap ? <GapHeadline gap={gap} mode={mode} /> : null}
          {s.rows.map((r) => (
            <div key={r.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
              <strong>{r.label}</strong>
              <div style={{ marginTop: 2 }}>
                you <Side side={r.you} mode={mode} /> · {s.rivalLabel ?? 'rival'} <Side side={r.rival} mode={mode} /> · {s.categoryLabel.toLowerCase()} <Side side={r.category} mode={mode} />
              </div>
              <AtLastMonth at={r.categoryAtLastMonth} mode={mode} />
              <SentLine line={sentLineFor(data.sent, INDUSTRY_AUDIENCE, 'subject', r.id, r.category.pct)} mode={mode} />
              <div style={{ marginTop: 2 }}>
                <BlockMovement verdict={r.category.verdict} unit="pts" mode={mode} /> <DirectionWord direction={r.direction} mode={mode} />
              </div>
            </div>
          ))}
        </div>,
      )
    }

    return frame(
      <>
        {gap ? <GapHeadline gap={gap} mode={mode} /> : null}
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
              {s.rows.map((r) => <Row key={r.id} row={r} mode={mode} appUrl={ctx.appUrl} sentLine={sentLineFor(data.sent, INDUSTRY_AUDIENCE, 'subject', r.id, r.category.pct)} />)}
            </tbody>
          </table>
        </div>
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
