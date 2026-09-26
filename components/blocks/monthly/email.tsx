import type { CSSProperties, ReactNode } from 'react'
import { EMAIL, FONT } from '@/lib/email/theme'
import { T, presentation } from './email-table'

// The monthly email's own markup (market-first WP2.1): the pieces every
// section of "September in your market" is drawn with in an inbox, set to the
// approved preview's email artboard (MonthlyReport, "What we send").
//
// EMAIL ONLY, AND WHY IT IS THE MONTHLY'S. The monthly's sections are the
// front page's blocks; in the app and on paper they print exactly as the page
// does. In an inbox the artefact IS the document, and the artboard draws each
// section as a card of 15px rows, mono figures and inner blocks, where the
// page's email arms are a plain courtesy fallback. So the monthly draws its
// email arms here, from the same data and the same pure helpers, and changes
// no front page file (other Stage 2 packages are rebuilding those).
//
// Tables and inline styles only: Outlook lays out with Word.

/** The artboard's link underline, lighter than the words it sits under. */
const UNDERLINE = EMAIL.neutralSeg

const cellBase: CSSProperties = { fontFamily: FONT.sans, verticalAlign: 'top' }

/** A section footer's link, as the artboard draws it: the words underlined in
 *  a light rule, the arrow beside them and not under the rule. */
export function MonthlyLink({ href, label }: { href: string; label: string }) {
  const words = label.replace(/\s*→\s*$/u, '')
  return (
    <a href={href} style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: EMAIL.ink, textDecoration: 'none' }}>
      <span style={{ textDecoration: 'underline', textDecorationColor: UNDERLINE, textUnderlineOffset: 5 }}>{words}</span>&nbsp;&nbsp;→
    </a>
  )
}

/** A figure in mono tabular digits: a count in ink at 600, a level in ink at
 *  400 (`weight`), the month before's in grey. Marked as code's figure for
 *  the copy contract. */
