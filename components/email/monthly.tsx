/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font -- an email document, not a page */
import { Fragment } from 'react'
import type { BlockContext } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { longMonth } from '@/lib/format'
import { PRIVACY_LINE } from '@/lib/reading/method'
import {
  MONTHLY_CARD_WIDTH,
  MONTHLY_EMAIL_WIDTH,
  monthlyContext,
  monthlyEyebrow,
  monthlyRuleFor,
  readingCaveat,
} from '@/lib/reports/monthly'
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
  const method = data.reading.overview.method
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
              {/* THE FRAME IS 640 AND THE CARD IS 600 (E-monthly). The canvas
                  gutter is the artboard's 20px, not 12, and the card inside it
                  carries the artboard's own 30px of side padding. */}
              <td align="center" style={{ padding: '20px 20px 24px', maxWidth: MONTHLY_EMAIL_WIDTH }}>
                <table width="100%" {...presentation} style={{ borderCollapse: 'separate', maxWidth: MONTHLY_CARD_WIDTH, background: EMAIL.card, borderRadius: 6, border: `1px solid ${EMAIL.border}` }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '28px 30px 22px' }}>
                        {/* THE GREEN RULE, then the product and the reading.
                            Drawn as a one-cell table because an email has no
                            flex: a 30 × 3 green cell, a spacer, then the words.
                            It is the only green on the artefact above the
                            button, and it is what makes the masthead read as a
                            masthead rather than as a first paragraph. */}
                        <table {...presentation} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
                          <tbody>
                            <tr>
                              <td width={30} style={{ width: 30, verticalAlign: 'middle', lineHeight: 0 }}>
                                <span style={{ display: 'inline-block', width: 30, height: 3, borderRadius: 2, background: EMAIL.green, fontSize: 0, lineHeight: 0 }} />
                              </td>
                              <td width={10} style={{ width: 10, fontSize: 1 }}>&nbsp;</td>
                              <td style={text.eyebrow}>{monthlyEyebrow(data.month, data.monthStatus, data.readingAt)}</td>
                            </tr>
                          </tbody>
                        </table>
                        <div style={{ fontFamily: FONT.serif, fontSize: 20, fontWeight: 500, lineHeight: '1.25', letterSpacing: '-.01em', color: EMAIL.ink2, marginTop: 11 }}>{data.subject}</div>
                        {/* THE CONTEXT ROW: the month's own days and the updates
                            that were delivered into it on the left, the tenant
                            right-aligned. `updateDates` has been loaded since
                            WP11 and printed by nothing; the tenant was in the
                            eyebrow, where the artboard puts the product. */}
                        <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', borderSpacing: 0, marginTop: 11 }}>
                          <tbody>
                            <tr>
                              <td style={{ ...text.mono, color: EMAIL.muted, fontSize: 12 }}>{monthlyContext(data.reading.overview.bar)}</td>
                              <td align="right" style={{ ...text.mono, color: EMAIL.faint, fontSize: 12, whiteSpace: 'nowrap' }}>{data.company}</td>
                            </tr>
                          </tbody>
                        </table>
                        <div style={{ ...text.small, fontStyle: 'italic', marginTop: 10 }}>{monthlyRuleFor(data.monthStatus)}</div>
                        {/* AND WHAT THE READING CANNOT SUPPORT, beside the rule
                            that says how to read it. One sentence for the whole
                            artefact (lib/reading/series.ts mergeNotes), on the
                            surface that is read with nobody beside the reader
                            to add it. */}
                        {caveat ? <div style={{ ...text.small, color: EMAIL.muted, marginTop: 8 }}>{caveat}</div> : null}
                      </td>
                    </tr>
                    {/* ONE SECTION PER ROW, WITH A FULL-BLEED RULE BETWEEN THEM
                        (E-monthly, the artboard's own structure). The email
                        stacked all eight inside one padded cell, so the only
                        thing separating "Rivals" from "Your moves" was 22px of
                        margin — on an artefact eight sections deep that reads
                        as one long column rather than as a document with parts.
                        The rule is `#DCDFE3` edge to edge, exactly as the
                        artboard draws it, and the section's own top padding is
                        4 because `BlockFrame`'s email arm already carries 22 of
                        margin (a shared primitive this package may not change). */}
                    {blocks.map((block) => (
                      <Fragment key={block.key}>
                        <tr>
                          <td style={{ height: 1, background: EMAIL.border, fontSize: 1, lineHeight: '1px' }}>&nbsp;</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '4px 30px 24px' }}>{block.render(data.reading, 'email', ctx)}</td>
                        </tr>
                      </Fragment>
                    ))}
                    <tr>
                      <td style={{ height: 1, background: EMAIL.border, fontSize: 1, lineHeight: '1px' }}>&nbsp;</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '22px 30px 26px' }}>
                        <div>
                          {/* THE MONTH IS ON THE BUTTON. "Open the full report"
                              names no reading, and a reader with twelve of
                              these a year has twelve identical buttons in one
                              mailbox. */}
                          {shareUrl ? <span style={{ marginRight: 10 }}><Button href={shareUrl} primary>Open the {longMonth(data.month)} reading</Button></span> : null}
                          <Button href={`${appUrl}/dashboard`}>Open Verbatim</Button>
                        </div>
                        <div style={{ ...text.small, marginTop: 13 }}>
                          {attached ? 'The PDF is attached. ' : ''}One link per section; the evidence behind each figure opens on the page.
                        </div>
                        <Hairline />
                        {/* "Prepared FOR", not "by" — this is a list Verbatim
                            sends to the client's own staff. The share page says
                            "by", because a share link is a document the client
                            forwards to THEIR stakeholders.
                            THE FOOTER NAMES THE READING AND WHAT IT WAS READ
                            OVER (the artboard's last line): the month, then the
                            coverage sentence `methodLines` composes, which
                            carries the platform mix and the video total. The
                            artboard also prints a comment total; no field on
                            this artefact holds one, so it is not printed. */}
                        <div style={{ fontFamily: FONT.mono, fontSize: 9.5, lineHeight: '1.4', marginTop: 10, color: EMAIL.muted }}>
                          <div>
                            <span style={{ color: EMAIL.ink2 }}>Prepared for {data.company}</span> · with Verbatim · {longMonth(data.month)} {data.month.slice(0, 4)} reading{method ? ` · ${method.coverage}` : ''}
                          </div>
                          {/* THE PRIVACY SENTENCE IS NEVER CONDITIONAL. A
                              workspace whose method footnote could not be
                              composed is still a workspace whose commenters are
                              never identified, so it falls back to the
                              constant the footnote itself prints. */}
                          <div style={{ marginTop: 4 }}>{method?.privacy ?? PRIVACY_LINE}</div>
                          <div style={{ marginTop: 4 }}>
                            You are receiving this because you are on {data.company}’s update list; an owner or admin changes it in Verbatim, in Settings.
                          </div>
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
