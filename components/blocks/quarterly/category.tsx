import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuotes } from '@/components/blocks/quote'
import { Sparkline } from '@/components/charts/sparkline'
import { panelRule } from '@/components/pages/overview/category'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, monthName } from '@/lib/format'
import type { CalendarSeries } from '@/lib/charts/calendar'
import { monthlyLineLabel, type Mover } from '@/lib/pages/overview'
import { hasQuote } from '@/lib/renderables/quotes-freeze'
import type { CategoryPage, QuarterlyData, QuarterMover } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE } from '@/lib/reports/quarterly'
import { Card, Chip, Column, Columns, Eyebrow, Note, Row } from './parts'

// QR4 · What the category talked about (mock page 4).
//
// MOVERS AND THE MIX ARE A MONTH, AND THE PAGE SAYS SO IN ITS FIRST LINE.
// This is the one page of a quarterly review most likely to be misread: a
// reader holding a document headed "Q3" will take every figure on it for a
// quarter figure unless told otherwise, and the movers, the kind mix, the mood
// and the attention line are all this month against last. The mock's own note
// says it; `CategoryPage.basis` composes it; it is printed before any row.
//
// THE QUARTER'S OWN READING, where the window pair could be taken, is a
// SEPARATE list below, banded by `quarterChange` over distinct videos. Where
// M3 is unapplied the list is empty and the page says the comparison is not
// recorded — it does not add three months together to fill the gap.
//
// A THEME'S LABEL IS THE MODEL's WORDS (`pass_b_theme` policy 'none'), so every
// site that prints one marks it `data-copy="subject"`. Six blocks failed rule
// (c) on live labels in the Block B fix pass for exactly this.
//
// ---- the port (Block D wave 2) -------------------------------------------------
//
// THE ARTBOARD'S 7fr / 5fr, AND THE TWO MOVER COLUMNS. What it does NOT take
// from the artboard:
//
//   · "Movers of the quarter" as a heading (D6). They are a month against the
//     month before it and on the normal send that month is outside the quarter.
//   · "Growing" / "Fading" as column headings (rule (c) — both are in
//     `DIRECTION_WORDS`). The monthly report's own headings are the precedent:
//     "Cleared their band · a larger share than last month", which is code
//     naming what was done to a number beside the band that earned it.
//   · the stacked partition bar and its "Other kinds" remainder (D4). Kinds are
//     INDEPENDENT shares of one denominator — measured at 175% and 228% summed
//     — so each is a row with its own "of N" and nothing reads as a whole.
//   · "▼ 18% since June" on the attention panel (D7, D8). The panel re-froze on
//     3 September, so that span compares two sets of accounts; the chart draws
//     the RULE at the re-freeze and the badge is `AttentionBlock.verdict`,
//     which on this corpus is the refusal.
//
// What it does take: the sparkline column (`Mover.spark`, added additively in
// wave 2), the month series under each row, the two READER_FLAGS as their own
// tinted block, the quote, and the mood's four rows with "of N judged" — Mixed
// included, which the mock folds away (D15).

/** A theme's label is the MODEL's words (`pass_b_theme`, policy 'none'), so it
 *  is marked and its slot is named — that is what buys the rule-(c) exemption,
 *  and a marker with no slot buys nothing. An AUDIENCE's name is code's, and
 *  marking it would claim a provenance it does not have. */
function ObjectLabel({ label, model, mode }: { label: string; model: boolean; mode: RenderMode }): ReactNode {
  if (!model) return mode === 'email' ? <strong>{label}</strong> : <span className="font-medium">{label}</span>
  return mode === 'email'
    ? <strong data-copy="subject" data-slot="pass_b_theme">{label}</strong>
    : <span data-copy="subject" data-slot="pass_b_theme" className="font-medium">{label}</span>
}

/** The months a mover's own series carried, named — the artboard's
 *  "Jul 5.1 · Aug 6.8 · Sep 9.4". A month with no reading is not named, which
 *  is why this is not simply the axis. */
function seriesLine(mover: Mover): string | null {
  const spark = mover.spark
  const months = mover.sparkMonths
  if (!spark || !months) return null
  const read = months
    .map((m, i) => (spark[i] == null ? null : `${monthName(m).split(' ')[0]} ${spark[i]}`))
    .filter((v): v is string => v != null)
  return read.length ? read.join(' · ') : null
}

/**
 * One mover row: the label, the figure with its "of N", the sparkline, the
 * badge, the flags and the months.
 *
 * THE LINE IS REFUSED BELOW THREE READINGS AND THE MONTHS ARE NAMED INSTEAD —
 * `monthlyLineLabel`, the same rule OV2 and the printed deck already apply. A
 * chart is a direction claim too, and two points are not a direction.
 */