export function Num({ children, prev = false, size = 14, weight }: { children: ReactNode; prev?: boolean; size?: number; weight?: 400 | 600 }) {
  return (
    <span
      data-copy="figure"
      style={{ fontFamily: FONT.mono, fontSize: size, fontWeight: weight ?? (prev ? 400 : 600), color: prev ? EMAIL.muted : EMAIL.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
    >
      {children}
    </span>
  )
}

/** A column of a section's table. */
export interface Column {
  head: ReactNode
  align?: 'left' | 'right'
  /** A fixed width in px, or none for the column that takes the rest. */
  width?: number
  /** A class the email's one media query reads (`MONTHLY_EMAIL_CSS`): the
   *  bar column leaves a phone's table, so the figures keep their room. */
  className?: string
}

/**
 * A section's table: heads in 12px grey over an ink-grey rule, rows at 15px
 * with a hairline between them. `100%` wide rather than the artboard's fixed
 * 536, so the table holds on a phone; the figure columns keep their widths and
 * the label column takes what is left.
 */
export function Table({ columns, rows, marginTop = 0 }: { columns: readonly Column[]; rows: readonly (readonly ReactNode[])[]; marginTop?: number }) {
  const head = (c: Column, i: number): CSSProperties => ({
    ...cellBase,
    padding: `0 0 8px ${i === 0 ? 0 : 8}px`,
    borderBottom: `1px solid ${EMAIL.border}`,
    fontSize: 12,
    lineHeight: '16px',
    color: EMAIL.muted,
    textAlign: c.align ?? 'left',
    verticalAlign: 'bottom',
    ...(c.width ? { width: c.width } : {}),
  })
  const cell = (c: Column, i: number, last: boolean): CSSProperties => ({
    ...cellBase,
    padding: `11px 0 11px ${i === 0 ? 0 : 8}px`,
    borderBottom: last ? 0 : `1px solid ${EMAIL.hairline}`,
    fontSize: 15,
    lineHeight: '22px',
    color: EMAIL.ink,
    textAlign: c.align ?? 'left',
    ...(c.width ? { width: c.width } : {}),
  })
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop }}>
      <thead>
        <tr>{columns.map((c, i) => <th key={i} className={c.className} style={head(c, i)}>{c.head}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>{columns.map((c, i) => <td key={i} className={c.className} style={cell(c, i, ri === rows.length - 1)}>{r[i]}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The email's one stylesheet: a phone's layout, for the clients that read a
 * media query (Apple Mail, iOS, Gmail's apps and web). A client that reads
 * none keeps the 600px layout, which is the artboard's. The bar column leaves
 * the tables, two-column rows stack, and the card's inset narrows.
 */
export const MONTHLY_EMAIL_CSS = [
  '@media only screen and (max-width: 480px) {',
  '.vb-m-bar { display: none !important; }',
  '.vb-m-col { display: block !important; width: 100% !important; padding-right: 0 !important; padding-bottom: 16px !important; }',
  '.vb-m-card { padding: 24px 20px 8px !important; }',
  '}',
].join('\n')

/** A row label with its tag under it ("about a third makers", "provisional"). */
export function RowLabel({ children, tag }: { children: ReactNode; tag?: ReactNode }) {
  return (
    <>
      <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', fontWeight: 500, color: EMAIL.ink }}>{children}</div>
      {tag ? <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '18px', color: EMAIL.muted, marginTop: 2 }}>{tag}</div> : null}
    </>
  )
}

/** The preview's level bar, drawn as a table-safe block: this month's share
 *  on the section's shared axis, in ink. Decoration: the figures beside it
 *  are the reading. */
export function Bar({ share, axis, width = 80 }: { share: number | null; axis: number; width?: number }) {
  if (share == null || !Number.isFinite(share) || axis <= 0) return null
  const w = Math.max(4, Math.round(Math.min(1, share / axis) * width))
  return <div aria-hidden style={{ width: w, height: 6, borderRadius: 3, background: EMAIL.ink, fontSize: 0, lineHeight: 0 }}>&nbsp;</div>
}

/** An inner block: the page's `--inner` ground, 24px in. */
export function Inner({ children, marginTop = 24 }: { children: ReactNode; marginTop?: number }) {
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop }}>
      <tbody>
        <tr><td style={{ padding: 24, borderRadius: 6, background: EMAIL.inner }}>{children}</td></tr>
      </tbody>
    </table>
  )
}

/** Body words at the artboard's 15px, in the second ink. */
export function Body({ children, marginTop = 0, size = 15 }: { children: ReactNode; marginTop?: number; size?: number }) {
  return <div style={{ fontFamily: FONT.sans, fontSize: size, lineHeight: size >= 15 ? '24px' : '22px', color: EMAIL.ink2, marginTop }}>{children}</div>
}

/**
 * The "not read as a change" chip, as the email artboard sets it: the mark,
 * the clause before the colon in ink at 600, the reason after it. The words
 * are the pair's own (`pairChipWords`), untouched; only the first letter is
 * raised, because the line starts a sentence here.
 */
export function ChipLine({ words, marginTop = 16 }: { words: string | null | undefined; marginTop?: number }) {
  if (!words) return null
  const cut = words.indexOf(': ')
  const lead = cut > 0 ? words.slice(0, cut + 1) : null
  const rest = cut > 0 ? words.slice(cut + 2) : words
  const upper = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop }}>
      <tbody>
        <tr>
          <td style={{ width: 22, verticalAlign: 'top', fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.muted }} aria-hidden>⊘</td>
          <td data-copy="verdict" data-pair-chip="" style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.ink2 }}>
            {lead ? <><span style={{ fontWeight: 600, color: EMAIL.ink }}>{upper(lead)}</span> {rest}.</> : `${upper(rest)}.`}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/** A sub-heading inside a section ("Asked", "Came in"). */
export function SubHead({ children, marginTop = 0 }: { children: ReactNode; marginTop?: number }) {
  return <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', fontWeight: 600, color: EMAIL.ink, marginTop }}>{children}</div>
}
