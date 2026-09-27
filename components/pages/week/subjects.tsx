import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockRanked } from '@/components/blocks/bars'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, longMonth, shortDate } from '@/lib/format'
import { monthPhrase, type SubjectWeekRow, type WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'
import { CalibrationTag } from '@/components/blocks/calibration-tag'
import { openLink } from '@/components/blocks/open-link'
import { surface } from '@/lib/nav'
import { marketLevel } from '@/lib/pages/overview-market/kinds'
import { RULE, SCALE, shortMonthName } from '@/components/pages/overview/market'

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
// THE MOCK'S SIX-ACROSS STRIP, WITH THE COLUMN THAT IS REFUSED REPLACED (Block
// D wave 2). The artboard draws six columns of `31 this week` over a two-bar
// comparison against `typical week 22`. Two things about that are impossible:
// the leading figure may not be a week alone (D6), and there is no per-week
// history to be typical of — a weekly series per subject is thirteen windowed
// reads per subject, which is the one series this page is allowed exactly one
// of. So the column keeps the mock's shape and inverts the two figures: the
// MONTH leads with its "of N", and the pair of bars underneath is this update's
// own contribution against what an update of its size usually adds
// (`typicalContribution` — a ratio of ratios, both sides measured, no modelled
// history anywhere). The tag over them is `typicalTag`'s word, which is a level
// against a level and never a direction.
//
// WHEN NOTHING IS RECORDED IT SAYS SO. Subjects are M4 and the table does not
// exist on production yet. A block that drew an empty table there would be
// saying this workspace cares about nothing.

/** The block's title on the market (WP2.7): the preview's This week title. A
 *  copy stored before WP2.7 keeps the Phase 1 title below, over its own rows. */
export const MARKET_SUBJECTS_WEEK_TITLE = 'Your market’s subjects'
const LEGACY_TITLE = 'This week in your subjects'

export const weekSubjects: Block<WeekData> = {
  key: 'week.subjects',
  title: MARKET_SUBJECTS_WEEK_TITLE,
  question: 'What did this update add to your market’s subjects?',

  render(data, mode = 'app', ctx) {
    const s = data.subjects
    // BUILT ON THE MARKET (market-first WP2.7): the preview's table. A copy
    // stored before WP2.7 carries the client's own side and draws the strip
    // it was sent with, below.
    if (s.market) return renderMarket(data, mode, ctx.appUrl)
    const email = mode === 'email'
    const empty = weekSubjects.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/subjects`
    const max = Math.max(1, ...s.rows.map((r) => r.monthVideos))
    // ONE SCALE ACROSS THE STRIP, NOT ONE PER COLUMN (review W2). `top` was
    // `Math.max(1, added, typical)` INSIDE each column, so six bars of one
    // unit under one shared legend were drawn on six different scales:
    // measured on the populated fixture at 1440, Comfort's 8 added drew 368px
    // while Durability's 2.77 "usually" drew 351px, and Durability's 1 added
    // drew 127px against Comfort's 4.52 "usually" at 208px — 1 longer than
    // half of 4.5. A six-across row under one legend is an invitation to
    // compare across it, which is exactly what the artboard's §3 does. So the
    // denominator is the strip's own tallest bar, computed once here over both
    // series, and the comment below is now true of the row as well as of the
    // column.
    // "this month" while the update's month is the clock's; its name once it
    // has ended (deploy 1 review).
    const when = monthPhrase(s.month, data.readingAt)
    const barTop = Math.max(1, ...s.rows.flatMap((r) => [r.addedVideos ?? 0, r.typical ?? 0]))

    return (
      <BlockFrame
        title={LEGACY_TITLE}
        question={weekSubjects.question}
        mode={mode}
        // AN ENDED MONTH IS NOT "SO FAR" (deploy 1 review): on 2 Oct the
        // latest update is 27 Sep's, and its September has ended; it is read
        // to that update.
        meta={when === 'this month'
          ? `${longMonth(s.month)} so far${data.monthStatus === 'filling' ? ' · still filling' : ''}`
          : `${longMonth(s.month)} to the ${shortDate(data.update.date)} update`}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Subjects →</a>
          : <Link href={href} className="hover:underline">Open Subjects →</Link>}
        // THE MOCK'S LEFT-HAND FOOTER NOTE, and it is a naming date rather than
        // a start of evidence (D14): `named_at` is the day somebody typed the
        // subject into Settings, not the day the conversation began.
        footerNote={s.namedLine ?? undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {/* THE MOCK'S LEAD, WITH THE HALF THAT IS REFUSED REPLACED RATHER THAN
            DROPPED. "Three of the six ran above a typical week" needs a weekly
            series per subject; what is printed instead is the same count, the
            same denominator and the same names, with the basis the tag was
            earned on said in the same sentence (`subjectLead`). */}
        {s.lead ? (
          <p
            className={email ? undefined : 'm-0 text-[12px]'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, marginBottom: 6 } : undefined}
          >
            {s.lead}
          </p>
        ) : null}
        {s.rows.length > 0 ? (
          email
            ? (
              // AN EMAIL GETS THE RANKED LIST, NOT THE STRIP. Six columns of
              // 6px bars are six columns Outlook lays out with Word; the
              // ranked row is the primitive that already survives that, and it
              // carries the same two numbers.
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
            )
            : (
              <>
                <div className={`grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 ${STRIP_COLUMNS[Math.min(s.rows.length, 6)] ?? 'xl:grid-cols-6'}`}>
                  {s.rows.map((r) => <Column key={r.id} row={r} top={barTop} when={when} />)}
                </div>
                <Withheld rows={s.withheld ?? []} email={false} strip={s.rows.length} />
                <Legend rows={s.rows} />
              </>
            )
        ) : null}
        {email || s.rows.length === 0 ? <Withheld rows={s.withheld ?? []} email={email} strip={0} /> : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    if (data.subjects.market) return marketFigures(data)
    const out: FigureTable = {}
    for (const r of data.subjects.rows) {
      out[`subject_${r.id}_videos`] = { value: r.monthVideos, unit: 'videos', label: `${r.label} — videos this month` } // em-dash-ok: FigureTable label (a record key, never printed)
      if (r.addedVideos != null) {
        out[`subject_${r.id}_added`] = { value: r.addedVideos, unit: 'videos', label: `${r.label} — videos this update added` } // em-dash-ok: FigureTable label (a record key, never printed)
      }
    }
    return out
  },

  emptyState(data) {
    return data.subjects.unread
  },
}

/**
 * As many columns as there are subjects, up to the artboard's six.
 *
 * Written out in full, never interpolated, so Tailwind v4's scanner sees them
 * (the rule `components/shell/tile.tsx`'s span maps follow). Six columns with
 * three subjects in them is three sixths of a strip and half a tile of white:
 * a workspace naming three subjects is the common case, and the strip should
 * fill the tile it is given.
 */
const STRIP_COLUMNS: Record<number, string> = {
  1: 'xl:grid-cols-1', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6',
}

/** One of the mock's six columns. `top` is the STRIP's tallest bar, not this
 *  column's — see `barTop`. */
function Column({ row, top, when = 'this month' }: { row: SubjectWeekRow; top: number; when?: string }) {
  // BOTH BARS ARE THE SAME UNIT ON THE SAME SCALE — videos this update added,
  // measured and expected — AND SO IS EVERY OTHER COLUMN'S PAIR. The mock's
  // pair is this week against a typical week, which needs a history nothing
  // holds; this pair is a contribution against the contribution an update of
  // this size usually makes to this subject, and both sides come off the same
  // two reads. The scale is the strip's, so a longer bar anywhere in the row
  // means more videos.
  const added = row.addedVideos
  const typical = row.typical
  return (
    <div className="flex min-w-0 flex-col gap-1.5 border-border/70 xl:border-l xl:pl-4 xl:first:border-l-0 xl:first:pl-0">
      {/* The subject's own name is the client's words, typed into Settings —
          not a model's — so it carries no prose marker. */}
      <span className="truncate text-[12.5px] font-medium" title={row.label}>{row.label}</span>
      <span className="flex items-baseline gap-1.5">
        <span data-copy="figure" className="font-mono text-[18px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
          {fmtInt(row.monthVideos)}
        </span>
        <span className="text-[12px] font-medium text-muted-foreground">{when}</span>
      </span>
      <Level row={row} className="block font-mono text-[11px] tabular-nums text-muted-foreground" />
      {added != null ? (
        <>
          <span className="flex flex-col gap-[3px]">
            <Bar pct={(added / top) * 100} color="var(--you)" />
            <Bar pct={typical != null ? (typical / top) * 100 : 0} color="var(--neutral-seg)" />
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            <Added row={row} />
            {typical != null ? ` · usually ${fmtInt(Math.round(typical))}` : ' · no usual share to compare it with'}
          </span>
        </>
      ) : (
        <span className="text-[11px] text-muted-foreground">
          What this update added to it is not recorded here yet.
        </span>
      )}
      {row.tag ? (
        // A LEVEL AGAINST A LEVEL, NEVER A DIRECTION. "above typical" says this
        // update put in more than an update of its size usually does; it says
        // nothing about where the subject is headed, which is why the word is
        // `typicalTag`'s and not `directionWord`'s.
        //
        // AND SO IT IS MARKED NOTHING (code review C7). It was marked
        // `data-copy="verdict"` — the contract's node for words a `Verdict`
        // (lib/reading/verdicts.ts) computed, and the one node rule (c) never
        // checks — directly under a comment saying it is not one. This tag
        // carries no band and no both-sides k/n; it is three fixed words
        // (`typicalTag`), none of them in DIRECTION_WORDS, so unmarked it is
        // CHECKED and it passes. An exemption that names nothing is a hole
        // (AGENTS.md), and this one was exempting a word that needed no
        // exemption.
        <span className="inline-flex w-fit items-center rounded-full bg-inner px-2 py-px text-[10.5px] font-semibold text-muted-foreground">
          {row.tag}
        </span>
      ) : null}
    </div>
  )
}

/**
 * The confirmed subjects whose own side is not shown (decision C, WP1.1):
 * each named once, with its word, and no figure. "provisional": not checked
 * yet, or not clearly under the floor; "being re-described": clearly under;
 * "no reading yet": the month was not read for it (`unread`, default M-a),
 * in place of the calibration word, as on every other surface.
 *
 * ON SCREEN THEY ARE THE STRIP'S NEXT ROW (design pass). As a loose 12px line
 * under the bar legend they read as a footnote to the legend, and on a
 * workspace whose subjects are all unchecked they are the whole block. Laid on
 * the strip's own columns, with its gutters, each name sits under a name and
 * at the same x, in the muted ink with its word beneath: the same subject set,
 * the ones with nothing to show yet. `strip` is how many columns the strip
 * above has (none: the grid takes the withheld count).
 */
function Withheld({ rows, email, strip }: { rows: NonNullable<WeekData['subjects']['withheld']>; email: boolean; strip: number }) {
  if (rows.length === 0) return null
  if (email) {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginTop: 8 }}>
        {rows.map((r, i) => (
          <span key={r.id}>{i > 0 ? ' · ' : ''}{r.label} <CalibrationTag calibration={r.calibration} unread={r.unread} mode="email" /></span>
        ))}
      </div>
    )
  }
  const cols = STRIP_COLUMNS[Math.min(strip > 0 ? strip : rows.length, 6)] ?? 'xl:grid-cols-6'
  return (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 ${cols}${strip > 0 ? ' mt-1.5' : ''}`}>
      {rows.map((r) => (
        // The strip's column rule, drawn transparent: the gutter and the
        // hairline's pixel stay, so the text lands on the strip's x.
        <div key={r.id} className="flex min-w-0 flex-col gap-0.5 border-transparent xl:border-l xl:pl-4 xl:first:border-l-0 xl:first:pl-0">
          <span className="truncate text-[12.5px] font-medium text-muted-foreground" title={r.label}>{r.label}</span>
          <CalibrationTag calibration={r.calibration} unread={r.unread} block />
        </div>
      ))}
    </div>
  )
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-inner">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </span>
  )
}

