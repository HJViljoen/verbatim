/* eslint-disable @next/next/no-head-element, @next/next/no-img-element -- an email document, not a page */
import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { translationLabel, translationNote } from '@/components/quote-block'
import { fmtInt, fmtPct, platformLabel, shortDate } from '@/lib/format'
import { FONT } from '@/lib/email/theme'
import { substituteFigures } from '@/lib/reports/cover'
import type { FigureTable } from '@/lib/reports/types'
import { WEEKLY_READ_TITLE, weeklyReadView, levelOneView, type LevelOneLead, type LevelOneRow, type LevelOneView, type ResolvedQuote, type WeeklyReadView } from '@/lib/reports/weekly-read'
import { isLevelOne, staleWeeklyReadSnapshot, type WeeklyReadSnapshotData } from '@/lib/reports/weekly-read-build'
import type { WeeklyReadLine } from '@/lib/reports/weekly-read-lines'
import { FLAG_WORDS, flagWordOf } from '@/components/v2/flag-chip'

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
 *  English where the comment was in another language (original first, always).
 *  The panel is the ground on paper, and paper on the ground (the findings
 *  band), so it always reads as a panel. */
function QuotePanel({ q, onGround = false }: { q: ResolvedQuote; onGround?: boolean }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const label = translationLabel(note)
  const cite = [q.platform ? platformLabel(q.platform) : null, q.date ? shortDate(`${q.date}T12:00:00.000Z`) : null].filter(Boolean).join(' · ')
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop: 16 }}>
      <tbody>
        <tr>
          <td style={{ background: onGround ? P.paper : P.ground, borderRadius: 14, padding: '16px 18px' }}>
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
  /** Where "Read this week in full" leads: the report's own share page (the
   *  web version, findings in full). The email passes its share link; where
   *  there is none (a test send, a preview) and on the page itself, the row
   *  is not printed. Until the new This week page ships, this is the full
   *  read; the old page carries none of it. */
  fullUrl?: string | null
  /** The findings in full (what was seen, what it means, the quote): the web
   *  page, the viewer and the paper. The email prints them compact. */
  full?: boolean
  /** Level 1's mark: the yellow ditto, drawn on an ink tile (board E7).
   *  Absolute by default (`${appUrl}/brand/verbatim-mark-yellow.png`). */
  markOnInkSrc?: string
}

/** The card itself, masthead to footer: the same in every frame. */
export function WeeklyReadReport({ data, appUrl, markSrc, fullUrl = null, full = false, markOnInkSrc }: WeeklyReadReportProps) {
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
  // LEVEL 1 (version 2, T11b): the email is its own card; the page, the
  // viewer and the paper keep the report and add level 1's lead, rows and
  // page lines under the week's one line. A report (version 1) takes neither
  // branch and renders exactly as it was sent.
  if (isLevelOne(data) && !full) return <LevelOneCard data={data} appUrl={appUrl} markSrc={markOnInkSrc} fullUrl={fullUrl} />
  const level = isLevelOne(data) ? onThePage(levelOneView(data.read, data.lines)) : null
  const v: WeeklyReadView = weeklyReadView(data.read)
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
            <NumberPair label={v.monthHeading} videos={market.month.videos} comments={market.month.comments} />
          </Band>
        ) : null}

        {/* 3 · The week in one line. */}
        {v.lead ? (
          <Band padding="18px 24px 28px">
            <div style={{ ...s.eyebrow, color: P.orange }}>{v.lead.label}</div>
            <Prose body={v.lead.body} figures={v.figures} style={{ margin: '10px 0 0', fontFamily: FONT.serif, fontSize: 22, fontWeight: 500, lineHeight: '1.42', color: P.ink }} />
          </Band>
        ) : null}

        {/* Level 1's own parts, on the page (version 2 only). */}
        {level ? <LevelOneOnPage view={level} appUrl={appUrl} /> : null}

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
                      {/* IN FULL ON THE PAGE: what was seen, then what it
                          means, then the voice; compact in the email. */}
                      {full && f.saw ? <Prose body={f.saw} figures={v.figures} style={{ ...s.body, fontSize: 15, lineHeight: '1.6', marginTop: 8 }} /> : null}
                      {f.line ? <Prose body={f.line} figures={v.figures} style={{ ...s.body, fontSize: 15, lineHeight: full ? '1.6' : '1.55', marginTop: full ? 10 : 6 }} /> : null}
                      {full && f.quote ? <QuotePanel q={f.quote} onGround /> : null}
                      {f.evidence ? <div data-copy="figure" style={{ ...s.meta, marginTop: full ? 10 : 6 }}>{codeLine(f.evidence, v.figures)}</div> : null}
                    </td>
                  </tr>
                ))}
                {fullUrl ? (
                  <tr>
                    <td colSpan={2} style={{ borderTop: `1px solid ${P.hairline}`, paddingTop: 14 }}>
                      <a href={fullUrl} style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: P.orange, textDecoration: 'none' }}>Read this week in full →</a>
                    </td>
                  </tr>
                ) : null}
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

