import type { ReactNode } from 'react'
import type { BlockContext } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { overviewRivals } from '@/components/pages/overview/rivals'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, shortDate } from '@/lib/format'
import { REFUSAL_WHY } from '@/lib/reading/record'
import { NOT_OBSERVED, NOT_RECORDED, standingText, type StandingShare } from '@/lib/reading/standings'
import { isRivalAudience } from '@/lib/rivals'
import { OWN_POSTS_UNREADABLE, type OverviewData, type RivalRow } from '@/lib/pages/overview'
import { presentation, T } from './email-table'

/**
 * MR4 · Rivals' month, in the EMAIL (Block D wave 2, E-monthly; the artboard's
 * section 4).
 *
 * FIVE THINGS THE ARTEFACT HELD AND DID NOT PRINT, and the section is Overview's
 * either way — the rows, the shares, the verdicts and the meta line all come
 * off `buildRivals` exactly as they do on the page. What this arm adds is the
 * markup for things the page's email fallback had no room for:
 *
 *   1. THE LEAD SENTENCE. `RivalsBlock.lead` is composed by `rivalsLead`
 *      (wave 1) and rendered by nothing, on either surface. It is a COUNT of
 *      the rivals whose attention cleared its band, with their names — never
 *      the artboard's "Patagonia slipped 2", which is a direction word for a
 *      movement the row beneath it says did not clear its band (D8).
 *   2. THE CONTENT-SHARE VERDICT. `RivalRow.contentVerdict` is loaded, declared
 *      in `verdicts()` and drawn in neither arm, so the artefact printed one of
 *      the two readings `buildStandings` returns. The artboard's answer is a
 *      bare "−2" with no band, which is the score this product does not print
 *      (D9); the badge carries the change AND the band or neither.
 *   3. THE REFUSAL'S REASON, IN THE OPEN. Poler reads "comparison refused" and
 *      the WHY was a `title` attribute — invisible in an inbox and on paper.
 *      The words are `REFUSAL_WHY`, the same table the record paragraph prints
 *      from, so a tooltip and a paragraph about one refusal cannot differ.
 *   4. "(you)" ON YOUR OWN ROW. `role` has carried it since WP11 and no arm
 *      used it; a table of seven brands where one of them is the reader is
 *      unreadable without it.
 *   5. WHAT THEY SAID ON THEIR OWN POSTS. `OwnPosts` was rendered in the app
 *      and print arms only, so the email — the artefact under review — dropped
 *      the column whole. Until M8 gives a tenant SELECT on `video_claims` it is
 *      one honest absence per rival, which is still a thing the reader is owed.
 *
 * THE DENOMINATOR LINE IS THE BUILD'S AND STAYS (D8). "Both shares of a frozen
 * panel of accounts · no rank is printed" was written to refuse exactly the
 * artboard's sentence, which puts the panel's comment total and the corpus's
 * video total in one clause and ends "of what our search plan found" — CO2's
 * sentence about a different population.
 */
export function monthlyRivalsEmail(data: OverviewData, ctx: BlockContext): ReactNode {
  const r = data.rivals
  const href = `${ctx.appUrl}/dashboard/competitive`
  const empty = overviewRivals.emptyState(data)

  return (
    <BlockFrame
      title={overviewRivals.title}
      question={overviewRivals.question}
      mode="email"
      accent
      meta="attention share"
      footer={<a href={href} style={{ color: EMAIL.ink }}>Open Competitive →</a>}
      footerNote="both shares of a frozen panel of accounts · no rank is printed"
    >
      {empty ? <BlockEmpty mode="email">{empty}</BlockEmpty> : null}
      {r.standingsNote ? <BlockEmpty mode="email">{r.standingsNote}</BlockEmpty> : null}
      {r.lead ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '1.5', color: EMAIL.ink, marginTop: 6 }}>{r.lead}</div>
      ) : null}
      <div style={{ marginTop: 8 }}>
        {r.rows.map((row) => <Row key={row.audience} row={row} recorded={r.recorded} />)}
      </div>
      <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: '1.5', color: EMAIL.muted, marginTop: 8 }}>
        {r.caveat}
        {r.dualMention != null && r.dualMention > 0 ? (
          <> <span data-copy="figure">{fmtInt(r.dualMention)}</span> did this month.</>
        ) : null}
      </div>
      <OwnPostsPanel rows={r.rows} />
      <AskedPanel rows={r.rows} />
    </BlockFrame>
  )
}

