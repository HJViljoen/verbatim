import type { ReactNode } from 'react'
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
    return frame(
      <div className={email ? undefined : 'flex flex-col gap-4'}>
        {/* THE ARM NAMES WHAT WAS DONE TO THE NUMBER; the row carries the
            word, inside the node that holds the band. VO2's own wording, so a
            reader who has seen the page reads the same two arms here. */}
        <Side heading="Cleared their band · a larger share than last month" rows={m.growing} mode={mode} audience={m.audienceLabel} arm="larger" />
        <Side heading="Cleared their band · a smaller share than last month" rows={m.fading} mode={mode} audience={m.audienceLabel} arm="smaller" />
        {m.newcomers.length > 0 ? <Flags heading="First heard this month" rows={m.newcomers} mode={mode} /> : null}
        {m.goneQuiet.length > 0 ? (
          <Quiet rows={m.goneQuiet} mode={mode} />
        ) : null}
        {notes
          ? email
            ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 }}>{notes}</div>
            : <p className="m-0 text-[11.5px] text-muted-foreground">{notes}</p>
          : null}
      </div>,
    )
  },

  figures(data): FigureTable {
    // THE FOUR LARGEST MOVEMENTS, TWO A SIDE, AND NOT THE TWENTY ROWS. A figure
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
    const line = `Nothing took a ${arm} share of ${audience} this month than it did last month.`
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

function Row({ row, mode }: { row: MoverRow; mode: RenderMode }) {
  const email = mode === 'email'
  // RULE (b): a level never prints without the count it rests on.
  const level = (
    <span data-copy="level">
      {row.pct == null ? `${fmtInt(row.k)} videos` : `${fmtPct(row.pct)} · ${fmtInt(row.k)} of ${fmtInt(row.n)}`}
    </span>
  )

  if (email) {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink }}>
          {/* The label is a MODEL's words read back out of a column — the
              `subject` kind, the exemption VO2 and OV3 already claim for a
              theme label (PROSE_POLICY gives pass_b_theme 'none'). */}
          <span data-copy="subject" data-slot="pass_b_theme">{row.label}</span>{' '}
          <BlockMovement verdict={row.verdict} unit="pts" mode={mode} />
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>{level}</div>
        {row.trail ? (
          <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.faint, marginTop: 2 }}>{row.trail}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-0 flex-1 text-[13px]">
        <span data-copy="subject" data-slot="pass_b_theme">{row.label}</span>
      </span>
      <Sparkline values={row.spark} width={104} height={22} animate={false} />
      <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">{level}</span>
      <BlockMovement verdict={row.verdict} unit="pts" mode={mode} />
      {row.trail ? (
        <span className="w-full font-mono text-[10.5px] tabular-nums text-muted-foreground">{row.trail}</span>
      ) : null}
    </div>
  )
}

/** First heard this month: a level and the flag, never a change. */
function Flags({ heading, rows, mode }: { heading: string; rows: readonly Mover[]; mode: RenderMode }) {
  const email = mode === 'email'
  const line = (r: Mover) => (
    <>
      <span data-copy="subject" data-slot="pass_b_theme">{r.label}</span>{' — '}
      <span data-copy="level">
        {r.pct == null ? `${fmtInt(r.k)} videos` : `${fmtPct(r.pct)} · ${fmtInt(r.k)} of ${fmtInt(r.n)}`}
      </span>
      {', first heard this month'}
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