// ---- Level 1 (depth v2, T11b; board E7) -----------------------------------------------
//
// The email a version-2 snapshot sends, drawn to the board: the masthead band;
// the week in one line with the market's week beside its month; the lead (the
// flag the update's check raised, with its two shares as a bar table, else
// the week's biggest new conversation); also this week; one line per page;
// the way in. No quote anywhere at level 1, and decision 1 throughout: a
// week's figure stands beside its month (a flag's beside the months the check
// compared it with), and the only words that say something moved are a
// verdict's, in a verdict node.
//
// The same email-safe spine as the report: tables and inline styles, no flex,
// no grid, no class. A chip is a table cell, never a coloured span inside a
// line.

/** The board's greys and the orange fill, beside palette A. */
const L = {
  rule: '#ECEAE4',
  edge: '#E4E2DC',
  ink2: '#45494D',
  fill: '#F2651D',
  track: '#ECEAE4',
} as const

const lab: CSSProperties = { margin: '0 0 10px', fontFamily: FONT.sans, fontSize: 11.5, fontWeight: 600, lineHeight: '1.3', letterSpacing: '.07em', textTransform: 'uppercase', color: P.orange }
const mono: CSSProperties = { fontFamily: FONT.mono, fontSize: 12.5, lineHeight: '1.5', color: P.muted, fontVariantNumeric: 'tabular-nums' }
const link: CSSProperties = { color: P.ink, textDecoration: 'none' }

/** The page shows the lead only when it is a flag (a new conversation is in
 *  the report's "New this week" below), and the rows the report does not. */
function onThePage(view: LevelOneView): LevelOneView {
  return { ...view, lead: view.lead?.kind === 'flag' ? view.lead : null, also: view.also.filter((r) => r.kind !== 'new') }
}

/** A theme's label is Pass B's words; anything else is code's or the client's. */
function Named({ label, theme }: { label: string; theme: boolean }) {
  return theme ? <span data-copy="subject" data-slot="pass_b_theme">{label}</span> : <>{label}</>
}

/** A flag chip, as a cell: the word its verdict earned, never free text. */
function Chip({ word }: { word: string }) {
  return (
    <td style={{ paddingLeft: 8, verticalAlign: 'middle' }}>
      <table {...presentation} style={T}>
        <tbody>
          <tr>
            <td data-copy="verdict" style={{ background: L.fill, borderRadius: 999, padding: '3px 7px', fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, lineHeight: '14px', color: P.ink, whiteSpace: 'nowrap' }}>{word}</td>
          </tr>
        </tbody>
      </table>
    </td>
  )
}

/** One share as a bar: its words and figure above, the bar under. */
function ShareBar({ label, pct, scale, color }: { label: string; pct: number; scale: number; color: string }) {
  const width = scale > 0 ? Math.max(2, Math.round((pct / scale) * 100)) : 0
  return (
    <>
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.4', color: P.ink, marginTop: 10 }}>
        {label} <span data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(pct)}</span>
      </div>
      <table width="100%" {...presentation} style={{ ...T, marginTop: 5 }}>
        <tbody>
          <tr>
            {width > 0 ? <td width={`${Math.min(100, width)}%`} height={10} style={{ background: color, borderRadius: 3, height: 10, fontSize: 1, lineHeight: '10px' }}>&nbsp;</td> : null}
            {width < 100 ? <td height={10} style={{ background: L.track, borderRadius: 3, height: 10, fontSize: 1, lineHeight: '10px' }}>&nbsp;</td> : null}
          </tr>
        </tbody>
      </table>
    </>
  )
}

/** The lead: the flag (its count, its month, its two shares, its band) or
 *  the week's biggest new conversation. */
