import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuotes } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, monthName } from '@/lib/format'
import type { FaceOffMeasure } from '@/lib/reading/head-to-head'
import { REFUSAL_WHY } from '@/lib/reading/record'
import type { QuarterlyData, RivalsPage } from '@/lib/pages/quarterly'
import { NOT_OBSERVED, NOT_RECORDED, standingText, type StandingShare } from '@/lib/reading/standings'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE } from '@/lib/reports/quarterly'
import { Column, Columns, Eyebrow, Note, NotDrawn, Row, TableHead, TableRow } from './parts'

// QR5 · Who else is in this (mock page 5).
//
// TWO SHARES, BOTH OF WHAT OUR SEARCH PLAN FOUND, AND NO RANK. Attention is
// comments under videos about them; content is videos about them. Both are
// shares of the tracked set — not of a market — and the page says so once,
// under the table, exactly as CO2 does, because a share of what we looked for
// read as a share of the category is the single most dangerous misreading this
// product can produce.
//
// "NOT OBSERVED" AND "NOT RECORDED YET" ARE DIFFERENT ANSWERS, AND THE CELL
// HAS TO SAY WHICH. "Not observed" means we looked at the panel and this brand
// was not in it; "not recorded yet" means `month_audience_stats` (M5) does not
// exist here and nobody looked. `RivalsBlock.recorded` is the flag that tells
// them apart, and rendering without it is the exact defect the Block B fix pass
// corrected on OV4 (commit c0102bd).
//
// THE HEADING IS NOT THE MOCK's. "…and are they gaining?" makes its claim
// before a band is drawn — the finding the Block B fix pass acted on for the
// Competitive page bar's own question.
//
// ---- the port (Block D wave 2) -------------------------------------------------
//
// THE ARTBOARD'S THREE COLUMNS, AND THE FOUR MONTH CELLS THE BUILD ALREADY HELD.
// `StandingsBlock.series[].points[]` and `.months` have been carried on this
// page's type since WP12 and rendered nowhere; the build printed one month
// inline per row. They are the artboard's Jun · Jul · Aug · Sep cells now.
//
// THE REFUSAL'S REASON IS PRINTED, NOT HOVERED. `MovementBadge` puts
// `REFUSAL_WHY` in a `title`, which is nothing at all on paper and nothing at
// all for a reader without a mouse — and this deck is a PDF. So a refused row
// prints its reason beside the badge, in the record's own words, and the
// per-month tracking rules (`standings.rules`) print under the table with their
// dates. That is the mock's "Poler was added 3 Sep", built from the log rather
// than typed.
//
// `qr.p5.h2h` · CO3's five measures, passed through from Competitive.
// THREE OF THE FIVE CARRY NO BADGE ON PURPOSE — comments per video is a rate,
// engagement is a median of rates and posts published is a bare count, and the
// product's band is built for shares. The row says so in `verdictWhy` rather
// than going quietly blank, and the badge each row DOES carry is that side
// against ITS OWN last month, never you against them: two shares of two
// populations have no honest margin.
//
// `qr.p5.saidabout` / `.whattheysay` · `RivalRow.raisedMost`, `saidAbout` and
// `ownPosts` were all carried and all dropped. What is NOT printed is the
// model's PARAPHRASE of a rival's claim (`OwnClaimRow.claim`,
// `SaidAbout.rows[].claim`): those words came out of `video_claims`, which is
// Pass A's, and `PROSE_POLICY` has no slot for a brand claim at this branch's
// base — an unknown `data-slot` fails the contract rather than exempting
// anything, and naming a convenient slot instead is the one thing the marker
// exists to stop. The claim as SPOKEN travels as a quote with its own ref and
// is printed; the paraphrase waits for its slot (E-competitive owns that edit).

