/* eslint-disable @next/next/no-img-element -- an email document, not a page */
import { Fragment, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { translationLabel, translationNote } from '@/components/quote-block'
import { FLAG_WORDS, flagWordOf } from '@/components/v2/flag-chip'
import { nonAnswerParts, signedChange } from '@/components/delta-badge'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import { FONT } from '@/lib/email/theme'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { barMonth } from '@/lib/reading/month-label'
import type { Verdict } from '@/lib/reading/verdicts'
import { substituteFigures } from '@/lib/reports/cover'
import type { FigureTable } from '@/lib/reports/types'
import { WEEKLY_READ_TITLE, type ResolvedQuote } from '@/lib/reports/weekly-read'
import type { WeeklyReadSnapshotData } from '@/lib/reports/weekly-read-build'
import {
  FIRST_TIME, sameMonth, weeklyV3View,
  type StoodOutRow, type WeeklyContentPart, type WeeklyMovesPart, type WeeklyProductsPart, type WeeklySubjectRead, type WeeklyV3View, type WeeklyVoicesPart,
} from '@/lib/reports/weekly-read-v3'

// THE WEEKLY READ, VERSION 3, DRAWN (the H7 boards, 18 Oct). Two frames:
//
//   · THE EMAIL (`WeeklyV3Card`), to H7-Email-Weekly-Alt: grouped by
//     question. This week (the line, the first sentence of each thing it
//     means, the market's week beside its month, the month-closing line,
//     what stood out); the month so far (every ready subject's headline,
//     Voices, Your products); what to do next (Content, Your moves); Open
//     Market and Read this week in full. EMAIL-SAFE: tables and inline
//     styles; the one <style> in the head (`WEEKLY_V3_EMAIL_CSS`) only
//     re-lays the same parts at a phone's width (H7-Email-Weekly-Phone), so
//     a client that drops it still reads the 640 layout. No quote.
//
//   · THE FULL READ (`WeeklyV3Page`): the share page, the in-app viewer and
//     the A4 paper, ONE visual system (H7-Weekly-Full / -Print): the week
//     card with each quote under its paragraph, Also this week, the subject
//     cards in full, the pages with room. On paper each group starts a page.
//     Not an email, so it lays out with CSS (one scoped stylesheet, `w3-`).
//
// The copy contract rides along on every node: the writer's sentences are
// `prose` (the read's) or `stored` with their slot (a subject's read, an
// advice title), code's numbers `figure`, a flag's or a move's words
// `verdict`, a model's label `subject` with its slot, a commenter's words
// `quote`.

const P = {
  yellow: '#FFD43B',
  ink: '#26292C',
  ink2: '#45494D',
  ground: '#F7F6F2',
  paper: '#FFFFFF',
  orange: '#C2410C',
  fill: '#F2651D',
  num: '#E8590C',
  muted: '#5F656B',
  rule: '#ECEAE4',
  edge: '#E4E2DC',
  soft: '#F0EEE9',
  pale: '#FFF4C7',
  close: '#FFFBEA',
  closeEdge: '#F3E7B3',
  button: '#D9D6CE',
} as const

/** The H7 boards' palette, for a test. */
export const WEEKLY_V3_PALETTE = P

const presentation = { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 } as const
const T: CSSProperties = { borderCollapse: 'collapse', borderSpacing: 0 }
const MONO = FONT.mono

/** The card's width: the board's 640 (600 inside the ground's gutters). */
export const WEEKLY_V3_CARD_WIDTH = 600

/** A flag's chip word, from its verdict (the check's own word, never free text). */
export const chipOf = (v: Verdict | null): string | null => {
  const w = flagWordOf(v)
  return w ? FLAG_WORDS[w] : v ? FLAG_WORDS.unusual : null
}

/** A writer's sentence, any `[[key]]` it carries put back as code's figure; a
 *  sentence naming a key the table lacks is not printed. */
function Prose({ body, figures, style, as = 'p', copy = 'prose', slot, className }: {
  body: string
  figures: FigureTable
  style?: CSSProperties
  as?: 'p' | 'div' | 'span' | 'h1' | 'h2' | 'h3'
  copy?: 'prose' | 'stored'
  slot?: string
  className?: string
}) {
  const Tag = as
  const marks = copy === 'stored' ? { 'data-copy': 'stored', 'data-slot': slot ?? 'week_read' } : { 'data-copy': 'prose' }
  if (!body.includes('[[')) return <Tag {...marks} className={className} style={style}>{body}</Tag>
  const parts = substituteFigures(body, figures)
  if (parts.length === 0) return null
  return (
    <Tag {...marks} className={className} style={style}>
      {parts.map((p, i) => ('text' in p ? <Fragment key={i}>{p.text}</Fragment> : <span key={i} data-copy="figure">{p.figure}</span>))}
    </Tag>
  )
}

/** A stood-out row's name, marked for who wrote it. */
function RowName({ row, figures }: { row: StoodOutRow; figures: FigureTable }) {
  if (row.labelKind === 'theme') return <span data-copy="subject" data-slot="pass_b_theme">{row.label}</span>
  if (row.labelKind === 'finding') return <Prose as="span" body={row.label} figures={figures} />
  return <>{row.label}</>
}

/** A figure, in its own node. */
const N = ({ n, style }: { n: number; style?: CSSProperties }) => <span data-copy="figure" style={style}>{fmtInt(n)}</span>

/** "19 videos this week · 54 in October so far", or a flag's "19 of 241
 *  videos this week · usually 38 of 1,089 over June, July and August", each
 *  number its own figure, the bold ones the board's. */
function RowFigure({ figure, bold }: { figure: StoodOutRow['figure']; bold: CSSProperties }) {
  if (figure.kind === 'flag') {
    return (
      <>
        <N n={figure.k} style={bold} /> of <N n={figure.n} /> videos this week
        {figure.usual ? <> · usually <N n={figure.usual.k} /> of <N n={figure.usual.n} /> over {figure.usual.months}</> : null}
      </>
    )
  }
  return (
    <>
      <span style={{ whiteSpace: 'nowrap' }}><N n={figure.week} style={bold} /> {figure.week === 1 ? 'video' : 'videos'} this week</span>
      {figure.month != null ? <> · <span style={{ whiteSpace: 'nowrap' }}><N n={figure.month} style={bold} /> {figure.where}</span></> : null}
    </>
  )
}

/** A band as the badge prints it: "band ±1.4 pts". */
const bandWords = (pts: number): string => `band ±${Math.abs(pts).toLocaleString('en-US')} pts`

/** THE BADGE'S WORDS, AS YOUR MOVES PRINTS THEM ON ITS MOVE CARD
 *  (`MovementBadge` with no `bandTip`, components/delta-badge.tsx): "▲ 2.1
 *  pts · band ±1.4 pts" for a move whose market moved beyond its band; a
 *  non-answer with the change it refused and its band where both exist ("no
 *  clear change · +0.9 pts · band ±3.2 pts": a refusal a reader can check,
 *  SH18), else its word alone ("too few to compare", which withholds both);
 *  the band inline, ruling I, because in an email a tooltip prints nothing.
 *  Nothing for a refused comparison, which never prints. */
export function moveVerdictWords(v: Verdict): string | null {
  if (v.state === 'refused') return null
  if (v.state === 'moved' && v.changePts != null) {
    const band = v.bandPts != null ? ` · ${bandWords(v.bandPts)}` : ''
    return `${v.changePts > 0 ? '▲' : '▼'} ${Math.abs(v.changePts).toLocaleString('en-US')} pts${band}`
  }
  const parts = nonAnswerParts(v, 'pts')
  if (!parts) return null
  return parts.change != null && parts.bandPts != null
    ? `${parts.word} · ${signedChange(parts.change, 'pts')} · ${bandWords(parts.bandPts)}`
    : parts.word
}

/** The mark: the yellow ditto on an ink tile in the email (an image: mail
 *  clients draw no SVG); the ink ditto on a yellow tile on the page. */
const DITTO = 'M1.5 2h3v3.2L3 9H1.6l1-3.8H1.5zM7 2h3v3.2L8.5 9H7.1l1-3.8H7z'

// =====================================================================================
// THE EMAIL (H7-Email-Weekly-Alt; -Phone at 390)
// =====================================================================================

/** The head's one stylesheet: the same parts at a phone's width (the board's
 *  `.ph` rules). Every element it touches is laid out inline first. */
export const WEEKLY_V3_EMAIL_CSS = [
  '@media only screen and (max-width:480px){',
  '.wr3-outer{padding:12px 10px 0 !important}',
  '.wr3-top{padding:14px 18px !important}',
  '.wr3-sec{padding-left:18px !important;padding-right:18px !important}',
  '.wr3-num{padding:14px 18px 16px !important}',
  '.wr3-line{font-size:20px !important}',
  '.wr3-nv{font-size:24px !important}',
  '.wr3-h2{font-size:16px !important}',
  '.wr3-note{display:none !important}',
  '.wr3-snote{display:block !important;max-height:none !important;overflow:visible !important}',
  '.wr3-cta{padding:20px 18px 22px !important}',
  '.wr3-btns{width:100% !important}',
  '.wr3-btn{display:block !important;width:100% !important;box-sizing:border-box}',
  '.wr3-unit{display:block !important;margin:6px 0 0 !important;font-size:13px !important}',
  '.wr3-btn a{display:block !important}',
  '.wr3-gap{display:block !important;width:auto !important;height:10px !important}',
  '}',
].join('')

const E = {
  mdl: { margin: 0, fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, lineHeight: '1.3', letterSpacing: '.07em', textTransform: 'uppercase', color: P.muted } as CSSProperties,
  meb: { margin: 0, fontFamily: FONT.sans, fontSize: 11.5, fontWeight: 600, lineHeight: '1.3', letterSpacing: '.07em', textTransform: 'uppercase', color: P.orange } as CSSProperties,
  h2: { margin: 0, fontFamily: FONT.sans, fontSize: 17, lineHeight: '1.3', fontWeight: 600, letterSpacing: '-.005em', color: P.ink } as CSSProperties,
  note: { fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.4', color: P.muted, textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: 12, verticalAlign: 'baseline' } as CSSProperties,
  link: { color: P.ink, textDecoration: 'none' } as CSSProperties,
  fig: { display: 'block', marginTop: 5, fontFamily: MONO, fontSize: 12.5, lineHeight: '1.5', color: P.muted, fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  bold: { fontWeight: 500, color: P.ink } as CSSProperties,
  arrow: { width: 22, textAlign: 'right', verticalAlign: 'middle', paddingLeft: 10, fontFamily: FONT.sans, fontWeight: 600, fontSize: 15 } as CSSProperties,
  cat: { fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.4', color: P.muted } as CSSProperties,
  pgl: { fontFamily: FONT.sans, fontSize: 11.5, fontWeight: 600, lineHeight: '1.3', letterSpacing: '.06em', textTransform: 'uppercase', color: P.muted } as CSSProperties,
  pgw: { fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.3', color: P.muted, textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: 12 } as CSSProperties,
  plead: { margin: '7px 0 0', fontFamily: FONT.sans, fontSize: 14, lineHeight: '1.45', color: P.ink2 } as CSSProperties,
  pname: { fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: P.ink, textDecoration: 'none' } as CSSProperties,
  r: { textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: 12, fontFamily: MONO, fontSize: 13, color: P.ink, fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' } as CSSProperties,
  chip: { display: 'inline-block', fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, lineHeight: '1', padding: '4px 7px', borderRadius: 999, background: P.fill, color: P.ink, whiteSpace: 'nowrap', verticalAlign: '1px' } as CSSProperties,
  verd: { display: 'inline-block', fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, lineHeight: '1.3', color: P.ink2, background: P.rule, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' } as CSSProperties,
}

/** A section of the card: padding, a rule above unless it is the first. */
function Sec({ children, first = false, style }: { children: ReactNode; first?: boolean; style?: CSSProperties }) {
  return (
    <tr>
      <td className="wr3-sec" style={{ padding: '24px 28px 22px', background: P.paper, borderTop: first ? undefined : `1px solid ${P.rule}`, ...style }}>{children}</td>
    </tr>
  )
}

/** A section's head: its title, and a quiet note at the right (under it on a
 *  phone). */
function Head({ title, note }: { title: string; note?: string | null }) {
  return (
    <>
      <table width="100%" {...presentation} style={T}>
        <tbody>
          <tr>
            <td style={{ padding: 0, verticalAlign: 'baseline' }}><h2 className="wr3-h2" style={E.h2}>{title}</h2></td>
            {note ? <td className="wr3-note" style={E.note}>{note}</td> : null}
          </tr>
        </tbody>
      </table>
      {note ? <div className="wr3-snote" style={{ display: 'none', maxHeight: 0, overflow: 'hidden', margin: '3px 0 0', fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.4', color: P.muted }}>{note}</div> : null}
    </>
  )
}

/** A row's arrow: the same link, the affordance at the right. */
const Arrow = ({ href }: { href: string }) => (
  <td style={E.arrow}><a href={href} style={{ color: P.orange, textDecoration: 'none' }}>→</a></td>
)

/** One list of rows, a hairline between (the board's `.rows`): each child
 *  is one row's cells. */
function Rows({ children }: { children: ReactNode[] }) {
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop: 10 }}>
      <tbody>
        {children.map((cells, i) => <tr key={i}>{cells}</tr>)}
      </tbody>
    </table>
  )
}

const rowCell = (i: number): CSSProperties => ({ padding: i === 0 ? '6px 0 13px' : '13px 0', borderTop: i === 0 ? undefined : `1px solid ${P.rule}`, verticalAlign: 'top' })

/** What stood out: each row its eyebrow (or the flag's chip), its name, its
 *  week beside its month. */
function StoodOut({ rows, appUrl, figures }: { rows: readonly StoodOutRow[]; appUrl: string; figures: FigureTable }) {
  return (
    <Rows>
      {rows.map((r, i) => (
        <Fragment key={r.key}>
          <td style={rowCell(i)}>
            <a href={`${appUrl}${r.href}`} style={E.link}>
              {r.chip ? <span data-copy="verdict" style={E.chip}>{r.chip}</span> : r.eyebrow ? <p style={E.meb}>{r.eyebrow.verdict ? <span data-copy="verdict">{r.eyebrow.text}</span> : r.eyebrow.text}</p> : null}
              <span style={{ display: 'block', marginTop: r.lead ? 4 : 3, fontFamily: FONT.sans, fontSize: r.lead ? 16.5 : 15, lineHeight: r.lead ? '1.32' : '1.35', fontWeight: 600, color: P.ink }}><RowName row={r} figures={figures} /></span>
              <span style={E.fig}><RowFigure figure={r.figure} bold={E.bold} /></span>
            </a>
          </td>
          <Arrow href={`${appUrl}${r.href}`} />
        </Fragment>
      ))}
    </Rows>
  )
}

/** "What the market is talking about": each ready subject's name as Market's
 *  card eyebrow, its stored headline under it; a thin read's stored line in
 *  its place (muted); a read with no headline, its meaning's first words. */
function SubjectRows({ subjects, appUrl, figures }: { subjects: readonly WeeklySubjectRead[]; appUrl: string; figures: FigureTable }) {
  return (
    <Rows>
      {subjects.map((s, i) => {
        const href = `${appUrl}${s.href}`
        const head = s.headline
        const quiet = !head ? (s.status === 'thin' ? s.line : s.means) : null
        return (
          <Fragment key={s.id}>
            <td style={rowCell(i)}>
              <a href={href} style={E.link}>
                <p style={E.meb}>{s.name}</p>
                {head ? <Prose as="span" copy="stored" body={head} figures={figures} style={{ display: 'block', marginTop: 4, fontFamily: FONT.sans, fontSize: 15.5, lineHeight: '1.38', fontWeight: 600, letterSpacing: '-.005em', color: P.ink }} /> : null}
                {quiet ? <Prose as="span" copy="stored" body={quiet} figures={figures} style={{ display: 'block', marginTop: 4, fontFamily: FONT.sans, fontSize: 14, lineHeight: '1.45', color: P.muted }} /> : null}
              </a>
            </td>
            <Arrow href={href} />
          </Fragment>
        )
      })}
    </Rows>
  )
}

/** A page's block inside a section (the board's `.pg`): its label, and its
 *  own month at the right where it is not the section's. */
function Pg({ label, month, first, children }: { label: string; month?: string | null; first: boolean; children: ReactNode }) {
  return (
    <div style={first ? { marginTop: 12 } : { marginTop: 18, paddingTop: 16, borderTop: `1px solid ${P.rule}` }}>
      <table width="100%" {...presentation} style={T}>
        <tbody>
          <tr>
            <td style={{ ...E.pgl, padding: 0, verticalAlign: 'baseline' }}>{label}</td>
            {month ? <td style={E.pgw}>{month}</td> : null}
          </tr>
        </tbody>
      </table>
      {children}
    </div>
  )
}

/** The board's `.prow` list. */
function PRows({ rows, style }: { rows: { cells: ReactNode; tight?: boolean }[]; style?: CSSProperties }) {
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop: 6, ...style }}>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{r.cells}</tr>)}
      </tbody>
    </table>
  )
}

const pcell = (i: number, extra?: CSSProperties): CSSProperties => ({
  padding: '9px 0', borderTop: i === 0 ? undefined : `1px solid ${P.soft}`, verticalAlign: 'top', fontFamily: FONT.sans, fontSize: 14.5, lineHeight: '1.4', color: P.ink, ...extra,
})

/** Voices: the group in the most videos of the month's, and the brands named
 *  most unprompted where they are counted. */
function VoicesPg({ part, month, first, appUrl }: { part: WeeklyVoicesPart; month: string | null; first: boolean; appUrl: string }) {
  const g = part.group!
  const rows: { cells: ReactNode; tight?: boolean }[] = [{
    cells: (
      <>
        <td style={pcell(0)}><span style={E.cat}>In the most videos</span><br /><a href={`${appUrl}${g.href}`} style={E.pname}><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></a></td>
        <td style={{ ...pcell(0), ...E.r }}>{part.videos ? <><N n={g.videos} /> of <N n={part.videos} /> videos</> : <><N n={g.videos} /> {g.videos === 1 ? 'video' : 'videos'}</>}</td>
      </>
    ),
  }]
  if (part.named.length > 0) {
    rows.push({ cells: <td colSpan={2} style={{ ...pcell(1), paddingBottom: 0 }}><span style={E.cat}>Named most, unprompted</span></td> })
    for (const b of part.named) {
      rows.push({
        tight: true,
        cells: (
          <>
            <td style={{ ...pcell(1), padding: '5px 0', borderTop: undefined }}><a href={`${appUrl}${b.href}`} style={E.pname}>{b.label}</a></td>
            <td style={{ ...pcell(1), padding: '5px 0', borderTop: undefined, ...E.r }}><N n={b.k} /> of <N n={b.n} /> videos</td>
          </>
        ),
      })
    }
  }
  return <Pg label="Voices" month={month} first={first}><PRows rows={rows} /></Pg>
}

/** "5 of your 65 products came up · 72 videos about them or their categories". */
function ProductsLead({ part }: { part: WeeklyProductsPart }) {
  return (
    <>
      <N n={part.cameUp} /> of your <N n={part.products} /> products came up
      {part.videos != null ? <> · <N n={part.videos} /> videos about them or their categories</> : null}
    </>
  )
}

/** Your products: how many came up, and up to five with their videos. */
function ProductsPg({ part, month, first, appUrl }: { part: WeeklyProductsPart; month: string | null; first: boolean; appUrl: string }) {
  return (
    <Pg label="Your products" month={month} first={first}>
      {part.products > 0 ? <p style={E.plead}><ProductsLead part={part} /></p> : null}
      {part.top.length > 0 ? (
        <PRows rows={part.top.map((p, i) => ({
          cells: (
            <>
              <td style={pcell(i)}>
                <a href={`${appUrl}${p.href}`} style={{ ...E.link, fontWeight: 600 }}>{p.name}</a> <span style={{ ...E.cat, whiteSpace: 'nowrap' }}>{p.category}</span>
                {p.first ? <> <span data-copy="verdict" style={E.chip}>{FIRST_TIME}</span></> : null}
              </td>
              <td style={{ ...pcell(i), ...E.r }}><N n={p.videos} /> {p.videos === 1 ? 'video' : 'videos'}</td>
            </>
          ),
        }))} />
      ) : null}
    </Pg>
  )
}

/** Worth a reply: a link to Content's list, never a count. */
function Replies({ part, appUrl, ruled }: { part: WeeklyContentPart; appUrl: string; ruled: boolean }) {
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop: ruled ? 4 : 6, borderTop: ruled ? `1px solid ${P.soft}` : undefined }}>
      <tbody>
        <tr>
          <td style={{ padding: ruled ? '12px 0 0' : '0', fontFamily: FONT.sans }}>
            <a href={`${appUrl}${part.replies.href}`} style={{ fontSize: 14, fontWeight: 600, color: P.ink, textDecoration: 'none' }}>Worth a reply →</a>
            <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, lineHeight: '1.4', color: P.muted }}>
              {part.replies.days ? `Comments written ${part.replies.days} worth an answer from you` : 'The comments worth an answer from you'}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/** Content: the ideas (numbered, each opening its page, the medical team line
 *  once under them), or the question asked most; then Worth a reply. */