function Lead({ lead, figures, where, appUrl }: { lead: LevelOneLead; figures: FigureTable; where: string; appUrl: string }) {
  const big: CSSProperties = { fontFamily: FONT.mono, fontSize: 40, fontWeight: 500, lineHeight: '1', letterSpacing: '-.02em', color: P.ink, fontVariantNumeric: 'tabular-nums' }
  const title: CSSProperties = { fontFamily: FONT.sans, fontSize: 17, fontWeight: 600, lineHeight: '1.35', color: P.ink, margin: '0 0 14px' }
  if (lead.kind === 'flag') {
    const f = lead.flag
    const word = flagWordOf(f.verdict)
    const weekPct = f.week.n > 0 ? (f.week.k / f.week.n) * 100 : 0
    const basePct = f.baseline.n > 0 ? (f.baseline.k / f.baseline.n) * 100 : 0
    const scale = Math.max(weekPct, basePct)
    return (
      <>
        <div data-copy="verdict" style={lab}>{word ? FLAG_WORDS[word] : FLAG_WORDS.unusual}</div>
        <div style={title}><a href={`${appUrl}${lead.href}`} style={link}><Named label={f.label} theme={f.objectKind === 'theme'} /></a></div>
        <table {...presentation} style={T}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: 'bottom', paddingRight: 14 }}><div data-copy="figure" style={big}>{fmtInt(f.week.k)}</div></td>
              <td style={{ verticalAlign: 'bottom' }}>
                <div style={{ ...mono, fontSize: 12 }}>
                  of <span data-copy="figure">{fmtInt(f.week.n)}</span> videos this week
                  {lead.usual ? (
                    <><br />usually about <span data-copy="figure">{fmtInt(lead.usual.k)}</span> of <span data-copy="figure">{fmtInt(lead.usual.n)}</span> a month</>
                  ) : null}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        {/* The two shares the check compared, as bars: this week's in the
            orange of what is new this week, the usual in the market yellow. */}
        <ShareBar label="This week" pct={weekPct} scale={scale} color={L.fill} />
        <ShareBar label="Usually" pct={basePct} scale={scale} color={P.yellow} />
        <div data-copy="verdict" style={{ ...mono, fontSize: 12, marginTop: 12 }}>
          A difference of <span data-copy="figure">{Math.abs(f.changePts).toFixed(1)}</span> points, on a band of <span data-copy="figure">{f.bandPts.toFixed(1)}</span>.
        </div>
      </>
    )
  }
  return (
    <>
      <div data-copy="verdict" style={lab}>{FLAG_WORDS.new} this week</div>
      {lead.label ? <div style={title}><a href={`${appUrl}${lead.href}`} style={link}><Named label={lead.label} theme /></a></div> : null}
      <table {...presentation} style={T}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'bottom', paddingRight: 14 }}><div data-copy="figure" style={big}>{fmtInt(lead.videos.week)}</div></td>
            <td style={{ verticalAlign: 'bottom' }}>
              <div style={{ ...mono, fontSize: 12 }}>
                {lead.videos.week === 1 ? 'video' : 'videos'} this week<br /><span data-copy="figure">{fmtInt(lead.videos.month)}</span> {where}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <Prose body={lead.body} figures={figures} style={{ margin: '14px 0 0', fontFamily: FONT.sans, fontSize: 14.5, lineHeight: '1.5', color: P.ink }} />
    </>
  )
}

