import Link from 'next/link'
import type { Block, BlockContext, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { MovementBadge } from '@/components/delta-badge'
import { RecStatusMenu, RecStatusWord } from '@/components/rec-status'
import { TileBlock } from '@/components/shell/tile'
import { FLAG_NOTE } from '@/lib/agent/movement'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import {
  ADVICE_UNRECORDED, GROUNDED_CORPUS_LINE, LEDGER_FIRST_TIME_LINE, adviceAnchor, ageInMonths, madeInMonth,
  marketSurfaceHref, repeatCell,
  type AdviceRow, type MarketSurfaceData,
} from '@/lib/pages/market-surface'

// MK2 · The advice, and what you decided — the ledger (design §3 MK2; ported to
// the artboard, Block D wave 2).
//
// SEVEN COLUMNS, NOT FOUR. The artboard's ledger is a seven-track grid — # ·
// Recommendation · First raised · Repeated · Your decision · Grounded in ·
// Afterwards — and three of those tracks had no field until wave 1 built them.
// They are bound here: `AdviceRow.number` (the identity a person can say out
// loud), `AdviceRow.grounded` (`groundingFor`) and `AdviceRow.afterwards`
// (`afterwardsFor`). It stays a `<table>` rather than becoming a grid of divs:
// the columns ARE a table, the anchors and the deep link are already on rows,
// and a `colgroup` carries the artboard's own track widths.
//
// ONE ROW PER IDENTITY, SORTED BY AGE. The loader's header says why that is a
// different read from the parked page's.
//
// EVERY ROW HAS AN ADDRESS. `?rec=<id>` is carried by four sent emails and
// every digest until WP17; it used to resolve to a lineage that reached only
// MK5's accept button, so a reader following a digest link landed on a ledger
// of the twelve oldest that did not contain the row they had clicked. Each row
// now carries an anchor and a link of its own (`?item=<lineage>`, which is what
// `marketSurfaceHref` writes), the named row is drawn whether or not it is one
// of the oldest, and it is marked.
//
// THE EXPANDED ROW IS THE DEEP LINK'S, and otherwise the oldest row that has an
// argument to show. The artboard draws one row expanded — "Why we keep raising
// it", the grounding restated, and the advice's own comment. `reasoning` and
// `hero_quote` are both selected again (D4) and both are already adjudicated:
// the argument is `stored` under `pass_d_b_recommendation`, and the comment is
// a SIBLING node with its own ref, never a span inside the scrubbed prose — a
// number inside a quotation is still refused, which is the whole reason the two
// are separate nodes.
//
// "AFTERWARDS" IS NEVER BLANK AND NEVER A DASH. The artboard prints "—" on
// three of its five rows, which in a column headed Afterwards reads as "nothing
// happened" — a claim. `afterwardsFor` has four states and each carries its own
// sentence; where it produced a comparison the band and the change travel
// together inside one `Verdict` (D2: `MovementBadge` prints points only when
// the state is `moved`). The clustering caveat is printed BESIDE it rather than
// dropped: on today's corpus every frozen month predates the clustering
// fingerprint, so `clustering_unknown` is on very nearly every comparison this
// column can draw, and a caveat that is always true is not one to skip.
//
// "GROUNDED IN" IS A COUNT OVER THE WHOLE CORPUS AND SAYS SO under the table
// (D8, `GROUNDED_CORPUS_LINE`) — the same shape as `CONCLUSIONS_CORPUS_LINE`
// one block above. Two of the cell's three states are not numbers at all:
// evidence a later update replaced says that (all twelve of Sealand's drawn
// rows are in that state), and a row that never recorded evidence says that
// instead of printing a zero.
//
// THE STATUS IS A CONTROL IN THE APP AND A WORD EVERYWHERE ELSE. An export must
// not render a button nobody can press, and `RecStatusWord` is the same fact
// with no affordance. One difference from the parked page, and it is deliberate:
// that page's word renders NOTHING while the status is `new`, which is 119 of
// 121 rows in production — a ledger whose subject is what you did about each
// row cannot have a blank column, so this one prints "New" itself.
//
// THE TITLE IS `stored`, NAMING `pass_d_b_recommendation`. A recommendation's
// words are Pass D-b's, adjudicated at write time by that slot's policy —
// `digits`, with the run's allow-list, and deliberately NOT the direction rule,
// because "Increase Content Volume to Improve Share of Voice" is an imperative
// addressed to the reader and not a claim that something is going up (the trade
// is measured beside PROSE_POLICY). Marking it `prose` made this block fail the
// copy contract on every production ledger; the marker says whose words they
// are instead of re-adjudicating them with no allow-list in hand.
//
// THE AGE IS BACK, AND IT IS THE ARTBOARD'S. This block said "NO AGE IN MONTHS
// ON THE ROW" while printing a day-and-month nobody reads as an age. The
// artboard stacks the month over the months standing, and `ageInMonths` counts
// CALENDAR months — the ledger's own unit, the one the column beside it counts
// in.

/** The artboard's track widths, in order. The empty one is the title, which
 *  takes what is left. */
const TRACKS = ['w-[22px]', '', 'w-[88px]', 'w-[96px]', 'w-[176px]', 'w-[100px]', 'w-[240px]'] as const

/** The artboard's dotted-underlined mono figure — a number a reader can see is
 *  counted rather than asserted. */
const FIGURE = 'font-mono text-[11.5px] tabular-nums text-secondary-foreground underline decoration-muted-foreground decoration-dotted underline-offset-[3px]'

function StatusCell({ row, mode }: { row: AdviceRow; mode: RenderMode }) {
  const decided = row.decidedAt ? shortDate(row.decidedAt) : null
  if (mode === 'app') {
    return <RecStatusMenu id={row.recommendationId} status={row.status} variant="pill" decidedAt={decided} />
  }
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2 }}>{row.statusLabel}{decided ? ` · ${decided}` : ''}</span>
  }
  // Print: the word, and "New" spelled out rather than an empty cell.
  return (
    <span className="text-[12px] text-secondary-foreground">
      {row.status === 'new' ? 'New' : <RecStatusWord status={row.status} />}{decided ? ` · ${decided}` : ''}
    </span>
  )
}

