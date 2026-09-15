import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import { NOT_OBSERVED, standingText, type StandingShare } from '@/lib/reading/standings'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import { isRivalAudience } from '@/lib/rivals'
import { OWN_POSTS_UNREADABLE, RIVAL_FIGURES_MAX, type OverviewData, type RivalRow } from '@/lib/pages/overview'

// OV4 · Rivals (design §3 OV4).
//
// TWO SHARES SIDE BY SIDE, AND THAT IS THE BLOCK. Content share is how much of
// the panel's video they account for; attention share is how much of the
// panel's COMMENT they account for. Measured on Össur's August panel, Ottobock
// is 13.6% of the videos and 0.56% of the comments — the difference between
// "they post a lot" and "people talk about them", which a standings table with
// one denominator cannot say (lib/reading/attention.ts).
//
// NO RANK, NO TINT. The design forbids a rank headline and a colour tint on a
// rival's row; the row is a reading, not a league table.

/** A share cell: the percentage and the two counts under it, or the words. A
 *  brand the panel holds nothing for reads "not observed" — never 0%, which
 *  would say the brand was silent when what happened is that we looked and
 *  found nothing. */
function Share({ share, mode }: { share: StandingShare | null; mode: RenderMode }): ReactNode {
  if (share == null || share.pct == null) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{NOT_OBSERVED}</span>
      : <span className="text-[12px] text-muted-foreground">{NOT_OBSERVED}</span>
  }
  const body = <>
    <span data-copy="figure">{standingText(share)}</span>{' '}
    <span data-copy="figure">{fmtInt(share.k)} of {fmtInt(share.n)}</span>
  </>
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.ink }}>{body}</span>
    : <span className="font-mono text-[12px] tabular-nums">{body}</span>
}

/** What they said on their own posts — or the honest absence.
 *
 *  `video_claims` is service-role only until M8 adds a tenant policy (WP16), so
 *  no tenant can read a rival's own claims today. The design's own words for a
 *  side we cannot read are "— not tracked", and the sentence names who fixes
 *  it rather than implying the rival said nothing. */
function OwnPosts({ row, mode }: { row: RivalRow; mode: RenderMode }): ReactNode {
  // ONLY A RIVAL HAS "THEIR OWN POSTS". The standings carry your own brand's
  // row and the category's, and "on their own posts: — not tracked" against
  // either of them is an absence of nothing.
  if (!isRivalAudience(row.audience)) return null
  const text = row.ownPosts ?? OWN_POSTS_UNREADABLE
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{text}</span>
    : <span className="text-[12px] text-muted-foreground">{text}</span>
}

function Raised({ row, mode }: { row: RivalRow; mode: RenderMode }): ReactNode {
  if (!row.raisedMost) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>—</span>
      : <span className="text-[12px] text-muted-foreground">—</span>
  }
  const body = <>
    {row.raisedMost.label}{' '}
    <span data-copy="figure">{fmtInt(row.raisedMost.k)} of {fmtInt(row.raisedMost.n)}</span>
  </>
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink }}>{body}</span>
    : <span className="text-[12px]">{body}</span>
}

export const overviewRivals: Block<OverviewData> = {
  key: 'overview.rivals',
  title: 'Rivals',
  // NOT the sidebar's "are they gaining?" (lib/nav.ts). A block's question is
  // rendered inside the block, where rule (c) applies: a direction word in a
  // heading makes the claim before a band has been drawn. The page bar keeps
  // the sidebar's wording, which no block contract checks.
  question: 'Who else is in this, and what are they promising?',

  render(data, mode = 'app', ctx) {
    const r = data.rivals
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/competitive`
    const footer = email
      ? <a href={href} style={{ color: EMAIL.ink }}>Open Competitive →</a>
      : <Link href={href} className="hover:underline">Open Competitive →</Link>

    const empty = overviewRivals.emptyState(data)
    const caveat = (
      <p
        className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
        style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 } : undefined}
      >
        {r.caveat}
        {r.dualMention != null && r.dualMention > 0 ? (
          <> <span data-copy="figure">{fmtInt(r.dualMention)}</span> did this month.</>
        ) : null}
      </p>
    )

    return (
      <BlockFrame
        title={overviewRivals.title}
        question={overviewRivals.question}
        mode={mode}
        meta="both shares of what our search plan found · no rank is printed"
        footer={footer}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {r.standingsNote ? <BlockEmpty mode={mode}>{r.standingsNote}</BlockEmpty> : null}
        {email ? (
          <div>
            {r.rows.map((row) => (
              <div key={row.audience} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
                <strong>{row.label}</strong>{row.retiredAt ? <span style={{ color: EMAIL.muted }}> · tracked until {shortDate(row.retiredAt)}</span> : null}
                <div style={{ marginTop: 2 }}>
                  attention <Share share={row.attention} mode={mode} /> · content <Share share={row.content} mode={mode} /> <BlockMovement verdict={row.attentionVerdict} unit="pts" mode={mode} />
                </div>
                <div style={{ marginTop: 2 }}>raised most under their content: <Raised row={row} mode={mode} /></div>
              </div>
            ))}
            {caveat}
          </div>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="py-1 pr-3 font-semibold">Brand</th>
                    <th className="py-1 pr-3 font-semibold">Attention</th>
                    <th className="py-1 pr-3 font-semibold">Content</th>
                    <th className="py-1 pr-3 font-semibold">Attention change</th>
                    <th className="py-1 pr-3 font-semibold">On their own posts</th>
                    <th className="py-1 font-semibold">Raised most under their content</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {r.rows.map((row) => (
                    <tr key={row.audience}>
                      <td className="py-1.5 pr-3 text-[12.5px] font-medium">
                        {row.label}
                        {row.retiredAt ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">tracked until {shortDate(row.retiredAt)}</span> : null}
                      </td>
                      <td className="py-1.5 pr-3"><Share share={row.attention} mode={mode} /></td>
                      <td className="py-1.5 pr-3"><Share share={row.content} mode={mode} /></td>
                      <td className="py-1.5 pr-3"><BlockMovement verdict={row.attentionVerdict} unit="pts" mode={mode} /></td>
                      <td className="py-1.5 pr-3"><OwnPosts row={row} mode={mode} /></td>
                      <td className="py-1.5"><Raised row={row} mode={mode} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {caveat}
          </>
        )}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    // THE LARGEST FEW, so the page's budget binds on a tenant and not only on
    // a fixture: nothing caps how many rivals a tenant may track, and every
    // one of them was spending a number. Every rival still has its row
    // (RIVAL_FIGURES_MAX).
    const declared = [...data.rivals.rows]
      .filter((r) => r.attention?.pct != null)
      .sort((a, b) => (b.attention?.pct ?? 0) - (a.attention?.pct ?? 0) || a.audience.localeCompare(b.audience))
      .slice(0, RIVAL_FIGURES_MAX)
    for (const row of declared) {
      out[`rival_${row.audience.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_attention`] = {
        value: row.attention?.pct as number,
        unit: 'pct',
        label: `${row.label}, share of the panel’s comments this month`,
      }
    }
    if (data.rivals.dualMention != null && data.rivals.dualMention > 0) {
      out.dual_mention_videos = { value: data.rivals.dualMention, unit: 'videos', label: 'videos of yours that also named a rival' }
    }
    return out
  },

  verdicts(data): Verdict[] {
    return data.rivals.rows.flatMap((r) =>
      [r.attentionVerdict, r.contentVerdict].filter((v): v is Verdict => v != null),
    )
  },

  emptyState(data) {
    return data.rivals.rows.length === 0 ? 'No rival is tracked for this workspace yet.' : null
  },
}
