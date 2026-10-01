/* eslint-disable @next/next/no-head-element, @next/next/no-img-element -- an email document, not a page */
import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { translationLabel, translationNote } from '@/components/quote-block'
import { fmtInt, longMonth, platformLabel, shortDate } from '@/lib/format'
import { FONT } from '@/lib/email/theme'
import { substituteFigures } from '@/lib/reports/cover'
import type { FigureTable } from '@/lib/reports/types'
import { WEEKLY_READ_TITLE, weeklyReadView, type ResolvedQuote, type WeeklyReadView } from '@/lib/reports/weekly-read'
import { staleWeeklyReadSnapshot, type WeeklyReadSnapshotData } from '@/lib/reports/weekly-read-build'

/**
 * "This week in your market": the weekly read as a report (artefact
 * `weekly_read`), drawn to the approved design (Weekly-v3, a 390-wide phone
 * email, palette A). ONE body, three frames: the email (`WeeklyReadEmail`), the
 * share page and the in-app viewer (`WeeklyReadPage`), and the printed PDF
 * (`WeeklyReadPage` under the render route). The link, the paper and the inbox
 * therefore cannot disagree about what the week said.
 *
 * THE ORDER IS THE DESIGN'S: the masthead; the four numbers (videos and
 * comments, this week and the month so far, on the market base); the week in
 * one line; what happened, its quotes set after the paragraph they belong to;
 * what it means for the company; worth watching next week; new this week (only
 * where something was first heard this week); the week's findings, compact
 * (headline, the short line, the evidence line); the footer.
 *
 * WHAT IS NEVER HERE (Heinrich's rules, §0a and the two design bans): no
 * section that has nothing to say (each renders only when the read has
 * something for it, and nothing says it was left out); no word about how the
 * read was made; no left-stripe block (a quote is a plain panel); no
 * highlighted phrase.
 *
 * EMAIL-SAFE MARKUP: tables and inline styles, no flex, no grid, no class and
 * no CSS variable, because Outlook lays out with Word. The copy contract
 * markers (`data-copy`) ride along so the render tier can check what prints:
 * the writer's sentences are `prose`, code's counts `figure`, a commenter's
 * words `quote`.
 */

/** Palette A (Heinrich, 30 Sep): yellow, ink, the ground; the text-safe
 *  orange for an eyebrow and a link; two greys from the design. Literal hex,
 *  because an email reads no CSS variable. */
export const WEEKLY_READ_PALETTE = {
  yellow: '#FFD43B',
  ink: '#26292C',
  ground: '#F7F6F2',
  paper: '#FFFFFF',
  orange: '#C2410C',
  muted: '#5F656B',
  hairline: '#E3E5E8',
} as const

const P = WEEKLY_READ_PALETTE
const BRAND = "'Bricolage Grotesque',".concat(FONT.sans)
const presentation = { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 } as const
const T: CSSProperties = { borderCollapse: 'collapse', borderSpacing: 0 }

/** The card's width on a wide screen; on a phone it is the screen. */
export const WEEKLY_READ_CARD_WIDTH = 600

