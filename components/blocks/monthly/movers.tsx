import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { Sparkline } from '@/components/charts/sparkline'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, monthName } from '@/lib/format'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { Mover } from '@/lib/pages/overview'
import type { MonthlyData, MoverRow } from '@/lib/pages/monthly'
import { TRAIL_SEPARATOR } from '@/lib/reports/monthly'
import { presentation, T } from './email-table'

/**
 * MR3 · What grew and faded this month (Phase 1 WP18; the mock's section 3).
 *
 * THE SECTION THAT MAKES THIS NOT THE WEEKLY REPORT. Ten rows a side against
 * Overview's three and the weekly's three, and every one of them carries its
 * own six-month line — which no other surface in the product draws per row.
 * Heinrich's revision 6 asks for exactly this ("movers with sparklines") and
 * the instruction around it is that the monthly artefact must not look like the
 * weekly one.
 *
 * THE LINE IS DRAWN AND IT IS ALSO WRITTEN OUT. `Sparkline` is an SVG whose
 * colour is a CSS variable; an email has no stylesheet, many clients block
 * images, and a picture is not a reading anyway. So app and print get the
 * sparkline AND the trail, and email gets the trail — which is what the mock
 * prints under every row: "Jul 5.1% → Aug 6.8% → Sep 9.4%". No mode is missing
 * a number the others have.
 *
 * A GAP IS A GAP. `Sparkline` takes nulls and draws one polyline per unbroken
 * run; the trail prints an em dash in the slot. A month nobody read keeps its
 * x, because closing it up would misdate every point after it.
 *
 * FIRST HEARD AND NO LONGER BEING SAID ARE FLAGS, NOT MOVEMENTS. A theme first
 * heard this month has no baseline to be banded against, so it prints its level
 * and says so, and never a change; a theme that has stopped being said carries
 * the month it was last heard in, inside a verdict node, because the registry's
 * dormancy rule earned that word. Both come off Voice's own reading.
 */
