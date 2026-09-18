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

/** The mock's `1fr 78px 78px 88px`, as ratios. */
const TEMPLATE = 'minmax(0,150fr) minmax(0,160fr) minmax(0,160fr) minmax(0,120fr)'
/** How many month cells the artboard draws per share. */
const MONTH_CELLS = 4

function Share({ share, recorded, mode }: { share: StandingShare | null; recorded: boolean; mode: RenderMode }): ReactNode {
  if (!share || share.pct == null) {
    const words = recorded ? NOT_OBSERVED : NOT_RECORDED
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{words}</span>
      : <span className="text-[12px] text-muted-foreground">{words}</span>
  }
  return <FigureCell mode={mode} value={standingText(share)} of={`${fmtInt(share.k)} of ${fmtInt(share.n)}`} />
}

/** The four month cells of one share, in one row — the artboard's inner grid.
 *  A month with no reading is an em dash, never a zero. */
function Months({ values, mode }: { values: (number | null)[]; mode: RenderMode }) {
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.ink }}>{values.map((v) => (v == null ? '—' : v)).join(' · ')}</span>
  }
  return (
    <span className="flex gap-2">
      {values.map((v, i) => (
        <span
          key={i}
          data-copy="figure"
          className={`font-mono text-[11.5px] tabular-nums ${i === values.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
        >
          {v == null ? '—' : v}
        </span>
      ))}
    </span>
  )
}

/** One head-to-head measure: your side and theirs, each with its own "of N",
 *  and the badge only where the measure is a proportion. */
function FaceOff({ m, mode }: { m: FaceOffMeasure; mode: RenderMode }) {
  const email = mode === 'email'
  const side = (s: FaceOffMeasure['you']) =>
    s == null
      ? <NotDrawn mode={mode}>— not read</NotDrawn>
      : (
        <FigureCell
          mode={mode}
          value={s.text}
          of={s.value.n > 0 ? `${fmtInt(s.value.k)} of ${fmtInt(s.value.n)}` : undefined}
        />
      )
  return (
    <div
      className={email ? undefined : 'flex flex-col gap-1 border-b border-border/70 py-1.5'}
      style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` } : undefined}
    >
      <span className={email ? undefined : 'text-[12px] font-medium'}>{m.label}</span>
      <span className={email ? undefined : 'font-mono text-[10px] text-muted-foreground'}>{m.basisLine}</span>
      <div className={email ? undefined : 'flex items-start gap-4'}>
        <span className={email ? undefined : 'min-w-0 flex-1'}>{side(m.you)}</span>
        <span className={email ? undefined : 'min-w-0 flex-1'}>{side(m.them)}</span>
      </div>
      <div className={email ? undefined : 'flex flex-wrap items-center gap-1.5'}>
        <BlockMovement verdict={m.verdict} unit="pts" mode={mode} />
        {/* WHY A ROW DREW NO BAND, IN THE ROW. Three of the five never can —
            a rate, a median and a count are not proportions — and a blank cell
            there would read as "nothing happened" rather than "this measure
            takes no band". */}
        {!m.verdict && m.verdictWhy ? <Note mode={mode}>{m.verdictWhy}</Note> : null}
        {m.why ? <Note mode={mode}>{m.why}</Note> : null}
      </div>
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
        footerNote={r.standings ? r.standings.denominatorLine : undefined}
      >
        {children}
      </BlockFrame>
    )
    const empty = quarterlyRivals.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const months = (r.standings?.months ?? []).slice(-MONTH_CELLS)
    const seriesFor = (audience: string, key: 'attention' | 'content'): (number | null)[] => {
      const points = r.standings?.series.find((s) => s.audience === audience)?.points ?? []
      const byMonth = new Map(points.map((p) => [p.month, p[key]]))
      return months.map((m) => byMonth.get(m) ?? null)
    }
    /**
     * A ROW OF EM DASHES IS NOT AN ANSWER, AND THE TWO ANSWERS ARE DIFFERENT.
     * Where a brand carries no month at all, the cell falls back to the words
     * `Share` prints — "not observed" where the panel was read and this brand
     * was not in it, "not recorded yet" where `month_audience_stats` (M5) does
     * not exist here and nobody looked. Four dashes say neither, and the
     * distinction is the exact defect the Block B fix pass corrected on OV4.
     */
    const cellFor = (
      audience: string,
      key: 'attention' | 'content',
      share: StandingShare | null,
    ): ReactNode => {
      if (months.length === 0) return <Share share={share} recorded={r.recorded} mode={mode} />
      const values = seriesFor(audience, key)
      if (values.every((v) => v == null)) return <Share share={share} recorded={r.recorded} mode={mode} />
      return <Months values={values} mode={mode} />
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
            `Attention · ${months.map((m) => monthName(m).split(' ')[0]).join(' ')}`,
            `Content · ${months.map((m) => monthName(m).split(' ')[0]).join(' ')}`,
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
        <div className={email ? undefined : 'mt-2 flex flex-col gap-1'}>
          {months.length > 0 ? (
            <Note mode={mode}>
              The newest month is the bold column. Each cell is that brand’s share of the month’s tracked set. The two
              shares are read over two different denominators, named under this page.
            </Note>
          ) : null}
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
          {r.standings ? <Note mode={mode}>{r.standings.precedence}</Note> : null}
          {r.standings?.caveat ? <Note mode={mode}>{r.standings.caveat}</Note> : null}
          {r.dualMention != null ? (
            <Note mode={mode}>
              <span data-copy="figure">{fmtInt(r.dualMention)}</span> of your own videos also named a tracked rival in{' '}
              {r.monthLabel}; each is counted once, in one audience.
            </Note>
          ) : null}
        </div>
      </Column>
    )

    const h2h = (
      <Column mode={mode} gap={10}>
        <div className={email ? undefined : 'flex flex-col gap-1'}>
          <Eyebrow mode={mode}>Head to head, then and now</Eyebrow>
          {r.headToHead ? (
            <>
              <Note mode={mode}>
                {data.brand} against {r.headToHead.rivalLabel}, {monthName(r.headToHead.month)}. Each side is printed
                with what it is out of; a badge is that side against its own month before, never one side against the other.
              </Note>
              <div className={email ? undefined : 'flex items-baseline gap-4 border-b border-border pb-1'}>
                <span className={email ? undefined : 'min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}>You</span>
                <span className={email ? undefined : 'min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}>{r.headToHead.rivalLabel}</span>
              </div>
              {r.headToHead.measures.map((m) => <FaceOff key={m.key} m={m} mode={mode} />)}
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

        <div className={email ? undefined : 'flex flex-col gap-1'}>
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
          {r.saidAbout.map((s) => (
            <div key={s.audience}>
              {s.empty ? (
                <Note mode={mode}>{s.empty}</Note>
              ) : (
                <BlockQuotes
                  mode={mode}
                  quotes={s.rows.filter((row) => row.quote).map((row) => ({ quote: row.quote, cite: `${s.label} · ${fmtInt(row.value.k)} of ${fmtInt(row.value.n)} videos` }))}
                />
              )}
            </div>
          ))}
          {r.saidAbout.length === 0 && !r.rows.some((row) => row.raisedMost) ? (
            <Note mode={mode}>What is said about a tracked rival is not readable on this workspace’s own session.</Note>
          ) : null}
        </div>
      </Column>
    )

    const theirs = (
      <Column mode={mode} gap={10}>
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
                <span className={email ? undefined : 'flex items-baseline gap-1.5'}>
                  <FigureCell mode={mode} value={fmtInt(q.comments)} />
                  <Note mode={mode}>comments behind it in this window</Note>
                </span>
              }
            >
              {r.questionsRival ? <span className={email ? undefined : 'text-muted-foreground'}>{r.questionsRival} — </span> : null}
              <span data-copy="stored" data-slot="pass_a_audience_insight">{q.text}</span>
            </Row>
          ))}
          <Note mode={mode}>{r.questionsLine}</Note>
          <Note mode={mode}>{r.caveat}</Note>
        </div>
      </Column>
    )

    return frame(
      <Columns weights={[5, 4, 3]} gap={28} mode={mode}>
        {standings}
        {h2h}
        {theirs}
      </Columns>,
    )
  },

  verdicts(data) {
    return [
      ...data.rivals.rows.flatMap((r) => [r.attentionVerdict, r.contentVerdict]),
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