const s = {
  eyebrow: { fontFamily: FONT.sans, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' } as CSSProperties,
  small: { fontFamily: FONT.sans, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: P.muted } as CSSProperties,
  h2: { fontFamily: FONT.sans, fontSize: 21, fontWeight: 700, lineHeight: '1.25', letterSpacing: '-.01em', color: P.ink, margin: 0 } as CSSProperties,
  body: { fontFamily: FONT.sans, fontSize: 16, lineHeight: '1.65', color: P.ink, margin: 0 } as CSSProperties,
  meta: { fontFamily: FONT.sans, fontSize: 13, lineHeight: '1.45', color: P.muted } as CSSProperties,
}

/** A writer's sentence, with any `[[key]]` it carries put back as code's
 *  figure. A sentence naming a key the read's table does not hold is not
 *  printed (`substituteFigures`), so no placeholder reaches a reader. */
function Prose({ body, figures, style, as = 'p' }: { body: string; figures: FigureTable; style: CSSProperties; as?: 'p' | 'div' }) {
  const Tag = as
  if (!body.includes('[[')) return <Tag data-copy="prose" style={style}>{body}</Tag>
  const parts = substituteFigures(body, figures)
  if (parts.length === 0) return null
  return (
    <Tag data-copy="prose" style={style}>
      {parts.map((p, i) => ('text' in p ? <Fragment key={i}>{p.text}</Fragment> : <span key={i} data-copy="figure">{p.figure}</span>))}
    </Tag>
  )
}

/** Code's line, with its figures put back: the evidence lines. */
function codeLine(body: string, figures: FigureTable): string {
  return substituteFigures(body, figures).map((p) => ('text' in p ? p.text : p.figure)).join('').replace(/\s+/g, ' ').trim()
}

/** A row of the card: padding, an optional ground, an optional rule above. */
function Band({ children, padding, background, ruled }: { children: ReactNode; padding: string; background?: string; ruled?: boolean }) {
  return (
    <tr>
      <td style={{ padding, background: background ?? P.paper, borderTop: ruled ? `1px solid ${P.hairline}` : undefined }}>{children}</td>
    </tr>
  )
}

/** The hairline between two sections, inset to the text column. */
function Divider() {
  return (
    <tr>
      <td style={{ padding: '0 24px', background: P.paper }}>
        <div style={{ borderTop: `1px solid ${P.hairline}`, height: 0, fontSize: 1, lineHeight: 0 }}>&nbsp;</div>
      </td>
    </tr>
  )
}

/** A quote, on a plain panel: the serif italic, the cite under it, and the
 *  English where the comment was in another language (original first, always). */
function QuotePanel({ q }: { q: ResolvedQuote }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const label = translationLabel(note)
  const cite = [q.platform ? platformLabel(q.platform) : null, q.date ? shortDate(`${q.date}T12:00:00.000Z`) : null].filter(Boolean).join(' · ')
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop: 16 }}>
      <tbody>
        <tr>
          <td style={{ background: P.ground, borderRadius: 14, padding: '16px 18px' }}>
            <p data-copy="quote" style={{ margin: 0, fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 16, lineHeight: '1.5', color: P.ink }}>“{q.text}”</p>
            {label ? <div style={{ ...s.meta, fontSize: 12, marginTop: 8 }}>{label}</div> : null}
            {note.english ? <p style={{ margin: '4px 0 0', fontFamily: FONT.serif, fontSize: 14, lineHeight: '1.5', color: P.muted }}>{note.english}</p> : null}
            {cite ? <div style={{ ...s.meta, marginTop: 10 }}>{cite}</div> : null}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/** One pair of the four numbers: a label, then videos and comments. */