/**
 * The mock's `1fr 78px 78px 88px`, as ratios — RE-CUT SO THE CHANGE COLUMN CAN
 * HOLD ITS WIDEST ANSWER.
 *
 * "comparison refused" is a real cell value on this table (`MovementBadge`'s
 * NON_ANSWER, which is `whitespace-nowrap`), and it is 109px wide at the badge's
 * own size. The previous cut gave the Change column 120fr of 590 — 66px on the
 * sheet — so the badge painted 43px into the column beside it and the printed
 * row read "comparison refuseCon" over "Comments per video", on six of the
 * seven fixture states at 1440 and at 1024. A nowrap node in a track narrower
 * than its own text does not clip on paper; it overprints.
 *
 * So the Change column is 170fr (~112px) and the month columns are 150fr each
 * (~99px), which still takes two month cells per line and the newest month's
 * "32,600 of 41,200" on one. The page's own columns widen with it (`Columns`
 * below): the width comes from the sheet's other two panels rather than out of
 * the month cells, which would have traded an overprint for a four-line cell.
 */
const TEMPLATE = 'minmax(0,120fr) minmax(0,150fr) minmax(0,150fr) minmax(0,170fr)'
/** How many month cells the artboard draws per share. */
const MONTH_CELLS = 4

/** "A, B or C" — the record's own labels, joined. */
function listLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
}

/** The words a cell says where there is no reading at all — never a zero, and
 *  never four em dashes, which say neither of the two things that can be true. */
function Absent({ recorded, mode }: { recorded: boolean; mode: RenderMode }): ReactNode {
  const words = recorded ? NOT_OBSERVED : NOT_RECORDED
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{words}</span>
    : <span className="text-[12px] text-muted-foreground">{words}</span>
}

/**
 * ONE CELL SHAPE FOR EVERY ROW, WITH THE UNIT AND THE DENOMINATOR.
 *
 * The first cut drew two shapes under one header: a `FigureCell` ("15% ·
 * 6,200 of 41,200") where a brand carried no month series, and a row of bare
 * values ("2.4 0.9 1.3") where it did. Three rows then answered two different
 * questions under one heading, and the bare half dropped BOTH the unit and the
 * "of N" — a reader could not tell that 15% and 2.4 were the same measure, nor
 * what 2.4 was a share of. `StandingsSeriesPoint.attention` / `.content` are
 * percentages (`competitive-surface.ts`, `round1(… * 100)`), so the `%` is the
 * measure's own and is printed.
 *
 * THE NEWEST MONTH'S CELL CARRIES THE COUNTS UNDER THE ROW. A month point
 * holds a percentage and nothing else; `StandingRow.attention` / `.content` is
 * that same share for the table's newest read month WITH its k and n, so the
 * denominator prints once, under the cells, naming the month it belongs to.
 * The older months are levels with no denominator on record, which is why they
 * are `figure` nodes and not `level` ones — a level node must carry its "of N"
 * and this product does not manufacture one.
 */
