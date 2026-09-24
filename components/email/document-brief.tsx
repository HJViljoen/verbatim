/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font, @next/next/no-img-element -- an email document, not a page */
import { coverPlainText } from '../../lib/reports/cover'
import { findingHeadlines, inShortSummary, overviewTiles } from '../../lib/reports/documents/overview'
import type { DocumentSnapshotData } from '../../lib/reports/documents/types'
import { fmtInt, platformLabel } from '../../lib/format'
import { EMAIL, FONT } from '../../lib/email/theme'
import { BlockMovement } from '../blocks/movement'
import type { Verdict } from '../../lib/reading/verdicts'
import { Button, Columns, Hairline, Section, text } from './primitives'

/**
 * The written report in an inbox (T10, 2026-08-31): the three numbers, the
 * summary as it stands, the finding headlines, and the way in. It is a
 * pointer to the document, not a copy of it: the reader opens the full brief
 * or the PDF for the findings themselves.
 *
 * The numbers, the summary and the headlines are read through
 * lib/reports/documents/overview.ts — the same functions the printed deck
 * uses, over data the caller has already run applyEdits over, so what the
 * operator edited is what the inbox shows. No quote ever appears here: a
 * pull quote is a ref at rest, and this email is built without resolving
 * one.
 */

export interface DocumentBriefEmailProps {
  data: DocumentSnapshotData
  shareUrl: string | null
  appUrl: string
  /** Whether the PDF rides along, so the footer can say so. */
  attached: boolean
  preheader?: string
}

const presentation = { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 } as const

/**
 * One tile in an inbox — and it carries the same four things the paper tile
 * does (fix pass).
 *
 * THE EMAIL WAS DROPPING THE CLAIM AND THE REFUSAL. `OverviewTile` carries
 * `verdict`, `note` and `word` as well as the pair, and the printed deck passes
 * all four to `StatTile`; this cell took `value` and `label` only. So on 54
 * own-posts with 3 toward and 2 away the printed brief said "Too few to
 * compare: 54 videos where a banded reading needs 100…" and the email of the
 * SAME frozen snapshot showed the counts and nothing else — paper and inbox
 * disagreeing about whether the figure was banded, from one artefact.
 * `OverviewTile.note` is documented as "Why the comparison was not drawn, in
 * the FIGURE's own words", which is exactly the half an inbox lost.
 *
 * `word` comes with them: a refusal set at the 26px numeral reads as a
 * measurement in an inbox as surely as on a sheet (mock-gap §6 D2).
 *
 * The badge is `BlockMovement` in `email` mode — a tinted chip, because an
 * arrow glyph in a client that has dropped the font is a box — so the two media
 * print one vocabulary and the direction word still comes from nowhere but
 * `directionWord`.
 */
function NumberCell({ value, label, verdict, note, word }: {
  value: string
  label: string
  verdict?: Verdict | null
  note?: string | null
  word?: boolean
}) {
  // `ClaimBadge`'s rule, which the deck states at length: a `too_little_data`
  // with no baseline is a LEVEL, and saying "too few to compare" beside a pool
  // that cleared both floors is a sentence the tile refutes.
  const shown: Verdict | null = verdict
    ? (!verdict.baseline && verdict.state === 'too_little_data' ? { ...verdict, state: 'baseline_forming' } : verdict)
    : null
  return (
    <div>
      <div style={word
        ? { ...text.body, fontSize: 15, fontWeight: 600, lineHeight: '1.25' }
        : { ...text.figure, fontSize: 26 }}
      >
        {value}
      </div>
      <div style={{ ...text.small, fontSize: 11.5, marginTop: 5 }}>{label}</div>
      {(shown || note) && (
        <div style={{ marginTop: 6 }}>
          {shown ? <BlockMovement verdict={shown} unit="pts" mode="email" /> : null}
          {note ? <div style={{ ...text.small, fontSize: 11, marginTop: shown ? 4 : 0 }}>{note}</div> : null}
        </div>
      )}
    </div>
  )
}