/** The mock's two-swatch legend, saying what the second bar actually is. */
function Legend({ rows }: { rows: readonly SubjectWeekRow[] }) {
  const anyTypical = rows.some((r) => r.typical != null)
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 pt-2">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-3.5 rounded-full" style={{ background: 'var(--you)' }} aria-hidden />
        what this update added
      </span>
      {anyTypical ? (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-3.5 rounded-full" style={{ background: 'var(--neutral-seg)' }} aria-hidden />
          what an update of its size usually adds
        </span>
      ) : null}
    </div>
  )
}

/** The level, with the denominator it is a level of. A calibrated count on its
 *  own is a score, and this product shows no scores (copy contract rule (b)). */
function Level({ row, className }: { row: SubjectWeekRow; className?: string }) {
  return (
    <span data-copy="level" className={className}>
      {fmtInt(row.monthVideos)} of {fmtInt(row.monthOf)} videos
      {row.monthOf > 0 ? ` · ${fmtPct((row.monthVideos / row.monthOf) * 100, 0)}` : ''}
    </span>
  )
}

/**
 * What THIS update put in.
 *
 * A COUNT, AND NOT A DIRECTION. "+14 videos since the last update" says what
 * arrived; it does not say the subject is growing, because one update against
 * one update is two readings of an incompletely filled month.
 */
