import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { TileBlock } from '@/components/shell/tile'
import { TileColumns } from '@/components/shell/page-grid'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { CardCount, MoveCandidate, MoveReading } from '@/lib/reading/moves'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import { moveWaitingLine } from '@/lib/pages/overview'
import type { MoveRow, OverviewData } from '@/lib/pages/overview'

// OV5 · What we are doing, and whether it is working (design §3 OV5; ported to
// `Main.dc.html` §5 in Block D wave 2).
//
// THE CARD IS BUILT AND THE WRITE PATH IS NOT, AND THE BLOCK SAYS WHICH. Wave 1
// built `buildMoveCandidate` and `readMove` — the pre-filled monthly card and
// the one banded comparison a declared move earns — and nothing rendered either
// of them. This is that render: the card on the left as the artboard draws it,
// the declared moves on the right, and the ledger's whole-history ratio under
// them.
//
// The masthead is code-written and never a model's: "We report what the
// conversation did after you acted. We never claim you caused it." It is the
// one sentence that keeps every line under it from reading as a causal claim,
// and it takes the artboard's footer-note slot.

/** How many claim rows the card prints before it stops.
 *
 *  MEASURED (wave 1's fixture header): Sealand's nine September claims are all
 *  DISTINCT, between 93 and 197 characters each, several to a post. The mock
 *  imagines short repeated slogans and lays out a tally; what the data holds is
 *  a list of long machine paraphrases, so the row needs a cap, and the cap has
 *  to be small enough that the card stays a card. */
export const CARD_CLAIMS_SHOWN = 2

/** How many characters of one claim the card prints. A claim is the client's
 *  own words off its own transcript, so it is CUT rather than re-worded. */
export const CARD_CLAIM_MAX = 96

/**
 * What stands in the primary button's place (`main.moves.card.confirm`).
 *
 * THE CARD IS BUILT AND THE WRITE PATH IS NOT. The artboard draws "Yes, count
 * this as a move" as the card's green primary; a button that cannot write is
 * worse than no button, so the SLOT is kept — same place, bottom of the card —
 * and the sentence says what the reader is waiting for. It does not name a
 * month: nothing in the product knows when that write ships, and a delivery
 * date computed from the calendar is a promise recomputed monthly, wrong the
 * first time it is read (the defect `MOVES_UNLOCK` was rewritten to end).
 */
export const CARD_CONFIRM_SLOT =
  'Every count above is real. Turning them into a move is a button this page does not have yet, so nothing here counts as one until you say so.'

/**
 * The same sentence on PAPER (Block D wave 3, M25).
 *
 * A PDF SHEET MAY NOT TALK ABOUT A BUTTON. The sales and marketing briefs
 * borrow this card onto a printed sheet and onto `/r/<token>`, where "a button
 * this page does not have yet" is a sentence about a control the reader has no
 * page to look for — the rule `MONTHLY_MOVES_EMPTY` was written under, and the
 * rule E-marketing already applied to three app-only controls. This is the
 * fourth.
 *
 * THE HONESTY SURVIVES THE CLAUSE. What the sentence is FOR is the second half
 * — that a count is not a move until the reader says it is — and that is true
 * on paper and in an inbox as much as in the app. Only the clause about the
 * control goes.
 */
export const CARD_CONFIRM_OFF_APP =
  'Every count above is real. Nothing here counts as a move until you say so.'

export function claimText(claim: string): string {
  const t = claim.replace(/\s+/g, ' ').trim()
  return t.length <= CARD_CLAIM_MAX ? t : `${t.slice(0, CARD_CLAIM_MAX - 1).trimEnd()}…`
}

/** What a claim row says when the count is real and the wording is not on
 *  record — `video_claims` carried the row and no transcribed words with it.
 *  Never a blank cell, and never the model's paraphrase in the words' place. */
export const CARD_CLAIM_UNQUOTED = 'said on these posts; the wording is not on record'

