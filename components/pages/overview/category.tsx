import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockProportion } from '@/components/blocks/bars'
import type { CalendarRule, CalendarSeries } from '@/lib/charts/calendar'
import { TileBlock } from '@/components/shell/tile'
import { TileColumns } from '@/components/shell/page-grid'
import { fmtInt, fmtPct, monthName, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import { moodLabel } from '@/lib/reading/mood'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { AttentionBlock, CategoryBlock, Mover, OverviewData, Voice } from '@/lib/pages/overview'
import { DirectionWord } from './subjects'

// OV3 · What the category is saying (design §3 OV3). Four lines: what kind of
// thing is being said, what grew and what faded, the mood, and the attention
// under a fixed panel.
//
// EVERY ONE OF THE FOUR CAN BE ABSENT, AND SAYS SO IN ITS OWN WORDS. Three of
// them read `month_kind_readings` / `month_audience_stats`, which land with M5;
// the movers read the theme months, which are seeded. A line with no reading
// prints the sentence naming what is not recorded, never a zero — "nobody asked
// a question this month" and "we have no reading of questions this month" are
// different sentences (lib/reading/kinds.ts).

const MOOD_COLOR: Record<string, string> = {
  positive: 'var(--positive)',
  mixed: 'var(--mixed)',
  neutral: 'var(--neutral-seg)',
  negative: 'var(--negative)',
}

/** One line of the block, with its own heading — so a line that is absent is
 *  visibly absent rather than silently missing. */
function Line({ label, mode, children }: { label: string; mode: RenderMode; children: ReactNode }) {
  if (mode === 'email') {
    return (
      <div style={{ paddingTop: 6 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{label}</div>
        <div style={{ marginTop: 2 }}>{children}</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/** "Sep 2026 against Aug 2026", from the verdict of a row that is printed. */
function moversBasis(c: OverviewData['category']): string | null {
  for (const m of [...c.growing, ...c.fading]) {
    const v = m.verdict
    if (v?.window?.from && v.basis?.from) return `${monthName(v.window.from)} against ${monthName(v.basis.from)}`
  }
  return null
}

function MoverRow({ mover, mode }: { mover: Mover; mode: RenderMode }) {
  const body = (
    <>
      {/* THE THEME'S OWN NAME, so `subject` and not bare markup: PROSE_POLICY
          marks `pass_b_theme` 'none' (lib/prose/scrub.ts), so a theme's label
          is never direction-scrubbed at write time and the product's own
          register carries "Concerns about declining quality" and "Technology
          should improve access". Rule (c) sweeps unmarked markup, so an
          unmarked label fails the contract on whichever theme happens to rank
          — the word is about the thing, not about a reading of it. */}
      {/* A THEME'S LABEL IS A SENTENCE, NOT A WORD. Sealand's movers run to
          "Will it survive a wet commute"; at a third of the tile with a figure
          cell and two badges beside it, `truncate` cut them to one character in
          the side-by-side. The row wraps instead, which is what the artboard's
          own 470px column does not have to do and is the honest answer at a
          third of the width. */}
      <span data-copy="subject" data-slot="pass_b_theme" className={mode === 'email' ? undefined : 'min-w-[9rem] flex-1 basis-[9rem]'}>{mover.label}</span>
      {/* THE SHARE OVER ITS COUNT, in the artboard's own two-line cell. The
          mock prints "9.4%" and "130" in two separate fixed columns with the
          denominator nowhere; a level without its "of N" is a score (D10). */}
      <span className={mode === 'email' ? undefined : 'w-[86px] shrink-0'}>
        <FigureCell
          mode={mode}
          value={mover.pct == null ? '—' : fmtPct(mover.pct)}
          of={`${fmtInt(mover.k)} of ${fmtInt(mover.n)}`}
        />
      </span>
      <BlockMovement verdict={mover.verdict} unit="pts" mode={mode} />
      <DirectionWord direction={mover.direction} mode={mode} />
      {mover.isNew ? (
        // "New" is a FLAG on a row, not a direction claim, and it is stated
        // only where the row's own months support it (design §3 VO2).
        <span data-copy="verdict" className={mode === 'email' ? undefined : 'text-[11px] text-muted-foreground'}>first heard this month</span>
      ) : null}
    </>
  )
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' }}>{body}</div>
    : <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">{body}</div>
}

/** The attention line's chart: panel comments by month. Not a share — the panel
 *  is a fixed set of accounts and the figure is the comment count under their
 *  videos, so there is no denominator and the floor is turned off. */
function attentionSeries(c: CategoryBlock, month: string): CalendarSeries | null {
  if (!c.attention || c.attention.months.length === 0) return null
  return {
    label: c.label,
    color: 'var(--cat)',
    // THE EXCLUSION IS A SENTENCE, NOT A LEGEND ITEM (design review High 7c).
    // `CalendarSeries.excludes` renders INSIDE the legend swatch's own row, so
    // in this 380px column a two-item legend seated a forty-word paragraph on
    // the same line as a 2px dot and wrapped "The category" onto two lines
    // beside it — three different things reading as one caption. The note is
    // printed under the chart in its own right (`PANEL_EXCLUDES_NOTE` below),
    // where it is a sentence about the basis and is legible as one.
    points: c.attention.months.map((m) => ({
      month: m.month,
      value: m.comments,
      state: m.month === month ? ('filling' as const) : ('read' as const),
      k: null,
      n: null,
    })),
  }
}

/**
 * The axis rule at the panel's re-freeze.
 *
 * THE MOCK'S "−18% since June" IS THE CLAIM THIS REPLACES. June and September
 * were read over two different sets of accounts — the panel re-froze on
 * 3 September — so a percentage across that line compares two populations and
 * calls it a change in attention. The rule DRAWS the break instead: the reader
 * sees where the basis moved and can weigh the two stretches themselves, which
 * is the same answer decision U gives for a tracking change.
 *
 * Drawn only where the freeze falls inside the drawn axis and something is
 * drawn before it. A rule on the first month of the axis marks a break with
 * nothing on the other side of it.
 */
export function panelRule(c: Pick<CategoryBlock, 'attention'>): CalendarRule[] {
  const at = c.attention?.panel?.frozen_at
  if (!at || !c.attention) return []
  const month = `${at.slice(0, 7)}-01`
  const i = c.attention.axis.indexOf(month)
  if (i <= 0) return []
  // `tracking_change`, WHICH IS THE WORD THE VERDICT BESIDE IT CARRIES. A panel
  // re-freeze is what `buildStandings` calls a tracking change, and the refusal
  // printed on the same card says `tracking_change` — so the rule drawing the
  // same event must not call it something else. `RULE_STROKE` draws the two
  // identically today, which is exactly why the drift would have gone unseen.
  return [{ month, kind: 'tracking_change', label: 'panel re-frozen', at: at.slice(0, 10) }]
}

/** The month's voices, where they belong to the category rather than to a
 *  subject. Exported so a wave-2 render and this block's `quotes()` cannot
 *  disagree about which two they are. */
export function categoryVoices(data: OverviewData): Voice[] {
  const lead = data.sentence.lead
  if (!lead || lead.objectKind !== 'theme') return []
  if (lead.audience !== data.category.audience) return []
  return data.sentence.voices
}

/**
 * The panel's own facts, in one mono line (`main.category.attention.note`, D7).
 *
 * The artboard writes "a fixed panel of 214 creators first seen before 1 Apr ·
 * 50,300 → 41,200 · panel re-frozen 3 Sep" — five facts, and the build printed
 * one of them. Each clause is drawn only where the field behind it exists, so a
 * workspace whose panel has no cutoff recorded loses that clause and keeps the
 * rest.
 *
 * "ACCOUNTS", NOT "CREATORS". A panel row is an account we gather from; whether
 * a person is behind it is a claim the product does not hold (D14), and
 * `THIRTEEN_WORDS` has no word for one.
 *
 * AND THE SPAN IS NOT A CHANGE. "50,300 → 41,200" prints two levels and no
 * magnitude: the mock's "−18% since June" compares two months read over two
 * different sets of accounts, because the panel re-froze between them, and a
 * raw comment count has no denominator to band anyway. The banded step beside
 * it is `AttentionBlock.verdict`, which says `comparison refused` for exactly
 * that reason.
 */
export function panelNote(a: AttentionBlock | null): string | null {
  if (!a) return null
  const parts: string[] = []
  if (a.accountCount != null) {
    parts.push(`a fixed panel of ${fmtInt(a.accountCount)} account${a.accountCount === 1 ? '' : 's'}`)
  }
  const cutoff = a.panel?.cutoff
  if (cutoff) parts.push(`first seen before ${shortDate(cutoff)}`)
  // A31: why Reddit is left out is How to read's; the panel says only that it is.
  if (parts.length > 0) parts.push('excl. Reddit')
  const months = a.months
  if (months.length >= 2) {
    const first = months[0]
    const last = months[months.length - 1]
    // AN ARROW IS SOMETHING A READER SUBTRACTS ACROSS (code review I5). The
    // docblock above argues — correctly — that the mock's "−18% since June" is
    // refused because the panel RE-FROZE between the two months, and then this
    // line printed those same two numbers with an arrow between them, which
    // invites exactly the subtraction the verdict beside it refuses. Where the
    // re-freeze falls inside the span, the break is named between them; where
    // it does not, they are still two levels and not a change, so they are
    // printed as two dated levels and never as a run.
    const frozenAt = a.panel?.frozen_at
    const refrozenWithin =
      frozenAt != null && `${frozenAt.slice(0, 7)}-01` > first.month && `${frozenAt.slice(0, 7)}-01` <= last.month
    if (refrozenWithin) {
      // The break carries its own date, so the trailing "panel frozen 3 Sep"
      // clause would be the same fact a second time in the same line.
      parts.push(`${monthName(first.month)} ${fmtInt(first.comments)} comments`)
      parts.push(`panel re-frozen ${shortDate(frozenAt!)}`)
      parts.push(`${monthName(last.month)} ${fmtInt(last.comments)} comments under the new panel`)
      return parts.join(' · ')
    }
    parts.push(`${monthName(first.month)} ${fmtInt(first.comments)} comments`)
    parts.push(`${monthName(last.month)} ${fmtInt(last.comments)} comments`)
  }
  const frozen = a.panel?.frozen_at
  if (frozen) parts.push(`panel frozen ${shortDate(frozen)}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "What moved most · Sep 2026 against Aug 2026", or the heading alone where
 *  no printed row carries a basis. */
export function moversLabel(c: CategoryBlock): string {
  // A34: the month pair is the block meta's; said once.
  void c
  return 'What moved most'
}

/**
 * "1,388 category videos this month · Sep vs Aug" (`main.category.header`).
 *
 * THE SECOND HALF IS THE BASIS AND IT WAS NOWHERE IN THE HEADER. Every change
 * on this block is drawn against the month before, and the meta stated the
 * denominator alone — so the one line that could have said what the block
 * compares against said only how big it is. Taken off a printed row's own
 * verdict (`moversBasis`), never computed here, so the header can never name a
 * comparison the block did not draw.
 */
/** What a kind's change cell says when nothing compared it — never a blank,
 *  and never a state word, because no comparison reached a state. */
export const KIND_NOT_COMPARED = 'not compared'

/**
 * The attention chart's INTRINSIC box, which is not its rendered width.
 *
 * `CalendarLine` scales its viewBox uniformly into whatever container it is
 * handed and sizes every label in viewBox units, so the intrinsic width is the
 * scale factor and nothing else. This chart's container is the third of a
 * `TileColumns of={3}` inside a 12-column tile — about 352px at 1440 — and the
 * 880-unit default scaled the whole drawing to 0.40, which is a 10px axis label
 * rendered at 4.0px (SH1 / M2).
 *
 * The pads are the artboard's own (`Main.dc.html` §3 draws `viewBox="0 0 300
 * 88"`, plot from x=44, end labels at x=234): 44 on the left for the two y
 * labels, and the gutter on the right wide enough for the whole end label —
 * "The category 41,200" sets about 118 units at 11px, and `CalendarLine` draws
 * it at `width - padR + 10` and clips it with nothing.
 */
const CHART_W = 352
const CHART_H = 110
const CHART_PAD_L = 44
const CHART_PAD_R = 132

export function categoryMeta(c: CategoryBlock): string | undefined {
  if (c.denominator == null) return undefined
  const basis = moversBasis(c)
  const videos = `${fmtInt(c.denominator)} category videos this month`
  return basis ? `${videos} · ${basis}` : videos
}

export const overviewCategory: Block<OverviewData> = {
  key: 'overview.category',
  title: 'What the category is saying',
  question: 'What is this category talking about, and how does it feel about it?',

  render(data, mode = 'app', ctx) {
    const c = data.category
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/voice`
    const series = attentionSeries(c, data.month)

    // ONE ROW PER KIND, EACH WITH ITS OWN DENOMINATOR (D4/D10). The artboard
    // draws three rows — label, share, change — and the build wrapped them into
    // a flowing line of inline items. What the artboard does NOT get is its
    // "Other kinds" remainder or anything that reads as a partition: kinds
    // overlap (measured 175%–228% across one denominator), so each row is an
    // independent share of one population and never a slice of a whole.
    const kinds = c.kinds.length > 0 ? (
      <>
        {/* THE ROW IS CAPPED, SO A LABEL AND ITS FIGURE STAY TOGETHER (Block D
            wave 3, M23). The row is a `min-w-0 flex-1 truncate` label beside a
            fixed 104px cell, which is right in this block's own ~378px column
            and right in the artboard's ~470px one. On the marketing sheet the
            block runs the full 1,088px of the page and `TileColumns` is below
            its `xl` breakpoint, so every line stretches and the label sat about
            850px from the figure it belongs to — a reader tracks across dead
            paper to pair them.
            A CAP AND NOT A BAR. `BlockProportion` is imported here for the mood
            row and is the wrong shape for this one: it draws a PARTITION, and
            kinds overlap (measured 175%–228% across one denominator), so each
            row is an independent share of one population and never a slice of a
            whole — which is the sentence directly above this one. The cap is
            the artboard's own column, so nothing changes in the app. */}
        <div className={email ? undefined : 'flex max-w-[440px] flex-col gap-1.5'}>
          {c.kinds.map((k) => (
            <span key={k.kind} className={email ? undefined : 'flex items-center gap-2 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginRight: 10 } : undefined}>
              {/* AND IT WRAPS RATHER THAN TRUNCATES (Block D wave 3b, `decks`).
                  M23's cap answered the stretch this row had on paper while
                  `TileColumns` was below its `xl` breakpoint; the columns are
                  real on paper now, so the row is the block's own ~340px and
                  `truncate` cut "Praise" to "Prai…" on the marketing brief's
                  fourth sheet. `MoverRow` two hundred lines up made exactly
                  this call for exactly this reason — the row wraps instead,
                  "which is the honest answer at a third of the width" — and a
                  kind's label is two words where a theme's is a sentence, so
                  the wrap costs at most one line. */}
              <span className={email ? undefined : 'min-w-0 flex-1'}>{k.label}</span>
              <span className={email ? undefined : 'w-[104px] shrink-0'}>
                <FigureCell
                  mode={mode}
                  value={k.pct == null ? '—' : fmtPct(k.pct)}
                  of={`${fmtInt(k.videos)} of ${fmtInt(k.denominator)}`}
                />
              </span>
              {/* AN ABSENCE THAT SAYS WHAT IT IS (design review Medium 11).
                  `BlockMovement` renders null for a null verdict, so a kind
                  nothing compared left a BLANK cell between two siblings that
                  had values — the one absence on this page that did not say
                  what it was. A null verdict is not "no clear change" (that is
                  a state a comparison reached); it is no comparison at all,
                  and the words say exactly that. */}
              {c.kindVerdicts[k.kind] ? (
                <BlockMovement verdict={c.kindVerdicts[k.kind]} unit="pts" mode={mode} />
              ) : (
                <span
                  className={email ? undefined : 'whitespace-nowrap text-[12px] text-muted-foreground'}
                  style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}
                >
                  {KIND_NOT_COMPARED}
                </span>
              )}
            </span>
          ))}
        </div>
        {/* "more — one click down →" (`main.category.kind.more`). There is no
            field behind it and there does not need to be: one click down from
            these rows IS Voice, which is where every kind can be filtered.
            IT NO LONGER PICKS A KIND FOR THE READER (design review Medium 12,
            code review I9). It hard-coded `c.kinds[0]?.kind`, so a control
            sitting under three rows silently filtered Voice to whichever kind
            happened to sort first — and the block's own test pinned that
            behaviour rather than catching it. A control under N rows either
            belongs on each row or belongs to none of them; this one goes to
            the page unfiltered, and the reader chooses there. */}
        {openLink(mode, `${ctx.appUrl}/dashboard/voice`, 'more · one click down →')}
      </>
    ) : (
      <BlockEmpty mode={mode}>{c.kindsNote ?? 'No kind carried a reading this month.'}</BlockEmpty>
    )

    // THE ARTBOARD'S TWO ARMS, WITH THE BUILD'S HEADINGS (`main.category
    // .movers.growing` / `.fading`). The mock heads them "Growing" and
    // "Fading"; rule (c) refuses a direction word outside a verdict node, and
    // it is right to — a heading makes the claim before any row under it has
    // earned it. "a larger share than last month" is code naming what was done
    // to a number, and `DIRECTION_WORDS` leaves `larger`/`smaller` off the list
    // for exactly this sentence (lib/calibration.ts). The LAYOUT is the mock's.
    const arm = (label: string, rows: readonly Mover[]) => (
      <div className={email ? undefined : 'flex flex-col gap-1'}>
        <span
          className={email ? undefined : 'text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted } : undefined}
        >
          {label}
        </span>
        {rows.map((m) => <MoverRow key={m.id} mover={m} mode={mode} />)}
      </div>
    )
    const movers = c.growing.length > 0 || c.fading.length > 0 ? (
      <div className={email ? undefined : 'flex flex-col gap-2.5'}>
        {c.growing.length > 0 ? arm('Larger share than last month', c.growing) : null}
        {c.fading.length > 0 ? arm('Smaller share than last month', c.fading) : null}
      </div>
    ) : (
      <BlockEmpty mode={mode}>{c.moversNote ?? 'Nothing moved clearly this month.'}</BlockEmpty>
    )

    const mood = c.mood ? (
      // THE BAR IS CAPPED TOO, AND FOR A LOUDER REASON (Block D wave 3, M24).
      // On the marketing sheet this block runs the full 1,088px of the page,
      // so a four-segment bar at full chroma ran the width of the sheet,
      // directly above the movers table the sheet is about — the loudest
      // object on a page whose subject is somewhere else. The artboard draws it
      // about 580px wide under its own heading. A cap, not a paler paint: the
      // colours are the mood palette and they mean what they mean.
      <div className={email ? undefined : 'flex max-w-[580px] flex-col'}>
        <BlockProportion
          mode={mode}
          of="videos"
          segments={c.mood.shares
            .filter((s) => s.pct != null)
            .map((s) => ({ label: moodLabel(s), count: s.videos, pct: s.pct as number, color: MOOD_COLOR[s.mood] ?? 'var(--neutral-seg)' }))}
        />
        <p className={email ? undefined : 'm-0 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}>
          <span data-copy="figure">of {fmtInt(c.mood.judged)} judged</span>
          <BlockMovement verdict={c.mood.verdict} unit="pts" mode={mode} />
          {c.mood.framingPct != null ? (
            <span>
              <span data-copy="figure">{fmtPct(c.mood.framingPct)}</span> judged on the video’s framing
            </span>
          ) : null}
        </p>
      </div>
    ) : (
      <BlockEmpty mode={mode}>{c.moodNote ?? 'Nothing in this month has been judged yet.'}</BlockEmpty>
    )

    // GONE QUIET IS A FLAG, NOT A DIRECTION. One of the two READER_FLAGS
    // (lib/calibration.ts), off the register's own dormancy rule — so it
    // carries no verdict, no change and no word for which way anything went.
    // "Last heard" is a month, which is a fact about the record.
    //
    // `?? []` BECAUSE A FROZEN ARTEFACT PREDATES THE FIELD (Block D wave 3,
    // M6). `CategoryBlock.quiet` is new AND required in Block D — 017fc6e's
    // `lib/pages/overview.ts` has neither the field nor `QuietTheme` — and
    // `overview.category` was already named by a section map at 017fc6e, so
    // `document-deck.tsx:1929` hands a snapshot built THEN to this block today
    // with a bare `as never`. Measured: a deck fixture with `category.quiet`
    // removed throws `Cannot read properties of undefined (reading 'length')`,
    // and a throw in a server component takes `/r/<token>`, the in-app viewer,
    // the Studio preview and the PDF route — not one tile. Both reads are
    // guarded, on the precedent already in tree at
    // `blocks/quarterly/category.tsx:223` and at `moves.tsx`'s `readings ?? []`.
    const quietRows = c.quiet ?? []
    const quiet = quietRows.length > 0 ? (
      <div className={email ? undefined : 'flex flex-col gap-1'}>
        {quietRows.map((q) => (
          <div key={q.id} className={email ? undefined : 'flex items-center gap-2 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' } : undefined}>
            <span data-copy="subject" data-slot="pass_b_theme" className={email ? undefined : 'min-w-0 flex-1 truncate'}>{q.label}</span>
            <span data-copy="verdict" className={email ? undefined : 'text-[11px] text-secondary-foreground'}>
              gone quiet{q.lastHeard ? ` · last heard ${monthName(q.lastHeard)}` : ''}
            </span>
          </div>
        ))}
      </div>
    ) : (
      <BlockEmpty mode={mode}>{c.quietNote ?? 'Nothing this page has drawn has stopped being said.'}</BlockEmpty>
    )

    const attention = series ? (
      <>
        <BlockCalendar
          rules={panelRule(c)}
          blockKey={overviewCategory.key}
          // THE ATTENTION LINE KEEPS ITS OWN AXIS, generated as a calendar
          // (lib/pages/overview.ts): the panel is read month by month whatever
          // horizon the page is on, and drawing it on a one-month axis would
          // leave a single dot where the question is whether attention is
          // going anywhere. The months it carries a READING in are not that
          // axis — the chart positions by index, so a June reading and a
          // September one drawn on two adjacent slots close the gap and
          // misdate every point after it.
          axis={c.attention?.axis ?? data.axis}
          series={[series]}
          mode={mode}
          ctx={ctx}
          format={(v) => fmtInt(v)}
          label={`${c.label}, comments under a fixed panel’s videos, by month`}
          // ONE FACT, ONE PLACE, ONE FORMAT (design review High 7a / Medium
          // 16). The caption said "a fixed panel, frozen 2026-09-03" and
          // `panelNote` said "· panel frozen 3 Sep" on the next line — the same
          // fact twice, in two date formats, and the ISO one appears nowhere
          // else in this product's client-facing copy. The date lives in the
          // note, in the reader's own format; the caption says what the axis is
          // drawn over and stops there.
          // THE COLUMN SAYS HOW WIDE IT IS (Block D wave 3, M2 / SH1).
          // `CalendarLine` emits its viewBox at `width="100%"` with every
          // `fontSize` in viewBox UNITS, so the intrinsic width is the scale
          // factor. This chart sits in the third of a `TileColumns of={3}`
          // inside a 12-column tile — about 352px at 1440 — and took the
          // 880-unit default, which is a uniform 0.40 downscale: the axis
          // labels rendered at 4.0px, the re-freeze marker at 3.6px and the
          // end label's own figure at 4.4px. A page whose rule is that a
          // level without its "of N" is a score was printing the number
          // illegibly.
          //
          // THE NUMBERS ARE THE ARTBOARD'S, not a guess. `Main.dc.html` §3
          // draws this chart at `viewBox="0 0 300 88"` with its baseline at
          // x1=44 and its end labels at x=234 — a 44-unit left pad and about
          // 70 reserved on the right. Squared up to the column's real width
          // and given a right gutter that fits the whole end label rather than
          // the artboard's two stacked lines, that is 352 × 110. The caller-states-its-box precedent is
          // `voice-surface/theme.tsx:443`.
          width={CHART_W}
          height={CHART_H}
          padL={CHART_PAD_L}
          padR={CHART_PAD_R}
        />
        {/* THE PANEL'S SIZE AND THE BANDED STEP, which are the two things the
            line has never said. A comment count is a number about a SET, and a
            set with no size is not a measurement — `AttentionPanel
            .account_count` has been built since the panel shipped and drawn
            nowhere. The step beside it is the verdict `verdicts()` has
            declared since WP11 and the loader hard-coded null; where the two
            months sit either side of the re-freeze it prints the refusal, which
            is the honest form of the mock's "−18% since June". */}
        {/* THE NOTE ON ITS OWN LINE, THE STEP ON ITS OWN LINE (design review
            High 7b, code review m11). The two shared one `flex-wrap`
            paragraph: the note wrapped to two lines in a 380px column, so the
            verdict landed on a third as the orphan "comparison refused" with
            nothing beside it naming what had been refused — while the comment
            above it said it printed "beside" the note. And the whole
            four-clause sentence was marked `data-copy="figure"`, a kind whose
            meaning is "code's number inside model prose": the note is code's
            own sentence end to end, so it takes no marker and rule (c) reaches
            it as it reaches any unmarked markup on the block. */}
        {/* WHAT THE LINE LEAVES OUT, under the line and not inside its legend.
            See `attentionSeries`. */}
        {panelNote(c.attention) ? (
          <p
            className={email ? undefined : 'm-0 font-mono text-[10.5px] leading-[1.35] tabular-nums text-secondary-foreground'}
            style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.ink2, marginTop: 4 } : undefined}
          >
            {panelNote(c.attention)}
          </p>
        ) : null}
        <p
          className={email ? undefined : 'm-0 flex flex-wrap items-baseline gap-2 text-[11.5px] text-secondary-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
        >
          <BlockMovement verdict={c.attention?.verdict ?? null} unit="pts" mode={mode} />
        </p>
      </>
    ) : (
      <BlockEmpty mode={mode}>{c.attentionNote ?? 'Attention is not read for this workspace yet.'}</BlockEmpty>
    )

    return (
      <BlockFrame
        title={overviewCategory.title}
        // THE PAGE PRINTS ONE QUESTION, IN THE PAGE BAR (Block D wave 3, M8).
        // Parsed from `Main.dc.html`: all six blocks go straight from
        // `</header>` into their content grid, and the artboard's only question
        // is "What is this month's reading?" in the bar — which
        // `SurfacePageBar` already prints (`lib/nav.ts`, `page-bar.tsx:65`).
        // Six sub-lines under six eyebrows cost about 156px and put a second
        // narrator over every tile. The block keeps its `question` field, which
        // is its contract with the reader and what the nav and the legend read;
        // what stops is drawing it a second time inside the block.
        mode={mode}
        meta={categoryMeta(c)}
        footer={openLink(mode, href, 'Open Voice →')}
        // "Nothing else moved clearly this month." into the footer note
        // (`main.category.footer`). It is a statement about what the block
        // DECLINED to say, which is metadata about the reading and not one of
        // its findings — the mono slot is where the artboard puts it.
        // THE NOTE BELONGS TO ONE OF THE TWO PLACES, NOT BOTH (code review
        // m12). Where both mover arms are empty the note is the movers'
        // EMPTY STATE, printed in the body; where they are not, it is the coda
        // under a populated list. It used to be `moversNote ?? …`, so a loader
        // that supplied a note while both arms were empty printed the same
        // sentence in the body and again in the footer.
        footerNote={c.growing.length + c.fading.length > 0 ? c.moversNote ?? 'Nothing else moved clearly this month.' : undefined}
      >
        {email ? (
          <div>
            <Line label="Kind of thing said" mode={mode}>{kinds}</Line>
            <Line label={moversLabel(c)} mode={mode}>{movers}</Line>
            <Line label="Mood" mode={mode}>{mood}</Line>
            <Line label="Attention" mode={mode}>{attention}</Line>
            <Line label="No longer being said" mode={mode}>{quiet}</Line>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            {/* THE ARTBOARD'S THREE COLUMNS (mock-gap §Visual fidelity: "the
                mood-beside-attention arrangement and the kind-rows-beside-more
                control all collapse into one column"). The kinds and the mood
                share the first column with a rule between them, exactly as the
                artboard draws it; the movers take the second; the attention
                line takes the third. `TileColumns` collapses all three to one
                stacked column under `xl`. */}
            {series ? (
              <TileColumns of={3}>
                <div className="flex min-w-0 flex-col gap-3">
                  <Line label="Kind of thing said" mode={mode}>{kinds}</Line>
                  <div className="border-t border-border/70 pt-2.5">
                    <Line label="Mood" mode={mode}>{mood}</Line>
                  </div>
                </div>
                <div className="min-w-0 xl:pl-4">
                  {/* NOT "Growing / fading", which the mock prints as two
                      headings. Both are direction words, and a heading is not a
                      verdict: rule (c) refuses them outside a node that carries a
                      band. The two arms below keep the mock's layout and take the
                      build's banded headings instead.
                      AND WHAT IT MOVED AGAINST. Voice states its basis in the
                      block meta ("Sep 2026 against Aug 2026"); OV3 printed
                      "▲ 5.3 pts" with nothing saying what the two sides
                      were, so a reader who opens Overview and This week in one
                      session sees one theme move by two different amounts with
                      only one page saying why. Taken off a printed row's own
                      verdict, so the heading can never describe a comparison the
                      block did not draw. */}
                  <Line label={moversLabel(c)} mode={mode}>{movers}</Line>
                </div>
                <div className="min-w-0 xl:pl-4">
                  <Line label="Attention" mode={mode}>{attention}</Line>
                </div>
              </TileColumns>
            ) : (
              // NO ATTENTION TO DRAW, NO COLUMN FOR IT (layout sweep,
              // 2026-09-24). A third column whose whole body was one sentence
              // about a panel nobody froze left two columns of white beside
              // the kind rows. The absence is one line under the columns; the
              // mood moves under the movers so the two columns stand level.
              <TileColumns of={2}>
                <div className="flex min-w-0 flex-col gap-3">
                  <Line label="Kind of thing said" mode={mode}>{kinds}</Line>
                </div>
                <div className="flex min-w-0 flex-col gap-3 xl:pl-4">
                  <Line label={moversLabel(c)} mode={mode}>{movers}</Line>
                  <div className="border-t border-border/70 pt-2.5">
                    <Line label="Mood" mode={mode}>{mood}</Line>
                  </div>
                </div>
              </TileColumns>
            )}
            {!series ? (
              <p className="m-0 text-[11.5px] text-secondary-foreground">
                <span className="font-semibold uppercase tracking-[0.06em] text-[10px]">Attention</span>{' '}
                {c.attentionNote ?? 'Attention is not read for this workspace yet.'}
              </p>
            ) : null}
            {/* THE FLAG ROW ALONG THE BOTTOM (`main.category.flag.quiet` /
                `.flag.new`). The artboard draws a tinted strip carrying the
                month's flags; a flag is not a direction (lib/calibration.ts
                READER_FLAGS), so it says an object was or was not there and
                never which way it is going.
                "No longer being said", not "Gone quiet" — VO2's own heading,
                because the FLAG is a direction word and rule (c) lets it appear
                only inside a verdict node. */}
            {/* AND THE TYPE ON THIS GROUND IS `secondary-foreground`, NOT
                `muted-foreground` (design review Medium 13). `--muted-
                foreground` #6E7378 on the inner block's #F6F7F8 is 4.46:1,
                under MASTER's own 4.5:1 floor — it passes on the white tile and
                fails inside every tinted block on this page, which is exactly
                where the k/n, the basis and the provenance live. The honesty
                lines were the least legible text on the surface. */}
            <TileBlock className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">No longer being said</span>
              {quiet}
            </TileBlock>
          </div>
        )}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const c = data.category
    const out: FigureTable = {}
    if (c.denominator != null) {
      out.category_videos = { value: c.denominator, unit: 'videos', label: 'videos read for the category this month' }
    }
    for (const k of c.kinds) {
      if (k.pct == null) continue
      out[`kind_${k.kind}_share`] = { value: k.pct, unit: 'pct', label: `${k.label.toLowerCase()}, share of the month` }
    }
    if (c.mood) {
      const negative = c.mood.shares.find((s) => s.mood === 'negative')
      if (negative?.pct != null) out.mood_negative_share = { value: negative.pct, unit: 'pct', label: 'the negative share of what was judged' }
    }
    if (c.attention && c.attention.months.length > 0) {
      const last = c.attention.months[c.attention.months.length - 1]
      out.attention_comments = { value: last.comments, unit: 'comments', label: 'comments under the panel’s videos this month' }
      out.attention_videos = { value: last.videos, unit: 'videos', label: 'videos the panel posted this month' }
    }
    // THE PANEL'S SIZE IS NOT PUBLISHED AS A FIGURE, and that is deliberate.
    // It is a count of ACCOUNTS, and `FigureTable.unit` has four values, none
    // of which is that (lib/reading/verdicts.ts). `sent-figures.ts` derives the
    // permanent record's `measure` straight off the unit — anything that is not
    // 'comments' is filed as 'videos' — and `sent_figures` has no UPDATE grant,
    // so the moment this block joins an artefact's set, "214 videos" would be
    // written down forever. The unit cannot simply be widened either: the
    // column carries `check (measure in ('videos','comments'))`
    // (20260918098000_sent_figures.sql), so a fifth unit is a migration, not an
    // edit. The panel's size is RENDERED — it is the denominator the comment
    // count needs and the reader sees it beside the line — and prose that wants
    // to name it can take it from the verdict's own `n`, which carries its
    // population in words.
    //
    // The banded step, where one was drawn. `verdicts()` already declares the
    // verdict itself; this is the magnitude a sentence may substitute, and it
    // exists only where the comparison MOVED — `no_clear_change` answers too,
    // and it answers with no magnitude to publish.
    if (c.attention?.verdict?.state === 'moved' && c.attention.verdict.changePts != null) {
      out.attention_change = { value: c.attention.verdict.changePts, unit: 'pts', label: 'the panel’s share of attention, against the month before' }
      if (c.attention.verdict.bandPts != null) {
        out.attention_band = { value: c.attention.verdict.bandPts, unit: 'pts', label: 'the band that step cleared' }
      }
    }
    return out
  },

  /**
   * `mkt.p3.quote` — the voices this block may show, as refs.
   *
   * WHOSE QUOTES THESE ARE. `sentence.voices` is loaded from the SUPPORTING
   * INSIGHTS of the month's lead object (lib/pages/overview.ts `loadVoices`),
   * and where that lead is a THEME those insights are the category's own
   * evidence for the very theme this block's movers are about. Where the lead
   * is a subject they are not, and this block declares none — a quote is only
   * a quote about the category when the thing it was cited for is one.
   *
   * REFS, never the words: a snapshot freezes ids and resolves at render
   * (lib/renderables/quotes-freeze.ts, decision H). Two blocks naming the same
   * ref is not a conflict — a ref is an address, and the freeze de-duplicates.
   */
  quotes(data) {
    return categoryVoices(data).map((v) => v.quote.ref)
  },

  verdicts(data): Verdict[] {
    const c = data.category
    return [
      ...Object.values(c.kindVerdicts).filter((v): v is Verdict => v != null),
      ...c.growing.map((m) => m.verdict),
      ...c.fading.map((m) => m.verdict),
      ...(c.mood?.verdict ? [c.mood.verdict] : []),
      ...(c.attention?.verdict ? [c.attention.verdict] : []),
    ]
  },

  emptyState(data) {
    const c = data.category
    const nothing = c.kinds.length === 0 && c.growing.length === 0 && c.fading.length === 0 && !c.mood && !c.attention
    return nothing ? 'Nothing about this category has been read into this month yet.' : null
  },
}
