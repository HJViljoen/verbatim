import type { CSSProperties, ReactNode } from 'react'
import { quoteCite, quoteWords } from '@/lib/reports/briefs/deck'
import type { BriefQuote } from '@/lib/reports/briefs/types'

// The monthly brief deck's small parts (components/briefs/brief-deck.tsx draws
// the pages; components/briefs/app-pages.tsx the October canvas's pages read
// from the app). Every size, weight, colour, radius and gap is the canvas's.

// ---- Palette A, as the canvas draws it ---------------------------------------------------------

export const BRIEF_PALETTE = {
  yellow: '#FFD43B',
  orange: '#F2651D',
  orangeText: '#C2410C',
  gold: '#9A6B00',
  ink: '#26292C',
  muted: '#5F656B',
  paper: '#FFFFFF',
  ground: '#F7F6F2',
  hair: '#E3E5E8',
  rule: '#D9DCE0',
  track: '#E8EAED',
  rival: '#8A9097',
  onInk: '#E6E7E8',
  onInkMuted: '#B9BDC2',
  pill: '#C9CDD2',
  pillGrey: '#9AA0A6',
  mixed: '#AEB3B9',
  neutral: '#D5D8DC',
  /** The October boards' second line under a headline ("what it means"). */
  soft: '#45494D',
} as const

export const P = BRIEF_PALETTE
// The app's own faces (the root layout's next/font variables), each with a
// fallback so a page without them (an email client, a test) still reads; the
// emoji face before the generic family, because the renderer's Chromium has
// none of its own and a commenter's emoji is part of their words.
export const EMOJI = "var(--font-emoji, 'Noto Color Emoji')"
export const SANS = `var(--font-plex-sans, 'IBM Plex Sans'), ${EMOJI}, -apple-system, sans-serif`
export const SERIF = `var(--font-plex-serif, 'IBM Plex Serif'), ${EMOJI}, Georgia, serif`
export const MONO = `var(--font-plex-mono, 'IBM Plex Mono'), Menlo, monospace`
export const BRAND = `var(--font-wordmark, 'Bricolage Grotesque'), ${SANS}`

export const STORED = { 'data-copy': 'stored', 'data-slot': 'monthly_brief' } as const
export const LONGRUN = { 'data-copy': 'stored', 'data-slot': 'week_read' } as const

// ---- Small parts ---------------------------------------------------------------------------------------

/** The canvas's caps label: 12px 700, 0.08em, upper case. */
export function Label({ children, color = P.orangeText, size = 12, spacing = '0.08em', style }: { children: ReactNode; color?: string; size?: number; spacing?: string; style?: CSSProperties }) {
  return <div style={{ fontSize: size, fontWeight: 700, letterSpacing: spacing, textTransform: 'uppercase', color, ...style }}>{children}</div>
}

export function Mark({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M26 14 L18 40" stroke={color} strokeWidth="12" strokeLinecap="round" />
      <path d="M46 14 L38 40" stroke={color} strokeWidth="12" strokeLinecap="round" />
    </svg>
  )
}

export function Dot() {
  return <div style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 3, background: P.ink, marginTop: 9 }} />
}

/** A bar on its track, its fill a share of 100. */
export function Bar({ pct, color, h }: { pct: number; color: string; h: number }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div style={{ flexGrow: 1, height: h, borderRadius: h / 2, background: P.track, overflow: 'hidden' }}>
      <div style={{ width: `${w}%`, height: h, background: color }} />
    </div>
  )
}

/** A resolved quote: the commenter's words, the English where translated. */
export interface ResolvedBriefQuote extends BriefQuote {
  english?: string | null
}

export const resolved = (q: BriefQuote | null | undefined): ResolvedBriefQuote | null => (q && q.text ? (q as ResolvedBriefQuote) : null)

/** A quote on the canvas's plain panel: the serif italic, its cite under it. */
export function QuotePanel({ q, company, size = 18, pad = '20px 24px', grow = false, labelled = false }: {
  q: ResolvedBriefQuote; company: string; size?: number; pad?: string; grow?: boolean; labelled?: boolean
}) {
  return (
    <div style={{ background: P.ground, borderRadius: 14, padding: pad, display: 'flex', flexDirection: 'column', gap: 10, ...(grow ? { flexGrow: 1, justifyContent: 'space-between' } : {}) }}>
      <p data-copy="quote" style={{ margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: size, lineHeight: 1.5, color: P.ink }}>“{quoteWords(q)}”</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: P.muted }}>{quoteCite(q, company, { labelled })}</span>
      </div>
    </div>
  )
}

/** The canvas's title block: a 32px title, and the 15px muted line under it. */
export function TitleBlock({ title, sub, size = 32, children }: { title: string; sub?: string | null; size?: number; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: size, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em' }}>{title}</div>
      {sub ? <div data-copy="figure" style={{ fontSize: 15, lineHeight: 1.45, color: P.muted }}>{sub}</div> : null}
      {children}
    </div>
  )
}

/** The line at the foot of a page naming what is argued in another brief. */
export function Footnote({ text }: { text: string | null }) {
  if (!text) return null
  return <p {...STORED} style={{ margin: 0, fontSize: 13, color: P.muted }}>{text}</p>
}