function NumberPair({ label, videos, comments }: { label: string; videos: number | null; comments: number | null }) {
  const cells = [
    videos != null ? { value: fmtInt(videos), unit: 'videos' } : null,
    comments != null ? { value: fmtInt(comments), unit: 'comments' } : null,
  ].filter((c): c is { value: string; unit: string } => c != null)
  if (cells.length === 0) return null
  return (
    <table width="100%" {...presentation} style={{ ...T, borderTop: `1px solid ${P.hairline}` }}>
      <tbody>
        <tr>
          <td colSpan={2} style={{ ...s.small, padding: '14px 0 8px' }}>{label}</td>
        </tr>
        <tr>
          {cells.map((c, i) => (
            <td key={i} width="50%" style={{ padding: '0 0 14px', verticalAlign: 'top' }}>
              <div data-copy="figure" style={{ fontFamily: FONT.sans, fontSize: 28, fontWeight: 600, lineHeight: '1.15', letterSpacing: '-.02em', color: P.ink, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
              <div style={{ ...s.meta, marginTop: 1 }}>{c.unit}</div>
            </td>
          ))}
          {cells.length === 1 ? <td width="50%">&nbsp;</td> : null}
        </tr>
      </tbody>
    </table>
  )
}

export interface WeeklyReadReportProps {
  data: WeeklyReadSnapshotData
  /** The app's origin: where "Open Verbatim" and the footer links land. */
  appUrl: string
  /** The mark's address. An email needs an absolute one; a page on the app's
   *  own origin may pass the relative path. */
  markSrc?: string
}

/** The card itself, masthead to footer: the same in every frame. */
export function WeeklyReadReport({ data, appUrl, markSrc }: WeeklyReadReportProps) {
  const stale = staleWeeklyReadSnapshot(data)
  const company = data.company || 'Your company'
  if (stale) {
    return (
      <table width="100%" {...presentation} style={{ ...T, maxWidth: WEEKLY_READ_CARD_WIDTH, background: P.paper }}>
        <tbody>
          <Band padding="24px">
            <div style={{ ...s.eyebrow, color: P.ink }}>{data.company}</div>
            <div style={{ ...s.h2, marginTop: 8 }}>{WEEKLY_READ_TITLE}</div>
            <p style={{ ...s.meta, margin: '10px 0 0' }}>{stale}</p>
          </Band>
        </tbody>
      </table>
    )
  }
  const v: WeeklyReadView = weeklyReadView(data.read)
  const month = longMonth(v.month)
  const mark = markSrc ?? `${appUrl}/brand/verbatim-mark-ink.png`
  const market = v.market
  const hasNumbers = Boolean(market && [market.week.videos, market.week.comments, market.month.videos, market.month.comments].some((x) => x != null))
  return (
    <table width="100%" {...presentation} style={{ ...T, maxWidth: WEEKLY_READ_CARD_WIDTH, background: P.paper }}>
      <tbody>
        {/* 1 · The masthead: the mark, the company, the report, its days. */}
        <tr>
          <td style={{ background: P.yellow, padding: '22px 24px 26px' }}>
            <table {...presentation} style={T}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: 'middle', paddingRight: 7 }}><img src={mark} width={17} height={17} alt="" style={{ display: 'block', border: 0 }} /></td>
                  <td style={{ verticalAlign: 'middle', fontFamily: BRAND, fontWeight: 700, fontSize: 15, letterSpacing: '-.02em', color: P.ink }}>Verbatim</td>
                </tr>
              </tbody>
            </table>
            <div style={{ ...s.eyebrow, fontSize: 13, color: P.ink, marginTop: 18 }}>{data.company}</div>
            <div style={{ fontFamily: FONT.sans, fontSize: 31, fontWeight: 700, lineHeight: '1.1', letterSpacing: '-.015em', color: P.ink, marginTop: 6 }}>{WEEKLY_READ_TITLE}</div>
            {data.period ? <div style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 500, color: P.ink, marginTop: 6 }}>{data.period}</div> : null}
          </td>
        </tr>

        {/* 2 · The four numbers, on the market base. */}
        {hasNumbers && market ? (
          <Band padding="10px 24px 6px">
            <NumberPair label="Your market this week" videos={market.week.videos} comments={market.week.comments} />
            <NumberPair label={`${month} so far`} videos={market.month.videos} comments={market.month.comments} />
          </Band>
        ) : null}

        {/* 3 · The week in one line. */}
        {v.lead ? (
          <Band padding="18px 24px 28px">
            <div style={{ ...s.eyebrow, color: P.orange }}>{v.lead.label}</div>
            <Prose body={v.lead.body} figures={v.figures} style={{ margin: '10px 0 0', fontFamily: FONT.serif, fontSize: 22, fontWeight: 500, lineHeight: '1.42', color: P.ink }} />
          </Band>
        ) : null}

        {/* 4 · What happened: the story, a quote after the paragraph it belongs to. */}
        {v.story.length > 0 ? (
          <>
            <Divider />
            <Band padding="28px 24px 30px">
              <div style={s.h2}>What happened</div>
              {v.story.map((p, i) => (
                <Fragment key={i}>
                  <Prose body={p.body} figures={v.figures} style={{ ...s.body, marginTop: 16 }} />
                  {p.quote ? <QuotePanel q={p.quote} /> : null}
                </Fragment>
              ))}
            </Band>
          </>
        ) : null}

        {/* 5 · What it means for the company. */}
        {v.implications.length > 0 ? (
          <>
            <Divider />
            <Band padding="28px 24px 26px">
              <div style={s.h2}>What it means for {company}</div>
              <table width="100%" {...presentation} style={{ ...T, marginTop: 14 }}>
                <tbody>
                  {v.implications.map((body, i) => (
                    <tr key={i}>
                      <td width={36} style={{ borderTop: `1px solid ${P.hairline}`, padding: '17px 14px 14px 0', verticalAlign: 'top', fontFamily: FONT.mono, fontSize: 13, color: P.muted }}>{String(i + 1).padStart(2, '0')}</td>
                      <td style={{ borderTop: `1px solid ${P.hairline}`, padding: '14px 0', verticalAlign: 'top' }}>
                        <Prose body={body} figures={v.figures} style={{ ...s.body, fontSize: 15, lineHeight: '1.6' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Band>
          </>
        ) : null}

        {/* 6 · Worth watching next week: the one dark panel. */}
        {v.watch.length > 0 ? (
          <Band padding={v.implications.length > 0 ? '0 24px 32px' : '28px 24px 32px'}>
            <table width="100%" {...presentation} style={T}>
              <tbody>
                <tr>
                  <td style={{ background: P.ink, borderRadius: 16, padding: '20px 22px 22px' }}>
                    <div style={{ ...s.eyebrow, color: P.yellow }}>Worth watching next week</div>
                    {v.watch.map((body, i) => (
                      <Prose key={i} body={body} figures={v.figures} style={{ margin: '10px 0 0', fontFamily: FONT.sans, fontSize: 18, fontWeight: 600, lineHeight: '1.45', color: P.paper }} />
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
          </Band>
        ) : null}

        {/* 7 · New this week: only where something was first heard this week. */}
        {v.newThisWeek.length > 0 ? (
          <Band padding="28px 24px 26px" ruled>
            <div style={s.h2}>New this week</div>
            <table width="100%" {...presentation} style={{ ...T, marginTop: 14 }}>
              <tbody>
                {v.newThisWeek.map((x, i) => (
                  <tr key={i}>
                    <td style={{ borderTop: `1px solid ${P.hairline}`, padding: '14px 0', verticalAlign: 'top' }}>
                      <Prose body={x.body} figures={v.figures} style={{ ...s.body, fontSize: 15, lineHeight: '1.6' }} />
                      {x.evidence ? <div data-copy="figure" style={{ ...s.meta, marginTop: 6 }}>{codeLine(x.evidence, v.figures)}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Band>
        ) : null}

        {/* 8 · The week's findings, compact. */}
        {v.findings.length > 0 ? (
          <Band padding="28px 24px 30px" background={P.ground}>
            <div style={s.h2}>This week’s findings</div>
            <table width="100%" {...presentation} style={{ ...T, marginTop: 14 }}>
              <tbody>
                {v.findings.map((f, i) => (
                  <tr key={i}>
                    <td width={38} style={{ borderTop: `1px solid ${P.hairline}`, padding: '16px 12px 16px 0', verticalAlign: 'top' }}>
                      <table {...presentation} style={T}>
                        <tbody>
                          <tr>
                            <td width={26} height={26} align="center" style={{ width: 26, height: 26, borderRadius: 13, background: P.yellow, fontFamily: FONT.sans, fontSize: 13, fontWeight: 700, lineHeight: '26px', color: P.ink, textAlign: 'center' }}>{i + 1}</td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                    <td style={{ borderTop: `1px solid ${P.hairline}`, padding: '16px 0', verticalAlign: 'top' }}>
                      <Prose as="div" body={f.headline} figures={v.figures} style={{ fontFamily: FONT.sans, fontSize: 17, fontWeight: 700, lineHeight: '1.3', color: P.ink }} />
                      {f.line ? <Prose body={f.line} figures={v.figures} style={{ ...s.body, fontSize: 15, lineHeight: '1.55', marginTop: 6 }} /> : null}
                      {f.evidence ? <div data-copy="figure" style={{ ...s.meta, marginTop: 6 }}>{codeLine(f.evidence, v.figures)}</div> : null}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ borderTop: `1px solid ${P.hairline}`, paddingTop: 14 }}>
                    <a href={`${appUrl}/dashboard/week`} style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: P.orange, textDecoration: 'none' }}>Read this week in full →</a>
                  </td>
                </tr>
              </tbody>
            </table>
          </Band>
        ) : null}

        {/* 9 · The footer: the way in, and who gets this. */}
        <Band padding="26px 24px 30px" ruled>
          <table width="100%" {...presentation} style={T}>
            <tbody>
              <tr>
                <td align="center" style={{ background: P.ink, borderRadius: 10 }}>
                  <a href={`${appUrl}/dashboard`} style={{ display: 'block', padding: '15px 0', fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, lineHeight: '18px', color: P.paper, textDecoration: 'none', textAlign: 'center' }}>Open Verbatim</a>
                </td>
              </tr>
            </tbody>
          </table>
          <table width="100%" {...presentation} style={{ ...T, marginTop: 18 }}>
            <tbody>
              <tr>
                <td style={{ ...s.meta, fontSize: 12 }}>{data.company ? `${data.company} · made with Verbatim` : 'Made with Verbatim'}</td>
                <td align="right" style={{ ...s.meta, fontSize: 12, whiteSpace: 'nowrap' }}>
                  <a href={`${appUrl}/dashboard/settings/reports`} style={{ color: P.orange, textDecoration: 'none' }}>Who gets this</a>
                </td>
              </tr>
            </tbody>
          </table>
        </Band>
      </tbody>
    </table>
  )
}

export interface WeeklyReadEmailProps extends WeeklyReadReportProps {
  /** The inbox preview line. */
  preheader?: string
}

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,500;1,400&display=swap'

/** The email document: the card on the ground, centred, phone first. */
export function WeeklyReadEmail({ data, appUrl, markSrc, preheader }: WeeklyReadEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>{data.title}</title>
        <link href={FONTS_HREF} rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, background: P.ground, fontFamily: FONT.sans, color: P.ink, WebkitTextSizeAdjust: '100%' }}>
        {preheader ? <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden', opacity: 0, color: 'transparent' }}>{preheader}</div> : null}
        <table width="100%" {...presentation} style={{ ...T, background: P.ground }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '16px 0 24px' }}>
                <WeeklyReadReport data={data} appUrl={appUrl} markSrc={markSrc} />
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

/**
 * The same card as a page: the share link (`/r/<token>`), the in-app viewer and
 * the printed PDF. `print` adds the page size the render route prints at: A4,
 * portrait, the column paginating as a document does, because this report is
 * one column to read down, not a deck of slides.
 */
export function WeeklyReadPage({ data, appUrl, markSrc = '/brand/verbatim-mark-ink.png', print = false, fill = false }: WeeklyReadReportProps & {
  print?: boolean
  /** The share page: the ground fills the window. */
  fill?: boolean
}) {
  return (
    <div style={{ background: P.ground, padding: print ? 0 : '24px 0 40px', minHeight: fill ? '100vh' : undefined }}>
      {print ? <style>{'@page { size: 210mm 297mm; margin: 12mm 0; } tr { break-inside: avoid; }'}</style> : null}
      <table width="100%" {...presentation} style={T}>
        <tbody>
          <tr>
            <td align="center">
              <WeeklyReadReport data={data} appUrl={appUrl} markSrc={markSrc} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