function MoverRow({ mover, mode }: { mover: QuarterMover; mode: RenderMode }) {
  const email = mode === 'email'
  const drawn = (mover.spark ?? []).filter((v) => v != null).length >= 3
  const label = mover.spark && mover.sparkMonths ? monthlyLineLabel(mover.spark, mover.sparkMonths) : null
  const months = seriesLine(mover)
  return (
    <div
      className={email ? undefined : 'flex flex-col gap-0.5 border-b border-border/70 pb-2 text-[12.5px] leading-[1.35]'}
      style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` } : undefined}
    >
      <ObjectLabel label={mover.label} model mode={mode} />
      <div className={email ? undefined : 'flex items-center justify-between gap-2'}>
        <FigureCell
          mode={mode}
          value={mover.pct == null ? '—' : fmtPct(mover.pct)}
          of={`${fmtInt(mover.k)} of ${fmtInt(mover.n)}`}
        />
        {!email && drawn ? <Sparkline values={mover.spark as (number | null)[]} color="var(--cat)" animate={false} /> : null}
      </div>
      <div className={email ? undefined : 'flex flex-wrap items-center gap-1.5'}>
        <BlockMovement verdict={mover.verdict} unit="pts" mode={mode} />
        {/* THE FLAG IS NOT A DIRECTION, AND IT SITS INSIDE A VERDICT NODE. Both
            `new` and `gone quiet` are in `DIRECTION_WORDS`, so rule (c) sweeps
            them anywhere else; the wording is the build's own ("first read in
            September"), which is a fact about the record and not about a
            series. */}
        {mover.flags.includes('new') ? (
          <span data-copy="verdict" className={email ? undefined : 'text-[11px] text-muted-foreground'}>first read this month</span>
        ) : null}
      </div>
      {months ? (
        <span data-copy="figure" className={email ? undefined : 'font-mono text-[10px] text-muted-foreground'}>
          {months}{!drawn && label ? ` · ${label}` : ''}
          {mover.firstHeard ? ` · first read ${monthName(mover.firstHeard)}` : ''}
        </span>
      ) : null}
    </div>
  )
}

/** The panel's months, as the calendar draws them. Not a share — the panel is a
 *  fixed set of accounts and the figure is the comment count under their
 *  videos, so there is no denominator and no floor. The same series
 *  `components/pages/overview/category.tsx` draws, so the page and the deck
 *  cannot disagree about the shape of it. */
function attentionSeries(c: CategoryPage, month: string): CalendarSeries[] {
  if (!c.attention || c.attention.months.length === 0) return []
  return [{
    label: c.label,
    color: 'var(--cat)',
    points: c.attention.months.map((m) => ({
      month: m.month,
      value: m.comments,
      state: m.month === month ? ('filling' as const) : ('read' as const),
      k: null,
      n: null,
    })),
  }]
}

export const quarterlyCategory: Block<QuarterlyData> = {
  key: 'quarterly.category',
  title: QUARTER_PAGE_TITLE.category,
  question: QUARTER_PAGE_QUESTION.category,

  render(data, mode = 'app') {
    const c = data.category
    const email = mode === 'email'
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyCategory.title}
        question={quarterlyCategory.question}
        mode={mode}
        meta={c.denominator != null ? `${c.label} · ${fmtInt(c.denominator)} videos in ${c.monthLabel}` : c.label}
      >
        {children}
      </BlockFrame>
    )
    const empty = quarterlyCategory.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const voices = c.quotes.filter(hasQuote)
    const panel = attentionSeries(c, data.monthStatus === 'filling' ? data.month : '')

    const movers = (
      <Column mode={mode} gap={10}>
        <Eyebrow mode={mode}>What moved most</Eyebrow>
        {c.growing.length + c.fading.length > 0 ? (
          <Columns weights={[1, 1]} gap={24} mode={mode}>
            <Column mode={mode} gap={8}>
              <span className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}>
                Cleared their band · a larger share than last month
              </span>
              {c.growing.map((m) => <MoverRow key={m.id} mover={m} mode={mode} />)}
              {c.growing.length === 0 ? <Note mode={mode}>Nothing took a larger share than last month.</Note> : null}
            </Column>
            <Column mode={mode} gap={8}>
              <span className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}>
                Cleared their band · a smaller share than last month
              </span>
              {c.fading.map((m) => <MoverRow key={m.id} mover={m} mode={mode} />)}
              {c.fading.length === 0 ? <Note mode={mode}>Nothing took a smaller share than last month.</Note> : null}
            </Column>
          </Columns>
        ) : (
          <Note mode={mode}>{c.moversNote ?? 'Nothing moved clearly this month.'}</Note>
        )}

        {/* `qr.p4.flags` · the two READER_FLAGS in the mock's tinted block.
            "Gone quiet" is the REGISTER's own dormancy rule, read here exactly
            as Voice and the monthly report read it — never a second rule for
            one word — and the month beside it is the last month the theme
            carried a reading on this axis. */}
        <div
          className={email ? undefined : 'flex flex-col gap-1.5 rounded-md bg-inner px-3 py-2.5'}
        >
          {c.quiet && c.quiet.length > 0 ? (
            c.quiet.map((q) => (
              <p key={q.id} className={email ? undefined : 'm-0 flex items-start gap-2 text-[12.5px] leading-[1.4]'}>
                {/* THE MOCK'S CHIP, INSIDE A VERDICT NODE. "gone quiet" and
                    "new" are both in `DIRECTION_WORDS`, so rule (c) sweeps them
                    wherever they are not inside one — the marker is what says
                    this is the register's flag and not a claim about a series.
                    The wording and the month beside it are the build's own, the
                    same two Voice and the monthly movers print. */}
                <span data-copy="verdict"><Chip tone="plain" mode={mode}>gone quiet</Chip></span>
                <span>
                  <ObjectLabel label={q.label} model mode={mode} />
                  {q.lastHeard ? ` — last read ${monthName(q.lastHeard)}` : ''}
                </span>
              </p>
            ))
          ) : (
            <Note mode={mode}>{c.quietNote}</Note>
          )}
          {c.moversNote ? <Note mode={mode}>{c.moversNote}</Note> : null}
        </div>

        {voices.length > 0 ? (
          <BlockQuotes mode={mode} quotes={voices.map((q) => ({ quote: q.quote, cite: q.cite }))} />
        ) : null}
      </Column>
    )

    const aside = (
      <Column mode={mode} gap={10}>
        <div className={email ? undefined : 'flex flex-col gap-2'}>
          <Eyebrow mode={mode}>Kind of thing said</Eyebrow>
          {c.kinds.length > 0 ? (
            <>
              {c.kinds.map((k) => (
                <Row
                  key={k.kind}
                  mode={mode}
                  label={k.label}
                  aside={<BlockMovement verdict={c.kindVerdicts[k.kind] ?? null} unit="pts" mode={mode} />}
                >
                  <FigureCell
                    mode={mode}
                    value={k.pct == null ? '—' : fmtPct(k.pct)}
                    of={`${fmtInt(k.videos)} of ${fmtInt(k.denominator)}`}
                  />
                </Row>
              ))}
              {/* D4 · WHY THERE IS NO BAR HERE. Said once, under the rows. */}
              <Note mode={mode}>
                One comment is one kind and a video can carry several, so these are independent shares of the same{' '}
                <span data-copy="figure">{fmtInt(c.kinds[0].denominator)}</span> videos and do not add up to them.
                {c.reddit && c.reddit.pct != null ? (
                  <> Reddit carried <span data-copy="figure">{fmtInt(c.reddit.reddit)} of {fmtInt(c.reddit.videos)}</span> of the question-and-objection videos{c.reddit.exact ? '' : ' (a video carrying both is counted in each)'}.</>
                ) : null}
              </Note>
            </>
          ) : (
            <Note mode={mode}>{c.kindsNote ?? 'What kind of thing was said is not recorded for this workspace yet.'}</Note>
          )}
        </div>

        <div className={email ? undefined : 'flex flex-col gap-2'}>
          <Eyebrow mode={mode}>Attention, month by month</Eyebrow>
          {panel.length > 0 ? (
            <Card mode={mode}>
              <BlockCalendar
                blockKey={`${quarterlyCategory.key}.attention`}
                axis={c.attention?.axis ?? []}
                series={panel}
                rules={panelRule(c)}
                mode={mode}
                height={160}
                format={(v) => fmtInt(v)}
                label="comments under the panel's videos, month by month"
              />
              <div className={email ? undefined : 'flex flex-wrap items-center gap-2'}>
                <BlockMovement verdict={c.attention?.verdict ?? null} unit="pts" mode={mode} />
                <Note mode={mode}>
                  {c.attention?.accountCount != null
                    ? <>Comments under a fixed panel of <span data-copy="figure">{fmtInt(c.attention.accountCount)}</span> accounts.</>
                    : 'Comments under a fixed panel of accounts.'}
                  {' '}The panel is re-frozen when what we track changes, and the rule on the line marks where.
                </Note>
              </div>
            </Card>
          ) : (
            <Note mode={mode}>{c.attentionNote ?? 'No panel has been frozen for this workspace yet, so attention is not read.'}</Note>
          )}
        </div>

        <div className={email ? undefined : 'flex flex-col gap-2'}>
          <Eyebrow mode={mode}>Mood</Eyebrow>
          {c.mood ? (
            <>
              {c.mood.shares.map((m) => (
                <Row key={m.mood} mode={mode} label={m.label}>
                  <FigureCell
                    mode={mode}
                    value={m.pct == null ? '—' : fmtPct(m.pct)}
                    of={`${fmtInt(m.videos)} of ${fmtInt(m.judged)} judged`}
                  />
                </Row>
              ))}
              <div className={email ? undefined : 'flex flex-wrap items-center gap-2'}>
                <BlockMovement verdict={c.mood.verdict} unit="pts" mode={mode} />
                {c.mood.framingPct != null ? (
                  <Note mode={mode}>
                    <span data-copy="figure">{fmtPct(c.mood.framingPct)}</span> of the judged videos were read from how the
                    video framed them rather than from a comment.
                  </Note>
                ) : null}
              </div>
            </>
          ) : (
            <Note mode={mode}>{c.moodNote ?? 'The mood of the category is not recorded for this workspace yet.'}</Note>
          )}
        </div>
      </Column>
    )

    return frame(
      <div className={email ? undefined : 'flex min-h-0 flex-1 flex-col gap-2'}>
        <Note mode={mode} tone="body">{c.gate ? `${c.basis} ${c.gate}` : c.basis}</Note>
        <Columns weights={[7, 5]} mode={mode}>
          {movers}
          {aside}
        </Columns>

        {c.quarterVolume || c.quarter.length > 0 ? (
          <div className={email ? undefined : 'mt-2'}>
            <Eyebrow mode={mode}>The quarter against the quarter before it</Eyebrow>
            {/* TWO COUNTS, NOT A BADGE. How much was read is a volume and not
                a share of anything, so it is stated and never banded — the
                first cut compared it with itself and printed "4,147 of 4,147 ·
                no clear change" for every audience on the page. */}
            {c.quarterVolume ? (
              <Row mode={mode} label="How much was read">
                {/* NO `of`, AND THAT IS THE STATEMENT. `FigureCell` marks the
                    pair as a LEVEL, and rule (b) reads a level node for its
                    "of N" — which a volume does not have, because a volume is
                    not a share of anything. Omitting `of` is the primitive's
                    own way of saying so; "against 3,810 in the quarter before
                    it" is a second count and sits beside the cell, not inside
                    it. The first cut of this row banded the volume against
                    itself and printed "4,147 of 4,147 · no clear change". */}
                <FigureCell mode={mode} value={`${fmtInt(c.quarterVolume.videos)} videos`} />
                <Note mode={mode}>against {fmtInt(c.quarterVolume.before)} in the quarter before it</Note>
              </Row>
            ) : null}
            {c.quarter.map((v) => (
              <Row
                key={`${v.objectKind}:${v.objectId}`}
                mode={mode}
                label={<ObjectLabel label={v.objectLabel} model={v.objectKind === 'theme'} mode={mode} />}
                aside={<BlockMovement verdict={v} unit="pts" mode={mode} />}
              >
                <FigureCell mode={mode} value={fmtInt(v.value.k)} of={`of ${fmtInt(v.value.n)}`} />
              </Row>
            ))}
            {c.quarterNote ? <Note mode={mode}>{c.quarterNote}</Note> : null}
          </div>
        ) : c.quarterNote ? (
          <Note mode={mode}>{c.quarterNote}</Note>
        ) : null}
      </div>,
    )
  },

  // `qr.p4.quote`, on the same rule as page 3: refs, resolved at render.
  quotes(data) {
    return data.category.quotes.map((q) => q.quote.ref)
  },

  verdicts(data) {
    return [
      ...data.category.growing.map((m) => m.verdict),
      ...data.category.fading.map((m) => m.verdict),
      ...Object.values(data.category.kindVerdicts).filter((v): v is NonNullable<typeof v> => v != null),
      ...data.category.quarter,
    ]
  },

  emptyState(data) {
    const c = data.category
    if (c.denominator == null && c.growing.length === 0 && c.fading.length === 0) {
      return 'Nothing has been read for the category in this quarter yet.'
    }
    return null
  },
}
