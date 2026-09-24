/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font -- an email document, not a page */
import type { BlockContext } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { QUARTER_PAGE_IN_SENTENCE, quarterPageKindOf } from '@/lib/reports/quarterly'
import { staleQuarterlySnapshot, type QuarterlySnapshotData } from '@/lib/reports/quarterly-build'
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
 * WIDTH IS THE WEEKLY REPORT'S 640, AND 640 IS TWO NUMBERS. The mock's
 * document artboards are 1123 wide, which is a printed slide and not an inbox;
 * an email that is not the artefact takes the artefact-email width the product
 * already has. But `spec/design-system.md` §4 opens "600px card on a #F6F7F8
 * canvas", and the 640 is 600 + 20 + 20: the CARD is 600 and the canvas cell
 * carries 20px of padding each side.
 *
 * Applied as a single 640 on the card, every measured line ran 40px longer
 * than the column the type ramp was set for — which is where the mono metadata
 * lines that wrap on the built artefact and not on the artboard come from.
 * `monthly` split its two in wave 2 (`MONTHLY_CARD_WIDTH` /
 * `MONTHLY_CANVAS_GUTTER`), `weekly` split its two in wave 3
 * (`WEEKLY_CARD_WIDTH` / `WEEKLY_CANVAS_GUTTER`, and its docblock hands this
 * one over by name), and this is the third sibling.
 *
 * `QUARTERLY_EMAIL_WIDTH` stays exported as the OUTER width — it is what the
 * transport test asserts the html carries, and it is still the figure a reader
 * of this file wants — but it is the sum now, not the card.
 */

/** The white card, on a #F6F7F8 canvas. */
export const QUARTERLY_CARD_WIDTH = 600

/** The canvas padding, each side: 600 + 20 + 20 = 640. */
export const QUARTERLY_CANVAS_GUTTER = 20

/** The artefact's outer width, which is the two above. */
export const QUARTERLY_EMAIL_WIDTH = QUARTERLY_CARD_WIDTH + QUARTERLY_CANVAS_GUTTER * 2

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

/** "a, b and c" — the product's own list joining, so a two-key arrangement
 *  reads as English rather than as a comma. */
function andList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The pages an arrangement names, in the reader's words, in the arrangement's
 *  own order. */
function pageNames(keys: readonly string[]): string[] {
  return keys
    .map(quarterPageKindOf)
    .filter((k): k is NonNullable<ReturnType<typeof quarterPageKindOf>> => k != null)
    .map((k) => QUARTER_PAGE_IN_SENTENCE[k])
}

export function QuarterlyEmail({ data, shareUrl, appUrl, attached, ctx, preheader }: QuarterlyEmailProps) {
  // Asked before anything dereferences `data.reading`, whose shape changed
  // incompatibly in block D (`QUARTERLY_SNAPSHOT_VERSION`). An email cannot be
  // recalled, so a send over a row this build cannot redraw carries the
  // sentence and the link rather than failing the render.
  const stale = staleQuarterlySnapshot(data)
  const carried = stale ? [] : data.keys.filter((k) => QUARTERLY_EMAIL_KEYS.includes(k))
  const blocks = quarterlyBlocksFor(carried)
  // NAMED, NOT COUNTED FROM THE FRONT. "the first {n} pages" is true only of an
  // arrangement that happens to store the cover and the read first; one that
  // stored the cover third would describe itself wrongly, which is the shape
  // `heldNames` was fixed for and this half was not.
  const carriedNames = pageNames(carried)
  // THE PAGES THIS NOTE IS NOT CARRYING, NAMED FROM THE ARRANGEMENT. The
  // sentence counted the stored keys and then named all six remaining pages in
  // fixed text, so a four-key arrangement read "the other 1 — your subjects,
  // the category, the rivals, your moves, how the quarter was read and what we
  // could not settle — are in the review itself."
  const heldNames = stale ? [] : pageNames(data.keys.filter((k) => !QUARTERLY_EMAIL_KEYS.includes(k)))
  const held = heldNames.length
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
              <td align="center" style={{ padding: `${QUARTERLY_CANVAS_GUTTER}px ${QUARTERLY_CANVAS_GUTTER}px 24px` }}>
                <table width="100%" {...presentation} style={{ borderCollapse: 'separate', maxWidth: QUARTERLY_CARD_WIDTH, background: EMAIL.card, borderRadius: 6, border: `1px solid ${EMAIL.border}` }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '24px 28px 4px' }}>
                        <div style={text.eyebrow}>{data.company} · consumer intelligence</div>
                        <div style={{ fontFamily: FONT.serif, fontSize: 22, fontWeight: 500, lineHeight: '1.25', color: EMAIL.ink, marginTop: 8 }}>{data.subject}</div>
                        <div style={{ ...text.mono, color: EMAIL.muted, fontSize: 12, marginTop: 6 }}>{data.period} · reading as at {fullDate(data.readingAt)}</div>
                        {/* NO RULE UNDER THE MASTHEAD (copy de-clutter, ruling E): the
                            cover's own stat card states the six-month gate, and a
                            covering note says it once. */}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0 28px 8px' }}>
                        {stale ? <div style={text.small}>{stale}</div> : null}
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
                          {attached && !stale ? 'The PDF is attached. ' : ''}
                          {stale ? '' : held > 0
                            ? `This note carries ${carriedNames.length ? andList(carriedNames) : 'none of the review’s pages'}; ${
                                held === 1 ? 'the other one' : `the other ${held}`
                              } (${andList(heldNames)}) ${held === 1 ? 'is' : 'are'} in the review itself.`
                            : 'The review itself carries every page.'}
                        </div>
                        <div style={{ ...text.small, fontSize: 11, marginTop: 10, color: EMAIL.faint }}>
                          Prepared for {data.company} · with Verbatim. You are receiving this because you are on {data.company}’s update list; an owner or admin changes it in the Studio.
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