function Added({ row }: { row: SubjectWeekRow }) {
  if (row.addedVideos == null) return null
  // MARKED NOTHING, for `typicalTag`'s reason (code review C7). This was a
  // verdict node too, on the argument that a plus sign is movement vocabulary
  // to a reader's eye — but the node's meaning in the contract is "a `Verdict`
  // computed these words", and no Verdict computed this count. "+14 this
  // update" holds no direction word, so checked it passes.
  return <span>+{fmtInt(row.addedVideos)} this update</span>
}

// ---- On the market (market-first WP2.7) ------------------------------------------
//
// THE PREVIEW'S TABLE (ThisWeek.dc.html, "Your market's subjects"): a row per
// subject with its name and a bar under it, the market's videos in the month
// so far, its share of the market, and what this update's own days put in. The
// header is the title alone and the footer a link alone (25 Sep rulings): the
// base is in the column head ("Share of 654"), the calibration word is a row
// tag, and nothing explains itself under the table.
//
// COUNTS THAT ADD TO THE MONTH (plan §2.7, "Looks & style: {k} in September,
// +{j} with this update"): "+j" is how many of the month's videos this update's
// days carried the subject, a count and never a share of a week, and never a
// direction.

const MARKET_COLS = 'grid-cols-[minmax(0,1fr)_56px_56px_64px] gap-x-3 sm:gap-x-4'

