/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font -- an email document, not a page */
import { Fragment, type ReactNode } from 'react'
import type { BlockContext } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { longMonth } from '@/lib/format'
import { MONTHLY_CANVAS_GUTTER, MONTHLY_CARD_WIDTH, readToWords } from '@/lib/reports/monthly'
import { staleMonthlySnapshot, type MonthlySnapshotData } from '@/lib/reports/monthly-build'
import { monthlySections } from '@/components/blocks/monthly'
import { MONTHLY_EMAIL_CSS } from '@/components/blocks/monthly/email'
import { withCurrentWords } from '@/lib/reports/legacy-words'

/**
 * "September in your market" as an email (market-first WP2.1; the approved
 * preview's "What we send" artboard, MonthlyReport).
 *
 * A 640 CANVAS AND A 600 COLUMN OF CARDS. The masthead and the first section
 * share the first card; every section after it is a card of its own, 24px
 * apart, as the artboard draws them; then a card with the two buttons, and one
 * mono line under everything saying whose report it is. The sections are the
 * blocks (`monthlySections`), each in its email arm inside `BlockFrame`'s
 * `card` chrome; this document draws only the cards around them.
 *
 * A SECTION THAT IS ABSENT IS NOT A CARD. A slot another package has not
 * filled is dropped by `monthlySections`, so the artefact never carries an
 * empty section (plan WP2.1, "Depends on").
 *
 * A STORED VERSION 1 ROW IS A SENTENCE. The Phase 1 arrangement's reading is a
 * different shape; `staleMonthlySnapshot` says so, and the email prints
 * `STALE_ARTEFACT_LINE` under the masthead instead of asking ten blocks to
 * draw a reading they were not built for.
 */

export interface MonthlyEmailProps {
  data: MonthlySnapshotData
  shareUrl: string | null
  appUrl: string
  /** Whether the PDF rides along, so the end card can say so. */
  attached: boolean
  ctx: BlockContext
  /** The inbox preview line: the subject by default. */
  preheader?: string
}

const presentation = { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 } as const

/** The artboard's card: white, a 6px radius, a hairline ring and its soft
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
 *  the update it was read to. The one context line the 25 Sep rulings allow,
 *  with no "still filling" and no freeze date. */
function Masthead({ data }: { data: MonthlySnapshotData }) {
  const read = readToWords(data.reading?.readTo ?? null)
  return (
    <>
      <table width="100%" {...presentation} style={{ borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ fontFamily: FONT.sans, fontSize: 16, lineHeight: '20px', fontWeight: 700, letterSpacing: '-.02em', color: EMAIL.ink, whiteSpace: 'nowrap' }}>
              <span aria-hidden style={{ color: EMAIL.ink, fontWeight: 700, letterSpacing: '-.12em' }}>{'//'}</span>&nbsp;&nbsp;Verbatim
            </td>
            <td align="right" style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: EMAIL.ink2 }}>{data.company}</td>
          </tr>
        </tbody>
      </table>
      <Gap h={40} />
      <h1 style={{ margin: 0, fontFamily: FONT.sans, fontSize: 24, lineHeight: '32px', fontWeight: 700, letterSpacing: '-.015em', color: EMAIL.ink }}>{data.title}</h1>
      <div style={{ marginTop: 8, fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.ink2 }}>
        <span style={{ fontWeight: 600, color: EMAIL.ink }}>{longMonth(data.month)} {data.month.slice(0, 4)}</span>
        {read ? <>&nbsp;&nbsp;<span style={{ fontFamily: FONT.mono, fontSize: 13, color: EMAIL.muted }}>{read}</span></> : null}
      </div>
      <Gap h={32} />
      <div style={{ height: 1, background: EMAIL.hairline, fontSize: 0, lineHeight: 0 }}>&nbsp;</div>
      <Gap h={32} />
    </>
  )
}

export function MonthlyEmail({ data, shareUrl, appUrl, attached, ctx, preheader }: MonthlyEmailProps) {
  // A snapshot built before the em-dash sweep re-renders in the current words.
  data = withCurrentWords(data)
  const stale = staleMonthlySnapshot(data)
  const sections = stale ? [] : monthlySections(data.keys, data.reading)
  const [first, ...rest] = sections
  const month = longMonth(data.month)
  const openHref = `${appUrl}/dashboard?month=${data.month.slice(0, 7)}`
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>{data.title}</title>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,500;1,400&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
        <style>{MONTHLY_EMAIL_CSS}</style>
      </head>
      <body style={{ margin: 0, padding: 0, background: EMAIL.canvas, fontFamily: FONT.sans, color: EMAIL.ink, WebkitTextSizeAdjust: '100%' }}>
        {preheader ? <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden', opacity: 0, color: 'transparent' }}>{preheader}</div> : null}
        <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', background: EMAIL.canvas }}>
          <tbody>
            <tr>
              {/* THE COLUMN IS 600 AND THE CANVAS 640: the card's max-width
                  binds, and the gutter makes up the rest. */}
              <td align="center" style={{ padding: `32px ${MONTHLY_CANVAS_GUTTER}px` }}>
                <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', maxWidth: MONTHLY_CARD_WIDTH }}>
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
                                {/* The two buttons stack on a phone (`vb-m-col`), where
                                    side by side they would outrun the column. */}
                                <td className="vb-m-col" style={{ paddingRight: 12, whiteSpace: 'nowrap' }}>
                                  <a href={openHref} style={{ display: 'inline-block', padding: '12px 20px', borderRadius: 6, background: EMAIL.button, fontFamily: FONT.sans, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: EMAIL.card, textDecoration: 'none' }}>
                                    Open {month} in Verbatim
                                  </a>
                                </td>
                                {shareUrl ? (
                                  <td className="vb-m-col" style={{ whiteSpace: 'nowrap' }}>
                                    <a href={shareUrl} style={{ display: 'inline-block', padding: '11px 19px', borderRadius: 6, background: EMAIL.card, border: `1px solid ${EMAIL.border}`, fontFamily: FONT.sans, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: EMAIL.ink, textDecoration: 'none' }}>
                                      Open the share page
                                    </a>
                                  </td>
                                ) : null}
                              </tr>
                            </tbody>
                          </table>
                          {attached ? <div style={{ marginTop: 16, fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.muted }}>The PDF of this report is attached.</div> : null}
                          <Gap h={16} />
                        </Card>
                        <Gap />
                        <div style={{ fontFamily: FONT.mono, fontSize: 12, lineHeight: '20px', color: EMAIL.muted, textAlign: 'left' }}>
                          <span style={{ color: EMAIL.ink2 }}>{data.company} · {data.title}</span> · sent with Verbatim
                        </div>
                        <div style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: '18px', color: EMAIL.muted, textAlign: 'left', marginTop: 4 }}>
                          You are receiving this because you are on {data.company}’s update list; an owner or admin changes it in the Studio.
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