/** The repeat cell: updates on top, months only where there is more than one
 *  (D9 — `timesMade` counts UPDATES and the word says so). The artboard's chip
 *  sits on a row first raised in the reading's own month — and it says "First
 *  time", never "New", because the cell one column to its right prints "New"
 *  for a row nobody has decided on (`LEDGER_FIRST_TIME_LINE`). */
function RepeatCell({ row, isNew, mode }: { row: AdviceRow; isNew: boolean; mode: RenderMode }) {
  const { updates, months } = repeatCell(row)
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{isNew ? 'First time' : updates}</span>
  }
  if (isNew) {
    return <span className="inline-block whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-[11.5px] font-semibold text-warning">First time</span>
  }
  return (
    <span className="flex min-w-0 flex-col gap-px">
      <span className="text-[12px] text-secondary-foreground">{updates}</span>
      {months ? <span className="text-[11px] text-muted-foreground">{months}</span> : null}
    </span>
  )
}

/** "Grounded in": a count, or the named absence that is not a zero. */
function GroundedCell({ row, mode }: { row: AdviceRow; mode: RenderMode }) {
  const g = row.grounded
  const words = g == null
    ? 'not recorded'
    : g.pruned
      ? 'evidence replaced'
      : `${fmtInt(g.videos)} ${g.videos === 1 ? 'video' : 'videos'}`
  const title = g?.line ?? 'This advice did not record the evidence it was written from.'
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted }}>{words}</span>
  }
  if (g == null || g.pruned) {
    return <span title={title} className="text-[11.5px] text-muted-foreground">{words}</span>
  }
  return <span data-copy="figure" title={title} className={FIGURE}>{words}</span>
}

/**
 * "Afterwards": two month readings with the band beside the word, or the
 * sentence for whichever silence this is.
 *
 * The whole cell is one `verdict` node in the reading state, because the badge
 * inside it is the only place on this page a movement word is allowed to appear
 * (copy contract, rule (c)).
 */
function AfterwardsCell({ row, mode }: { row: AdviceRow; mode: RenderMode }) {
  const a = row.afterwards
  const email = mode === 'email'
  if (a.state !== 'reading' || !a.verdict) {
    return email
      ? <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{a.line}</span>
      : <span className="text-[11.5px] leading-[1.35] text-muted-foreground">{a.line}</span>
  }
  // EVERY FLAG THIS COMPARISON CARRIES, in the product's one wording for them
  // (`FLAG_NOTE`, lib/agent/movement.ts) — not a caveat this block chooses.
  const notes = [...new Set(a.verdict.flags.map((f) => FLAG_NOTE[f]).filter((n): n is string => Boolean(n)))]
  if (email) {
    return (
      <span data-copy="verdict" style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2 }}>
        {a.verdict.objectLabel}: {a.line}
        {notes.length > 0 ? ` (${notes.join('; ')})` : ''}
      </span>
    )
  }
  return (
    <span data-copy="verdict" className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11.5px] leading-[1.35] text-secondary-foreground">{a.verdict.objectLabel}: {a.line}</span>
      <MovementBadge verdict={a.verdict} unit="pts" good="neutral" />
      {notes.map((n) => <span key={n} className="text-[10.5px] leading-[1.3] text-muted-foreground">{n}</span>)}
    </span>
  )
}