/** "Also this week": a row each, its name (and chip), its figure under it. */
function AlsoRows({ rows, appUrl }: { rows: readonly LevelOneRow[]; appUrl: string }) {
  return (
    <table width="100%" {...presentation} style={T}>
      <tbody>
        {rows.map((r, i) => {
          const word = r.kind === 'flag' ? flagWordOf(r.verdict) : r.kind === 'new' ? 'new' : null
          return (
            <tr key={i}>
              <td style={{ padding: i === 0 ? '0 0 12px' : '12px 0', borderTop: i === 0 ? undefined : `1px solid ${L.rule}` }}>
                <table {...presentation} style={T}>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: FONT.sans, fontSize: 14.5, lineHeight: '1.4', color: P.ink, verticalAlign: 'middle' }}>
                        <a href={`${appUrl}${r.href}`} style={link}><Named label={r.label} theme={r.theme} /></a>
                      </td>
                      {word ? <Chip word={FLAG_WORDS[word]} /> : null}
                    </tr>
                  </tbody>
                </table>
                <div data-copy="figure" style={{ ...mono, marginTop: 3 }}>{r.figure}</div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** A line's name, marked for who wrote it. */
function LineName({ line }: { line: WeeklyReadLine }) {
  const c = line.copy
  if (c.kind === 'stored' || c.kind === 'subject') return <span data-copy={c.kind} data-slot={c.slot}>{line.name}</span>
  if (c.kind === 'prose') return <span data-copy="prose">{line.name}</span>
  return <>{line.name}</>
}

/** "Across your pages": the page's name, its line, its figure. */
function PageRows({ lines, appUrl }: { lines: readonly WeeklyReadLine[]; appUrl: string }) {
  return (
    <table width="100%" {...presentation} style={T}>
      <tbody>
        {lines.map((line, i) => (
          <tr key={line.page}>
            <td style={{ padding: i === 0 ? '0 0 12px' : '12px 0', borderTop: i === 0 ? undefined : `1px solid ${L.rule}` }}>
              <div style={{ fontFamily: FONT.sans, fontSize: 11.5, fontWeight: 600, lineHeight: '1.3', letterSpacing: '.06em', textTransform: 'uppercase', color: P.muted, marginBottom: 3 }}>{line.label}</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 14.5, lineHeight: '1.4', color: P.ink }}>
                <a href={`${appUrl}${line.href}`} style={link}>{line.lead} <LineName line={line} /></a>
              </div>
              {line.figure ? <div data-copy="figure" style={{ ...mono, marginTop: 3 }}>{line.figure}</div> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Level 1's parts as the page prints them, under the week's one line. */
function LevelOneOnPage({ view, appUrl }: { view: LevelOneView; appUrl: string }) {
  return (
    <>
      {view.lead ? (
        <>
          <Divider />
          <Band padding="28px 24px 26px"><Lead lead={view.lead} figures={view.figures} where={view.where} appUrl={appUrl} /></Band>
        </>
      ) : null}
      {view.also.length > 0 ? (
        <>
          <Divider />
          <Band padding="26px 24px 22px"><div style={lab}>Also this week</div><AlsoRows rows={view.also} appUrl={appUrl} /></Band>
        </>
      ) : null}
      {view.lines.length > 0 ? (
        <>
          <Divider />
          <Band padding="26px 24px 22px"><div style={lab}>Across your pages</div><PageRows lines={view.lines} appUrl={appUrl} /></Band>
        </>
      ) : null}
    </>
  )
}

/** A section of the level-1 card. */
function Section({ children, first = false, padding = '24px 30px', align }: { children: ReactNode; first?: boolean; padding?: string; align?: 'center' }) {
  return (
    <tr>
      <td align={align} style={{ padding, background: P.paper, borderTop: first ? undefined : `1px solid ${L.rule}`, textAlign: align }}>{children}</td>
    </tr>
  )
}

/** The level-1 email's card, masthead to footer (board E7). */
function LevelOneCard({ data, appUrl, markSrc, fullUrl }: { data: WeeklyReadSnapshotData; appUrl: string; markSrc?: string; fullUrl: string | null }) {
  const view = levelOneView(data.read, data.lines)
  const company = data.company
  const n = view.numbers
  // The board's mark: the yellow ditto on an ink tile. An email needs an
  // absolute address.
  const mark = markSrc ?? `${appUrl}/brand/verbatim-mark-yellow.png`
  return (
    <table width="100%" {...presentation} style={{ ...T, maxWidth: WEEKLY_READ_CARD_WIDTH + 40 }}>
      <tbody>
        <tr>
          <td style={{ padding: '12px 20px 0' }}>
            <table width="100%" {...presentation} style={{ ...T, background: P.paper, border: `1px solid ${L.edge}`, borderRadius: 14, borderCollapse: 'separate', overflow: 'hidden' }}>
              <tbody>
                {/* The masthead: the mark and the name, the company. */}
                <tr>
                  <td style={{ background: P.yellow, padding: '18px 30px', borderRadius: '14px 14px 0 0' }}>
                    <table width="100%" {...presentation} style={T}>
                      <tbody>
                        <tr>
                          <td style={{ verticalAlign: 'middle' }}>
                            <table {...presentation} style={T}>
                              <tbody>
                                <tr>
                                  <td width={26} height={26} align="center" style={{ width: 26, height: 26, background: P.ink, borderRadius: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                                    <img src={mark} width={13} height={13} alt="" style={{ display: 'inline-block', border: 0, verticalAlign: 'middle' }} />
                                  </td>
                                  <td style={{ paddingLeft: 10, verticalAlign: 'middle', fontFamily: FONT.sans, fontSize: 16, fontWeight: 700, color: P.ink }}>Verbatim</td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                          {company ? <td align="right" style={{ verticalAlign: 'middle', fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: P.ink, textAlign: 'right' }}>{company}</td> : null}
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

                {/* The week in one line, and the market's week beside its month. */}
                <Section first padding="26px 30px 6px">
                  <div style={{ fontFamily: FONT.mono, fontSize: 13, lineHeight: '1.4', color: P.muted }}>{data.period ? `${WEEKLY_READ_TITLE} · ${data.period}` : WEEKLY_READ_TITLE}</div>
                  {view.headline ? <Prose as="div" body={view.headline} figures={view.figures} style={{ margin: '8px 0 0', fontFamily: FONT.sans, fontSize: 24, fontWeight: 700, lineHeight: '1.25', letterSpacing: '-.01em', color: P.ink }} /> : null}
                  {n ? (
                    <p style={{ margin: '8px 0 0', fontFamily: FONT.sans, fontSize: 14.5, lineHeight: '1.5', color: L.ink2 }}>
                      <span data-copy="figure">{fmtInt(n.week.videos)}</span> videos{n.week.comments != null ? <> and <span data-copy="figure">{fmtInt(n.week.comments)}</span> comments</> : null} in your market this week · <span data-copy="figure">{fmtInt(n.month.videos)}</span> videos{n.month.comments != null ? <> and <span data-copy="figure">{fmtInt(n.month.comments)}</span> comments</> : null} {n.where}.
                    </p>
                  ) : null}
                </Section>

                {/* The lead: the flag, else the biggest new conversation. */}
                {view.lead ? (
                  <Section first padding="24px 30px">
                    <Lead lead={view.lead} figures={view.figures} where={view.where} appUrl={appUrl} />
                  </Section>
                ) : null}

                {/* Also this week. */}
                {view.also.length > 0 ? (
                  <Section>
                    <div style={lab}>Also this week</div>
                    <AlsoRows rows={view.also} appUrl={appUrl} />
                  </Section>
                ) : null}

                {/* One line per page. */}
                {view.lines.length > 0 ? (
                  <Section>
                    <div style={lab}>Across your pages</div>
                    <PageRows lines={view.lines} appUrl={appUrl} />
                  </Section>
                ) : null}

                {/* The way in. */}
                <Section padding="28px 30px" align="center">
                  <table {...presentation} align="center" style={{ ...T, margin: '0 auto' }}>
                    <tbody>
                      <tr>
                        <td align="center" style={{ background: P.yellow, borderRadius: 8 }}>
                          <a href={`${appUrl}/dashboard`} style={{ display: 'block', padding: '13px 26px', fontFamily: FONT.sans, fontSize: 15, fontWeight: 700, lineHeight: '18px', color: P.ink, textDecoration: 'none' }}>Open this week in Verbatim</a>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {fullUrl ? (
                    <div style={{ marginTop: 14, fontFamily: FONT.sans, fontSize: 13, lineHeight: '1.4' }}>
                      <a href={fullUrl} style={{ color: P.orange, fontWeight: 600, textDecoration: 'none' }}>Read this week in full</a>
                    </div>
                  ) : null}
                </Section>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style={{ padding: '16px 20px 8px', fontFamily: FONT.sans, fontSize: 12, lineHeight: '1.5', color: P.muted, textAlign: 'center' }}>
            {company ? `${company} · made with Verbatim · ` : 'Made with Verbatim · '}
            <a href={`${appUrl}/dashboard/settings/reports`} style={{ color: P.ink, textDecoration: 'underline' }}>Who gets this</a>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export interface WeeklyReadEmailProps extends Omit<WeeklyReadReportProps, 'full'> {
  /** The inbox preview line. */
  preheader?: string
}

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,500;1,400&display=swap'

/** The email document: the card on the ground, centred, phone first. */
export function WeeklyReadEmail({ data, appUrl, markSrc, markOnInkSrc, fullUrl, preheader }: WeeklyReadEmailProps) {
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
                <WeeklyReadReport data={data} appUrl={appUrl} markSrc={markSrc} markOnInkSrc={markOnInkSrc} fullUrl={fullUrl} />
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
 * the printed PDF, with the findings IN FULL (it is where the email's "Read
 * this week in full" leads). `print` adds the page size the render route
 * prints at: A4, portrait, the column paginating as a document does, because
 * this report is one column to read down, not a deck of slides.
 */
export function WeeklyReadPage({ data, appUrl, markSrc = '/brand/verbatim-mark-ink.png', print = false, fill = false }: Omit<WeeklyReadReportProps, 'full' | 'fullUrl'> & {
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
              <WeeklyReadReport data={data} appUrl={appUrl} markSrc={markSrc} full />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