/**
 * One brand, in the artboard's own row: the dot, the name, the SHARE BAR, the
 * attention level with its count, and the banded verdict — then the content
 * side on its own full-width line beneath, with ITS verdict beside the words
 * that name it.
 *
 * THE BAR IS THE SECTION'S ONE GRAPHIC AND IT WAS MISSING (the fix pass,
 * review finding [High]). `crop-mid-artboard.png` draws dot · name · bar ·
 * share · verdict; the build drew everything but the bar, so an artefact whose
 * argument is that a rival's share can be compared BY EYE compared by reading
 * six mono percentages. It is a `td` with a track colour and an inner cell at
 * the share's own width, which is the only bar an email can draw.
 *
 * AND IT IS DRAWN AGAINST THE WHOLE, NOT AGAINST THE LARGEST ROW. The artboard
 * normalises: 39% fills the track and every other row is a fraction of that,
 * which makes the leader's bar say 100% of something. Ours fills the share's
 * own percentage of the track, so the bar and the figure beside it say the
 * same thing (deviation 24).
 *
 * THE CONTENT LINE MOVED UNDER THE ROW (review finding [High]). Beside the
 * name it was a 264px box holding ~310px of words, so it wrapped and its badge
 * landed at the left margin — the exact ambiguity the comment there claimed to
 * have fixed, one chip top-right and one bottom-left with nothing saying which
 * share either belonged to. On its own line the badge sits immediately after
 * the words "content share 78% · 780 of 1,000" that name it, which is the
 * artboard's own arrangement (its second line ends "· −2").
 */
function Row({ row, recorded }: { row: RivalRow; recorded: boolean }) {
  const colour = row.role === 'client' ? EMAIL.green : row.role === 'category' ? EMAIL.cat : EMAIL.comp
  const why = row.attentionVerdict?.state === 'refused' && row.attentionVerdict.refusedReason
    ? REFUSAL_WHY[row.attentionVerdict.refusedReason]
    : null
  const pct = row.attention?.pct ?? null
  return (
    <table width="100%" {...presentation} style={{ ...T, borderTop: `1px solid ${EMAIL.hairline}` }}>
      <tbody>
        <tr>
          <td width={8} style={{ width: 8, padding: '11px 10px 0 0', verticalAlign: 'top' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: colour }} />
          </td>
          <td style={{ padding: '9px 10px 9px 0', verticalAlign: 'top' }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: row.role === 'rival' ? 400 : 600, color: EMAIL.ink }}>
              {row.label}
              {row.role === 'client' ? <span style={{ fontWeight: 400, color: EMAIL.muted }}> (you)</span> : null}
              {row.retiredAt ? <span style={{ fontWeight: 400, color: EMAIL.muted }}> · tracked until {shortDate(row.retiredAt)}</span> : null}
            </div>
          </td>
          {/* THE BAR. A percentage width inside a fixed-height track, which is
              the one bar shape every mail client draws the same way. It is
              hidden where there is no share to draw rather than drawn empty:
              an empty track beside "not observed" reads as a zero. */}
          {pct != null ? (
            <td width="17%" style={{ width: '17%', padding: '13px 10px 9px 0', verticalAlign: 'top' }}>
              <table width="100%" {...presentation} style={{ ...T, background: EMAIL.inner, borderRadius: 8 }}>
                <tbody>
                  <tr>
                    <td style={{ height: 8, lineHeight: '8px', fontSize: 0 }}>
                      <span style={{ display: 'block', height: 8, width: `${Math.max(2, Math.min(100, pct))}%`, borderRadius: 8, background: colour, fontSize: 0, lineHeight: 0 }} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          ) : null}
          <td align="right" style={{ padding: '9px 10px 9px 0', verticalAlign: 'top' }}>
            {row.attention == null || row.attention.pct == null ? (
              <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{recorded ? NOT_OBSERVED : NOT_RECORDED}</span>
            ) : (
              <FigureCell
                mode="email"
                align="right"
                value={standingText(row.attention)}
                of={`${fmtInt(row.attention.k)} of ${fmtInt(row.attention.n)}`}
              />
            )}
          </td>
          {/* AND THE COLUMNS ARE NOT FIXED PIXELS ANY MORE (review finding
              [Critical]). Chrome takes a `width:112px` on an auto-layout cell
              as a MINIMUM for its column, so 8 + 112 + 124 of fixed lead held
              every rivals row — and so the whole artefact — at a 296px floor
              on a phone. The columns now take their content's width, and the
              artboard's proportions at 640 come from the bar, which is the
              only sized thing in the row. */}
          <td align="right" style={{ padding: '9px 0', verticalAlign: 'top' }}>
            <BlockMovement verdict={row.attentionVerdict} unit="pts" mode="email" />
            {/* THE REASON, IN THE OPEN. "Comparison refused" alone tells a
                reader something is wrong without telling them what, and the
                app's tooltip reaches neither an inbox nor a sheet of paper. */}
            {why ? <div style={{ fontFamily: FONT.sans, fontSize: 10.5, lineHeight: '1.4', color: EMAIL.muted, marginTop: 3 }}>{why}</div> : null}
          </td>
        </tr>
        <tr>
          <td />
          <td colSpan={pct != null ? 4 : 3} style={{ padding: '0 0 9px', verticalAlign: 'top' }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 10.5, lineHeight: '1.6', color: EMAIL.muted }}>
              content share <Share share={row.content} recorded={recorded} />
            </span>
            {row.contentVerdict ? <span style={{ marginLeft: 6, display: 'inline-block' }}><BlockMovement verdict={row.contentVerdict} unit="pts" mode="email" /></span> : null}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function Share({ share, recorded }: { share: StandingShare | null; recorded: boolean }) {
  if (share == null || share.pct == null) return <span>{recorded ? NOT_OBSERVED : NOT_RECORDED}</span>
  return (
    <span data-copy="level">
      {standingText(share)} · {fmtInt(share.k)} of {fmtInt(share.n)}
    </span>
  )
}