const token = (id: string, suffix: 'videos' | 'added'): string => `subject_${id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${suffix}`

/** The share cell: a share at the floor, a dot under it (the Videos column
 *  carries the count). */
const shareCell = (k: number | null, n: number | null): string => {
  const l = marketLevel(k, n)
  return l?.kind === 'share' ? l.text : '·'
}

const plus = (j: number | null): string => (j == null ? '·' : `+${fmtInt(j)}`)

function marketFigures(data: WeekData): FigureTable {
  const out: FigureTable = {}
  const month = longMonth(data.subjects.month)
  for (const r of data.subjects.rows) {
    const side = r.market?.monthSoFar
    if (side?.k == null) continue
    const word = r.calibration === 'provisional' ? ' (provisional)' : ''
    out[token(r.id, 'videos')] = { value: side.k, unit: 'videos', label: `videos on ${r.label} in your market in ${month}${word}` }
    if (r.market?.thisUpdate != null) {
      out[token(r.id, 'added')] = { value: r.market.thisUpdate, unit: 'videos', label: `${month} videos on ${r.label} this update put in${word}` }
    }
  }
  return out
}

function renderMarket(data: WeekData, mode: RenderMode, appUrl: string) {
  const s = data.subjects
  const n = s.market?.n ?? null
  const month = shortMonthName(s.market?.month ?? s.month)
  const nav = surface('subjects')
  const footer = openLink(mode, `${appUrl}${nav.href}`, `Open ${nav.label} →`)
  const empty = weekSubjects.emptyState(data)
  const withheld = s.withheld ?? []
  const max = Math.max(1, ...s.rows.map((r) => r.market?.monthSoFar.k ?? 0))

  if (empty) {
    return (
      <BlockFrame title={MARKET_SUBJECTS_WEEK_TITLE} mode={mode} footer={footer} roomy card>
        <BlockEmpty mode={mode}>{empty}</BlockEmpty>
      </BlockFrame>
    )
  }

  if (mode === 'email') {
    const c = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '5px 10px 5px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
    const num = { ...c, fontFamily: FONT.mono, textAlign: 'right' as const }
    const head = { ...c, borderTop: 0, color: EMAIL.muted, fontSize: 11 }
    return (
      <BlockFrame title={MARKET_SUBJECTS_WEEK_TITLE} mode={mode} footer={footer} roomy card>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Subject</th>
              <th style={{ ...head, textAlign: 'right' }}>Videos {month}</th>
              <th style={{ ...head, textAlign: 'right' }}><span data-copy="level">Share{n != null ? <span style={{ fontFamily: FONT.mono, fontWeight: 400 }}> of {fmtInt(n)}</span> : null}</span></th>
              <th style={{ ...head, textAlign: 'right' }}>With this update</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.id}>
                <td style={c}>{r.label}{r.calibration === 'provisional' ? <> <CalibrationTag calibration={r.calibration} mode={mode} /></> : null}</td>
                <td style={num}><span data-copy="figure">{r.market?.monthSoFar.k != null ? fmtInt(r.market.monthSoFar.k) : '·'}</span></td>
                <td style={num}><span data-copy="figure">{shareCell(r.market?.monthSoFar.k ?? null, n)}</span></td>
                <td style={{ ...num, color: EMAIL.ink2 }}><span data-copy="figure">{plus(r.market?.thisUpdate ?? null)}</span></td>
              </tr>
            ))}
            {withheld.map((r) => (
              <tr key={r.id}>
                <td style={c} colSpan={4}>{r.label} <CalibrationTag calibration={r.calibration} unread={r.unread} mode={mode} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </BlockFrame>
    )
  }

  return (
    <BlockFrame title={MARKET_SUBJECTS_WEEK_TITLE} mode={mode} footer={footer} roomy card>
      <div role="table" className="flex flex-col">
        <div role="row" className={`grid ${MARKET_COLS} items-end ${RULE.head}`}>
          <span role="columnheader" className={SCALE.head}>Subject</span>
          <span role="columnheader" className="flex flex-col items-end text-right leading-[1.35]">
            <span className="text-[13px] font-medium text-muted-foreground">Videos</span>
            <span className="font-mono text-[12px] text-muted-foreground">{month}</span>
          </span>
          <span role="columnheader" data-copy="level" className="flex flex-col items-end text-right leading-[1.35]">
            <span className="text-[13px] font-medium text-muted-foreground">Share</span>
            {n != null ? <span className="whitespace-nowrap font-mono text-[12px] text-muted-foreground">of {fmtInt(n)}</span> : null}
          </span>
          <span role="columnheader" className="flex flex-col items-end text-right leading-[1.35]">
            <span className="whitespace-nowrap text-[13px] font-medium text-muted-foreground">With this</span>
            <span className="font-mono text-[12px] text-muted-foreground">update</span>
          </span>
        </div>
        {s.rows.map((r) => {
          const k = r.market?.monthSoFar.k ?? null
          return (
            <div key={r.id} role="row" className={`grid ${MARKET_COLS} min-h-14 items-center py-2.5 ${RULE.row}`}>
              <span role="rowheader" className="flex min-w-0 flex-col gap-1.5">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className={`[text-wrap:pretty] ${SCALE.row}`}>{r.label}</span>
                  {r.calibration === 'provisional' ? <CalibrationTag calibration={r.calibration} className="text-[12px]" /> : null}
                </span>
                {k != null ? (
                  <span aria-hidden className="block h-1 w-full max-w-[224px] rounded-[2px] bg-inner">
                    <span className="block h-full rounded-[2px] bg-foreground" style={{ width: `${Math.max(1, Math.min(100, (k / max) * 100))}%` }} />
                  </span>
                ) : null}
              </span>
              <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{k != null ? fmtInt(k) : '·'}</span></span>
              <span className={SCALE.num}><span data-copy="figure">{shareCell(k, n)}</span></span>
              <span className={SCALE.prev}><span data-copy="figure">{plus(r.market?.thisUpdate ?? null)}</span></span>
            </div>
          )
        })}
        {withheld.map((r) => (
          <div key={r.id} role="row" className={`flex min-h-12 flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 ${RULE.row} last:border-b-0`}>
            <span role="rowheader" className={SCALE.row}>{r.label}</span>
            <CalibrationTag calibration={r.calibration} unread={r.unread} className="text-[12px]" />
          </div>
        ))}
      </div>
    </BlockFrame>
  )
}
