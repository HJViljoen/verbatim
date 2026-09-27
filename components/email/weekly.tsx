/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font -- an email document, not a page */
import { Fragment, type ReactNode } from 'react'
import type { BlockContext } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { longMonth } from '@/lib/format'
import { WEEKLY_CANVAS_GUTTER, WEEKLY_CARD_WIDTH } from '@/lib/reports/weekly'
import { staleWeeklySnapshot, type WeeklySnapshotData } from '@/lib/reports/weekly-build'
import { weeklyBlocksFor } from '@/components/blocks/weekly'
import { WEEKLY_EMAIL_CSS } from '@/components/blocks/weekly/email'
import { withCurrentWords } from '@/lib/reports/legacy-words'

/**
 * "Your market this week" as an email (market-first WP3.7; the approved
 * preview's WeeklyReport, "What we send").
 *
 * A 640 CANVAS AND A 600 COLUMN OF CARDS, as the monthly's: the masthead and
 * the first section (the market's level and what the update brought in) share
 * the first card; every section after it is a card of its own, 24px apart;
 * then a card with the two buttons, and one mono line under everything saying
 * whose report it is. The sections are the blocks (`weeklyBlocksFor`), each in
 * its email arm inside `BlockFrame`'s `card` chrome; this document draws only
 * the cards around them.
 *
 * THE MASTHEAD'S ONE LINE (25 Sep rulings): the month, then "as at the 20 Sep
 * update · next update Sun 27 Sep". No rule under the masthead's words, no
 * "how sound", no footnote.
 *
 * A STORED VERSION 2 ROW IS A SENTENCE: `staleWeeklySnapshot` says so, and the
 * email prints `STALE_ARTEFACT_LINE` under the masthead instead of asking
 * seven blocks to draw a reading they were not built for.
 */

export interface WeeklyEmailProps {
  data: WeeklySnapshotData
  shareUrl: string | null
  appUrl: string
  /** Whether the PDF rides along, so the end card can say so. */
  attached: boolean
  ctx: BlockContext
  /** The inbox preview line: the subject by default. */
  preheader?: string
}

const presentation = { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 } as const

/** The preview's card: white, a 6px radius, a hairline ring and its soft
 *  shadow (a client that draws no shadow still draws the ring). */
const CARD = {
  borderCollapse: 'separate' as const,
  background: EMAIL.card,
  borderRadius: 6,
  border: `1px solid ${EMAIL.hairline}`,
  boxShadow: '0 1px 3px rgba(38,41,44,.05), 0 0 16px rgba(38,41,44,.09)',
}

function Card({ children }: { children: ReactNode }) {
  return (
    <table width="100%" {...presentation} style={CARD}>
      <tbody>
        <tr><td className="vb-m-card" style={{ padding: '32px 32px 16px' }}>{children}</td></tr>
      </tbody>
    </table>
  )
}

const Gap = ({ h = 24 }: { h?: number }) => <div style={{ height: h, fontSize: 0, lineHeight: 0 }}>&nbsp;</div>

/** The masthead: the product and the tenant, the heading, and the month with
 *  its one line. */
function Masthead({ data }: { data: WeeklySnapshotData }) {
  const line = data.reading?.barLine ?? null
  return (
    <>
      <table width="100%" {...presentation} style={{ borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ fontFamily: FONT.sans, fontSize: 16, lineHeight: '20px', fontWeight: 700, letterSpacing: '-.02em', color: EMAIL.ink, whiteSpace: 'nowrap' }}>
              <span aria-hidden style={{ color: EMAIL.green, fontWeight: 700, letterSpacing: '-.12em' }}>{'//'}</span>&nbsp;&nbsp;Verbatim
            </td>
            <td align="right" style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: EMAIL.ink2 }}>{data.company}</td>
          </tr>
        </tbody>
      </table>
      <Gap h={40} />
      <h1 style={{ margin: 0, fontFamily: FONT.sans, fontSize: 24, lineHeight: '32px', fontWeight: 700, letterSpacing: '-.015em', color: EMAIL.ink }}>{data.title}</h1>
      <div style={{ marginTop: 8, fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.ink2 }}>
        <span style={{ fontWeight: 600, color: EMAIL.ink }}>{longMonth(data.month)} {data.month.slice(0, 4)}</span>
        {line ? <>&nbsp;&nbsp;<span style={{ fontFamily: FONT.mono, fontSize: 13, color: EMAIL.muted }}>{line}</span></> : null}
      </div>
      <Gap h={32} />
      <div style={{ height: 1, background: EMAIL.hairline, fontSize: 0, lineHeight: 0 }}>&nbsp;</div>
      <Gap h={32} />
    </>
  )
}

