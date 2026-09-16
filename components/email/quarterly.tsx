/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font -- an email document, not a page */
import type { BlockContext } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { QUARTERLY_RULE } from '@/lib/reports/quarterly'
import type { QuarterlySnapshotData } from '@/lib/reports/quarterly-build'
import { quarterlyBlocksFor } from '@/components/blocks/quarterly'
import { Button, Hairline, text } from './primitives'

/**
 * The quarterly review as an email (Phase 1 WP20).
 *
 * THE EMAIL IS A COVERING NOTE, NOT THE ARTEFACT. The weekly report IS its
 * email — six sections a reader takes in on a phone. A quarterly review is
 * eight pages of deck; an inbox is the wrong shape for it, and pasting all
 * eight into a table would produce a message no client reads and an Outlook
 * layout nobody can fix. So the email carries the two pages that survive the
 * shape — the cover and the read — and then hands the reader the link and the
 * PDF, which is where the other six live.
 *
 * WHICH TWO, AND WHY THOSE. The cover is the quarter in a paragraph with its
 * three figures and the six-month gate; the read is the labelled
 * interpretation. Together they are the answer to "what happened, and what do
 * you make of it" — and both are already written to be read on their own,
 * because the deck's first two sheets are read on their own too.
 *
 * WIDTH IS THE WEEKLY REPORT'S 640. The mock's document artboards are 1123
 * wide, which is a printed slide and not an inbox; an email that is not the
 * artefact takes the artefact-email width the product already has.
 */

export const QUARTERLY_EMAIL_WIDTH = 640

/** The pages the email carries. The other six are in the deck and behind the
 *  link, and the footer says so rather than dropping them in silence. */
export const QUARTERLY_EMAIL_KEYS: readonly string[] = ['quarterly.cover', 'quarterly.read']

export interface QuarterlyEmailProps {
  data: QuarterlySnapshotData
  shareUrl: string | null
  appUrl: string
  attached: boolean
  ctx: BlockContext
  preheader?: string
}

const presentation = { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 } as const

export function QuarterlyEmail({ data, shareUrl, appUrl, attached, ctx, preheader }: QuarterlyEmailProps) {
  const carried = data.keys.filter((k) => QUARTERLY_EMAIL_KEYS.includes(k))
  const blocks = quarterlyBlocksFor(carried)
  const held = data.keys.length - carried.length
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
                <table width="100%" {...presentation} style={{ borderCollapse: 'separate', maxWidth: QUARTERLY_EMAIL_WIDTH, background: EMAIL.card, borderRadius: 6, border: `1px solid ${EMAIL.border}` }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '24px 28px 4px' }}>
                        <div style={text.eyebrow}>{data.company} · consumer intelligence</div>
                        <div style={{ fontFamily: FONT.serif, fontSize: 22, fontWeight: 500, lineHeight: '1.25', color: EMAIL.ink, marginTop: 8 }}>{data.subject}</div>
                        <div style={{ ...text.mono, color: EMAIL.muted, fontSize: 12, marginTop: 6 }}>{data.period} · reading as at {fullDate(data.readingAt)}</div>
                        <div style={{ ...text.small, fontStyle: 'italic', marginTop: 10 }}>{QUARTERLY_RULE}</div>
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
                          {shareUrl ? <span style={{ marginRight: 8 }}><Button href={shareUrl} primary>Open the full review</Button></span> : null}
                          <Button href={`${appUrl}/dashboard`}>Open Verbatim</Button>
                        </div>
                        <div style={{ ...text.small, marginTop: 12 }}>
                          {attached ? 'The PDF is attached. ' : ''}
                          {held > 0
                            ? `This note carries the first two pages; the other ${held} — your subjects, the category, the rivals, your moves, how the quarter was read and what we could not settle — are in the review itself.`
                            : 'The review itself carries every page.'}
                        </div>
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