/**
 * "2 declared · 1 card waiting for you" (`main.moves.header`).
 *
 * The second clause exists only now that the card is built, and only where
 * there is something to confirm: a card with no `proposal` cannot be confirmed
 * (either nothing was published, or `moves` is not applied here), and calling
 * one "waiting for you" would be asking for an action the page cannot take.
 */
export function movesMeta(m: OverviewData['moves']): string | undefined {
  const parts: string[] = []
  if (m.rows.length > 0) parts.push(`${fmtInt(m.rows.length)} declared`)
  if (m.card?.proposal) parts.push('1 card waiting for you')
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** One counted row of the card: the figure over the population it is counted
 *  in. `CardCount.basis` is the artboard's "posts published in September" — and
 *  on the own-post rows that is `upload_date`, a THIRD clock (D9), which is why
 *  the basis prints beside the figure and is never assumed. */
function Count({ count, mode, basis = true }: { count: CardCount; mode: RenderMode; basis?: boolean }) {
  return (
    <span className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-0.5'}>
      <FigureCell
        mode={mode}
        value={fmtInt(count.value.k)}
        of={count.value.n > 0 && count.value.n !== count.value.k ? `of ${fmtInt(count.value.n)}` : undefined}
      />
      <span
        className={mode === 'email' ? undefined : 'text-[11px] leading-[1.35] text-secondary-foreground'}
        style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.ink2 } : undefined}
      >
        {basis ? `${count.label} · ${count.basis}` : count.label}
      </span>
    </span>
  )
}

/** The one basis the card's own-post rows share, said once under them.
 *
 *  D9 ASKS FOR THE BASIS BESIDE THE FIGURE, NOT FOUR TIMES IN ONE CARD (design
 *  review High 8). `buildMoveCandidate` gives `posts`, `overFloor` and `claims`
 *  the same basis string, so the first row printed "posts published · posts
 *  published in September" — the label and the basis in the same four words —
 *  and three later rows repeated it unchanged in a 240px card. The rows that
 *  share a clock name it once, together; the rows on a DIFFERENT clock
 *  (`subjectsBasis`, which is posts READ) still carry their own beside them,
 *  because that is the difference the rule exists to keep visible. */
export function cardBasisLine(card: MoveCandidate): string {
  return `every count above is dated by the post itself — ${card.posts.basis}`
}