export const monthlyMovers: Block<MonthlyData> = {
  key: 'monthly.movers',
  // NOT "What grew and faded this month", which is the mock's own heading and
  // is two direction words in a title — a claim made before any row has earned
  // one (copy contract rule (c)). VO2 reached the same conclusion for the same
  // reason and heads itself "What moved"; WP11 changed OV3 and WP17 changed
  // WR5. Every row still carries its direction, in the badge, where a verdict
  // computed it.
  title: 'What moved this month',
  question: 'What is the category saying more of, and less of, than it was?',

  render(data, mode = 'app', ctx) {
    const m = data.movers
    const email = mode === 'email'
    const href = `${ctx.appUrl}${m.href}`
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={monthlyMovers.title}
        question={monthlyMovers.question}
        mode={mode}
        // THE ARTBOARDS' RULED EYEBROW (E-monthly): a 2 x 16 green mark and
        // the title in mono 11 uppercase, which is how all seventeen head a
        // section. Off by default on the primitive; on for every section of
        // this artefact, so the eight read as one document.
        accent
        meta={m.span || undefined}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Voice →</a>
          : <Link href={href} className="hover:underline">Open Voice →</Link>}
      >
        {children}
      </BlockFrame>
    )

    const empty = monthlyMovers.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const notes = [m.note, m.rereadNote].filter(Boolean).join(' ')
    // THE ARM NAMES WHAT WAS DONE TO THE NUMBER; the row carries the word,
    // inside the node that holds the band. VO2's own wording, so a reader who
    // has seen the page reads the same two arms here.
    const larger = <Side heading="Cleared their band · a larger share than last month" rows={m.growing} mode={mode} audience={m.audienceLabel} arm="larger" />
    const smaller = <Side heading="Cleared their band · a smaller share than last month" rows={m.fading} mode={mode} audience={m.audienceLabel} arm="smaller" />
    const flags = (
      <>
        {m.newcomers.length > 0 ? <Flags heading="First heard this month" rows={m.newcomers} mode={mode} /> : null}
        {m.goneQuiet.length > 0 ? <Quiet rows={m.goneQuiet} mode={mode} /> : null}
        {notes
          ? email
            ? <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.faint, marginTop: 8 }}>{notes}</div>
            : <p className="m-0 font-mono text-[11px] text-muted-foreground">{notes}</p>
          : null}
      </>
    )

    // TWO COLUMNS, WHICH IS THE ARTBOARD'S WHOLE POINT FOR THIS SECTION
    // (Block D wave 2, E-monthly). A larger share and a smaller share are the
    // two halves of one question, and stacked one under the other — ten rows
    // deep each — the second half is a page away from the first. Side by side
    // they are one reading. The email arm is a two-cell table because an email
    // has no grid; the app and print arms are the same two columns, and fall
    // back to one at phone width.
    //
    // THE FLAGS PANEL STAYS FULL WIDTH: "first heard this month" and "no
    // longer being said" are not a third and fourth arm of the same comparison
    // — neither carries a change at all — and the artboard draws them as one
    // shaded band under both columns.
    if (email) {
      return frame(
        <div>
          <table width="100%" {...presentation} style={{ ...T, tableLayout: 'fixed' }}>
            <tbody>
              <tr>
                <td width="50%" style={{ verticalAlign: 'top', paddingRight: 12 }}>{larger}</td>
                <td width="50%" style={{ verticalAlign: 'top', paddingLeft: 12 }}>{smaller}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '14px 16px', marginTop: 14 }}>{flags}</div>
        </div>,
      )
    }
    return frame(
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">{larger}</div>
          <div className="flex min-w-0 flex-col gap-2">{smaller}</div>
        </div>
        <div className="flex flex-col gap-2 rounded-md bg-inner px-4 py-3.5">{flags}</div>
      </div>,
    )
  },

  figures(data): FigureTable {
    // THE FOUR LARGEST MOVEMENTS, TWO A SIDE, AND NOT THE TWENTY ROWS — four
    // rows, and eight figures, because each row declares its share and the
    // count behind it. A figure
    // is a number a model may cite and a number budget is counted over; a block
    // that declared forty of them would spend the whole artefact's on one list.
    // VO2 makes the same cut at two. Nothing is lost from the RECORD by it:
    // `sent_figures` takes its object-keyed rows from `verdicts()` below, which
    // returns every row with its identity, its band and its two sides.
    const out: FigureTable = {}
    const pick = (rows: readonly MoverRow[]) =>
      [...rows].sort((a, b) => Math.abs(b.verdict.changePts ?? 0) - Math.abs(a.verdict.changePts ?? 0)).slice(0, 2)
    for (const row of [...pick(data.movers.growing), ...pick(data.movers.fading)]) {
      if (row.pct == null) continue
      const token = `moved_${row.id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`
      out[`${token}_share`] = { value: row.pct, unit: 'pct', label: `${row.label}, share of the month` }
      out[`${token}_videos`] = { value: row.k, unit: 'videos', label: `videos that raised ${row.label}` }
    }
    return out
  },

  verdicts(data): Verdict[] {
    return [...data.movers.growing, ...data.movers.fading].map((r) => r.verdict)
  },

  quotes(): QuoteRef[] {
    // A MOVER ROW SHOWS NO QUOTE. Ten rows a side with a quote each would be
    // twenty strangers' sentences in one section; the words live on Voice,
    // which the footer links to, and on section 6, which prints one per subject.
    return []
  },

  emptyState(data) {
    const m = data.movers
    if (m.growing.length > 0 || m.fading.length > 0 || m.newcomers.length > 0 || m.goneQuiet.length > 0) return null
    return m.note ?? 'Nothing moved clearly this month.'
  },
}

