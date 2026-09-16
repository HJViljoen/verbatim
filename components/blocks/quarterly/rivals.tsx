import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { NOT_OBSERVED, NOT_RECORDED, standingText, type StandingShare } from '@/lib/reading/standings'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE } from '@/lib/reports/quarterly'
import { Figure, Note, Row } from './parts'

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
// corrected on OV4 (commit c0102bd) — reintroduced here in the first cut and
// caught by reading the printed deck, where every Össur row said "not
// observed" about a table nobody has applied.
//
// THE HEADING IS NOT THE MOCK's. "…and are they gaining?" makes its claim
// before a band is drawn — the finding the Block B fix pass acted on for the
// Competitive page bar's own question.

function Share({ share, recorded, mode }: { share: StandingShare | null; recorded: boolean; mode: RenderMode }): ReactNode {
  if (!share || share.pct == null) {
    const words = recorded ? NOT_OBSERVED : NOT_RECORDED
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{words}</span>
      : <span className="text-[12px] text-muted-foreground">{words}</span>
  }
  return <Figure mode={mode} value={standingText(share)} of={`${fmtInt(share.k)} of ${fmtInt(share.n)}`} />
}

export const quarterlyRivals: Block<QuarterlyData> = {
  key: 'quarterly.rivals',
  title: QUARTER_PAGE_TITLE.rivals,
  question: QUARTER_PAGE_QUESTION.rivals,

  render(data, mode = 'app') {
    const r = data.rivals
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyRivals.title}
        question={quarterlyRivals.question}
        mode={mode}
        // THE MONTH THESE ROWS ARE OF. `standings.monthLabel` is the
        // Competitive surface's own read and can be a different month: it
        // headed this sheet "Sep 2026" while every other page said October.
        meta={r.monthLabel}
      >
        {children}
      </BlockFrame>
    )
    const empty = quarterlyRivals.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    return frame(
      <div>
        {r.rows.map((row) => (
          <Row
            key={row.audience}
            mode={mode}
            label={row.label}
            aside={
              <>
                <BlockMovement verdict={row.attentionVerdict} unit="pts" mode={mode} />{' '}
                <BlockMovement verdict={row.contentVerdict} unit="pts" mode={mode} />
              </>
            }
          >
            attention <Share share={row.attention} recorded={r.recorded} mode={mode} /> · content <Share share={row.content} recorded={r.recorded} mode={mode} />
            {row.retiredAt ? ' · no longer tracked' : null}
          </Row>
        ))}
        {/* A MONTH OUTSIDE THE QUARTER SAYS SO HERE TOO. Every row on this
            page is the month the product is in, and on a review of a closed
            quarter that is not a month of the quarter in the heading. */}
        {r.monthNote ? <Note mode={mode}>{r.monthNote}</Note> : null}
        {r.standingsNote ? <Note mode={mode}>{r.standingsNote}</Note> : null}
        {r.rivalsNote ? <Note mode={mode}>{r.rivalsNote}</Note> : null}
        {r.standings ? <Note mode={mode}>{r.standings.denominatorLine} {r.standings.precedence}</Note> : null}
        {r.standings?.caveat ? <Note mode={mode}>{r.standings.caveat}</Note> : null}
        {r.dualMention != null ? (
          <Note mode={mode}>
            <Figure mode={mode} value={fmtInt(r.dualMention)} /> of your own videos also named a tracked rival in {r.monthLabel}; each is counted once, in one audience.
          </Note>
        ) : null}

        {r.questions.length > 0 ? (
          <div className={mode === 'email' ? undefined : 'mt-3'}>
            <Note mode={mode} tone="body">What the category asks under their videos</Note>
            {r.questions.map((q) => (
              <Row key={q.id} mode={mode}>
                <span data-copy="stored" data-slot="pass_a_audience_insight">{q.text}</span>
              </Row>
            ))}
          </div>
        ) : null}
        <Note mode={mode}>{r.questionsLine}</Note>
        <Note mode={mode}>{r.caveat}</Note>
      </div>,
    )
  },

  verdicts(data) {
    return data.rivals.rows.flatMap((r) => [r.attentionVerdict, r.contentVerdict].filter((v): v is NonNullable<typeof v> => v != null))
  },

  emptyState(data) {
    if (data.rivals.rows.length === 0) {
      return 'No rival is tracked for this workspace, so there is nobody to stand this quarter against.'
    }
    return null
  },
}