/** The pre-filled card — the artboard's left column. */
function Card({ card, mode }: { card: MoveCandidate; mode: RenderMode }) {
  const email = mode === 'email'
  const claims = card.claimRows.slice(0, CARD_CLAIMS_SHOWN)
  const moreClaims = card.claimRows.length - claims.length
  const body = (
    <>
      <span
        className={email ? undefined : 'text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}
        style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted } : undefined}
      >
        This month’s card · pre-filled from your own posts
      </span>

      <span className={email ? undefined : 'flex flex-wrap items-start gap-x-6 gap-y-2'}>
        <Count count={card.posts} mode={mode} basis={false} />
        <Count count={card.overFloor} mode={mode} basis={false} />
      </span>
      <span
        className={email ? undefined : 'font-mono text-[10.5px] text-secondary-foreground'}
        style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.ink2 } : undefined}
      >
        {cardBasisLine(card)}
      </span>

      {/* CLAIMS YOU MADE (`main.moves.card.claims`), IN THE SPEAKER'S OWN WORDS.
          `video_claims` holds the model's PARAPHRASE in `claim` and what was
          actually said in `quote`; this row printed the paraphrase inside
          quotation marks under `data-copy="quote"` — a model-written string
          taking the one exemption reserved for words a model did not write
          (code review I6) — and carried it as a bare string into every stored
          export (C1). It prints `CardClaim.quote` now: the founder's own
          sentence, carried as `k:<video_claims.id>` so a snapshot holds the ref
          and re-resolves the words, and marked `quote` truthfully. Cut here
          rather than in the data, so a re-resolved export cuts in the same
          place. A row whose wording was never transcribed keeps its count and
          says so. */}
      {claims.length > 0 ? (
        <span className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
          <span
            className={email ? undefined : 'text-[11px] text-secondary-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.ink2 } : undefined}
          >
            Claims you made
          </span>
          {claims.map((c, i) => (
            <span key={c.quote?.ref ?? `claim-${i}`} className={email ? undefined : 'flex min-w-0 items-baseline gap-2 text-[12px]'}>
              {c.quote && c.quote.text.trim() ? (
                <span data-copy="quote" className={email ? undefined : 'min-w-0 flex-1'}>“{claimText(c.quote.text)}”</span>
              ) : (
                <span className={email ? undefined : 'min-w-0 flex-1 text-secondary-foreground'}>{CARD_CLAIM_UNQUOTED}</span>
              )}
              <span data-copy="level" className={email ? undefined : 'shrink-0 font-mono text-[10.5px] tabular-nums text-secondary-foreground'}>
                {fmtInt(c.posts.k)} of {fmtInt(c.posts.n)} posts
              </span>
            </span>
          ))}
          {moreClaims > 0 ? (
            <span className={email ? undefined : 'font-mono text-[10.5px] tabular-nums text-secondary-foreground'}>
              and {fmtInt(moreClaims)} more, each said on its own post
            </span>
          ) : null}
        </span>
      ) : null}

      {/* THE HOOK SPLIT, FROM THE REAL `hook_style` ENUM AND NOT THE MOCK'S
          THREE LABELS (`main.moves.card.hooks`). It is mostly empty — twelve of
          Sealand's seventeen September posts carry no hook at all — so
          "not classified" is the largest row rather than a rounding footnote,
          and `buildMoveCandidate` emits it as a row so the card says so. */}
      {card.hooks.length > 0 ? (
        <span
          className={email ? undefined : 'font-mono text-[10.5px] tabular-nums text-muted-foreground'}
          style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted } : undefined}
        >
          hooks: {card.hooks.map((h) => `${h.label} ${fmtInt(h.value.k)} of ${fmtInt(h.value.n)}`).join(' · ')}
        </span>
      ) : null}

      {/* SUBJECTS MATCHED, DENOMINATED ON POSTS ACTUALLY READ
          (`main.moves.card.subjects`) — never on posts published. A subject
          match only exists for a post Pass A analysed, and denominating on
          every post published would print a statement about our gather cadence
          wearing the client's noun. `subjectsBasis` says which. */}
      <span className={email ? undefined : 'flex flex-wrap items-baseline gap-2'}>
        <span
          className={email ? undefined : 'text-[11px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}
        >
          Subjects matched · {card.subjectsBasis}
        </span>
        {card.subjectsUnread ? (
          <span className={email ? undefined : 'text-[11px] text-muted-foreground'}>{card.subjectsUnread}</span>
        ) : card.subjects.length === 0 ? (
          <span className={email ? undefined : 'text-[11px] text-muted-foreground'}>none of your posts matched a subject this month</span>
        ) : (
          card.subjects.map((s) => (
            <span
              key={s.subjectId}
              data-copy="level"
              className={email ? undefined : 'inline-flex items-center gap-1.5 rounded-full bg-tile px-2 py-0.5 text-[12px] font-medium text-secondary-foreground ring-1 ring-border'}
            >
              {s.label}{' '}
              <span
                className={email ? undefined : 'font-mono text-[10.5px] tabular-nums'}
                style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted } : undefined}
              >
                {fmtInt(s.matched.k)} of {fmtInt(s.matched.n)}
              </span>
            </span>
          ))
        )}
      </span>

      {/* THE PAIRED MOVEMENT, PRINTED SIDE BY SIDE AND NEVER DIFFERENCED (D2).
          The mock writes "Durability in the category 19% → 22% · in your
          audience 27% → 31% (too few to compare)" — a magnitude beside a
          refusal. A `Verdict` carries the change and the band together or
          neither, so each side prints its own badge and the two sit beside each
          other for the reader to weigh. */}
      {card.movement.yours || card.movement.category ? (
        <span className={email ? undefined : 'flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground'}>
          {card.movement.yours ? (
            <span className={email ? undefined : 'flex items-center gap-1.5'}>your audience <BlockMovement verdict={card.movement.yours} unit="pts" mode={mode} /></span>
          ) : null}
          {card.movement.category ? (
            <span className={email ? undefined : 'flex items-center gap-1.5'}>the category <BlockMovement verdict={card.movement.category} unit="pts" mode={mode} /></span>
          ) : null}
        </span>
      ) : null}

      {/* THE PRIMARY BUTTON'S SLOT, WITH THE HONEST SENTENCE IN IT
          (`main.moves.card.confirm`). The card is built; the write path is not.
          A button that cannot write is worse than none, so the slot keeps the
          artboard's place at the bottom of the card and states what it is
          waiting for — and `card.unread` is what distinguishes "there is
          nothing to confirm" from "this cannot be confirmed here yet". */}
      <span
        className={email ? undefined : 'mt-auto text-[11px] text-muted-foreground'}
        style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}
      >
        {card.unread ?? (mode === 'app' ? CARD_CONFIRM_SLOT : CARD_CONFIRM_OFF_APP)}
      </span>
    </>
  )
  if (email) {
    return <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, background: EMAIL.inner, padding: '10px 14px', borderRadius: 4 }}>{body}</div>
  }
  return <TileBlock className="flex min-h-full min-w-0 flex-col gap-[7px]">{body}</TileBlock>
}