function Side({ heading, rows, mode, audience, arm }: {
  heading: string
  rows: readonly MoverRow[]
  mode: RenderMode
  audience: string
  arm: 'larger' | 'smaller'
}) {
  const email = mode === 'email'
  if (rows.length === 0) {
    // THE AUDIENCE LEADS THE SENTENCE. Its label is "The category" or
    // "Ottobock" — a capital that is right at the start of a clause and wrong in
    // the middle of one, and lower-casing it would be wrong for every rival. So
    // the sentence is built round it rather than round the verb, which is also
    // how VO2 words its own audience meta.
    const line = `${audience}: nothing took a ${arm} share this month than it did last month.`
    return email
      ? <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginTop: 10 }}>{line}</div>
      : <p className="m-0 text-[12px] text-muted-foreground">{line}</p>
  }
  return (
    <div className={email ? undefined : 'flex flex-col gap-2'}>
      <Heading mode={mode}>{heading}</Heading>
      {rows.map((r) => <Row key={r.id} row={r} mode={mode} />)}
    </div>
  )
}

function Heading({ children, mode }: { children: ReactNode; mode: RenderMode }) {
  return mode === 'email' ? (
    <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted, marginTop: 12 }}>{children}</div>
  ) : (
    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{children}</span>
  )
}

/**
 * A mover's share, with the count it rests on — or, where there is no share,
 * the count alone and NOT marked as a level.
 *
 * RULE (b) IS ABOUT THE MARKER, NOT ABOUT THE NUMBER. `pct` is null exactly
 * when the month's denominator is zero (lib/reading/series.ts), and
 * `loadVoiceSurface` guards on `videos != null` rather than `> 0`, so the arm
 * is reachable — and it printed "130 videos" inside a data-copy="level" node
 * with no "of N" in it, four violations a side in each of the three modes. The
 * bare count is honest and there is no denominator to print beside it; what was
 * wrong was calling it a calibrated level.
 */
function Level({ k, n, pct }: { k: number; n: number; pct: number | null }) {
  if (pct == null) return <span>{fmtInt(k)} videos</span>
  return <span data-copy="level">{`${fmtPct(pct)} · ${fmtInt(k)} of ${fmtInt(n)}`}</span>
}

/**
 * One mover: the theme, its level, its verdict and its trail.
 *
 * THE TRAIL IS MARKED AS THE LEVELS IT IS. It carried no `data-copy` at all,
 * and rule (b) is checked on marked nodes alone — so six bare percentages a row
 * escaped the contract the level beside them keeps. `seriesTrail` now prints
 * each point's denominator and `buildMovers` gates each point on `isReadable`,
 * so a month under the floor is a dash rather than a point indistinguishable
 * from a 388-video month.
 */
function Row({ row, mode }: { row: MoverRow; mode: RenderMode }) {
  const email = mode === 'email'
  const level = <Level k={row.k} n={row.n} pct={row.pct} />

  if (email) {
    return (
      <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '11px 0' }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink }}>
          {/* The label is a MODEL's words read back out of a column — the
              `subject` kind, the exemption VO2 and OV3 already claim for a
              theme label (PROSE_POLICY gives pass_b_theme 'none'). */}
          <span data-copy="subject" data-slot="pass_b_theme">{row.label}</span>{' '}
          <BlockMovement verdict={row.verdict} unit="pts" mode={mode} />
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>{level}</div>
        {row.trail ? <Trail trail={row.trail} mode={mode} /> : null}
      </div>
    )
  }

  // THE ROW IS A COLUMN'S ROW NOW, not a full-width one: the label and its
  // badge on the first line, the artboard's 72 x 24 line and the level on the
  // second, the trail under both. At 104 wide beside a wrapped label in a
  // half-width column the sparkline pushed the badge onto a third line.
  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-border/60 py-2">
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 text-[14.5px] font-semibold">
          <span data-copy="subject" data-slot="pass_b_theme">{row.label}</span>
        </span>
        <BlockMovement verdict={row.verdict} unit="pts" mode={mode} />
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <Sparkline values={row.spark} width={72} height={24} animate={false} />
        <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">{level}</span>
      </span>
      {row.trail ? <Trail trail={row.trail} mode={mode} /> : null}
    </div>
  )
}