function ContentPg({ part, first, appUrl, medical }: { part: WeeklyContentPart; first: boolean; appUrl: string; medical: boolean }) {
  const ideas = part.ideas
  const q = part.asked
  return (
    <Pg label="Content" first={first}>
      {ideas.length > 0 ? (
        <>
          {part.read ? <p style={E.plead}>What to post next, from questions asked {part.read}</p> : <p style={E.plead}>What to post next</p>}
          <table width="100%" {...presentation} style={{ ...T, marginTop: 6 }}>
            <tbody>
              {ideas.map((x, i) => (
                <tr key={x.id}>
                  <td width={30} style={{ width: 30, padding: '8px 0', verticalAlign: 'top', borderTop: i === 0 ? undefined : `1px solid ${P.soft}` }}>
                    <span data-copy="figure" style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 10, background: P.num, color: P.paper, fontFamily: FONT.sans, fontSize: 11.5, fontWeight: 700, lineHeight: '20px', textAlign: 'center' }}>{i + 1}</span>
                  </td>
                  <td style={{ padding: '8px 0', verticalAlign: 'top', borderTop: i === 0 ? undefined : `1px solid ${P.soft}`, fontFamily: FONT.sans, fontSize: 14.5, lineHeight: '1.42' }}>
                    <a href={`${appUrl}${x.href}`} style={{ ...E.link, fontWeight: 600 }}><span data-copy="prose">{x.title}</span></a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {part.medical || medical ? <p style={{ margin: '8px 0 0', fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.45', color: P.muted }}>{MEDICAL_LINE}</p> : null}
        </>
      ) : q ? (
        <PRows rows={[{
          cells: (
            <td style={pcell(0)}>
              <span style={E.cat}>Asked most, and not yet in your posts</span><br />
              <a href={`${appUrl}${q.href}`} style={E.pname}><span data-copy="subject" data-slot="pass_b_theme">{q.label}</span></a>
              {q.week != null ? (
                <span style={E.fig}>
                  <N n={q.week} style={E.bold} /> {q.week === 1 ? 'video' : 'videos'} {q.weekWords}
                  {q.month != null ? <> · <N n={q.month} style={E.bold} /> {q.monthWords}</> : null}
                </span>
              ) : null}
            </td>
          ),
        }]} />
      ) : null}
      <Replies part={part} appUrl={appUrl} ruled={ideas.length > 0 || q != null} />
    </Pg>
  )
}

/** "Cost & access: 92 of 612 videos in August, the month before, against 134
 *  of 839 in September · no clear change": the move's one comparison, in Your
 *  moves' own words, its verdict in a verdict node. */
function MoveLine({ move }: { move: NonNullable<WeeklyMovesPart['move']> }) {
  const words = moveVerdictWords(move.verdict)
  return (
    <>
      {move.label ? <>{move.kind === 'subject' ? <span data-copy="quote">{move.label}</span> : <span data-copy="subject" data-slot="pass_b_theme">{move.label}</span>}: </> : null}
      <N n={move.before.k} style={E.bold} /> of <N n={move.before.n} /> videos in {move.months.before}, against <N n={move.after.k} style={E.bold} /> of <N n={move.after.n} /> in {move.months.after}
      {words ? <> · <span data-copy="verdict" style={{ ...E.verd, fontFamily: FONT.sans }}>{words}</span></> : null}
    </>
  )
}

/** An advice title, marked for who wrote it. */
const AdviceTitle = ({ a }: { a: WeeklyMovesPart['advice'][number] }) =>
  a.untitled ? <>{a.title}</> : <span data-copy="stored" data-slot="pass_d_b_recommendation">{a.title}</span>

/** Your moves: the first piece of advice waiting and how many wait; the
 *  move's comparison where one may print. */
function MovesPg({ part, first, appUrl }: { part: WeeklyMovesPart; first: boolean; appUrl: string }) {
  const a = part.advice[0]
  const rows: { cells: ReactNode }[] = []
  if (a) {
    rows.push({
      cells: (
        <>
          <td style={pcell(0)}>
            <span style={E.cat}>Advice waiting for a decision</span><br />
            <a href={`${appUrl}${a.href}`} style={{ ...E.link, fontWeight: 600 }}><AdviceTitle a={a} /></a>
            {a.figure ? <span data-copy="figure" style={E.fig}>{a.figure}</span> : null}
          </td>
          <td style={{ ...pcell(0), ...E.r }}><N n={part.waiting} /> waiting</td>
        </>
      ),
    })
  }
  if (part.move) {
    const m = part.move
    rows.push({
      cells: (
        <td colSpan={2} style={pcell(rows.length)}>
          <span style={E.cat}>After your move</span><br />
          <a href={`${appUrl}${m.href}`} style={{ ...E.link, fontWeight: 600 }}><span data-copy="quote">{m.title}</span>, dated {shortDate(`${m.day}T12:00:00.000Z`)}</a>
          <span style={E.fig}><MoveLine move={m} /></span>
        </td>
      ),
    })
  }
  return <Pg label="Your moves" first={first}><PRows rows={rows} /></Pg>
}

/** The month-closing line (decision 8), after the week's numbers. */
function MonthClose({ view, appUrl }: { view: WeeklyV3View; appUrl: string }) {
  const c = view.monthClose!
  const name = longMonthOf(c.month)
  const href = `${appUrl}${c.href}`
  return (
    <tr>
      <td style={{ padding: 0 }}>
        <table width="100%" {...presentation} style={{ ...T, background: P.close }}>
          <tbody>
            <tr>
              <td className="wr3-sec" style={{ padding: '16px 28px', verticalAlign: 'top', borderTop: `1px solid ${P.closeEdge}`, borderBottom: `1px solid ${P.closeEdge}` }}>
                <p style={E.meb}>The month’s long-run read</p>
                <a href={href} style={E.link}>
                  <span style={{ display: 'block', marginTop: 4, fontFamily: FONT.sans, fontSize: 15, lineHeight: '1.4', fontWeight: 600, color: P.ink }}>{name}’s read, “{c.title}”, is on Market › This month</span>
                </a>
              </td>
              <td style={{ ...E.arrow, padding: '16px 28px 16px 10px', borderTop: `1px solid ${P.closeEdge}`, borderBottom: `1px solid ${P.closeEdge}` }}><a href={href} style={{ color: P.orange, textDecoration: 'none' }}>→</a></td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  )
}

const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const longMonthOf = (m: string): string => LONG_MONTHS[Number(m.slice(5, 7)) - 1] ?? m

/** A part's own month at its head, only where it is not the section's (a
 *  whole-month reading of another month carries its label, decision 3). */
const ownMonth = (month: string | null | undefined, words: string, label: string | null | undefined, sectionMonth: string): string | null =>
  sameMonth(month, sectionMonth) ? null : words ? barMonth(words, label) : null

/** "Ideas, replies and advice": what the last section holds, in a few words. */
function nextNote(content: WeeklyContentPart | null, moves: WeeklyMovesPart | null): string {
  const first = content ? (content.ideas.length > 0 ? 'Ideas' : content.asked ? 'Questions' : null) : null
  const parts = [first, content ? 'replies' : null, moves ? 'advice' : null].filter((x): x is string => x != null)
  const words = parts.length > 0 ? parts : ['Advice']
  const said = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
  return said.charAt(0).toUpperCase() + said.slice(1)
}

/** The email's card, masthead to footer (H7-Email-Weekly-Alt). */
export function WeeklyV3Card({ data, appUrl, markSrc, fullUrl, medical = false }: { data: WeeklyReadSnapshotData; appUrl: string; markSrc?: string; fullUrl: string | null; medical?: boolean }) {
  const v = weeklyV3View({ read: data.read, subjects: data.subjects, pages: data.pages, monthClose: data.monthClose, chipOf })
  const company = data.company
  const mark = markSrc ?? `${appUrl}/brand/verbatim-mark-yellow.png`
  const voices = v.pages.voices && v.pages.voices.group ? v.pages.voices : null
  const products = v.pages.products ?? null
  const content = v.pages.content ?? null
  const moves = v.pages.moves ?? null
  const monthParts = v.subjects.length > 0 || voices || products
  const month = data.read.month
  return (
    <table width="100%" {...presentation} style={{ ...T, maxWidth: WEEKLY_V3_CARD_WIDTH + 40 }}>
      <tbody>
        <tr>
          <td className="wr3-outer" style={{ padding: '12px 20px 0' }}>
            <table width="100%" {...presentation} style={{ ...T, background: P.paper, border: `1px solid ${P.edge}`, borderRadius: 14, borderCollapse: 'separate', overflow: 'hidden' }}>
              <tbody>
                {/* The masthead. */}
                <tr>
                  <td className="wr3-top" style={{ background: P.yellow, padding: '16px 28px', borderRadius: '14px 14px 0 0' }}>
                    <table width="100%" {...presentation} style={T}>
                      <tbody>
                        <tr>
                          <td style={{ verticalAlign: 'middle' }}>
                            <table {...presentation} style={T}>
                              <tbody>
                                <tr>
                                  <td width={26} height={26} align="center" style={{ width: 26, height: 26, background: P.ink, borderRadius: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                                    <img src={mark} width={12} height={12} alt="" style={{ display: 'inline-block', border: 0, verticalAlign: 'middle' }} />
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

                {/* THIS WEEK: the line, and what it means in first sentences. */}
                <Sec first>
                  <p style={{ margin: 0, fontFamily: MONO, fontSize: 13, lineHeight: '1.4', color: P.muted }}>
                    {WEEKLY_READ_TITLE}{v.dates ? <> · <span style={{ whiteSpace: 'nowrap' }}>{v.dates}</span></> : null}
                  </p>
                  {v.line ? <Prose as="h1" className="wr3-line" body={v.line} figures={v.figures} style={{ margin: '8px 0 0', fontFamily: FONT.sans, fontSize: 23, lineHeight: '1.3', fontWeight: 700, letterSpacing: '-.012em', color: P.ink }} /> : null}
                  {v.meansFirst.length > 0 ? (
                    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${P.rule}` }}>
                      <p style={E.mdl}>What it means</p>
                      <table width="100%" {...presentation} style={{ ...T, marginTop: 8 }}>
                        <tbody>
                          {v.meansFirst.map((m, i) => (
                            <tr key={i}>
                              <td width={30} style={{ width: 30, padding: '9px 0 7px', verticalAlign: 'top', fontFamily: MONO, fontSize: 12, color: P.muted }}>{String(i + 1).padStart(2, '0')}</td>
                              <td style={{ padding: '7px 0', verticalAlign: 'top' }}><Prose body={m} figures={v.figures} style={{ margin: 0, fontFamily: FONT.sans, fontSize: 14.5, lineHeight: '1.5', color: P.ink }} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </Sec>

                {/* The market's week beside its month (decision 1). */}
                {v.numbers || v.stoodOut.length > 0 ? (
                  <Sec style={{ paddingBottom: v.numbers ? 14 : 0 }}>
                    <Head title={v.dates ? `This week, ${v.dates}` : 'This week'} note={v.numbers ? `Beside ${v.monthCell}` : null} />
                  </Sec>
                ) : null}
                {v.numbers ? (
                  <tr>
                    <td style={{ padding: 0 }}>
                      <table width="100%" {...presentation} style={{ ...T, background: P.ground, borderTop: `1px solid ${P.rule}` }}>
                        <tbody>
                          <tr>
                            {[
                              { label: 'This week', n: v.numbers.week },
                              { label: v.monthCell, n: v.numbers.month },
                            ].map((c, i) => (
                              <td key={c.label} width="50%" className="wr3-num" style={{ width: '50%', padding: '16px 28px 18px', verticalAlign: 'top', borderLeft: i === 1 ? `1px solid ${P.edge}` : undefined }}>
                                <p style={E.mdl}>{c.label}</p>
                                <div className="wr3-nv" style={{ marginTop: 8, fontFamily: MONO, fontSize: 28, lineHeight: '1', fontWeight: 500, letterSpacing: '-.02em', color: P.ink, fontVariantNumeric: 'tabular-nums' }}>
                                  <N n={c.n.videos} /><span className="wr3-unit" style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 500, letterSpacing: 0, marginLeft: 6, color: P.ink }}>videos</span>
                                </div>
                                {c.n.comments != null ? <div style={{ marginTop: 6, fontFamily: FONT.sans, fontSize: 13, color: P.ink2 }}><N n={c.n.comments} style={{ fontFamily: MONO, color: P.ink }} /> comments</div> : null}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ) : null}

                {/* The month-closing line, after the week's numbers (decision 8). */}
                {v.monthClose ? <MonthClose view={v} appUrl={appUrl} /> : null}

                {/* What stood out, in Market's eyebrows. */}
                {v.stoodOut.length > 0 ? (
                  <Sec style={{ borderTop: v.monthClose ? undefined : '0', paddingTop: 16 }}>
                    <p style={E.mdl}>What stood out</p>
                    <StoodOut rows={v.stoodOut} appUrl={appUrl} figures={v.figures} />
                  </Sec>
                ) : null}

                {/* THE MONTH SO FAR: each a reading of the whole month. */}
                {monthParts ? (
                  <Sec>
                    <Head title={v.monthGroup} note="Each a reading of the whole month" />
                    {v.subjects.length > 0 ? (
                      <>
                        <p style={{ ...E.mdl, marginTop: 14 }}>What the market is talking about</p>
                        <SubjectRows subjects={v.subjects} appUrl={appUrl} figures={v.figures} />
                      </>
                    ) : null}
                    {voices ? <VoicesPg part={voices} month={ownMonth(voices.month, voices.monthWords, voices.monthLabel, month)} first={v.subjects.length === 0} appUrl={appUrl} /> : null}
                    {products ? <ProductsPg part={products} month={ownMonth(products.month, products.monthWords, products.monthLabel, month)} first={v.subjects.length === 0 && !voices} appUrl={appUrl} /> : null}
                  </Sec>
                ) : null}

                {/* WHAT TO DO NEXT: the ideas, the replies, the advice. */}
                {content || moves ? (
                  <Sec>
                    <Head title="What to do next" note={nextNote(content, moves)} />
                    {content ? <ContentPg part={content} first appUrl={appUrl} medical={medical} /> : null}
                    {moves ? <MovesPg part={moves} first={!content} appUrl={appUrl} /> : null}
                  </Sec>
                ) : null}

                {/* The way in: Market first, the full read beside it. */}
                <tr>
                  <td className="wr3-cta" align="center" style={{ padding: '26px 28px 28px', background: P.paper, borderTop: `1px solid ${P.rule}`, textAlign: 'center' }}>
                    <table {...presentation} align="center" className="wr3-btns" style={{ ...T, margin: '0 auto' }}>
                      <tbody>
                        <tr>
                          <td className="wr3-btn" align="center" style={{ background: P.yellow, borderRadius: 8 }}>
                            <a href={`${appUrl}/dashboard/market`} style={{ display: 'inline-block', padding: '13px 24px', fontFamily: FONT.sans, fontSize: 15, fontWeight: 700, lineHeight: '18px', color: P.ink, textDecoration: 'none' }}>Open Market</a>
                          </td>
                          {fullUrl ? (
                            <>
                              <td className="wr3-gap" width={10} style={{ width: 10, fontSize: 1, lineHeight: '1px' }}>&nbsp;</td>
                              <td className="wr3-btn" align="center" style={{ background: P.paper, borderRadius: 8, border: `1px solid ${P.button}` }}>
                                <a href={fullUrl} style={{ display: 'inline-block', padding: '12px 22px', fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, lineHeight: '18px', color: P.ink, textDecoration: 'none' }}>Read this week in full</a>
                              </td>
                            </>
                          ) : null}
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style={{ padding: '16px 20px 8px', fontFamily: FONT.sans, fontSize: 12, lineHeight: '1.5', color: P.muted, textAlign: 'center' }}>
            {company ? `${company} · made with Verbatim · ` : 'Made with Verbatim · '}
            <a href={`${appUrl}/dashboard/studio`} style={{ color: P.ink, textDecoration: 'underline' }}>Who gets this</a>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

// =====================================================================================
// THE FULL READ (H7-Weekly-Full at 1040; -Print on A4)
// =====================================================================================

const SANS = "var(--font-plex-sans, 'IBM Plex Sans'), 'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const SERIF = "var(--font-plex-serif, 'IBM Plex Serif'), 'IBM Plex Serif', Georgia, serif"
const MONOP = "var(--font-plex-mono, 'IBM Plex Mono'), 'IBM Plex Mono', SFMono-Regular, Menlo, monospace"

/** A string as CSS writes it in `content:`: quoted, anything past printable
 *  ASCII (and the three characters HTML cares about) escaped, so a workspace
 *  name cannot end the stylesheet. */
export function cssString(s: string): string {
  // A hex escape swallows the one space after it, so each is followed by
  // one of its own and the text's spaces stay where they were.
  return `"${s.replace(/[^\x20-\x7E]|["\\<>&]/g, (c) => `\\${c.codePointAt(0)!.toString(16).padStart(6, '0')} `)}"`
}

/** The page's one stylesheet (the boards' own classes, prefixed). */
function pageCss(print: boolean, footer: string): string {
  const screen = `
.w3{background:${P.ground};font-family:${SANS};color:${P.ink};-webkit-font-smoothing:antialiased}
.w3 *{box-sizing:border-box}
.w3 a{color:${P.ink}}
.w3-sheet{max-width:1040px;margin:0 auto;padding:22px 40px 48px;display:flex;flex-direction:column;gap:20px}
.w3-brow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:16px;border-bottom:1px solid ${P.edge}}
.w3-bl{display:flex;align-items:center;gap:10px}
.w3-mark{width:24px;height:24px;border-radius:6px;background:${P.yellow};display:flex;align-items:center;justify-content:center;flex:0 0 24px}
.w3-word{font-size:17px;font-weight:700;letter-spacing:-0.01em}
.w3-co{font-size:13px;color:${P.muted};padding-left:10px;margin-left:2px;border-left:1px solid ${P.edge}}
.w3-br{font-family:${MONOP};font-size:12.5px;color:${P.muted}}
.w3-ttl{margin:2px 0 0;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-0.015em}
.w3-meta{margin:6px 0 0;font-family:${MONOP};font-size:12.5px;line-height:1.5;color:${P.muted}}
.w3-card{background:${P.paper};border-radius:16px;box-shadow:0 1px 2px rgba(38,41,44,.06),0 4px 14px rgba(38,41,44,.06),0 12px 32px rgba(38,41,44,.04);padding:24px 26px;display:flex;flex-direction:column;gap:16px;min-width:0}
.w3-week{gap:18px;padding:28px 30px 26px}
.w3-chead{display:flex;align-items:flex-start;gap:12px}
.w3-chead.c{align-items:center}
.w3-itile{width:28px;height:28px;border-radius:7px;background:${P.pale};color:${P.orange};display:flex;align-items:center;justify-content:center;flex:0 0 28px}
.w3-itile svg{width:16px;height:16px}
.w3-eb{margin:0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${P.orange}}
.w3-whead{margin:0;font-size:26px;line-height:1.32;font-weight:600;letter-spacing:-0.015em;max-width:900px}
.w3-wcols{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:44px;border-top:1px solid ${P.rule};padding-top:20px}
.w3-wcol{display:flex;flex-direction:column;gap:14px;min-width:0}
.w3-dl{margin:0;font-size:11.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${P.muted}}
.w3-gap{margin-top:14px}
.w3-read{margin:0;font-size:15.5px;line-height:1.62}
.w3-items{display:flex;flex-direction:column;margin-top:-2px}
.w3-items p{margin:0;font-size:15px;line-height:1.55;padding:11px 0;border-top:1px solid ${P.rule}}
.w3-items p:first-child{border-top:0;padding-top:0}
.w3-nothing{margin:0;font-size:15px;color:${P.muted}}
.w3-q{background:${P.ground};border-radius:10px;padding:13px 15px;display:flex;flex-direction:column;gap:6px}
.w3-qt{margin:0;font-family:${SERIF};font-style:italic;font-size:15px;line-height:1.5}
.w3-qen{margin:0;font-family:${SERIF};font-size:13.5px;line-height:1.5;color:${P.muted}}
.w3-qsrc{font-size:12px;color:${P.muted}}
.w3-sec{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:0 2px;margin-top:14px}
.w3-sec h2{margin:0;font-size:19px;line-height:1.3;font-weight:600;letter-spacing:-0.005em}
.w3-note{margin:0;font-size:12.5px;color:${P.muted}}
.w3-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:20px}
.w3-news{grid-column:span 4}
.w3-scard{grid-column:span 6;gap:12px}
.w3-pcard{grid-column:span 6;gap:16px}
.w3-wide{grid-column:span 12}
.w3-ct{margin:4px 0 0;font-size:17px;line-height:1.3;font-weight:600;letter-spacing:-0.005em}
.w3-csub{margin:2px 0 0;font-size:13px;line-height:1.4;color:${P.muted}}
.w3-nf{margin:6px 0 0;font-family:${MONOP};font-size:12.5px;line-height:1.5;color:${P.muted};font-variant-numeric:tabular-nums}
.w3-nf b{font-weight:500;color:${P.ink}}
.w3-nw{white-space:nowrap}
.w3-chip{display:inline-flex;align-items:center;font-size:12px;font-weight:600;line-height:1;padding:5px 8px;border-radius:999px;background:${P.fill};color:${P.ink};white-space:nowrap}
.w3-chip.s{font-size:11px;padding:4px 7px;margin-left:6px}
.w3-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:auto}
.w3-foot.r{justify-content:flex-end}
.w3-olink{font-size:13.5px;font-weight:600;color:${P.orange} !important;text-decoration:none}
.w3-when{font-size:12.5px;color:${P.muted}}
.w3-shead{margin:0;font-size:20px;line-height:1.32;font-weight:600;letter-spacing:-0.01em}
.w3-sread{margin:0;font-size:15px;line-height:1.6;color:${P.ink2}}
.w3-sthin{margin:0;font-size:15px;line-height:1.55;color:${P.muted}}
.w3-ctitle{margin:0;font-size:17px;line-height:1.3;font-weight:600;letter-spacing:-0.005em}
.w3-big{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:8px}
.w3-big a{font-size:22px;font-weight:600;letter-spacing:-0.01em;text-decoration:none}
.w3-big .m{font-family:${MONOP};font-size:13px;color:${P.ink2};white-space:nowrap}
.w3-bar{position:relative;height:10px;border-radius:5px;background:${P.rule};margin-top:10px;overflow:hidden}
.w3-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:${P.yellow}}
.w3-one{margin:0;font-size:14.5px;line-height:1.55;color:${P.ink2}}
.w3-tags{display:flex;flex-wrap:wrap;gap:6px}
.w3-tag{display:inline-block;font-size:12px;line-height:1.3;background:${P.ground};color:${P.ink};border-radius:6px;padding:3px 8px;white-space:nowrap}
.w3-tbl{width:100%;border-collapse:collapse;font-size:14px}
.w3-tbl th{text-align:left;font-size:11.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${P.muted};padding:0 12px 10px 0;border-bottom:1px solid ${P.edge};white-space:nowrap}
.w3-tbl td{padding:9px 12px 9px 0;border-bottom:1px solid ${P.rule};vertical-align:middle}
.w3-tbl tr:last-child td{border-bottom:0}
.w3-tbl .r{text-align:right;padding-right:0}
.w3-tbl td.r{font-family:${MONOP};font-variant-numeric:tabular-nums;font-size:13px}
.w3-tbl td.mu{color:${P.muted};white-space:nowrap}
.w3-tbl a{text-decoration:none;font-weight:500}
.w3-cats{display:flex;flex-direction:column;gap:8px}
.w3-rrow{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) 34px;gap:10px;align-items:center;font-size:13.5px}
.w3-rtrack{position:relative;height:8px;border-radius:4px;background:${P.rule};overflow:hidden}
.w3-rtrack i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:${P.yellow}}
.w3-rnum{font-family:${MONOP};font-variant-numeric:tabular-nums;font-size:12.5px;text-align:right}
.w3-ideas{display:flex;flex-direction:column}
.w3-idea{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;align-items:start;padding:11px 0;border-top:1px solid ${P.rule}}
.w3-idea:first-child{border-top:0;padding-top:2px}
.w3-idea a{font-size:15.5px;line-height:1.4;font-weight:600;text-decoration:none}
.w3-num{width:22px;height:22px;border-radius:11px;background:${P.num};color:${P.paper};font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.w3-med{margin:0;font-size:13px;line-height:1.5;color:${P.muted}}
.w3-reply{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;background:${P.ground};border-radius:10px;padding:13px 15px;text-decoration:none}
.w3-reply .t{margin:0;font-size:14.5px;font-weight:600}
.w3-reply .s{margin:2px 0 0;font-size:12.5px;color:${P.muted}}
.w3-adv{display:flex;flex-direction:column}
.w3-adv a{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid ${P.rule};text-decoration:none;font-size:14.5px;line-height:1.42;font-weight:500}
.w3-adv a:first-child{border-top:0;padding-top:2px}
.w3-adv .w{flex:0 0 auto;font-family:${MONOP};font-size:12px;color:${P.muted};white-space:nowrap;padding-top:2px;text-align:right}
.w3-move{background:${P.ground};border-radius:10px;padding:13px 15px;display:flex;flex-direction:column;gap:4px;text-decoration:none}
.w3-move .l{font-size:11.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${P.orange}}
.w3-move .t{font-size:14.5px;font-weight:600;line-height:1.4}
.w3-move .f{font-family:${MONOP};font-size:12.5px;line-height:1.5;color:${P.muted}}
.w3-verd{display:inline-block;font-family:${SANS};font-size:12px;font-weight:600;color:${P.ink2};background:${P.rule};border-radius:999px;padding:3px 8px;white-space:nowrap}
.w3-close{display:flex;align-items:center;justify-content:space-between;gap:12px;background:${P.close};border:1px solid ${P.closeEdge};border-radius:12px;padding:14px 18px;text-decoration:none}
.w3-close .t{display:block;margin-top:4px;font-size:15px;line-height:1.4;font-weight:600}
.w3-arr{color:${P.orange};font-weight:600}
.w3-end{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:18px 2px 0;border-top:1px solid ${P.edge}}
.w3-end .l{display:flex;align-items:center;gap:16px}
.w3-fine{font-size:12.5px;color:${P.muted}}
.w3-btn{display:inline-block;background:${P.yellow};color:${P.ink} !important;text-decoration:none;font-size:13.5px;font-weight:600;border-radius:8px;padding:9px 18px;line-height:22px}
.w3-bar2{display:flex;flex-direction:column;gap:2px}
@media (max-width:1000px){.w3-news{grid-column:span 12}.w3-scard,.w3-pcard{grid-column:span 12}}
@media (max-width:760px){.w3-sheet{padding:16px 16px 40px}.w3-wcols{grid-template-columns:minmax(0,1fr);gap:24px}.w3-whead{font-size:21px}.w3-ttl{font-size:24px}.w3-sec{flex-direction:column;gap:2px}.w3-brow{flex-wrap:wrap}}
`
  if (!print) return screen
  // THE PAPER (H7-Weekly-Full-Print): the same parts, flat (no card shadow),
  // hairlines between parts, each group on a new page, every page footed
  // with the issue and its page.
  return `${screen}
@page{size:210mm 297mm;margin:14mm 15mm 18mm;
@bottom-left{content:${cssString(footer)};font-family:'IBM Plex Sans',-apple-system,sans-serif;font-size:8pt;color:${P.muted}}
@bottom-right{content:counter(page) " of " counter(pages);font-family:'IBM Plex Mono',monospace;font-size:8pt;color:${P.muted}}}
.w3.w3-print{background:${P.paper}}
@media print{html,body{background:${P.paper} !important}}
.w3-print .w3-sheet{max-width:none;padding:0;gap:14px}
.w3-print .w3-card{box-shadow:none;border-radius:0;padding:0;gap:12px}
.w3-print .w3-group{break-before:page}
.w3-print .w3-ttl{font-size:22px}
.w3-print .w3-whead{font-size:19px;font-weight:700;line-height:1.35}
.w3-print .w3-read{font-size:12.5px;line-height:1.6}
.w3-print .w3-items p{font-size:12px;line-height:1.55;padding:8px 0}
.w3-print .w3-qt{font-size:12px}
.w3-print .w3-hr{border-top:1px solid ${P.edge};margin:4px 0}
.w3-print .w3-sec{margin-top:0}
.w3-print .w3-sec h2{font-size:16px}
.w3-print .w3-shead{font-size:13px;font-weight:700}
.w3-print .w3-sread,.w3-print .w3-sthin{font-size:11.5px;line-height:1.55}
.w3-print .w3-subj{padding:10px 0;border-top:1px solid ${P.rule};display:flex;flex-direction:column;gap:4px;break-inside:avoid}
.w3-print .w3-subj:first-of-type{border-top:0}
.w3-print .w3-prow{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:8px 0;border-top:1px solid ${P.rule};break-inside:avoid}
.w3-print .w3-prow:first-child{border-top:0}
.w3-print .w3-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}
.w3-print .w3-pc{display:flex;flex-direction:column;gap:8px;min-width:0;break-inside:avoid}
.w3-print .w3-ctitle{font-size:13.5px}
.w3-print .w3-tbl{font-size:11.5px}
.w3-print .w3-idea a,.w3-print .w3-adv a{font-size:12px}
.w3-print .w3-q{break-inside:avoid}
.w3-print .w3-nothing{font-size:12px}
.w3-print .w3-sec{flex-direction:column;align-items:flex-start;gap:2px;margin-bottom:6px}
.w3-print .w3-big{margin-top:6px}
.w3-print .w3-big a{font-size:14px}
.w3-print .w3-big .m{font-size:11px}
.w3-print .w3-one{font-size:11.5px;line-height:1.5}
.w3-print .w3-tag{font-size:10.5px;background:none;padding:0}
.w3-print .w3-tags{gap:4px 10px}
.w3-print .w3-csub{font-size:11px}
.w3-print .w3-dl{font-size:10px}
.w3-print .w3-num{width:18px;height:18px;font-size:10.5px}
.w3-print .w3-idea{grid-template-columns:22px minmax(0,1fr);padding:7px 0}
.w3-print .w3-med{font-size:11px}
.w3-print .w3-reply{background:none;padding:0}
.w3-print .w3-reply .t{font-size:12px}
.w3-print .w3-reply .s{font-size:11px}
.w3-print .w3-adv a{padding:7px 0}
.w3-print .w3-adv .w{font-size:10.5px}
.w3-print .w3-tbl td{padding:6px 10px 6px 0}
.w3-print .w3-tbl td.r{font-size:11px}
.w3-print .w3-rrow{font-size:11.5px}
.w3-print .w3-move{background:none;padding:0}
.w3-print .w3-move .t{font-size:12px}
.w3-print .w3-move .f{font-size:10.5px}
.w3-print .w3-end{font-size:11px}
.w3-print .w3-fine{font-size:10.5px}
`
}

/** The boards' card icons (lucide's, 24-unit, stroked). */
const ICON: Record<string, ReactNode> = {
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  talk: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M13 8H7" /><path d="M17 12H7" /></>,
  bars: <><path d="M3 3v18h18" /><path d="M8 17V11M13 17V7M18 17v-4" /></>,
  spark: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
  trend: <><path d="M22 7 13.5 15.5 8.5 10.5 2 17" /><path d="M16 7h6v6" /></>,
  voices: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  products: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7 12 12l8.7-5" /><path d="M12 22V12" /></>,
  content: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m10 8 6 4-6 4Z" /></>,
  moves: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
}

const Icon = ({ name }: { name: keyof typeof ICON }) => (
  <div className="w3-itile" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{ICON[name]}</svg>
  </div>
)

/** A quote under its paragraph, as Market's week page places it. */
function QuotePanel({ q }: { q: ResolvedQuote }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const label = translationLabel(note)
  const cite = [q.platform ? platformLabel(q.platform) : null, q.date ? shortDate(`${q.date.slice(0, 10)}T12:00:00.000Z`) : null].filter(Boolean).join(' · ')
  return (
    <div className="w3-q">
      <p data-copy="quote" className="w3-qt">“{q.text}”</p>
      {label ? <span className="w3-qsrc">{label}</span> : null}
      {note.english ? <p className="w3-qen">{note.english}</p> : null}
      {cite ? <span className="w3-qsrc">{cite}</span> : null}
    </div>
  )
}

/** "12 to 18 October · 146 videos · 4,180 comments this week · 434 videos
 *  and 11,178 comments in October so far". */
function Meta({ v }: { v: WeeklyV3View }) {
  const n = v.numbers
  return (
    <p className="w3-meta">
      {v.dates}
      {n ? (
        <>
          {v.dates ? ' · ' : null}<N n={n.week.videos} /> videos{n.week.comments != null ? <> · <N n={n.week.comments} /> comments</> : null} this week · <N n={n.month.videos} /> videos{n.month.comments != null ? <> and <N n={n.month.comments} /> comments</> : null} {v.where}
        </>
      ) : null}
    </p>
  )
}

/** The week card's right column: what it means, new this week, worth
 *  watching. */
function WeekRight({ v }: { v: WeeklyV3View }) {
  return (
    <>
      {v.means.length > 0 ? (
        <>
          <p className="w3-dl">What it means</p>
          <div className="w3-items">{v.means.map((m, i) => <Prose key={i} body={m} figures={v.figures} />)}</div>
        </>
      ) : null}
      <p className={`w3-dl${v.means.length > 0 ? ' w3-gap' : ''}`}>New this week</p>
      {v.fresh.length > 0
        ? <div className="w3-items">{v.fresh.map((m, i) => <Prose key={i} body={m} figures={v.figures} />)}</div>
        : <p className="w3-nothing"><span data-copy="verdict">Nothing new this week.</span></p>}
      {v.watch.length > 0 ? (
        <>
          <p className="w3-dl w3-gap">Worth watching</p>
          <div className="w3-items">{v.watch.map((m, i) => <Prose key={i} body={m} figures={v.figures} />)}</div>
        </>
      ) : null}
    </>
  )
}

/** What happened: each paragraph, its quote under it. */
function Story({ v }: { v: WeeklyV3View }) {
  if (v.story.length === 0) return null
  return (
    <>
      <p className="w3-dl">What happened</p>
      {v.story.map((p, i) => (
        <Fragment key={i}>
          <Prose className="w3-read" body={p.body} figures={v.figures} />
          {p.quote ? <QuotePanel q={p.quote} /> : null}
        </Fragment>
      ))}
    </>
  )
}

/** The market's week beside its month, two cells (the paper's numbers band). */
function NumbersBand({ v }: { v: WeeklyV3View }) {
  const n = v.numbers
  if (!n) return null
  const cell = (label: string, x: { videos: number; comments: number | null }, ruled: boolean) => (
    <div style={{ flex: 1, padding: '12px 16px', borderLeft: ruled ? `1px solid ${P.edge}` : undefined }}>
      <p className="w3-dl" style={{ fontSize: 10.5 }}>{label}</p>
      <div style={{ marginTop: 8, fontFamily: MONOP, fontSize: 22, lineHeight: 1, fontWeight: 500, letterSpacing: '-.02em' }}><N n={x.videos} /><span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 500, letterSpacing: 0, marginLeft: 6 }}>videos</span></div>
      {x.comments != null ? <div style={{ marginTop: 6, fontSize: 11.5, color: P.ink2 }}><N n={x.comments} /> comments</div> : null}
    </div>
  )
  return (
    <div style={{ display: 'flex', background: P.ground, borderRadius: 10, breakInside: 'avoid' }}>
      {cell(v.dates ? `This week · ${shortDays(v.dates)}` : 'This week', n.week, false)}
      {cell(v.monthCell, n.month, true)}
    </div>
  )
}

/** "12 to 18 Oct" from "12 to 18 October" (the paper's cell label). */
const shortDays = (dates: string): string => dates.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g, (m) => m.slice(0, 3))

/** The month-closing line, as a slim card. */
function CloseCard({ v, appUrl }: { v: WeeklyV3View; appUrl: string }) {
  const c = v.monthClose
  if (!c) return null
  return (
    <a className="w3-close" href={`${appUrl}${c.href}`}>
      <span><span className="w3-eb">The month’s long-run read</span><span className="t">{longMonthOf(c.month)}’s read, “{c.title}”, is on Market › This month</span></span>
      <span className="w3-arr" aria-hidden="true">→</span>
    </a>
  )
}

/** A stood-out card (screen) or row (paper). */
function NewsCard({ r, appUrl, figures, print }: { r: StoodOutRow; appUrl: string; figures: FigureTable; print: boolean }) {
  const icon: keyof typeof ICON = r.chip ? 'trend' : r.eyebrow?.verdict ? 'spark' : r.lead ? 'talk' : 'bars'
  const eyebrow = r.chip
    ? <span data-copy="verdict" className="w3-chip">{r.chip}</span>
    : r.eyebrow ? <p className="w3-eb">{r.eyebrow.verdict ? <span data-copy="verdict">{r.eyebrow.text}</span> : r.eyebrow.text}{print && r.sub ? <> · {r.sub}</> : null}</p> : null
  const figure = <p className="w3-nf"><RowFigure figure={r.figure} bold={{ fontWeight: 500, color: P.ink }} /></p>
  if (print) {
    return (
      <div className="w3-prow">
        <div>{eyebrow}<div style={{ fontSize: 12.5, marginTop: 2 }}><RowName row={r} figures={figures} /></div></div>
        <div style={{ textAlign: 'right' }}>{figure}</div>
      </div>
    )
  }
  return (
    <article className="w3-card w3-news">
      <div className="w3-chead">
        <Icon name={icon} />
        <div style={{ minWidth: 0 }}>
          {eyebrow}
          <h3 className="w3-ct"><RowName row={r} figures={figures} /></h3>
          {r.sub ? <p className="w3-csub">{r.sub}</p> : null}
          {figure}
        </div>
      </div>
      <div className="w3-foot r"><a className="w3-olink" href={`${appUrl}${r.href}`}>Open →</a></div>
    </article>
  )
}

/** A subject's card (screen) or block (paper): its name, its headline, what
 *  it means in full. */
function SubjectCard({ s, v, appUrl, print }: { s: WeeklySubjectRead; v: WeeklyV3View; appUrl: string; print: boolean }) {
  const body = (
    <>
      <p className="w3-eb">{s.name}</p>
      {s.headline ? <Prose as="h3" copy="stored" className="w3-shead" body={s.headline} figures={v.figures} /> : null}
      {s.status === 'thin'
        ? (s.line ? <Prose copy="stored" className="w3-sthin" body={s.line} figures={v.figures} /> : null)
        : (s.means ? <Prose copy="stored" className="w3-sread" body={s.means} figures={v.figures} /> : null)}
    </>
  )
  if (print) return <div className="w3-subj">{body}</div>
  return (
    <article className="w3-card w3-scard">
      {body}
      <div className="w3-foot"><span className="w3-when">{v.monthGroup}</span><a className="w3-olink" href={`${appUrl}${s.href}`}>Open →</a></div>
    </article>
  )
}

/** "October so far · your six subjects". */
function subjectsNote(v: WeeklyV3View): string {
  const n = v.subjects.length
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  const count = n === 1 ? 'your subject' : `your ${words[n] ?? fmtInt(n)} subjects`
  return `${v.monthGroup} · ${count}`
}

/** The Voices card: the group in the most videos, its share of the month's
 *  videos as a bar, its one-liner, the other groups, the brands named most. */
function VoicesCard({ part, sectionMonth, appUrl, print, wide = false }: { part: WeeklyVoicesPart; sectionMonth: string; appUrl: string; print: boolean; wide?: boolean }) {
  const g = part.group!
  const share = part.videos ? Math.max(2, Math.min(100, Math.round((g.videos / part.videos) * 1000) / 10)) : null
  // A whole-month reading: its month, labelled where it is not the current
  // one (decision 3); the section's own words where it is the read's month.
  const month = sameMonth(part.month, sectionMonth) ? part.monthWords : barMonth(part.monthWords, part.monthLabel)
  return (
    <article className={print ? 'w3-pc' : `w3-card w3-pcard${wide ? ' w3-wide' : ''}`}>
      <div className="w3-chead">
        {print ? null : <Icon name="voices" />}
        <div><h3 className="w3-ctitle">Voices</h3><p className="w3-csub">{print ? `${month} · in the most videos` : `The groups in your market, ${month}`}</p></div>
      </div>
      <div>
        {print ? null : <p className="w3-dl">In the most videos</p>}
        <div className="w3-big">
          <a href={`${appUrl}${g.href}`}><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></a>
          <span className="m">{part.videos ? <><N n={g.videos} /> of <N n={part.videos} /> videos</> : <><N n={g.videos} /> {g.videos === 1 ? 'video' : 'videos'}</>}</span>
        </div>
        {share != null && !print ? <div className="w3-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></div> : null}
      </div>
      {g.oneLiner ? <p className="w3-one"><span data-copy="subject" data-slot="pass_e_persona">{g.oneLiner}</span></p> : null}
      {part.others.length > 0 ? (
        <div>
          <p className="w3-dl" style={{ marginBottom: 8 }}>The other groups</p>
          <div className="w3-tags">{part.others.map((o) => <span key={o} className="w3-tag"><span data-copy="subject" data-slot="pass_e_persona">{o}</span></span>)}</div>
        </div>
      ) : null}
      {part.named.length > 0 ? (
        <div>
          <p className="w3-dl" style={{ marginBottom: 4 }}>Named most, unprompted</p>
          <div className="w3-adv">
            {part.named.map((b) => (
              <a key={b.href} href={`${appUrl}${b.href}`}><span>{b.label}</span><span className="w"><N n={b.k} /> of <N n={b.n} /> videos</span></a>
            ))}
          </div>
        </div>
      ) : null}
      {print ? null : <div className="w3-foot r"><a className="w3-olink" href={`${appUrl}${part.href}`}>Open Voices →</a></div>}
    </article>
  )
}

/** The Your products card: the table of the products that came up, and the
 *  categories' videos. */
function ProductsCard({ part, appUrl, print, monthWords, wide = false }: { part: WeeklyProductsPart; appUrl: string; print: boolean; monthWords: string; wide?: boolean }) {
  const max = Math.max(1, ...part.categories.map((c) => c.videos))
  const table = part.top.length > 0 ? (
    <table className="w3-tbl">
      <thead><tr><th>Product</th><th>Category</th><th className="r">Videos</th></tr></thead>
      <tbody>
        {part.top.map((p) => (
          <tr key={p.id}>
            <td><a href={`${appUrl}${p.href}`}>{p.name}</a>{p.first ? <span data-copy="verdict" className="w3-chip s">{FIRST_TIME}</span> : null}</td>
            <td className="mu">{p.category}</td>
            <td className="r"><N n={p.videos} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : null
  const cats = part.categories.length > 0 ? (
    <div>
      {print ? null : <p className="w3-dl" style={{ marginBottom: 10 }}>Videos about each category, a product named or not</p>}
      <div className="w3-cats">
        {part.categories.map((c) => (
          <div key={c.id} className="w3-rrow">
            <span>{c.name}</span>
            <div className="w3-rtrack" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.round((c.videos / max) * 100))}%` }} /></div>
            <span className="w3-rnum"><N n={c.videos} /></span>
          </div>
        ))}
      </div>
    </div>
  ) : null
  const sub = (
    <p className="w3-csub">
      {monthWords}{part.products > 0 ? <> · <ProductsLead part={part} /></> : null}
    </p>
  )
  if (print) {
    return (
      <>
        <article className="w3-pc"><h3 className="w3-ctitle">Your products</h3>{sub}{table}</article>
        {cats ? <article className="w3-pc" data-part="categories"><h3 className="w3-ctitle">Videos about each category</h3><p className="w3-csub">A product named or not, {monthWords}</p>{cats}</article> : null}
      </>
    )
  }
  return (
    <article className={`w3-card w3-pcard${wide ? ' w3-wide' : ''}`}>
      <div className="w3-chead"><Icon name="products" /><div><h3 className="w3-ctitle">Your products</h3>{sub}</div></div>
      {table}
      {cats}
      <div className="w3-foot r"><a className="w3-olink" href={`${appUrl}${part.href}`}>Open Your products →</a></div>
    </article>
  )
}

/** The Content card: what to post next (or the question asked most), the
 *  medical team line once, Worth a reply. */
function ContentCard({ part, appUrl, print, medical, wide = false }: { part: WeeklyContentPart; appUrl: string; print: boolean; medical: boolean; wide?: boolean }) {
  const ideas = part.ideas
  const q = part.asked
  const title = ideas.length > 0 ? 'What to post next' : q ? 'Asked most, and not yet in your posts' : 'Content'
  const sub = ideas.length > 0 && part.read ? `From questions asked ${part.read}` : null
  return (
    <article className={print ? 'w3-pc' : `w3-card w3-pcard${wide ? ' w3-wide' : ''}`}>
      <div className="w3-chead">{print ? null : <Icon name="content" />}<div><h3 className="w3-ctitle">{title}</h3>{sub ? <p className="w3-csub">{sub}</p> : null}</div></div>
      {ideas.length > 0 ? (
        <div className="w3-ideas">
          {ideas.map((x, i) => (
            <div key={x.id} className="w3-idea"><span data-copy="figure" className="w3-num">{i + 1}</span><a href={`${appUrl}${x.href}`}><span data-copy="prose">{x.title}</span></a></div>
          ))}
        </div>
      ) : q ? (
        <div>
          <a href={`${appUrl}${q.href}`} style={{ fontSize: 15.5, fontWeight: 600, textDecoration: 'none' }}><span data-copy="subject" data-slot="pass_b_theme">{q.label}</span></a>
          {q.week != null ? <p className="w3-nf"><b><N n={q.week} /></b> {q.week === 1 ? 'video' : 'videos'} {q.weekWords}{q.month != null ? <> · <b><N n={q.month} /></b> {q.monthWords}</> : null}</p> : null}
        </div>
      ) : null}
      {ideas.length > 0 && (part.medical || medical) ? <p className="w3-med">{MEDICAL_LINE}</p> : null}
      <a className="w3-reply" href={`${appUrl}${part.replies.href}`}>
        <div><p className="t">Worth a reply</p><p className="s">{part.replies.days ? `Comments written ${part.replies.days} worth an answer from you` : 'The comments worth an answer from you'}</p></div>
        {print ? null : <span className="w3-olink" style={{ whiteSpace: 'nowrap' }}>Open the replies →</span>}
      </a>
      {print ? null : <div className="w3-foot r"><a className="w3-olink" href={`${appUrl}${part.href}`}>Open Content →</a></div>}
    </article>
  )
}

/** The Your moves card: the advice waiting, and the move's one comparison. */
function MovesCard({ part, appUrl, print, wide = false }: { part: WeeklyMovesPart; appUrl: string; print: boolean; wide?: boolean }) {
  const n = part.waiting
  return (
    <article className={print ? 'w3-pc' : `w3-card w3-pcard${wide ? ' w3-wide' : ''}`}>
      <div className="w3-chead">
        {print ? null : <Icon name="moves" />}
        <div>
          <h3 className="w3-ctitle">Advice to decide on</h3>
          {n > 0 ? <p className="w3-csub"><N n={n} /> {n === 1 ? 'piece of advice waiting' : 'pieces of advice waiting'} for a decision</p> : null}
        </div>
      </div>
      {part.advice.length > 0 ? (
        <div className="w3-adv">
          {part.advice.map((a) => (
            <a key={a.href} href={`${appUrl}${a.href}`}><span><AdviceTitle a={a} /></span>{a.since ? <span className="w">first raised {shortDate(`${a.since.slice(0, 10)}T12:00:00.000Z`)}</span> : a.figure ? <span className="w" data-copy="figure">{a.figure}</span> : null}</a>
          ))}
        </div>
      ) : null}
      {part.move ? (
        <a className="w3-move" href={`${appUrl}${part.move.href}`}>
          <span className="l">After your move</span>
          <span className="t"><span data-copy="quote">{part.move.title}</span>, dated {shortDate(`${part.move.day}T12:00:00.000Z`)}</span>
          <span className="f"><MoveLineFull move={part.move} /></span>
        </a>
      ) : null}
      {print ? null : <div className="w3-foot"><a className="w3-olink" href={`${appUrl}${part.recordHref}`}>The advice record →</a><a className="w3-olink" href={`${appUrl}${part.href}`}>Open Your moves →</a></div>}
    </article>
  )
}

function MoveLineFull({ move }: { move: NonNullable<WeeklyMovesPart['move']> }) {
  const words = moveVerdictWords(move.verdict)
  return (
    <>
      {move.label ? <>{move.kind === 'subject' ? <span data-copy="quote">{move.label}</span> : <span data-copy="subject" data-slot="pass_b_theme">{move.label}</span>}: </> : null}
      <b style={{ fontWeight: 500, color: P.ink }}><N n={move.before.k} /></b> of <N n={move.before.n} /> videos in {move.months.before}, against <b style={{ fontWeight: 500, color: P.ink }}><N n={move.after.k} /></b> of <N n={move.after.n} /> in {move.months.after}
      {words ? <> · <span data-copy="verdict" className="w3-verd">{words}</span></> : null}
    </>
  )
}

/** The full read: the share page (`fill`), the viewer and, with `print`, the
 *  A4 paper. */
export function WeeklyV3Page({ data, appUrl, print = false, fill = false, medical = false }: { data: WeeklyReadSnapshotData; appUrl: string; print?: boolean; fill?: boolean; medical?: boolean }) {
  const v = weeklyV3View({ read: data.read, subjects: data.subjects, pages: data.pages, monthClose: data.monthClose, chipOf, full: true })
  const company = data.company
  const footer = [company, WEEKLY_READ_TITLE, v.dates].filter(Boolean).join(' · ')
  const voices = v.pages.voices && v.pages.voices.group ? v.pages.voices : null
  const products = v.pages.products ?? null
  const content = v.pages.content ?? null
  const moves = v.pages.moves ?? null
  const productsMonth = products ? (sameMonth(products.month, data.read.month) ? products.monthWords : barMonth(products.monthWords, products.monthLabel)) : ''
  // Two to a row; an odd last card takes the row (screen only).
  const makers = [
    voices ? (wide: boolean) => <VoicesCard key="voices" part={voices} sectionMonth={data.read.month} appUrl={appUrl} print={print} wide={wide} /> : null,
    products ? (wide: boolean) => <ProductsCard key="products" part={products} appUrl={appUrl} print={print} monthWords={productsMonth} wide={wide} /> : null,
    content ? (wide: boolean) => <ContentCard key="content" part={content} appUrl={appUrl} print={print} medical={medical} wide={wide} /> : null,
    moves ? (wide: boolean) => <MovesCard key="moves" part={moves} appUrl={appUrl} print={print} wide={wide} /> : null,
  ].filter((c): c is (wide: boolean) => ReactElement => c != null)
  const cards = makers.map((make, i) => make(i === makers.length - 1 && makers.length % 2 === 1))
  const read = `Read ${shortDate(data.readingAt)}`
  const brow = (
    <div className="w3-brow">
      <div className="w3-bl">
        <div className="w3-mark" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12"><path d={DITTO} fill={P.ink} /></svg></div>
        <span className="w3-word">Verbatim</span>
        {company ? <span className="w3-co">{company}</span> : null}
      </div>
      <span className="w3-br">{fill ? `${read} · shared from Verbatim` : read}</span>
    </div>
  )
  const also = v.stoodOut.length > 0 ? (
    <>
      <div className="w3-sec"><h2>Also this week</h2>{print ? null : <span className="w3-note">What stood out in this week’s conversations</span>}</div>
      {print
        ? <div>{v.stoodOut.map((r) => <NewsCard key={r.key} r={r} appUrl={appUrl} figures={v.figures} print />)}</div>
        : <div className="w3-grid">{v.stoodOut.map((r) => <NewsCard key={r.key} r={r} appUrl={appUrl} figures={v.figures} print={false} />)}</div>}
    </>
  ) : null
  const subjects = v.subjects.length > 0 ? (
    <div className={print ? 'w3-group' : undefined} style={print ? undefined : { display: 'contents' }}>
      <div className="w3-sec"><h2>What the market is talking about</h2><span className="w3-note">{subjectsNote(v)}</span></div>
      {print
        ? <div style={{ marginTop: 8 }}>{v.subjects.map((s) => <SubjectCard key={s.id} s={s} v={v} appUrl={appUrl} print />)}</div>
        : <div className="w3-grid">{v.subjects.map((s) => <SubjectCard key={s.id} s={s} v={v} appUrl={appUrl} print={false} />)}</div>}
    </div>
  ) : null
  const pages = cards.length > 0 ? (
    <div className={print ? 'w3-group' : undefined} style={print ? undefined : { display: 'contents' }}>
      <div className="w3-sec"><h2>Across your pages</h2><span className="w3-note">Each opens its page in Verbatim</span></div>
      {print
        ? <PrintPages voices={voices} products={products} content={content} moves={moves} v={v} appUrl={appUrl} medical={medical} productsMonth={productsMonth} />
        : <div className="w3-grid">{cards}</div>}
    </div>
  ) : null

  return (
    <div className={`w3${print ? ' w3-print' : ''}`} style={{ minHeight: fill ? '100vh' : undefined }}>
      <style dangerouslySetInnerHTML={{ __html: pageCss(print, footer) }} />
      <div className="w3-sheet">
        {brow}
        {print ? (
          <>
            {/* PAGE 1: the week, its numbers, what happened. */}
            <div>
              <h1 className="w3-ttl">{WEEKLY_READ_TITLE}</h1>
              {v.dates ? <p className="w3-meta">{v.dates}</p> : null}
            </div>
            <div className="w3-hr" />
            {v.line ? <div><p className="w3-eb">The week in one line</p><Prose as="h2" className="w3-whead" body={v.line} figures={v.figures} style={{ marginTop: 8 }} /></div> : null}
            <NumbersBand v={v} />
            <CloseCard v={v} appUrl={appUrl} />
            {v.story.length > 0 ? <><div className="w3-hr" /><div className="w3-wcol"><Story v={v} /></div></> : null}
            {/* PAGE 2: what it means, new, worth watching, also this week. */}
            <div className="w3-group w3-wcol">
              <WeekRight v={v} />
              {also ? <><div className="w3-hr" />{also}</> : null}
            </div>
            {/* PAGE 3: the subjects in full. PAGE 4: across your pages. */}
            {subjects}
            {pages}
          </>
        ) : (
          <>
            <div><h1 className="w3-ttl">{WEEKLY_READ_TITLE}</h1><Meta v={v} /></div>
            <section className="w3-card w3-week">
              <div className="w3-chead c"><Icon name="calendar" /><p className="w3-eb">{v.dates ? `This week · ${v.dates}` : 'This week'}</p></div>
              {v.line ? <Prose as="h2" className="w3-whead" body={v.line} figures={v.figures} /> : null}
              <div className="w3-wcols">
                <div className="w3-wcol"><Story v={v} /></div>
                <div className="w3-wcol"><WeekRight v={v} /></div>
              </div>
            </section>
            <CloseCard v={v} appUrl={appUrl} />
            {also}
            {subjects}
            {pages}
          </>
        )}
        <div className="w3-end">
          {print ? (
            <div className="w3-bar2">
              <span style={{ fontSize: 12 }}>Open this week in Verbatim: <span style={{ fontFamily: MONOP }}>{`${appUrl.replace(/^https?:\/\//, '')}/dashboard/market`}</span></span>
              <span className="w3-fine">Every section above opens its page there: a subject, a conversation, a group, a product, an idea, a piece of advice.</span>
            </div>
          ) : (
            <div className="l"><a className="w3-btn" href={`${appUrl}/dashboard/market`}>Open Market</a><a className="w3-olink" href={`${appUrl}/dashboard/studio`}>Who gets this</a></div>
          )}
          <span className="w3-fine">{company ? `${company} · made with Verbatim` : 'Made with Verbatim'}</span>
        </div>
      </div>
    </div>
  )
}

/** Across your pages on paper: Voices beside Your products, what to post
 *  next beside the categories, then the advice across. */
function PrintPages({ voices, products, content, moves, v, appUrl, medical, productsMonth }: {
  voices: WeeklyVoicesPart | null
  products: WeeklyProductsPart | null
  content: WeeklyContentPart | null
  moves: WeeklyMovesPart | null
  v: WeeklyV3View
  appUrl: string
  medical: boolean
  productsMonth: string
}) {
  const left = [voices ? <VoicesCard key="v" part={voices} sectionMonth={v.month} appUrl={appUrl} print /> : null, content ? <ContentCard key="c" part={content} appUrl={appUrl} print medical={medical} /> : null].filter(Boolean)
  return (
    <>
      <div className="w3-cols">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{left}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{products ? <ProductsCard part={products} appUrl={appUrl} print monthWords={productsMonth} /> : null}</div>
      </div>
      {moves ? <><div className="w3-hr" /><MovesCard part={moves} appUrl={appUrl} print /></> : null}
    </>
  )
}