/** The audience's own label, off the series the reading carries — never a
 *  second name for one audience. */
export function seriesLabel(reading: MoveReading, audience: string): string {
  return reading.series.find((s) => s.audience === audience)?.label ?? audience
}

/**
 * "You 7% → 9% → 12% · The category 9% → 10% → 11%" — every side's own series,
 * printed beside the others (`main.moves.move1.figures`).
 *
 * LEVELS, NOT A DIFFERENCE. Each series is a run of readings on its own
 * denominator; the mock prints "themes you are not working on +0.4 per 100
 * videos", which is a synthetic control subtracted from the client side, and
 * nothing in this product computes one.
 *
 * AND EVERY ONE OF THOSE LEVELS PRINTS ITS "of N" (Block D wave 3, M5). This
 * printed the share alone — "You 07/26 7.3% → 08/26 9.6% → 09/26 11.9%" — which
 * is a run of six bare scores on a page whose stated rule is that a level
 * without its denominator is a score and this product shows none. The
 * denominators were on the object all along (`MoveSeries.points` is
 * `{month, k, n, pct}`) and only `pct` was read; the sentence under the line
 * says "read against 3 months", which says how many months and never what of.
 * It escaped `assertCopyContract` because rule (b) inspects `data-copy="level"`
 * nodes and the node carried no marker — so the marker goes on too, at the call
 * site, and the rule applies to this line from here on.
 *
 * EACH SIDE'S DENOMINATOR IS ITS OWN AND MOVES BETWEEN MONTHS: your audience
 * carried 82 videos in July and 84 in August, so one "of N" for the run would
 * be a denominator the run does not have.
 */
export function seriesLine(reading: MoveReading): string {
  // AN ARROWED RUN IS THE SAME CLAIM AS THE SPARKLINE (code review I4). This
  // printed "You 07/26 7.3% → 08/26 9.6% → 09/26 11.9%" unconditionally, two
  // lines above `chartNote` — whose whole job is to say why a LINE may not be
  // drawn over this reading — and beside a verdict that on this fixture reads
  // "too few to compare". So the arrows are gated on the same rule the chart
  // is: three readings in one regime, `chartNote === null`, or the points are
  // printed side by side with no arrow between them.
  const arrows = reading.chartNote === null
  return reading.series
    .map((s) => {
      // AND A CLUSTERING CHANGE BREAKS THE RUN. `MoveSeries.regimeByMonth`
      // says which clustering each month was produced under, and months under
      // two clusterings are not like-for-like — the verdict beside this line
      // refuses them with `clustering_changed`, and an unbroken arrow through
      // the break is that refusal contradicted in the reader's own eye. The
      // break is MARKED, not hidden: the reader sees both months and sees why
      // they are not one run.
      const read = s.points.filter((p) => p.pct != null)
      const parts = read.map((p, i) => {
        const of = p.k != null && p.n != null ? ` ${fmtInt(p.k)} of ${fmtInt(p.n)}` : ''
        const label = `${p.month.slice(5, 7)}/${p.month.slice(2, 4)} ${p.pct}%${of}`
        if (i === 0) return label
        const broke =
          !s.noClustering &&
          s.regimeByMonth != null &&
          (s.regimeByMonth[read[i - 1].month] ?? null) !== (s.regimeByMonth[p.month] ?? null)
        return `${broke ? REGIME_BREAK : arrows ? ' → ' : ' · '}${label}`
      })
      return parts.length > 0 ? `${s.label} ${parts.join('')}` : null
    })
    .filter((x): x is string => x != null)
    .join(' · ')
}

