/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font -- an email document, not a page */
import type { BlockContext } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { WEEKLY_CANVAS_GUTTER, WEEKLY_CARD_WIDTH, weeklyDateLine, weeklyEyebrow, weeklyFooterLines, weeklyHeadline, weeklyLinks } from '@/lib/reports/weekly'
import { staleWeeklySnapshot, type WeeklySnapshotData } from '@/lib/reports/weekly-build'
import { weeklyBlocksFor } from '@/components/blocks/weekly'
import { Button, Hairline, text } from './primitives'
import { withCurrentWords } from '@/lib/reports/legacy-words'

/**
 * The weekly report as an email (Phase 1 WP17, design §3 Artefact WR).
 *
 * A 600 CARD ON A 640 CANVAS — the artboard's two widths, which this file had
 * collapsed into one 640 on the card (`WEEKLY_CARD_WIDTH`, which carries the
 * proof). The digest's card is 600 too; they agree because the design system
 * says one thing, not because one was made to match the other.
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
  // A snapshot built before the em-dash sweep re-renders in the current words.
  data = withCurrentWords(data)
  // A ROW AN OLDER BUILD WROTE IS A SENTENCE, NOT A STACK TRACE. `data.reading`
  // changed incompatibly in block D wave 2 and every line below dereferences
  // the new fields (`WEEKLY_SNAPSHOT_VERSION`), so this is asked before any of
  // them.
  const stale = staleWeeklySnapshot(data)
  if (stale) return <StaleWeekly title={data.title} line={stale} />
  const blocks = weeklyBlocksFor(data.keys)
  // THE MASTHEAD IS THE ARTBOARD'S (block D wave 2): the artefact and the
  // update's date in the eyebrow, the window and the update behind it on the
  // left of the date row, the TENANT at its right end. The reading date moves
  // to the footer, where the mock keeps every stamp — one mono block of
  // provenance instead of a date halfway up the page.
  const links = weeklyLinks({
    noun: data.reading.section1.check.noun,
    keys: data.keys,
    flagHref: data.reading.section1.check.flags[0]?.href ?? null,
    weekHref: data.reading.content.weekHref,
    subjectsHref: '/dashboard/subjects',
    briefHref: data.reading.sales.brief.href,
    recordHref: data.reading.coverage.href,
  })
  const footer = weeklyFooterLines({
    company: data.company,
    updateDate: data.reading.update.date,
    readingAt: data.readingAt,
    platforms: data.reading.incoming.platforms,
  })
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
              <td align="center" style={{ padding: `${WEEKLY_CANVAS_GUTTER}px ${WEEKLY_CANVAS_GUTTER}px 24px` }}>
                <table width="100%" {...presentation} style={{ borderCollapse: 'separate', maxWidth: WEEKLY_CARD_WIDTH, background: EMAIL.card, borderRadius: 6, border: `1px solid ${EMAIL.border}` }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '24px 28px 4px' }}>
                        <div style={text.eyebrow}>{weeklyEyebrow(data.reading.update.date)}</div>
                        {/* THE HEADLINE, WITHOUT THE TENANT. `data.subject` is
                            the INBOX's sentence and keeps "Sealand:" — that is
                            how a reader tells one client's report from
                            another's in a mail list. Inside the artefact the
                            tenant is already at the right end of the date row
                            below and again in the footer, and the artboard's
                            own headline does not open with it. */}
                        <div style={{ fontFamily: FONT.serif, fontSize: 23, fontWeight: 500, lineHeight: '1.24', color: EMAIL.ink, marginTop: 9 }}>{weeklyHeadline(data.reading.section1.check)}</div>
                        {/* TWO-ENDED, and the email arm cannot put two things
                            at opposite ends of a line any other way: no flex,
                            because Outlook lays out with Word. */}
                        <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', marginTop: 9 }}>
                          <tbody>
                            <tr>
                              {/* TOP-ALIGNED, BOTH. A `<td>` centres its
                                  content by default, so when the left cell
                                  wrapped to two lines on a phone the tenant
                                  floated half a line below the date it sits
                                  beside and read as a third, stray line. */}
                              <td style={{ ...text.mono, color: EMAIL.muted, fontSize: 12, verticalAlign: 'top' }}>{weeklyDateLine(data.period, data.reading.update.previous)}</td>
                              <td align="right" style={{ ...text.mono, color: EMAIL.muted, fontSize: 12, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{data.company}</td>
                            </tr>
                          </tbody>
                        </table>
                        {/* NO RULE UNDER THE MASTHEAD (copy de-clutter, D53): §1's
                            meta already prints the update beside the month so
                            far, and the month-to-date rule lives in Settings ›
                            How to read. */}
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
                        {/* ONE LINK PER SECTION, at the foot, in the mock's
                            two-column grid — and no duplicate destination:
                            §1, §3 and §5 all open This week, so the list is
                            deduped and names only the sections this
                            arrangement drew (`weeklyLinks`). */}
                        {links.length > 0 ? (
                          <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: 6 }}>
                            <tbody>
                              {Array.from({ length: Math.ceil(links.length / 2) }, (_, r) => (
                                <tr key={r}>
                                  {[links[r * 2], links[r * 2 + 1]].map((l, i) => (
                                    <td key={i} width="50%" style={{ padding: '6px 8px 6px 0', verticalAlign: 'top' }}>
                                      {l ? <a href={`${appUrl}${l.href}`} style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.link, textDecoration: 'none' }}>{l.label} →</a> : null}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : null}
                        <Hairline />
                        <div style={{ marginTop: 8 }}>
                          {shareUrl ? <span style={{ marginRight: 8 }}><Button href={shareUrl} primary>Open the full report</Button></span> : null}
                          <Button href={`${appUrl}/dashboard`}>Open Verbatim</Button>
                        </div>
                        {/* THREE MONO LINES, THE MOCK'S FOOTER — provenance,
                            the platform mix and the privacy sentence, which
                            `PRIVACY_LINE` has said on This week and the monthly
                            email since WP15 and which this artefact did not say
                            at all. "next update" is not among them: nothing in
                            this product computes one, and a date in an email a
                            client can hold up is a promise.

                            "Prepared FOR", not "by". The share shell says "by"
                            because a share link is a document the client
                            forwards to THEIR stakeholders; this is a list
                            Verbatim sends to the client's own staff, and the
                            two clauses of that sentence cannot both be true of
                            one reader otherwise. */}
                        <div style={{ fontFamily: FONT.mono, fontSize: 10, lineHeight: '1.5', color: EMAIL.muted, marginTop: 14 }}>
                          <div><span style={{ color: EMAIL.ink2 }}>{footer.prepared}</span></div>
                          {footer.mix ? <div style={{ marginTop: 4 }}>{footer.mix}</div> : null}
                          <div style={{ marginTop: 4 }}>{footer.privacy}</div>
                        </div>
                        {/* NOT THE MOCK'S, AND IT STAYS. A send is a list
                            somebody is on, and the sentence that says how to
                            leave it belongs on the artefact that arrives
                            uninvited. The attachment clause is the same kind of
                            fact about this send. */}
                        <div style={{ ...text.small, fontSize: 11, marginTop: 10, color: EMAIL.muted }}>
                          {attached ? 'The PDF is attached. ' : ''}You are receiving this because you are on {data.company}’s update list; an owner or admin changes it in Verbatim, in Settings.
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

/** The whole document, when the stored reading is one this build cannot draw.
 *  The same shell, so a client who opens it sees a Verbatim email rather than
 *  an empty page. */
function StaleWeekly({ title, line }: { title: string; line: string }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>{title}</title>
      </head>
      <body style={{ margin: 0, padding: 0, background: EMAIL.canvas, fontFamily: FONT.sans, color: EMAIL.ink }}>
        <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', background: EMAIL.canvas }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: `${WEEKLY_CANVAS_GUTTER}px ${WEEKLY_CANVAS_GUTTER}px 24px` }}>
                <table width="100%" {...presentation} style={{ borderCollapse: 'separate', maxWidth: WEEKLY_CARD_WIDTH, background: EMAIL.card, borderRadius: 6, border: `1px solid ${EMAIL.border}` }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '24px 28px' }}>
                        <div style={text.eyebrow}>Verbatim · weekly</div>
                        <div style={{ fontFamily: FONT.serif, fontSize: 23, fontWeight: 500, lineHeight: '1.24', color: EMAIL.ink, marginTop: 9 }}>{title}</div>
                        <div style={{ ...text.small, marginTop: 10 }}>{line}</div>
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