/** The artboard's expanded row: the argument, the grounding restated, and the
 *  advice's own comment as its own node. */
function Expansion({ row, mode }: { row: AdviceRow; mode: RenderMode }) {
  const g = row.grounded
  return (
    <TileBlock className="ml-[34px] flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">Why we keep raising it</span>
        {g && !g.pruned
          ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground">grounded in <span data-copy="figure" className={FIGURE}>{fmtInt(g.videos)} {g.videos === 1 ? 'video' : 'videos'}</span></span>
          : null}
      </div>
      {row.why
        ? <p data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 text-[12.5px] leading-[1.45]">{row.why}</p>
        : null}
      {row.quote ? <BlockQuote quote={row.quote} mode={mode} /> : null}
    </TileBlock>
  )
}

/** Which row the artboard draws open: the one a link named, else the oldest
 *  that actually has something to show. Pure, so the choice is testable. */
export function expandedLineage(rows: readonly AdviceRow[], highlight: string | null): string | null {
  const hasBody = (r: AdviceRow) => Boolean(r.why || r.quote)
  const named = highlight ? rows.find((r) => r.lineageId === highlight) ?? null : null
  if (named && hasBody(named)) return named.lineageId
  return rows.find(hasBody)?.lineageId ?? null
}

export const marketAdvice: Block<MarketSurfaceData> = {
  key: 'market.advice',
  title: 'The advice, and what you decided',
  question: 'What were we told to do, and what did we do about it?',

  render(data, mode = 'app', ctx?: BlockContext) {
    const a = data.advice
    const email = mode === 'email'
    const empty = marketAdvice.emptyState(data)
    const more = a.total - a.rows.length
    const hrefFor = (lineageId: string) => `${ctx?.appUrl ?? ''}${marketSurfaceHref(lineageId, ctx?.params ?? {})}`
    const expanded = expandedLineage(a.rows, a.highlight)
    const readingMonth = data.month.slice(0, 7)
    // THE COLUMN'S UNLOCK IS GONE WHERE THE COLUMN ANSWERS. `ADVICE_UNLOCK`
    // named the absence of an Afterwards column; the column exists now, so the
    // sentence is printed only while no row on the page has a reading in it —
    // which is production today, and is the honest naming of that absence.
    const anyReading = a.rows.some((r) => r.afterwards.state === 'reading')
    // The chip's basis, printed where a reader meets it rather than left in a
    // `title` no keyboard and no touch reaches.
    const anyFirstTime = a.rows.some((r) => r.firstMade.slice(0, 7) === data.month.slice(0, 7))

    const notes = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-0.5'}>
        {a.requestedLine ? (
          <p
            className={email ? undefined : 'm-0 text-[11px] text-secondary-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 6 } : undefined}
          >
            {a.requestedLine}
          </p>
        ) : null}
        <p
          className={email ? undefined : 'm-0 text-[11px] leading-[1.35] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
        >
          {GROUNDED_CORPUS_LINE} {a.repeatLine}
          {anyFirstTime ? ` ${LEDGER_FIRST_TIME_LINE}` : ''}
          {!a.recorded ? ` ${ADVICE_UNRECORDED}` : ''}
          {!anyReading ? ` ${a.unlock}` : ''}
        </p>
      </div>
    )

    return (
      <BlockFrame
        title={marketAdvice.title}
        question={marketAdvice.question}
        mode={mode}
        meta={a.total > 0 ? `${fmtInt(a.total)} recommendations · oldest first · # is the identity, kept for life` : undefined}
        // THE WHOLE LEDGER, NEVER A QUARTER (D12). `actedLine`'s own docstring
        // argues it: the denominator is every identity ever recommended and has
        // no quarter at all, so the artboard's "Jul → Sep 2026" note beside it
        // is replaced by what the right-hand note can honestly say — how much
        // of the ledger this table is showing.
        footer={a.total > 0 ? a.actedLine : undefined}
        // THE NOTE COUNTS THE ROWS IT DREW, NEVER `LEDGER_SHOWN`. The constant
        // is the cap the loader asks for and is not what is on the page: the
        // fixture draws 3 of 64 and printed "12 oldest shown · 61 behind them",
        // where 12 + 61 is 73 and no reader can make that add. The deep-link
        // arm is the same defect the other way — `ledgerRowsShown` APPENDS the
        // named row, so 13 are drawn under a note claiming 12. Both halves are
        // now read off the same array.
        footerNote={more > 0 ? `${fmtInt(a.rows.length)} shown · ${fmtInt(more)} behind them` : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {email ? (
          <div>
            {a.rows.map((row) => (
              <div key={row.lineageId} id={adviceAnchor(row.lineageId)} style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}`, background: row.lineageId === a.highlight ? EMAIL.inner : undefined }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink }}>
                  <span style={{ fontFamily: FONT.mono, color: EMAIL.muted }}>{fmtInt(row.number)} </span>
                  <span data-copy="stored" data-slot="pass_d_b_recommendation">{row.title}</span>
                </div>
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>first raised {madeInMonth(row.firstMade)} · </span>
                  <RepeatCell row={row} isNew={row.firstMade.slice(0, 7) === readingMonth} mode={mode} />
                  <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}> · </span>
                  <StatusCell row={row} mode={mode} />
                  <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}> · grounded in </span>
                  <GroundedCell row={row} mode={mode} />
                </div>
                <div style={{ marginTop: 2 }}><AfterwardsCell row={row} mode={mode} /></div>
              </div>
            ))}
            {notes}
          </div>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full border-collapse text-left">
                <colgroup>{TRACKS.map((w, i) => <col key={i} className={w || undefined} />)}</colgroup>
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="py-1 pr-3 font-semibold">#</th>
                    <th className="py-1 pr-3 font-semibold">Recommendation</th>
                    <th className="py-1 pr-3 font-semibold">First raised</th>
                    <th className="py-1 pr-3 font-semibold">Repeated</th>
                    <th className="py-1 pr-3 font-semibold">Your decision</th>
                    <th className="py-1 pr-3 font-semibold">Grounded in</th>
                    <th className="py-1 font-semibold">Afterwards</th>
                  </tr>
                </thead>
                <tbody className="align-middle">
                  {a.rows.flatMap((row) => {
                    const age = ageInMonths(row.firstMade, data.readingAt)
                    const cells = (
                      <tr key={row.lineageId} id={adviceAnchor(row.lineageId)} className={`border-t border-border/70 ${row.lineageId === a.highlight ? 'bg-inner' : ''}`}>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] tabular-nums text-muted-foreground">{fmtInt(row.number)}</td>
                        <td className="py-1.5 pr-3 text-[12.5px] font-medium">
                          <span data-copy="stored" data-slot="pass_d_b_recommendation">
                            {mode === 'app'
                              ? <Link href={hrefFor(row.lineageId)} className="hover:underline">{row.title}</Link>
                              : row.title}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <span className="flex min-w-0 flex-col gap-px">
                            <span className="font-mono text-[11.5px] text-secondary-foreground">{madeInMonth(row.firstMade).split(' ')[0]}</span>
                            {age ? <span className="text-[11px] text-muted-foreground">{age}</span> : null}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3"><RepeatCell row={row} isNew={row.firstMade.slice(0, 7) === readingMonth} mode={mode} /></td>
                        <td className="py-1.5 pr-3"><StatusCell row={row} mode={mode} /></td>
                        <td className="py-1.5 pr-3"><GroundedCell row={row} mode={mode} /></td>
                        <td className="py-1.5"><AfterwardsCell row={row} mode={mode} /></td>
                      </tr>
                    )
                    // The artboard's expansion, in its own track directly under
                    // the row it belongs to — never a second row pretending to
                    // be a ledger entry.
                    return row.lineageId === expanded
                      ? [cells, (
                        <tr key={`${row.lineageId}-why`}>
                          <td colSpan={TRACKS.length} className="pb-2 pt-1"><Expansion row={row} mode={mode} /></td>
                        </tr>
                      )]
                      : [cells]
                  })}
                </tbody>
              </table>
            </div>
            {notes}
          </>
        )}
      </BlockFrame>
    )
  },

  // NO FIGURES. Everything counted here is a count of advice, of the evidence
  // behind it and of the decisions the client typed; the "Afterwards" verdict
  // carries its own counts inside itself. The budget counts the readings a
  // surface states as its own figures.
  figures(): FigureTable {
    return {}
  },

  // THE AFTERWARDS COLUMN'S COMPARISONS, DECLARED. `market.advice` is a named
  // brief section (`lib/reports/documents/sections.ts`, `ct.advice`), and a
  // brief composing this block folds its answers through `blockAnswers` →
  // `blockReading`: a movement claim this block PRINTS and does not declare is
  // a claim the brief's own reading does not know about. Every other block in
  // the codebase that draws a `MovementBadge` declares them.
  verdicts(data): Verdict[] {
    return data.advice.rows.map((r) => r.afterwards.verdict).filter((v): v is Verdict => v != null)
  },

  // THE ONE COMMENT THIS BLOCK SHOWS, by the same choice the render makes —
  // `expandedLineage` decides which row opens, and only that row's quote is
  // drawn. Declaring every row's would freeze refs the page never prints.
  quotes(data): QuoteRef[] {
    const open = expandedLineage(data.advice.rows, data.advice.highlight)
    const row = data.advice.rows.find((r) => r.lineageId === open)
    return row?.quote ? [row.quote.ref] : []
  },

  emptyState(data) {
    return data.advice.empty
  },
}