/** What stands between two months grouped differently — never an arrow. A
 *  reader subtracts across an arrow, and these two are not comparable. */
export const REGIME_BREAK = ' | grouped differently | '

/** One declared move: the artboard's row — title, subject chip, declared stamp,
 *  the move's one movement claim, and the series beside it. */
function MoveBody({ row, reading, mode }: { row: MoveRow; reading: MoveReading | null; mode: RenderMode }) {
  const email = mode === 'email'
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-[3px]'}>
      <span className={email ? undefined : 'flex flex-wrap items-center gap-2'}>
        <span className={email ? undefined : 'text-[13px] font-semibold'}>{row.title}</span>
        {reading?.on ? (
          <span
            data-copy="subject"
            data-slot="pass_b_theme"
            className={email ? undefined : 'inline-block rounded-full bg-inner px-2 py-px text-[10.5px] font-semibold text-muted-foreground'}
          >
            {reading.on}
          </span>
        ) : null}
        <span className={email ? undefined : 'font-mono text-[10.5px] text-muted-foreground'}>declared {shortDate(row.declaredAt)}</span>
      </span>
      {/* THE MOVE'S ONE MOVEMENT CLAIM — yours, and the controls beside it,
          PRINTED BESIDE AND NEVER SUBTRACTED (`main.moves.move1.verdict` /
          `.figures`). `readMove` bands the client side before against after;
          the controls are the audiences the move did not touch, which is what
          would have moved anyway. A difference between them is a synthetic
          control, and this product does not compute one. */}
      {reading ? (
        <>
          <span className={email ? undefined : 'flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-secondary-foreground'}>
            <span className={email ? undefined : 'flex items-center gap-1.5'}>your audience <BlockMovement verdict={reading.verdict} unit="pts" mode={mode} /></span>
            {reading.control.map((v) => (
              <span key={`${v.objectId}-${v.audience}`} className={email ? undefined : 'flex items-center gap-1.5'}>
                {seriesLabel(reading, v.audience)} <BlockMovement verdict={v} unit="pts" mode={mode} />
              </span>
            ))}
          </span>
          {/* MARKED `level`, so rule (b) reaches it (Block D wave 3, M5). The
              line is a run of banded LEVELS and it printed six bare shares;
              unmarked, the copy contract's denominator rule never looked at
              it. */}
          <span data-copy="level" className={email ? undefined : 'font-mono text-[10.5px] tabular-nums text-muted-foreground'}>
            {seriesLine(reading)}
          </span>
          {/* D3: A CHART IS A DIRECTION CLAIM TOO. `chartNote` is why a line
              may not be drawn over this reading; where it is null the reading
              has three months in one regime and the line would be honest. */}
          <span className={email ? undefined : 'font-mono text-[10.5px] text-muted-foreground'}>
            {reading.chartNote ?? reading.line}
          </span>
          {reading.unread ? (
            <span className={email ? undefined : 'text-[11px] text-muted-foreground'}>{reading.unread}</span>
          ) : null}
        </>
      ) : (
        // WHAT IS LEFT OF THE LINE, NOT THE LINE (Block D wave 3, M9). The row
        // above has already printed the title and "declared 2 Sep"; `row.line`
        // is `moveLine`, which is "Track: Waterproofing · tracked 2 Sep · first
        // scoring lands with the October reading." — so the title and the date
        // appeared twice, one line apart, on every move of a fresh tenant. The
        // residual is composed from the same input rather than sliced out of
        // the finished sentence (the monthly email cuts a title PREFIX, which
        // is not enough here because this row prints the date too).
        <span className={email ? undefined : 'text-[12.5px] text-secondary-foreground'}>{moveWaitingLine(row.declaredAt)}</span>
      )}
    </div>
  )
}