export function DocumentBriefEmail({ data, shareUrl, appUrl, attached, preheader }: DocumentBriefEmailProps) {
  const tiles = overviewTiles(data)
  // Substituted per paragraph, so the summary keeps the breaks it has on
  // paper; substituted at all, so a headline the writer put a figure key in
  // never reaches an inbox as [[key]].
  const paragraphs = inShortSummary(data).split(/\n\n+/).map((p) => coverPlainText(p, data.figures)).filter(Boolean)
  const headlines = findingHeadlines(data).map((h) => coverPlainText(h, data.figures)).filter(Boolean)
  const m = data.method

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
                <table width="100%" {...presentation} style={{ borderCollapse: 'separate', maxWidth: 600, background: EMAIL.card, borderRadius: 6, border: `1px solid ${EMAIL.border}` }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '24px 28px 4px' }}>
                        <div style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, letterSpacing: '-.02em', color: EMAIL.ink, marginBottom: 10 }}>
                          <img src={`${appUrl}/brand/verbatim-mark.png`} width="16" height="16" alt="" style={{ verticalAlign: '-2px', marginRight: 7 }} />
                          Verbatim
                        </div>
                        <div style={text.eyebrow}>{data.company} · written from the latest update</div>
                        <div style={{ fontFamily: FONT.serif, fontSize: 22, fontWeight: 500, lineHeight: '1.25', color: EMAIL.ink, marginTop: 8 }}>{data.title}</div>
                        <div style={{ ...text.mono, color: EMAIL.muted, fontSize: 12, marginTop: 6 }}>{data.period}</div>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0 28px 8px' }}>
                        {tiles.length ? (
                          <table width="100%" {...presentation} style={{ borderCollapse: 'collapse', marginTop: 18, background: EMAIL.inner, borderRadius: 6 }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: '16px 18px' }}>
                                  <Columns cells={tiles.map((t, i) => <NumberCell key={i} value={t.value} label={t.label} verdict={t.verdict} note={t.note} word={t.word} />)} />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        ) : null}
                        {paragraphs.length ? (
                          <Section title="In short">
                            {paragraphs.map((p, i) => (
                              <p key={i} style={{ ...text.body, margin: i === 0 ? 0 : '10px 0 0' }}>{p}</p>
                            ))}
                          </Section>
                        ) : null}
                        {headlines.length ? (
                          <Section title="Findings in this brief">
                            <table width="100%" {...presentation} style={{ borderCollapse: 'collapse' }}>
                              <tbody>
                                {headlines.map((h, i) => (
                                  <tr key={i}>
                                    <td width={26} style={{ ...text.mono, color: EMAIL.link, fontWeight: 600, padding: '7px 8px 7px 0', verticalAlign: 'top', borderTop: i === 0 ? undefined : `1px solid ${EMAIL.hairline}` }}>{i + 1}</td>
                                    <td style={{ ...text.body, fontWeight: 600, padding: '7px 0', verticalAlign: 'top', borderTop: i === 0 ? undefined : `1px solid ${EMAIL.hairline}` }}>{h}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </Section>
                        ) : null}
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
                          {attached ? 'The PDF is attached. ' : ''}{shareUrl ? 'The full brief opens without an account. ' : ''}
                        </div>
                        <div style={{ ...text.small, fontSize: 11, marginTop: 10, color: EMAIL.faint }}>
                          {m.sources.map(platformLabel).join(', ')} · {fmtInt(m.conversations)} conversations on {fmtInt(m.videos)} videos · {m.period}
                          {m.thin ? ' · a thinner update than usual' : ''}
                        </div>
                        <div style={{ ...text.small, fontSize: 11, marginTop: 10, color: EMAIL.faint }}>
                          Written for {data.company} by Verbatim from public conversation. You are receiving this because you are on {data.company}&rsquo;s update list; an owner or admin changes it in the Studio.
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