function MonthCells({ months, values, newest, newestLabel, share, recorded, mode }: {
  months: readonly string[]
  values: readonly (number | null)[]
  newest: string | null
  newestLabel: string | null
  share: StandingShare | null
  recorded: boolean
  mode: RenderMode
}): ReactNode {
  // The newest month's own cell comes off the row where the series has no
  // point for it: the two are the same reading of the same month.
  const cells = months.map((m, i) => (values[i] ?? (m === newest && share ? share.pct : null)))
  if (cells.every((v) => v == null)) return <Absent recorded={recorded} mode={mode} />
  const text = (v: number | null) => (v == null ? '—' : `${v}%`)
  if (mode === 'email') {
    return (
      <span style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.ink }}>
        {months.map((m, i) => `${monthName(m).split(' ')[0]} ${text(cells[i])}`).join(' · ')}
        {share && share.pct != null ? ` · ${fmtInt(share.k)} of ${fmtInt(share.n)} in ${newestLabel}` : ''}
      </span>
    )
  }
  return (
    <span className="flex min-w-0 flex-col gap-[1px]">
      {/* WRAPS INSIDE ITS OWN CELL. Three mono percentages do not shrink, so
          on a narrow track the row simply painted over the column beside it —
          "86.4%comparison refused". A cell that needs two lines takes two. */}
      <span className="flex min-w-0 flex-wrap gap-x-1.5">
        {cells.map((v, i) => (
          <span
            key={i}
            data-copy="figure"
            className={`font-mono text-[11px] leading-[1.3] tabular-nums ${i === cells.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
          >
            {text(v)}
          </span>
        ))}
      </span>
      {share && share.pct != null ? (
        <span data-copy="figure" className="whitespace-nowrap font-mono text-[10.5px] leading-[1.2] text-muted-foreground">
          {fmtInt(share.k)} of {fmtInt(share.n)}
        </span>
      ) : null}
    </span>
  )
}

/** One head-to-head measure: your side and theirs, each with its own "of N",
 *  and the badge only where the measure is a proportion. */
function FaceOff({ m, basis, mode }: { m: FaceOffMeasure; basis: string | null; mode: RenderMode }) {
  const email = mode === 'email'
  // WHAT k AND n COUNT IS THE MEASURE'S, NOT THE LOOP'S. Comments per video is
  // 151 COMMENTS over 19 VIDEOS, and a cell that prints "151 of 19" has told the
  // reader nothing except that the product cannot count. `countUnit` is on the
  // measure for exactly this; the units are printed only where the two differ,
  // because "19 of 449 videos of videos" is the other way to be wrong.
  const of = (s: NonNullable<FaceOffMeasure['you']>): string | undefined => {
    if (s.value.n <= 0) return undefined
    const { k, n } = m.countUnit
    return k === n
      ? `${fmtInt(s.value.k)} of ${fmtInt(s.value.n)} ${n}`
      : `${fmtInt(s.value.k)} ${k} of ${fmtInt(s.value.n)} ${n}`
  }
  const side = (s: FaceOffMeasure['you']) =>
    s == null
      ? <NotDrawn mode={mode}>— not read</NotDrawn>
      : <FigureCell mode={mode} value={s.text} of={of(s)} />
  // THE ARTBOARD'S OWN ROW: the measure on the left with its clock under it,
  // the two sides beside each other, and the badge with the row. Stacked, five
  // of these cost 749px on a slide body of 561; laid out they cost about 280.
  return (
    <div
      className={email ? undefined : 'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-2 border-b border-border/70 py-[2px]'}
      style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` } : undefined}
    >
      <span className={email ? undefined : 'flex min-w-0 flex-col'}>
        <span className={email ? undefined : 'text-[11.5px] font-medium leading-[1.3]'}>{m.label}</span>
        {/* THE CLOCK IS PRINTED WHERE IT CHANGES. Five measures carry two
            distinct basis lines between them, and one of them was printed
            three times running — four repeated lines of a 421px column, on
            the page that lost rows off its bottom. Every row is still ON a
            stated clock: the line above it is the one it is read on, which is
            how a dated table is read, and it is the rule this block already
            follows for why a band was not drawn. */}
        {basis ? <span className={email ? undefined : 'font-mono text-[10.5px] leading-[1.3] text-muted-foreground'}>{basis}</span> : null}
        {/* WHY A ROW DREW NO BAND IS SAID ONCE, UNDER THE TABLE, AND NOT
            FOUR TIMES INSIDE IT. Three of the five measures never can carry one
            — a rate, a median and a count are not proportions — and the three
            sentences that say so cost 228px of a 561px slide when each sits in
            a cell 150px wide. They are printed below, one per distinct reason,
            where they read as the rule they are. `m.why` stays in the row: it
            is about THIS side being absent, which is not a fact about the
            measure. */}

      </span>
      <span className={email ? undefined : 'flex min-w-0 flex-col gap-0.5'}>
        {side(m.you)}
        <BlockMovement verdict={m.verdict} unit="pts" mode={mode} />
      </span>
      <span className={email ? undefined : 'flex min-w-0 flex-col gap-0.5'}>
        {side(m.them)}
        <BlockMovement verdict={m.rivalVerdict} unit="pts" mode={mode} />
      </span>
    </div>
  )
}

export const quarterlyRivals: Block<QuarterlyData> = {
  key: 'quarterly.rivals',
  title: QUARTER_PAGE_TITLE.rivals,
  question: QUARTER_PAGE_QUESTION.rivals,

  render(data, mode = 'app') {
    const r: RivalsPage = data.rivals
    const email = mode === 'email'
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyRivals.title}
        question={quarterlyRivals.question}
        mode={mode}
        // THE MONTH THESE ROWS ARE OF. `standings.monthLabel` is the
        // Competitive surface's own read and can be a different month: it
        // headed this sheet "Sep 2026" while every other page said October.
        meta={r.monthLabel}
        // NO `footerNote`. The corpus sentence used to be spent here, which is
        // the block frame's LAST child on a sheet whose columns already fill
        // it: measured at 1440 and at 1024 on six of the seven fixture states,
        // the frame footer's box landed 7px below `.vb-slide-body`'s 561px
        // bottom and the page printed a hairline with nothing under it. The
        // sentence is under the table it is about now (below), which is both
        // where "the videos on the left" names something and inside the column
        // that can carry it; the footer slot costs the sheet 36px it does not
        // have.
      >
        {children}
      </BlockFrame>
    )
    const empty = quarterlyRivals.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const months = (r.standings?.months ?? []).slice(-MONTH_CELLS)
    const silent = r.saidAbout.filter((s) => s.empty).map((s) => s.label)
    const seriesFor = (audience: string, key: 'attention' | 'content'): (number | null)[] => {
      const points = r.standings?.series.find((s) => s.audience === audience)?.points ?? []
      const byMonth = new Map(points.map((p) => [p.month, p[key]]))
      return months.map((m) => byMonth.get(m) ?? null)
    }
    /**
     * A ROW OF EM DASHES IS NOT AN ANSWER, AND THE TWO ANSWERS ARE DIFFERENT.
     * Where a brand carries no reading at all, the cell falls back to the
     * words — "not observed" where the panel was read and this brand was not
     * in it, "not recorded yet" where `month_audience_stats` (M5) does not
     * exist here and nobody looked. Four dashes say neither, and the
     * distinction is the exact defect the Block B fix pass corrected on OV4.
     */
    const newest = r.standings?.month ?? null
    const newestLabel = newest ? monthName(newest).split(' ')[0] : null
    const cellFor = (
      audience: string,
      key: 'attention' | 'content',
      share: StandingShare | null,
    ): ReactNode => {
      if (months.length === 0) {
        return share && share.pct != null
          ? <FigureCell mode={mode} value={standingText(share)} of={`${fmtInt(share.k)} of ${fmtInt(share.n)}`} />
          : <Absent recorded={r.recorded} mode={mode} />
      }
      return (
        <MonthCells
          months={months}
          values={seriesFor(audience, key)}
          newest={newest}
          newestLabel={newestLabel}
          share={share}
          recorded={r.recorded}
          mode={mode}
        />
      )
    }
    const refusedWhy = (verdict: { state: string; refusedReason?: string | null } | null): string | null =>
      verdict && verdict.state === 'refused' && verdict.refusedReason
        ? REFUSAL_WHY[verdict.refusedReason as keyof typeof REFUSAL_WHY] ?? null
        : null

    const standings = (
      <Column mode={mode} gap={0}>
        <Eyebrow mode={mode}>
          Where they stand{months.length > 1 ? `, ${monthName(months[0]).split(' ')[0]} → ${monthName(months[months.length - 1]).split(' ')[0]}` : ''}
        </Eyebrow>
        <TableHead
          mode={mode}
          template={TEMPLATE}
          cells={[
            'Brand',
            // THE UNIT IS IN THE HEADER, WHICH IS THE ARTBOARD'S OWN ANSWER
            // ("ATTENTION %"). Every cell under it is a percentage and each
            // one prints its own `%` as well: a header is read once and a row
            // is scanned, and the deck is a PDF nobody can hover.
            `Attention % · ${months.map((m) => monthName(m).split(' ')[0]).join(' ')}`,
            `Content % · ${months.map((m) => monthName(m).split(' ')[0]).join(' ')}`,
            'Change · attention',
          ]}
        />
        {r.rows.map((row) => (
          <TableRow
            key={row.audience}
            mode={mode}
            template={TEMPLATE}
            cells={[
              <>{row.label}{row.retiredAt ? <Note mode={mode}>no longer tracked</Note> : null}</>,
              cellFor(row.audience, 'attention', row.attention),
              cellFor(row.audience, 'content', row.content),
              <span key="chg" className={email ? undefined : 'flex flex-col gap-0.5'}>
                <BlockMovement verdict={row.attentionVerdict} unit="pts" mode={mode} />
                {/* PRINTED, NOT HOVERED. A `title` is nothing at all on paper. */}
                {refusedWhy(row.attentionVerdict) ? <Note mode={mode}>{refusedWhy(row.attentionVerdict)}</Note> : null}
              </span>,
            ]}
          />
        ))}
        <div className={email ? undefined : 'mt-1 flex flex-col gap-[2px]'}>
          {/* WHAT THE CELLS ARE. The clause that used to close this sentence —
              "both shares are of the month's tracked set" — is `r.caveat`'s
              own subject, said more precisely two lines down, and one sheet
              does not need it twice. */}
          {/* `qr.p5.standings.note` · the two denominators as figures, and the
              per-month tracking rules with their dates. Both were carried on
              `StandingsBlock` and neither was rendered. */}
          {(r.standings?.denominators ?? []).slice(-1).map((d) => (
            <Note key={d.month} mode={mode}>
              {d.label}: <span data-copy="figure">{fmtInt(d.comments)}</span> comments ·{' '}
              <span data-copy="figure">{fmtInt(d.videos)}</span> videos.
            </Note>
          ))}
          {(r.standings?.rules ?? []).map((rule) => (
            <Note key={`${rule.month}-${rule.label}`} mode={mode}>{rule.text}</Note>
          ))}
          {r.monthNote ? <Note mode={mode}>{r.monthNote}</Note> : null}
          {r.standingsNote ? <Note mode={mode}>{r.standingsNote}</Note> : null}
          {r.rivalsNote ? <Note mode={mode}>{r.rivalsNote}</Note> : null}
          {/* THE PRECEDENCE RULE ONCE, WITH ITS COUNT WHERE THERE IS ONE.
              `standings.precedence` states the rule and points at the count
              ("the count of those is beside this table"); the sentence under
              it states the count AND the rule again ("each is counted once,
              in one audience"). Five lines of a 421px column for one rule,
              and the fifth was the row this table lost off the sheet. Where
              the count exists it is the sentence that carries both; where it
              does not, the rule still prints on its own. */}
          {/* THE DUAL-MENTION COUNT IS ON THE METHOD PAGE (the record's own
              line there), so where it exists nothing is said here (E82). */}
          {r.dualMention == null && r.standings ? (
            <Note mode={mode}>{r.standings.precedence}</Note>
          ) : null}
          {r.standings?.caveat ? <Note mode={mode}>{r.standings.caveat}</Note> : null}
          {/* THE CORPUS CAVEAT, UNDER THE TABLE IT IS ABOUT, AND IT IS THIS
              BLOCK THAT PRINTS IT.

              `standings.denominatorLine` is `CORPUS_DENOMINATOR_LINE` — "Both
              shares are of what our search plan found and we read this month —
              the videos on the left, the comments we kept on the right" —
              which names THESE two columns and nothing else on the sheet. It
              was passed to the frame's `footerNote` and printed at the bottom
              of the whole block, where "left" and "right" name nothing and
              where it was the leaf that fell off the bottom of the page on six
              of the seven fixture states.

              It is the sentence this block's own header calls the one the page
              must say once, because a share of what we looked for read as a
              share of the category is the worst misreading this product can
              produce; it says it here. `r.caveat` is the SAME claim from the
              Overview block's own composition and is empty on every populated
              reading, so it is printed only where it says something this line
              does not. */}
          {r.standings?.denominatorLine ? <Note mode={mode}>{r.standings.denominatorLine}</Note> : null}
          {r.caveat && r.caveat !== r.standings?.denominatorLine ? <Note mode={mode}>{r.caveat}</Note> : null}
        </div>

        <div className={email ? undefined : 'mt-1 flex flex-col gap-[2px]'}>
          <Eyebrow mode={mode}>Said about them, by others</Eyebrow>
          {r.rows.filter((row) => row.raisedMost).map((row) => (
            <Row key={`raised-${row.audience}`} mode={mode} label={row.label}>
              {row.raisedMost?.label}{' '}
              <FigureCell
                mode={mode}
                value={row.raisedMost?.pct == null ? '—' : `${row.raisedMost.pct}%`}
                of={`${fmtInt(row.raisedMost!.k)} of ${fmtInt(row.raisedMost!.n)}`}
              />
            </Row>
          ))}
          {r.saidAbout.filter((s) => !s.empty).map((s) => (
            <div key={s.audience}>
              <BlockQuotes
                mode={mode}
                quotes={s.rows.filter((row) => row.quote).map((row) => ({ quote: row.quote, cite: `${s.label} · ${fmtInt(row.value.k)} of ${fmtInt(row.value.n)} videos` }))}
              />
            </div>
          ))}
          {/* ONE SENTENCE FOR THE SILENCES, NOT ONE PER BRAND. `SAID_ABOUT_EMPTY`
              is a single template and three rivals produced three lines of it
              differing only in the name — "Nothing was said about Ottobock in
              what we read this month." three times, 50px of a 419px column,
              and the third of them was clipped off the sheet. The words are
              the record's own; only the list is joined. */}
          {silent.length > 0 ? (
            <Note mode={mode}>
              Nothing was said about {listLabels(silent)} in what we read this month.
            </Note>
          ) : null}
          {r.saidAbout.length === 0 && !r.rows.some((row) => row.raisedMost) ? (
            <Note mode={mode}>What is said about a tracked rival is not readable on this workspace’s own session.</Note>
          ) : null}
        </div>
      </Column>
    )

    const h2h = (
      <Column mode={mode} gap={6}>
        <div className={email ? undefined : 'flex flex-col gap-1'}>
          <Eyebrow mode={mode}>Head to head, then and now</Eyebrow>
          {r.headToHead ? (
            <>
              <Note mode={mode}>
                {data.brand} against {r.headToHead.rivalLabel}, {monthName(r.headToHead.month)} — a badge is that side
                against its own month before, never one side against the other.
              </Note>
              <div className={email ? undefined : 'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 border-b border-border pb-1'}>
                <span />
                <span className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}>You</span>
                <span className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}>{r.headToHead.rivalLabel}</span>
              </div>
              {r.headToHead.measures.map((m, i) => (
                <FaceOff
                  key={m.key}
                  m={m}
                  basis={i === 0 || m.basisLine !== r.headToHead!.measures[i - 1].basisLine ? m.basisLine : null}
                  mode={mode}
                />
              ))}
              {/* ONE PARAGRAPH OF REASONS, NOT FIVE ORPHAN LINES. Each reason
                  is still distinct and still composed from the rows rather than
                  typed — a measure that gains a band drops its sentence with it
                  — but they are one run of prose under the table instead of one
                  `Note` each. Five one-sentence notes cost four inter-note gaps
                  and a short last line apiece: measured at this column's width,
                  34px of a 561px sheet, which is the height the Change column
                  next door needed to stop overprinting. They read as the rule
                  they are, which is what a paragraph is for. */}
              {(() => {
                const why = [...new Set(r.headToHead.measures.flatMap((m) => [m.why, !m.verdict ? m.verdictWhy : null]).filter((w): w is string => !!w))]
                return why.length > 0 ? <Note mode={mode}>{why.join(' ')}</Note> : null
              })()}
              <Note mode={mode}>{r.headToHead.footerLine}</Note>
              <Note mode={mode}>{r.headToHead.excludedNote}</Note>
              {r.headToHead.unread ? <Note mode={mode}>{r.headToHead.unread}</Note> : null}
            </>
          ) : (
            <Note mode={mode}>
              Head to head needs a rival selected and a month read on both sides; neither is recorded for this workspace yet.
            </Note>
          )}
        </div>
      </Column>
    )

    const theirs = (
      <Column mode={mode} gap={6}>
        <div className={email ? undefined : 'flex flex-col gap-1'}>
          <Eyebrow mode={mode}>What they say on their own posts</Eyebrow>
          {r.ownPosts.length > 0 ? (
            r.ownPosts.map((c) => (
              <Row key={c.audience} mode={mode} label={c.audienceLabel}>
                {/* THREE ABSENCE STATES, NEVER A ZERO (`rivalOwnClaims`): posts
                    read · configured and silent · no accounts. `basis` names
                    the month the posts were PUBLISHED in — a third clock, and
                    it says so beside every figure (D9). */}
                {c.unread ? (
                  <Note mode={mode}>{c.unread}</Note>
                ) : (
                  <>
                    <FigureCell mode={mode} value={fmtInt(c.published.k)} of={`posts · ${fmtInt(c.overFloor.k)} of ${fmtInt(c.overFloor.n)} cleared the comment floor`} />
                    {c.claimsNote ? <Note mode={mode}>{c.claimsNote}</Note> : null}
                    {c.claims.some((claim) => claim.quote) ? (
                      <BlockQuotes
                        mode={mode}
                        quotes={c.claims.filter((claim) => claim.quote).slice(0, 2).map((claim) => ({
                          quote: claim.quote,
                          cite: `${c.audienceLabel} · ${fmtInt(claim.posts.k)} of ${fmtInt(claim.posts.n)} posts`,
                        }))}
                      />
                    ) : null}
                  </>
                )}
                {c.unread ? null : <Note mode={mode}>{c.basis}</Note>}
              </Row>
            ))
          ) : (
            <Note mode={mode}>No rival’s own accounts are recorded for this workspace.</Note>
          )}
        </div>

        <div className={email ? undefined : 'flex flex-col gap-1'}>
          <Eyebrow mode={mode}>What the category asks under their videos</Eyebrow>
          {r.questions.map((q) => (
            <Row
              key={q.id}
              mode={mode}
              // NO `of`, BECAUSE THERE IS NO DENOMINATOR. This is how many
              // comments in the window are cited behind the question; it is not
              // a share of the window's comments, and inventing one at render is
              // what `FigureCell`'s optional `of` exists to refuse.
              aside={
                q.comments == null ? null : (
                  <span className={email ? undefined : 'flex items-baseline gap-1.5'}>
                    <FigureCell mode={mode} value={fmtInt(q.comments)} />
                    <Note mode={mode}>comments behind it in this window</Note>
                  </span>
                )
              }
            >
              {r.questionsRival ? <span className={email ? undefined : 'text-muted-foreground'}>{r.questionsRival} — </span> : null}
              <span data-copy="stored" data-slot="pass_a_audience_insight">{q.text}</span>
            </Row>
          ))}
          <Note mode={mode}>{r.questionsLine}</Note>
        </div>
      </Column>
    )

    return frame(
      // 4.6 / 5 / 2.9, NOT 3.9 / 5.6 / 3. The standings table has four columns
      // and the widest answer any of them prints is "comparison refused"; at
      // 3.9 the table had 325px of track for a row needing ~112px of Change
      // alone. The 0.7fr it gains comes off the head-to-head (0.6) and the
      // questions (0.1), neither of which gains a line at its new width —
      // measured, both columns stand where they stood.
      <Columns weights={[4.6, 5, 2.9]} gap={24} mode={mode}>
        {standings}
        {h2h}
        {theirs}
      </Columns>,
    )
  },

  // WHAT THIS PAGE DRAWS, AND ONLY THAT. The ported table has one badge column
  // — `Change · attention` — where the build's old aside printed a content
  // badge too, and `contentVerdict` stayed in this list after the badge it
  // named came off the page. `blockAnswers` feeds the digest and the summary
  // composition (lib/schedules/deliver.ts, lib/schedules/run.ts), so a
  // comparison this artefact does not print was being declared as one it did.
  // The content shares are still on the table as levels with their counts;
  // what is not on it is a banded claim about how they moved.
  verdicts(data) {
    return [
      ...data.rivals.rows.map((r) => r.attentionVerdict),
      ...(data.rivals.headToHead?.measures.flatMap((m) => [m.verdict, m.rivalVerdict]) ?? []),
    ].filter((v): v is NonNullable<typeof v> => v != null)
  },

  quotes(data) {
    return [
      ...data.rivals.saidAbout.flatMap((s) => s.rows.map((r) => r.quote?.ref)),
      ...data.rivals.ownPosts.flatMap((c) => c.claims.map((claim) => claim.quote?.ref)),
    ].filter((ref): ref is string => !!ref)
  },

  emptyState(data) {
    if (data.rivals.rows.length === 0) {
      return 'No rival is tracked for this workspace, so there is nobody to stand this quarter against.'
    }
    return null
  },
}