export function WeeklyEmail({ data, shareUrl, appUrl, attached, ctx, preheader }: WeeklyEmailProps) {
  // A snapshot built before the em-dash sweep re-renders in the current words.
  data = withCurrentWords(data)
  const stale = staleWeeklySnapshot(data)
  const sections = stale ? [] : weeklyBlocksFor(data.keys)
  const [first, ...rest] = sections
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>{data.title}</title>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,500;1,400&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
        <style>{WEEKLY_EMAIL_CSS}</style>
      </head>
      <body style={{ margin: 0, padding: 0, background: EMAIL.canvas, fontFamily: FONT.sans, color: EMAIL.ink, WebkitTextSizeAdjust: '100%' }}>
        {preheader ? <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden', opacity: 0, color: 'transparent' }}>{preheader}</div> : null}
        <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', background: EMAIL.canvas }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: `32px ${WEEKLY_CANVAS_GUTTER}px` }}>
                <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', maxWidth: WEEKLY_CARD_WIDTH }}>
                  <tbody>
                    <tr>
                      <td>
                        <Card>
                          <Masthead data={data} />
                          {stale ? (
                            <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2, paddingBottom: 16 }}>{stale}</div>
                          ) : first ? first.render(data.reading, 'email', ctx) : null}
                        </Card>
                        {rest.map((block) => (
                          <Fragment key={block.key}>
                            <Gap />
                            <Card>{block.render(data.reading, 'email', ctx)}</Card>
                          </Fragment>
                        ))}
                        <Gap />
                        <Card>
                          <table {...presentation} style={{ borderCollapse: 'collapse' }}>
                            <tbody>
                              <tr>
                                {/* The two buttons stack on a phone (`vb-m-col`). */}
                                <td className="vb-m-col" style={{ paddingRight: 12, whiteSpace: 'nowrap' }}>
                                  <a href={`${appUrl}/dashboard`} style={{ display: 'inline-block', padding: '12px 20px', borderRadius: 6, background: EMAIL.green, fontFamily: FONT.sans, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: EMAIL.card, textDecoration: 'none' }}>
                                    Open Your market
                                  </a>
                                </td>
                                <td className="vb-m-col" style={{ whiteSpace: 'nowrap' }}>
                                  <a href={`${appUrl}/dashboard/week`} style={{ display: 'inline-block', padding: '11px 19px', borderRadius: 6, background: EMAIL.card, border: `1px solid ${EMAIL.border}`, fontFamily: FONT.sans, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: EMAIL.ink, textDecoration: 'none' }}>
                                    Open This week
                                  </a>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          {shareUrl ? (
                            <div style={{ marginTop: 16, fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px' }}>
                              <a href={shareUrl} style={{ color: EMAIL.ink, textDecoration: 'underline', textDecorationColor: EMAIL.neutralSeg, textUnderlineOffset: 5 }}>Open the share page</a>
                            </div>
                          ) : null}
                          {attached ? <div style={{ marginTop: 16, fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.muted }}>The PDF of this report is attached.</div> : null}
                          <Gap h={16} />
                        </Card>
                        <Gap />
                        <div style={{ fontFamily: FONT.mono, fontSize: 12, lineHeight: '20px', color: EMAIL.muted, textAlign: 'left' }}>
                          Prepared for {data.company} with Verbatim
                        </div>
                        {/* A send is a list somebody is on, and the sentence that
                            says how to leave it belongs on the artefact that
                            arrives uninvited. */}
                        <div style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: '18px', color: EMAIL.muted, textAlign: 'left', marginTop: 4 }}>
                          You are receiving this because you are on {data.company}’s update list; an owner or admin changes it in Verbatim, in Settings.
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