/**
 * What the tracked rivals said on their own posts — the artboard's shaded
 * inner panel.
 *
 * ONE CELL PER RIVAL, AND THE ABSENCE IS NAMED. `video_claims` is service-role
 * only until M8 (WP16), so every cell reads the block's own words for a side we
 * cannot read, which name who fixes it rather than implying the rival said
 * nothing. When `rivalOwnClaims` (wave 1) starts filling `RivalRow.ownPosts`
 * the same cell carries the claims — no second shape to build.
 *
 * THE ECHO / PUSH-BACK COUNTS THE ARTBOARD PRINTS ("echoed it in 31 videos and
 * pushed back in 9") ARE NOT HERE, because say-vs-hear is Market's reading
 * (`lib/pages/market-surface.ts`) and this block carries no field for it.
 */
function OwnPostsPanel({ rows }: { rows: readonly RivalRow[] }) {
  const rivals = rows.filter((r) => isRivalAudience(r.audience))
  if (rivals.length === 0) return null
  return (
    <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '16px 18px', marginTop: 12 }}>
      <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, letterSpacing: '.6px', textTransform: 'uppercase', color: EMAIL.muted }}>
        What the tracked rivals said on their own posts
      </div>
      {rivals.map((row) => (
        <div key={row.audience} style={{ marginTop: 10 }}>
          <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink }}>{row.label}</div>
          <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.5', color: EMAIL.muted, marginTop: 2 }}>
            {row.ownPosts ?? OWN_POSTS_UNREADABLE}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * What was asked most under each rival's content — the artboard's serif
 * quotation, promoted out of the row.
 *
 * NO SUPERLATIVE. The artboard heads it "The one question the category asked
 * most" and closes with "the largest of the seven rival questions". Nothing
 * computes a largest across rivals: `raisedMost` is per row, each with its own
 * denominator, and denominators do not compare. So the panel prints every
 * rival's own, each with its k-of-n, under a heading that claims only what the
 * field holds.
 */
function AskedPanel({ rows }: { rows: readonly RivalRow[] }) {
  const asked = rows.filter((r) => r.raisedMost != null)
  if (asked.length === 0) return null
  return (
    <div style={{ borderLeft: `3px solid ${EMAIL.border}`, paddingLeft: 16, marginTop: 14 }}>
      <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, letterSpacing: '.6px', textTransform: 'uppercase', color: EMAIL.muted }}>
        Raised most under their content
      </div>
      {asked.map((row) => (
        <div key={row.audience} style={{ marginTop: 8 }}>
          <div style={{ fontFamily: FONT.serif, fontSize: 16, lineHeight: '1.45', color: EMAIL.ink }}>
            {/* A THEME LABEL IS A MODEL'S WORDS READ BACK OUT OF A COLUMN —
                the `subject` kind, `pass_b_theme`, the exemption VO2 and OV3
                already claim for the same string. */}
            <span data-copy="subject" data-slot="pass_b_theme">{row.raisedMost?.label}</span>
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: '1.5', color: EMAIL.muted, marginTop: 2 }}>
            <span data-copy="level">{fmtInt(row.raisedMost?.k ?? 0)} of {fmtInt(row.raisedMost?.n ?? 0)}</span> · under {row.label}’s content
          </div>
        </div>
      ))}
    </div>
  )
}