/**
 * The six-month trail, point by point (the fix pass, review finding
 * [High]/[Minor]).
 *
 * A POINT NEVER BREAKS IN HALF. Set as one string in a 254px column the line
 * wrapped to four, and the wrap fell between "9.4% of" and "1,388": a share on
 * one line and what it is a share of on the next. Every point carrying its
 * denominator is the rule this line exists to keep, and a line break between
 * them is that separation by other means. Each point is its own unbreakable
 * box and the ARROWS are where the line may break, so a narrow column gets two
 * short lines of whole readings instead of four ragged ones.
 *
 * THE MARKER STAYS ON THE WHOLE LINE, not on each point: rule (b) reads a
 * level node's whole text, and "Jul —" alone is a month with no reading rather
 * than a level missing its evidence.
 */
function Trail({ trail, mode }: { trail: string; mode: RenderMode }) {
  const points = trail.split(TRAIL_SEPARATOR)
  const parts = points.map((point, i) => (
    <Fragment key={point + i}>
      {i > 0 ? TRAIL_SEPARATOR : null}
      <span style={{ whiteSpace: 'nowrap' }}>{point}</span>
    </Fragment>
  ))
  return mode === 'email' ? (
    <div data-copy="level" style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: '1.5', color: EMAIL.faint, marginTop: 2 }}>{parts}</div>
  ) : (
    <span data-copy="level" className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{parts}</span>
  )
}

/**
 * First heard this month: a level, never a change.
 *
 * AND THE FLAG IS THE HEADING. Every row used to end ", first heard this month"
 * under a heading that already reads "First heard this month", so the reader
 * got "Second-hand resale value — 1.9% · 26 of 1,388, first heard this month"
 * directly beneath those four words. One of the two is enough and the heading
 * is the one that scales.
 */
function Flags({ heading, rows, mode }: { heading: string; rows: readonly Mover[]; mode: RenderMode }) {
  const email = mode === 'email'
  const line = (r: Mover) => (
    <>
      <span data-copy="subject" data-slot="pass_b_theme">{r.label}</span>{' — '}
      <Level k={r.k} n={r.n} pct={r.pct} />
    </>
  )
  return (
    <div className={email ? undefined : 'flex flex-col gap-1'}>
      <Heading mode={mode}>{heading}</Heading>
      {rows.map((r) => (email
        ? <div key={r.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginTop: 4 }}>{line(r)}</div>
        : <p key={r.id} className="m-0 text-[12.5px]">{line(r)}</p>
      ))}
    </div>
  )
}

/**
 * Stopped being said.
 *
 * "GONE QUIET" IS A DIRECTION WORD AND IT IS MARKED AS ONE. Rule (c) lets it
 * appear only inside a verdict node — which is right, because it IS earned:
 * the registry's own dormancy rule, fired over updates that actually produced
 * theme observations, and not an absence this block noticed. The heading above
 * carries none, because a heading has no reading behind it. VO2's own shape.
 */
function Quiet({ rows, mode }: { rows: readonly { id: string; label: string; lastHeard: string | null }[]; mode: RenderMode }) {
  const email = mode === 'email'
  const line = (r: { label: string; lastHeard: string | null }) => (
    <>
      <span data-copy="subject" data-slot="pass_b_theme">{r.label}</span>{' '}
      <span data-copy="verdict" style={email ? { color: EMAIL.muted } : undefined} className={email ? undefined : 'text-[11px] text-muted-foreground'}>
        gone quiet{r.lastHeard ? ` · last heard ${monthName(r.lastHeard)}` : ''}
      </span>
    </>
  )
  return (
    <div className={email ? undefined : 'flex flex-col gap-1'}>
      <Heading mode={mode}>No longer being said</Heading>
      {rows.map((r) => (email
        ? <div key={r.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginTop: 4 }}>{line(r)}</div>
        : <p key={r.id} className="m-0 text-[12.5px]">{line(r)}</p>
      ))}
    </div>
  )
}
