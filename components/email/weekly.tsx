/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font -- an email document, not a page */
import type { BlockContext } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { WEEKLY_EMAIL_WIDTH, periodNounFor, weeklyRuleFor } from '@/lib/reports/weekly'
import type { WeeklySnapshotData } from '@/lib/reports/weekly-build'
import { weeklyBlocksFor } from '@/components/blocks/weekly'
import { Button, Hairline, text } from './primitives'

/**
 * The weekly report as an email (Phase 1 WP17, design §3 Artefact WR).
 *
 * 640 WIDE, against the digest's 600 — the mock's own width
 * (`mock-sealand/spec/artboards.md`). The digest keeps its 600; this is a
 * different artefact and the two are not made to agree by making one wrong.
 *
 * SIX SECTIONS, IN THE STORED ORDER, AND NONE OF THEM IS EVER DROPPED. The
 * digest drops a section whose tile returns null, for a reason its own comment
 * gives; this one may not, because the design's gate says so in as many words:
 * "sections 4 and 5 print their empty states rather than being dropped, so the
 * artefact has the same shape every week". A reader who has learned where their
 * part of the report is must find it in the same place next week.
 *
 * THE RULE IS ON THE ARTEFACT, TWICE OVER — under the masthead where a reader
 * meets the first number, and again inside WR6 where they leave. It is not
 * decoration: every figure below is the month so far, and the week is how much
 * of it arrived since the last update.
 */

export interface WeeklyEmailProps {
  data: WeeklySnapshotData
  shareUrl: string | null
  appUrl: string
  /** Whether the PDF rides along, so the footer can say so. */
  attached: boolean
  ctx: BlockContext
  /** The inbox preview line — the subject by default. */
  preheader?: string
}

const presentation = { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 } as const

export function WeeklyEmail({ data, shareUrl, appUrl, attached, ctx, preheader }: WeeklyEmailProps) {
  const blocks = weeklyBlocksFor(data.keys)
  // ONE DATE FORMAT PER LINE. The masthead read "6 Sep - 13 Sep · reading as
  // at 2026-09-16": the window in the product's own form and the reading date
  // in raw ISO, three words apart. WP9's page bar gets this right with
  // `fullDate`.
  const readAt = fullDate(data.readingAt)
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
                <table width="100%" {...presentation} style={{ borderCollapse: 'separate', maxWidth: WEEKLY_EMAIL_WIDTH, background: EMAIL.card, borderRadius: 6, border: `1px solid ${EMAIL.border}` }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '24px 28px 4px' }}>
                        <div style={text.eyebrow}>{data.company} · consumer intelligence</div>
                        <div style={{ fontFamily: FONT.serif, fontSize: 22, fontWeight: 500, lineHeight: '1.25', color: EMAIL.ink, marginTop: 8 }}>{data.subject}</div>
                        <div style={{ ...text.mono, color: EMAIL.muted, fontSize: 12, marginTop: 6 }}>{data.period} · reading as at {readAt}</div>
                        <div style={{ ...text.small, fontStyle: 'italic', marginTop: 10 }}>{weeklyRuleFor(periodNounFor(data.reading.window))}</div>
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
                        {/* "Prepared FOR", not "by". The share shell says "by"
                            because a share link is a document the client
                            forwards to THEIR stakeholders; this is a list
                            Verbatim sends to the client's own staff, and the
                            two clauses of this sentence cannot both be true of
                            one reader otherwise. WP15 wrote the right one four
                            days earlier: "Prepared for Össur with Verbatim"
                            (lib/pages/week.ts). */}
                        <div style={{ ...text.small, fontSize: 11, marginTop: 10, color: EMAIL.faint }}>
                          Prepared for {data.company} · with Verbatim. You are receiving this because you are on {data.company}’s update list; an owner or admin changes it in Verbatim, in Settings.
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