export const overviewMoves: Block<OverviewData> = {
  key: 'overview.moves',
  title: 'Your moves',
  question: 'What have we said we are doing about it?',

  render(data, mode = 'app', ctx) {
    const m = data.moves
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/market`
    const empty = overviewMoves.emptyState(data)
    // `?? []` BECAUSE A FROZEN ARTEFACT MAY PREDATE THE FIELD (merge, Block D
    // wave 2). `MovesBlock.readings` is wave 1's, the briefs borrow this block
    // onto their sheets, and a snapshot built before the field has none — a
    // bare `.find` threw inside a server component, which takes the share
    // link, the viewer, the Studio preview and the PDF route down with it.
    const readings = m.readings ?? []
    const readingFor = (id: string) => readings.find((r) => r.moveId === id) ?? null

    const declared: ReactNode = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-2.5'}>
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {m.rows.map((row, i) => (
          <div key={row.id} className={email ? undefined : i > 0 ? 'border-t border-border/70 pt-2.5' : undefined}>
            <MoveBody row={row} reading={readingFor(row.id)} mode={mode} />
          </div>
        ))}
        {/* THE WHOLE LEDGER, NEVER A QUARTER (`main.moves.acted`, D12). The
            mock writes "acted on 2 of 5 this quarter"; `actedTally` counts every
            piece of advice this product has ever given, because a quarter of a
            table that is deleted and reinserted every update is a window over a
            table with no history in it. */}
        {m.acted ? (
          <p
            className={email ? undefined : 'm-0 mt-auto border-t border-border/70 pt-2.5 text-[12.5px] text-secondary-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 6 } : undefined}
          >
            <span data-copy="level">{m.acted.line}</span>
          </p>
        ) : null}
        <p
          className={email ? undefined : 'm-0 text-[11px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 } : undefined}
        >
          {m.unlock}
        </p>
      </div>
    )

    return (
      <BlockFrame
        title={overviewMoves.title}
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
        meta={movesMeta(m)}
        footer={openLink(mode, href, 'Open Market →')}
        // THE MASTHEAD INTO THE FOOTER NOTE (`main.moves.footer`). It is the
        // sentence that keeps every line above it from reading as a causal
        // claim, and the artboard sets it in the footer's mono slot where the
        // build printed it as a body paragraph among the findings.
        footerNote={m.masthead}
      >
        {email ? (
          <div>{m.card ? <Card card={m.card} mode={mode} /> : null}{declared}</div>
        ) : m.card ? (
          // THE ARTBOARD'S TWO COLUMNS: the pre-filled card on the left, the
          // declared moves on the right.
          <TileColumns of={2}>
            <Card card={m.card} mode={mode} />
            <div className="flex min-w-0 flex-col xl:pl-4">{declared}</div>
          </TileColumns>
        ) : declared}
      </BlockFrame>
    )
  },

  // NO FIGURES. Nothing on this block is a reading of the CONVERSATION: the
  // card counts posts the client published (dated by `upload_date`, a third
  // clock) and the ledger's ratio counts advice, not videos. The budget counts
  // readings, and a block with none declares none. The moves' own verdicts ARE
  // readings and are declared below.
  figures(): FigureTable {
    return {}
  },

  verdicts(data): Verdict[] {
    const card = data.moves.card
    return [
      ...(data.moves.readings ?? []).flatMap((r) => [r.verdict, ...r.control].filter((v): v is Verdict => v != null)),
      ...(card ? [card.movement.yours, card.movement.category].filter((v): v is Verdict => v != null) : []),
    ]
  },

  emptyState(data) {
    return data.moves.rows.length === 0 ? data.moves.empty : null
  },
}
