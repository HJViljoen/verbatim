/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font -- an email document, not a page */
import type { BlockContext } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { MONTHLY_EMAIL_WIDTH, monthlyRuleFor, readingCaveat } from '@/lib/reports/monthly'
import type { MonthlySnapshotData } from '@/lib/reports/monthly-build'
import { monthlyBlocksFor } from '@/components/blocks/monthly'
import { Button, Hairline, text } from './primitives'

/**
 * The monthly report as an email (Phase 1 WP18, design item 13).
 *
 * 640 WIDE AND EIGHT SECTIONS DEEP — the mock's own geometry (640 × ~1600
 * against the weekly report's ~1000). It is the same width as the weekly
 * artefact and deliberately not the same length: Heinrich's revision 6 is that
 * the monthly report is the bigger picture and must not look like the weekly.
 * What makes it look different is not styling, it is the ten movers with a line
 * each, the six voices and the decision at the end.
 *
 * NO SECTION IS EVER DROPPED. The design's gate for the weekly report — "print
 * their empty states rather than being dropped, so the artefact has the same
 * shape every week" — applies here with more force, because a reader meets this
 * one twelve times a year and learns where their part of it is.
 *
 * THE MASTHEAD SAYS WHAT THE READING IS OF, and its third clause is the one
 * nobody else prints: "still filling until 31 Oct 2026". A month keeps taking
 * comments for thirty days after it ends, so a report sent on the 1st is a
 * reading of a month that will still move — which is exactly what the sent
 * figures then let the app say beside the live number.
 */

export interface MonthlyEmailProps {
  data: MonthlySnapshotData
  shareUrl: string | null
  appUrl: string
  /** Whether the PDF rides along, so the footer can say so. */
  attached: boolean
  ctx: BlockContext
  /** The inbox preview line — the subject by default. */
  preheader?: string
}

const presentation = { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 } as const

export function MonthlyEmail({ data, shareUrl, appUrl, attached, ctx, preheader }: MonthlyEmailProps) {
  const blocks = monthlyBlocksFor(data.keys)
  const caveat = readingCaveat(data.reading.notes)
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>{data.title}</title>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Serif:ital,wght@0,500;1,400&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, background: EMAIL.canvas, fontFamily: FONT.sans, color: EMAIL.ink, WebkitTextSizeAdjust: '100%' }}>
        {preheader ? <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden', opacity: 0, color: 'transparent' }}>{preheader}</div> : null}
        <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', background: EMAIL.canvas }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '24px 12px' }}>
                <table width="100%" {...presentation} style={{ borderCollapse: 'separate', maxWidth: MONTHLY_EMAIL_WIDTH, background: EMAIL.card, borderRadius: 6, border: `1px solid ${EMAIL.border}` }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '24px 28px 4px' }}>
                        <div style={text.eyebrow}>{data.company} · consumer intelligence</div>
                        <div style={{ fontFamily: FONT.serif, fontSize: 22, fontWeight: 500, lineHeight: '1.25', color: EMAIL.ink, marginTop: 8 }}>{data.subject}</div>
                        {/* ONE DATE FORMAT PER LINE, and the whole stamp is
                            composed once (`monthlyPeriod`) rather than
                            assembled here, so the email, the deck and the share
                            page cannot word the same three facts three ways. */}
                        <div style={{ ...text.mono, color: EMAIL.muted, fontSize: 12, marginTop: 6 }}>{data.period}</div>
                        <div style={{ ...text.small, fontStyle: 'italic', marginTop: 10 }}>{monthlyRuleFor(data.monthStatus)}</div>
                        {/* AND WHAT THE READING CANNOT SUPPORT, beside the rule
                            that says how to read it. One sentence for the whole
                            artefact (lib/reading/series.ts mergeNotes), on the
                            surface that is read with nobody beside the reader
                            to add it. */}
                        {caveat ? <div style={{ ...text.small, color: EMAIL.muted, marginTop: 8 }}>{caveat}</div> : null}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0 28px 8px' }}>
                        {blocks.map((block) => (
                          <div key={block.key}>{block.render(data.reading, 'email', ctx)}</div>
                        ))}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '18px 28px 24px' }}>
                        <Hairline />
                        <div style={{ marginTop: 8 }}>
                          {shareUrl ? <span style={{ marginRight: 8 }}><Button href={shareUrl} primary>Open the full report</Button></span> : null}
                          <Button href={`${appUrl}/dashboard`}>Open Verbatim</Button>
                        </div>
                        <div style={{ ...text.small, marginTop: 12 }}>
                          {attached ? 'The PDF is attached. ' : ''}One link per section; the evidence behind each figure opens on the page.
                        </div>
                        {/* "Prepared FOR", not "by" — this is a list Verbatim
                            sends to the client's own staff. The share page says
                            "by", because a share link is a document the client
                            forwards to THEIR stakeholders. */}
                        <div style={{ ...text.small, fontSize: 11, marginTop: 10, color: EMAIL.faint }}>
                          Prepared for {data.company} · with Verbatim. Commenters are never identified; quotes carry platform and date only. You are receiving this because you are on {data.company}’s update list; an owner or admin changes it in Verbatim, in Settings.
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
