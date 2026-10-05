import { Fragment, type CSSProperties, type ReactNode } from 'react'
import {
  SHEET, SUBTITLE, contentsOf, continuedTitle, deckPages, heardIn, monthYear, pairColumn, quoteCite, quoteWords, whoLineOf, writtenOn,
  type DeckPage, type FindingPlan, type WhoLine,
} from '@/lib/reports/briefs/deck'
import { BRIEF_LENS, BRIEF_NAME, type BriefFinding, type BriefItem, type BriefQuote, type BriefRole, type BriefSection, type StoredBriefData } from '@/lib/reports/briefs/types'

/**
 * The monthly department brief as a deck of 1280×720 sheets, drawn to the
 * approved design (the Claude Design canvas, "Monthly briefs": the
 * Brief-{Sales,Marketing,Content,Leadership}-*.dc.html boards, design round 6,
 * which Heinrich approved on 1 Oct: "the briefs look nice", the per-brief
 * colours kept). ONE body for the in-app viewer, the printed PDF (the render
 * route, `print`) and a share link, so they cannot disagree.
 *
 * WHAT THE DESIGN FIXES, AND THIS KEEPS: palette A (yellow #FFD43B, orange
 * #F2651D with the text-safe #C2410C for eyebrows, gold #9A6B00 for the
 * company, rival grey #8A9097, ink #26292C, the ground #F7F6F2 for panels);
 * IBM Plex Sans for the page, the serif for the In short, the leads and every
 * quote (italic, on a plain panel), the mono for page numbers and table
 * figures, Bricolage Grotesque for the wordmark; each brief's own cover (Sales
 * yellow, Marketing orange, Content white, Leadership ink); the frame on every
 * page (the eyebrow in orange caps, "{company} · {brief} · {month}" top right,
 * "Created by {company} with Verbatim · {date}" and "n / N" at the foot).
 *
 * THE TWO BANS (Heinrich, 30 Sep): no left-stripe accent on any block, and no
 * highlighted phrase. A quote is the serif italic on a plain panel.
 *
 * WHAT IT PRINTS AND NOTHING ELSE: the frozen brief, its quotes resolved at
 * render (the words are never stored), every number code's, and on every
 * item who the talk was about (Heinrich, 1 Oct: "brand attribution on every
 * item"). Copy markers for the render tier (`data-copy`): the writers' words
 * are `stored` from the `monthly_brief` slot (scrubbed at write time), code's
 * counts `figure`, a commenter's words `quote`.
 *
 * Which page holds what is lib/reports/briefs/deck.ts (pure). Where the brief's
 * data has a section the canvas did not draw, the page follows the canvas's
 * nearest established pattern; AGENTS.md lists each.
 */

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
  pill: '#C9CDD2',
} as const

const P = BRIEF_PALETTE
// The app's own faces (the root layout's next/font variables), each with a
// fallback so a page without them (an email client, a test) still reads; the
// emoji face before the generic family, because the renderer's Chromium has
// none of its own and a commenter's emoji is part of their words.
const EMOJI = "var(--font-emoji, 'Noto Color Emoji')"
const SANS = `var(--font-plex-sans, 'IBM Plex Sans'), ${EMOJI}, -apple-system, sans-serif`
const SERIF = `var(--font-plex-serif, 'IBM Plex Serif'), ${EMOJI}, Georgia, serif`
const MONO = `var(--font-plex-mono, 'IBM Plex Mono'), Menlo, monospace`
const BRAND = `var(--font-wordmark, 'Bricolage Grotesque'), ${SANS}`

/** Each brief's cover, as the canvas colours it. */
const COVER: Readonly<Record<BriefRole, { bg: string; fg: string; mark: string; giant: string }>> = {
  sales: { bg: P.yellow, fg: P.ink, mark: P.ink, giant: P.ink },
  marketing: { bg: P.orange, fg: P.ink, mark: P.ink, giant: P.yellow },
  content: { bg: P.paper, fg: P.ink, mark: P.ink, giant: P.yellow },
  leadership: { bg: P.ink, fg: '#FFFFFF', mark: P.yellow, giant: P.yellow },
}

const STORED = { 'data-copy': 'stored', 'data-slot': 'monthly_brief' } as const

// ---- Small parts ---------------------------------------------------------------------------------------

function Label({ children, color = P.orangeText, size = 12, style }: { children: ReactNode; color?: string; size?: number; style?: CSSProperties }) {
  return <div style={{ fontSize: size, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color, ...style }}>{children}</div>
}

function Mark({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M26 14 L18 40" stroke={color} strokeWidth="12" strokeLinecap="round" />
      <path d="M46 14 L38 40" stroke={color} strokeWidth="12" strokeLinecap="round" />
    </svg>
  )
}

function Wordmark({ color, markColor, size }: { color: string; markColor: string; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Mark color={markColor} size={Math.round(size * 1.09)} />
      <span style={{ fontFamily: BRAND, fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', color }}>Verbatim</span>
    </div>
  )
}

function Dot({ color = P.ink }: { color?: string }) {
  return <div style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 3, background: color, marginTop: 9 }} />
}

function Bar({ pct, color = P.yellow, h = 10, track = P.track }: { pct: number; color?: string; h?: number; track?: string }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div style={{ flexGrow: 1, height: h, borderRadius: h / 2, background: track, overflow: 'hidden' }}>
      <div style={{ width: `${w}%`, height: h, background: color }} />
    </div>
  )
}

/** Who the talk behind an item was about, with what it rests on. */
function Who({ line, tag, style }: { line: WhoLine | null; tag?: string | null; style?: CSSProperties }) {
  if (!line && !tag) return null
  return (
    <div style={{ fontSize: 12, lineHeight: 1.4, color: P.muted, paddingTop: 4, ...style }}>
      {tag ? <span style={{ whiteSpace: 'nowrap' }}>{tag}</span> : null}
      {tag && line ? ' · ' : null}
      {line ? (
        <>
          <span data-copy="figure" style={{ whiteSpace: 'nowrap' }}>{line.count}</span>
          {line.parts.map((p, i) => (
            <Fragment key={i}>
              {' · '}
              <span style={{ whiteSpace: 'nowrap' }}>{p.label}{p.videos ? <> <span data-copy="figure">{p.videos}</span></> : null}</span>
            </Fragment>
          ))}
        </>
      ) : null}
    </div>
  )
}

/** A resolved quote: the commenter's words, the English where translated. */
export interface ResolvedBriefQuote extends BriefQuote {
  english?: string | null
}

/** A quote on a plain panel, the serif italic, its cite under it. */
function QuotePanel({ q, company, noun, size = 18, pad = '20px 24px', grow = false, bg = P.ground }: {
  q: ResolvedBriefQuote; company: string; noun: string | null | undefined; size?: number; pad?: string; grow?: boolean; bg?: string
}) {
  if (!q.text) return null
  return (
    <div style={{ background: bg, borderRadius: 14, padding: pad, display: 'flex', flexDirection: 'column', gap: 10, ...(grow ? { flexGrow: 1, justifyContent: 'space-between' } : {}) }}>
      <p data-copy="quote" style={{ margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: size, lineHeight: 1.5, color: P.ink }}>“{quoteWords(q)}”</p>
      <div style={{ fontSize: 13, color: P.muted }}>{quoteCite(q, company, noun)}</div>
    </div>
  )
}

function TitleBlock({ title, sub, size = 32 }: { title: string; sub?: string | null; size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: size, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em' }}>{title}</div>
      {sub ? <div style={{ fontSize: 15, lineHeight: 1.45, color: P.muted }}>{sub}</div> : null}
    </div>
  )
}

/** A section's lead: the writer's opening sentences, in the serif. */
function Lead({ text, size = 20, maxWidth }: { text?: string; size?: number; maxWidth?: number }) {
  if (!text) return null
  return <p {...STORED} style={{ margin: 0, fontFamily: SERIF, fontSize: size, fontWeight: 500, lineHeight: 1.5, ...(maxWidth ? { maxWidth } : {}) }}>{text}</p>
}

/** An item's words: its title where it has one, its text and second line. */
function ItemText({ i, size = 15 }: { i: BriefItem; size?: number }) {
  return (
    <p style={{ margin: 0, fontSize: size, lineHeight: 1.55 }}>
      <span {...STORED}>{i.text}</span>
      {i.detail ? <> <span {...STORED}>{i.detail}</span></> : null}
    </p>
  )
}

// ---- The frame ---------------------------------------------------------------------------------------

interface Ctx {
  data: StoredBriefData
  date: string
  pages: DeckPage[]
  total: number
}

function Frame({ ctx, page, children }: { ctx: Ctx; page: DeckPage; children: ReactNode }) {
  const { data } = ctx
  return (
    <div style={{ width: SHEET.width, height: SHEET.height, boxSizing: 'border-box', padding: '40px 60px 28px', display: 'flex', flexDirection: 'column', background: P.paper }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 22 }}>
        <Label size={13}>{page.eyebrow}</Label>
        <div style={{ fontSize: 13, color: P.muted }}>{data.company} · {BRIEF_NAME[data.role]} · {monthYear(data.month)}</div>
      </div>
      <div data-brief-body="" style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{children}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${P.hair}`, fontSize: 12, color: P.muted }}>
        <div>Created by {data.company} with Verbatim{ctx.date ? ` · ${ctx.date}` : ''}</div>
        <div style={{ fontFamily: MONO }}>{page.n} / {ctx.total}</div>
      </div>
    </div>
  )
}

// ---- The cover and In short --------------------------------------------------------------------------

function Cover({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const c = COVER[data.role]
  const items = contentsOf(ctx.pages)
  return (
    <div style={{ position: 'relative', width: SHEET.width, height: SHEET.height, boxSizing: 'border-box', padding: '56px 72px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: c.bg, color: c.fg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: 40, top: 70 }}><Mark color={c.giant} size={470} /></div>
      <div style={{ position: 'relative' }}><Wordmark color={c.fg} markColor={c.mark} size={22} /></div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{data.company}</div>
        <div style={{ fontSize: 104, fontWeight: 700, lineHeight: 0.98, letterSpacing: '-0.025em' }}>{BRIEF_NAME[data.role]}</div>
        <div style={{ fontSize: 28, fontWeight: 500 }}>{monthYear(data.month)}</div>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>In this brief · <span data-copy="figure">{ctx.total}</span> pages</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px 32px', maxWidth: 980 }}>
          {items.map((t) => <div key={t.n} style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{t.title}</div>)}
        </div>
      </div>
    </div>
  )
}

function InShort({ ctx, summarySize, tocSize }: { ctx: Ctx; summarySize: number; tocSize: number }) {
  const { data } = ctx
  const toc = contentsOf(ctx.pages)
  const rows = Math.ceil(toc.length / 2)
  return (
    <div style={{ display: 'flex', gap: 56, height: '100%' }}>
      <div style={{ flex: 1.45, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.1 }}>In short</div>
        {data.inShort.summary ? <p {...STORED} style={{ margin: 0, fontFamily: SERIF, fontSize: summarySize, fontWeight: 500, lineHeight: 1.5 }}>{data.inShort.summary}</p> : null}
        <div style={{ flexGrow: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, borderTop: `1px solid ${P.hair}` }}>
          <Label color={P.muted} size={11}>In this brief</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: `repeat(${rows}, auto)`, gridAutoFlow: 'column', gap: '6px 28px' }}>
            {toc.map((t) => (
              <div key={t.n} style={{ display: 'flex', gap: 10, fontSize: tocSize, lineHeight: 1.4 }}>
                <span style={{ fontFamily: MONO, color: P.muted, width: 20, flexShrink: 0 }}>{t.n}</span><span>{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22, paddingTop: 6 }}>
        {data.inShort.figures.length ? (
          <div style={{ display: 'flex', gap: 24 }}>
            {data.inShort.figures.slice(0, 2).map((f, i) => (
              <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div data-copy="figure" style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>{f.value}</div>
                <div data-copy="figure" style={{ fontSize: 13, lineHeight: 1.4, color: P.muted }}>{f.label}</div>
              </div>
            ))}
          </div>
        ) : null}
        {data.inShort.also.length ? (
          <div style={{ background: P.ground, borderRadius: 16, padding: '18px 22px 8px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingBottom: 10 }}><Label color={P.ink}>Also this month, in the other briefs</Label></div>
            {data.inShort.also.map((a, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 0', borderTop: `1px solid ${P.rule}` }}>
                <Label color={P.muted} size={11}>{BRIEF_NAME[a.brief]}</Label>
                <div {...STORED} style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{a.headline}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---- A finding --------------------------------------------------------------------------------------

function Finding({ ctx, f, plan }: { ctx: Ctx; f: BriefFinding; plan: FindingPlan }) {
  const { data } = ctx
  const quotes = (f.quotes as ResolvedBriefQuote[]).filter((q) => q?.text)
  const placed = (where: 'right' | 'left') => quotes.filter((_q, k) => plan.quotes[k] === where)
  const heard = heardIn(f)
  const who = whoLineOf(f.videos, f.who, data.company, data.noun)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ display: 'flex', gap: 48, flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 1.45, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div {...STORED} style={{ fontSize: plan.headline, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{f.headline}</div>
          {f.saw.map((p, i) => <p key={i} {...STORED} style={{ margin: 0, fontSize: plan.saw, lineHeight: 1.58 }}>{p}</p>)}
          {plan.practice === 'left' ? <Practice lines={f.practice} size={Math.min(15, plan.saw)} /> : null}
          {placed('left').map((q, k) => <QuotePanel key={k} q={q} company={data.company} noun={data.noun} size={15} pad="14px 18px" />)}
          <div style={{ flexGrow: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {heard ? <div style={{ fontSize: 13, color: P.muted }}>{heard}</div> : null}
            <Who line={who} style={{ fontSize: 13, color: P.ink, paddingTop: 0 }} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: P.yellow, borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label color={P.ink}>{BRIEF_LENS[data.role]}</Label>
            <p {...STORED} style={{ margin: 0, fontSize: plan.means, fontWeight: 500, lineHeight: 1.5 }}>{f.means}</p>
          </div>
          {placed('right').map((q, k) => <QuotePanel key={k} q={q} company={data.company} noun={data.noun} size={k === 0 ? 17 : 16} pad={k === 0 ? '20px 24px' : '16px 20px'} />)}
        </div>
      </div>
    </div>
  )
}

function Practice({ lines, size }: { lines: readonly string[]; size: number }) {
  if (!lines.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
      <Label color={P.muted} size={11}>In practice</Label>
      {lines.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 10 }}><Dot /><div {...STORED} style={{ fontSize: size, lineHeight: 1.5 }}>{t}</div></div>
      ))}
    </div>
  )
}

/** A finding's second page, where its words ran long: what did not fit on
 *  the first, under the headline again. */
function FindingContinued({ ctx, f, plan }: { ctx: Ctx; f: BriefFinding; plan: FindingPlan }) {
  const { data } = ctx
  const quotes = (f.quotes as ResolvedBriefQuote[]).filter((q) => q?.text).filter((_q, k) => plan.quotes[k] === 'next')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <div {...STORED} style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{continuedTitle(f.headline)}</div>
      <div style={{ display: 'flex', gap: 48 }}>
        <div style={{ flex: 1.45, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {plan.practice === 'next' ? <Practice lines={f.practice} size={15} /> : null}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {quotes.map((q, k) => <QuotePanel key={k} q={q} company={data.company} noun={data.noun} size={17} />)}
        </div>
      </div>
    </div>
  )
}

// ---- Section pages -------------------------------------------------------------------------------------

const allItems = (s: BriefSection): BriefItem[] => s.groups.flatMap((g) => g.items)

function SectionHead({ s, continued, sub, size = 32 }: { s: BriefSection; continued: boolean; sub?: string | null; size?: number }) {
  return <TitleBlock title={continued ? continuedTitle(s.title) : s.title} sub={continued ? null : sub ?? SUBTITLE[s.key] ?? null} size={size} />
}

/** A row: the label on the left, what people say on the right (the design's
 *  What stops them, What people want to be shown, Language to handle with
 *  care). */
function Row({ i, ctx, title, text }: { i: BriefItem; ctx: Ctx; title: CSSProperties; text: CSSProperties }) {
  const who = whoLineOf(i.videos, i.who, ctx.data.company, ctx.data.noun)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 24, padding: '12px 0', borderTop: `1px solid ${P.hair}` }}>
      <div {...STORED} style={{ gridColumn: 'span 3', fontWeight: 700, lineHeight: 1.3, ...title }}>{i.title}</div>
      <div style={{ gridColumn: 'span 7' }}>
        <ItemText i={i} size={Number(text.fontSize ?? 15)} />
        <Who line={who} tag={i.tag} />
      </div>
    </div>
  )
}

function RowsPage({ ctx, s, continued, companion }: { ctx: Ctx; s: BriefSection; continued: boolean; companion: BriefSection | null }) {
  const { data } = ctx
  const quote = s.quote ? (s.quote as ResolvedBriefQuote) : null
  const rows = (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {allItems(s).map((i, k) => <Row key={k} i={i} ctx={ctx} title={{ fontSize: s.key === 'content.more' ? 20 : 18 }} text={{ fontSize: s.key === 'content.more' ? 16 : 15 }} />)}
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 44, height: '100%' }}>
      <div style={{ flex: 1.75, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionHead s={s} continued={continued} />
        {!continued ? <Lead text={s.lead} size={17} /> : null}
        {rows}
      </div>
      {/* The design's right column, kept even when it holds nothing, so the
          rows keep the design's measure. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, justifyContent: companion ? 'flex-start' : 'flex-end' }}>
        {quote ? <QuotePanel q={quote} company={data.company} noun={data.noun} size={17} /> : null}
        {companion ? <SettlePanel ctx={ctx} s={companion} /> : null}
      </div>
    </div>
  )
}

/** What they want settled first, in the grey panel beside what stops them. */
function SettlePanel({ ctx, s }: { ctx: Ctx; s: BriefSection }) {
  return (
    <div style={{ background: P.ground, borderRadius: 16, padding: '14px 20px 8px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ paddingBottom: 8 }}><Label color={P.ink}>{s.title}</Label></div>
      {allItems(s).map((i, k) => (
        <div key={k} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: `1px solid ${P.rule}` }}>
          <Dot />
          <div style={{ minWidth: 0 }}>
            <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{i.text}</p>
            <Who line={whoLineOf(i.videos, i.who, ctx.data.company, ctx.data.noun)} tag={i.tag} />
          </div>
        </div>
      ))}
    </div>
  )
}

function CarePage({ ctx, s, continued }: { ctx: Ctx; s: BriefSection; continued: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <SectionHead s={s} continued={continued} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {allItems(s).map((i, k) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 28, alignItems: 'baseline', padding: '20px 0', borderTop: `1px solid ${P.hair}` }}>
            <div {...STORED} style={{ gridColumn: 'span 5', fontSize: 30, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.15 }}>{i.title}</div>
            <div style={{ gridColumn: 'span 7' }}>
              <ItemText i={i} size={19} />
              <Who line={whoLineOf(i.videos, i.who, ctx.data.company, ctx.data.noun)} tag={i.tag} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SayHearPage({ ctx, s, continued }: { ctx: Ctx; s: BriefSection; continued: boolean }) {
  const co = ctx.data.company
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <SectionHead s={s} continued={continued} sub={null} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 24, paddingBottom: 8 }}>
          <div style={{ gridColumn: 'span 10' }}><Label color={P.muted} size={11}>What {co} says in its own posts</Label></div>
          <div style={{ gridColumn: 'span 14' }}><Label color={P.muted} size={11}>What comes back from the market</Label></div>
        </div>
        {allItems(s).map((i, k) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 24, alignItems: 'start', padding: '17px 0', borderTop: `1px solid ${P.hair}` }}>
            <p style={{ gridColumn: 'span 10', margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.45 }}>{i.title}</p>
            <div style={{ gridColumn: 'span 14' }}>
              <p {...STORED} style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{i.text}</p>
              <Who line={whoLineOf(i.videos, i.who, co, ctx.data.noun)} tag={i.tag} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Who is buying: one card a buyer, two a page (the design's persona cards). */
function BuyersPage({ ctx, s, continued, across }: { ctx: Ctx; s: BriefSection; continued: boolean; across?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <SectionHead s={s} continued={continued} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexGrow: 1, minHeight: 0 }}>
        {allItems(s).map((i, k) => (
          <div key={k} style={{ flex: '1 1 0', minHeight: 0, border: `1px solid ${P.hair}`, borderRadius: 16, padding: '16px 22px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 28 }}>
              <div style={{ flex: 1.15, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div {...STORED} style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{i.title}</div>
              </div>
              <div style={{ flex: 2.4, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p {...STORED} style={{ margin: 0, fontFamily: SERIF, fontSize: 16, lineHeight: 1.5 }}>{i.text}</p>
                {i.detail ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Label color={P.muted} size={10}>What they look for first</Label>
                    <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{i.detail}</p>
                  </div>
                ) : null}
              </div>
            </div>
            <div style={{ flexGrow: 1 }} />
            <div style={{ paddingTop: 8, borderTop: `1px solid ${P.hair}` }}>
              <Who line={whoLineOf(i.videos, i.who, ctx.data.company, ctx.data.noun)} tag={i.tag} style={{ paddingTop: 0 }} />
            </div>
          </div>
        ))}
        {/* Two to a page, as the design draws them: one buyer keeps half. */}
        {allItems(s).length === 1 && (across ?? 2) === 2 ? <div style={{ flex: '1 1 0' }} /> : null}
      </div>
    </div>
  )
}

/** One card a rival, side by side (the design's Who buyers compare you with,
 *  and How rivals are heard). */
function CardsPage({ ctx, s, continued, across }: { ctx: Ctx; s: BriefSection; continued: boolean; across?: number }) {
  const { data } = ctx
  const sales = s.key === 'sales.rivals'
  const quote = s.quote ? (s.quote as ResolvedBriefQuote) : null
  const items = allItems(s)
  // The design's three across; four where there are four.
  const slots = across ?? Math.max(3, items.length)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <SectionHead s={s} continued={continued} />
      <div style={{ display: 'flex', gap: 18 }}>
        {items.map((i, k) => (
          <div key={k} style={{ flex: `0 0 calc((100% - ${18 * (slots - 1)}px) / ${slots})`, minWidth: 0, border: `1px solid ${P.hair}`, borderRadius: 16, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sales
              ? <div style={{ fontSize: 26, fontWeight: 700 }}>{i.title}</div>
              : <Label color={P.muted}>{i.title}</Label>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {sales ? <Label color={P.muted} size={11}>What buyers choose it for</Label> : null}
              <p {...STORED} style={{ margin: 0, fontSize: sales ? 14.5 : 17, fontWeight: sales ? 400 : 600, lineHeight: sales ? 1.52 : 1.4 }}>{i.text}</p>
            </div>
            {i.detail ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label size={11}>{sales ? 'Where buyers push back' : 'What it is criticised for'}</Label>
                <p {...STORED} style={{ margin: 0, fontSize: 14.5, lineHeight: 1.52 }}>{i.detail}</p>
              </div>
            ) : null}
            <div style={{ flexGrow: 1 }} />
            <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} />
          </div>
        ))}
        {/* A free slot holds the section's voice beside the cards. */}
        {quote && items.length < slots ? (
          <div style={{ flex: `0 0 calc((100% - ${18 * (slots - 1)}px) / ${slots})`, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <QuotePanel q={quote} company={data.company} noun={data.noun} size={14} pad="12px 16px" />
          </div>
        ) : null}
      </div>
      <div style={{ flexGrow: 1 }} />
      {quote && items.length >= slots ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 'calc((100% - 20px) / 3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <QuotePanel q={quote} company={data.company} noun={data.noun} size={14} pad="12px 16px" />
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Numbered columns: what tips them into buying. */
function ColumnsPage({ ctx, s, continued, offset, across }: { ctx: Ctx; s: BriefSection; continued: boolean; offset: number; across?: number }) {
  const { data } = ctx
  const quote = s.quote ? (s.quote as ResolvedBriefQuote) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, height: '100%' }}>
      <SectionHead s={s} continued={continued} />
      <div style={{ display: 'flex', gap: 24 }}>
        {allItems(s).map((i, k, all) => (
          <div key={k} style={{ flex: `0 0 calc((100% - ${24 * ((across ?? Math.max(4, all.length)) - 1)}px) / ${across ?? Math.max(4, all.length)})`, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: 13, color: P.muted, paddingTop: 12, borderTop: `2px solid ${P.ink}` }}>{String(offset + k + 1).padStart(2, '0')}</div>
            <div {...STORED} style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{i.title}</div>
            <ItemText i={i} />
            <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} />
          </div>
        ))}
        {quote && allItems(s).length < (across ?? Math.max(4, allItems(s).length)) ? (
          <div style={{ flex: `0 0 calc((100% - ${24 * ((across ?? Math.max(4, allItems(s).length)) - 1)}px) / ${across ?? Math.max(4, allItems(s).length)})`, minWidth: 0, paddingTop: 14 }}>
            <QuotePanel q={quote} company={data.company} noun={data.noun} size={15} pad="14px 18px" />
          </div>
        ) : null}
      </div>
      <div style={{ flexGrow: 1 }} />
      {quote && allItems(s).length >= (across ?? Math.max(4, allItems(s).length)) ? (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}><QuotePanel q={quote} company={data.company} noun={data.noun} size={15} pad="14px 18px" /></div>
          <div style={{ flex: 1 }} />
        </div>
      ) : null}
    </div>
  )
}

/** Two columns from two groups (believes and doubts; praised and criticised;
 *  what the comments praise and complain about). */
function PairPage({ ctx, s, continued }: { ctx: Ctx; s: BriefSection; continued: boolean }) {
  const { data } = ctx
  const quote = s.quote ? (s.quote as ResolvedBriefQuote) : null
  const blocks = s.key === 'content.watch'
  // The design's two columns, whichever groups printed: what is believed,
  // praised or praised for on the left; what is doubted, complained about or
  // criticised on the right, in the orange label.
  const cols = [s.groups.find((g) => pairColumn(g.label) === 0) ?? null, s.groups.find((g) => pairColumn(g.label) === 1) ?? null]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <SectionHead s={s} continued={continued} />
      {!continued ? <Lead text={s.lead} size={blocks ? 22 : 18} maxWidth={1080} /> : null}
      <div style={{ display: 'flex', gap: 48, flexGrow: 1, minHeight: 0 }}>
        {cols.map((g, c) => (
          <div key={c} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {g?.label ? <Label color={c === 0 ? P.ink : P.orangeText} size={13}>{g.label}</Label> : null}
            <div style={{ paddingTop: 6 }}>
              {(g?.items ?? []).map((i, k) => blocks || i.title ? (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 0', borderTop: `1px solid ${P.hair}` }}>
                  {i.title ? <div {...STORED} style={{ fontSize: 20, fontWeight: 700 }}>{i.title}</div> : null}
                  <ItemText i={i} size={16} />
                  <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} style={{ paddingTop: 0 }} />
                </div>
              ) : (
                <div key={k} style={{ display: 'flex', gap: 12, padding: '11px 0', borderTop: `1px solid ${P.hair}` }}>
                  <Dot />
                  <div style={{ minWidth: 0 }}>
                    <ItemText i={i} />
                    <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} />
                  </div>
                </div>
              ))}
            </div>
            {c === 1 && quote ? <><div style={{ flexGrow: 1 }} /><QuotePanel q={quote} company={data.company} noun={data.noun} size={17} /></> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Numbered questions in two columns (the design's The questions people ask);
 *  also what they want settled first, and the questions for the business,
 *  where each stands on its own page. */
function QuestionsPage({ ctx, s, continued, offset }: { ctx: Ctx; s: BriefSection; continued: boolean; offset: number }) {
  const { data } = ctx
  const items = allItems(s)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <SectionHead s={s} continued={continued} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 44px' }}>
        {items.map((i, k) => (
          <div key={k} style={{ display: 'flex', gap: 14, padding: '15px 0', borderTop: `1px solid ${P.hair}` }}>
            <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 15, background: P.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 14, fontWeight: 500 }}>{offset + k + 1}</div>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div {...STORED} style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{i.text}</div>
              {i.detail ? <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: P.muted }}>{i.detail}</p> : null}
              <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} style={{ paddingTop: 0 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** In its own words: the market's terms, grouped, and its short voices in the
 *  grey panel beside them. */
function WordsPage({ ctx, s, continued }: { ctx: Ctx; s: BriefSection; continued: boolean }) {
  const { data } = ctx
  const voices = (!continued ? (s.voices ?? []) : []) as ResolvedBriefQuote[]
  const shown = voices.filter((v) => v?.text)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <SectionHead s={s} continued={continued} />
      <div style={{ display: 'flex', gap: 48, flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 1.4, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {!continued ? <Lead text={s.lead} size={18} /> : null}
          {s.groups.map((g, gi) => (
            <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.label ? <Label color={P.muted} size={11}>{g.label}</Label> : null}
              {g.items.map((i, k) => (
                <div key={k} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: k ? `1px solid ${P.hair}` : undefined }}>
                  <Dot />
                  <div style={{ minWidth: 0 }}>
                    <ItemText i={i} />
                    <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        {!shown.length ? <div style={{ flex: 1, minWidth: 0 }} /> : null}
        {shown.length ? (
          <div style={{ flex: 1, minWidth: 0, background: P.ground, borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingBottom: 10 }}><Label color={P.ink}>In their words</Label></div>
            {shown.map((v, k) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 0', borderTop: `1px solid ${P.rule}` }}>
                <p data-copy="quote" style={{ margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, lineHeight: 1.45 }}>“{quoteWords(v)}”</p>
                <div style={{ fontSize: 12, color: P.muted }}>{quoteCite(v, data.company, data.noun)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Words to borrow: short voices, two by two, on plain panels. */
function VoicesPage({ ctx, s, continued }: { ctx: Ctx; s: BriefSection; continued: boolean }) {
  const { data } = ctx
  const voices = ((s.voices ?? []) as ResolvedBriefQuote[]).filter((v) => v?.text)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, height: '100%' }}>
      <SectionHead s={s} continued={continued} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20 }}>
        {voices.map((v, k) => <QuotePanel key={k} q={v} company={data.company} noun={data.noun} size={20} pad="22px 26px" />)}
      </div>
    </div>
  )
}

/** Hooks and formats: the market's formats and openings with the company's
 *  own posts beside them (the design's table; code's numbers). */
function FormatsPage({ ctx, s, continued }: { ctx: Ctx; s: BriefSection; continued: boolean }) {
  const { data } = ctx
  const lines = s.groups.flatMap((g) => g.lines ?? [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <SectionHead s={s} continued={continued} sub={null} />
      {!continued && s.lead ? <div style={{ fontSize: 15, lineHeight: 1.45, color: P.muted, marginTop: -8 }}>{s.lead}</div> : null}
      <div style={{ display: 'flex', gap: 40, flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 1.85, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {s.groups.map((g, gi) => (
            <div key={gi} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 14, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted }}>
                  <div style={{ gridColumn: 'span 5' }}>{g.label}</div>
                  <div style={{ gridColumn: 'span 8' }}>The market</div>
                  <div style={{ gridColumn: 'span 3', textAlign: 'right' }}>{data.company}</div>
                  <div style={{ gridColumn: 'span 4', textAlign: 'right' }}>Engagement</div>
                </div>
                {g.base ? <div data-copy="figure" style={{ fontSize: 12, color: P.muted }}>{g.base}</div> : null}
              </div>
              {g.items.map((i, k) => {
                const m = i.measure
                return (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 14, alignItems: 'center', padding: '9px 0', borderTop: `1px solid ${P.hair}` }}>
                    <div style={{ gridColumn: 'span 5', fontSize: 16, fontWeight: 600 }}>{i.title}</div>
                    {m?.pct != null ? (
                      <>
                        <div style={{ gridColumn: 'span 8', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Bar pct={m.pct} />
                          <div data-copy="figure" style={{ width: 52, fontFamily: MONO, fontSize: 14 }}>{m.pct.toFixed(1)}%</div>
                        </div>
                        <div data-copy="figure" style={{ gridColumn: 'span 3', textAlign: 'right', fontFamily: MONO, fontSize: 14 }}>{m.own != null ? m.own : ''}</div>
                        <div data-copy="figure" style={{ gridColumn: 'span 4', textAlign: 'right', fontFamily: MONO, fontSize: 14, color: P.muted }}>{m.median != null ? `${m.median.toFixed(1)}%` : ''}</div>
                      </>
                    ) : (
                      <div data-copy="figure" style={{ gridColumn: 'span 15', fontSize: 14 }}>{i.text}{i.detail ? ` ${i.detail}` : ''}</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {lines.length ? (
          <div style={{ flex: 1, minWidth: 0, background: P.ground, borderRadius: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingBottom: 8 }}><Label color={P.ink}>What the numbers say</Label></div>
            {lines.map((t, k) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: `1px solid ${P.rule}` }}>
                <Dot /><p data-copy="figure" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{t}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Where the market stands: each subject's share as a bar, what people say
 *  about it beside it. */
function MarketPage({ s, continued }: { ctx: Ctx; s: BriefSection; continued: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <TitleBlock title={continued ? continuedTitle(s.title) : s.title} />
        {s.base ? <div data-copy="figure" style={{ fontSize: 14, color: P.muted, paddingBottom: 6 }}>{s.base}</div> : null}
      </div>
      {!continued ? <Lead text={s.lead} size={17} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {allItems(s).map((i, k) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 24, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${P.hair}` }}>
            <div style={{ gridColumn: 'span 5', fontSize: 18, fontWeight: 700 }}>{i.title}</div>
            {/* A subject with no level (its matching is still settling) has
                no bar: what people say takes the bar's room. */}
            {i.measure?.pct != null ? (
              <div style={{ gridColumn: 'span 8', display: 'flex', alignItems: 'center', gap: 14 }}>
                <Bar pct={i.measure.pct} h={12} />
                <div data-copy="figure" style={{ width: 48, fontFamily: MONO, fontSize: 16, fontWeight: 500 }}>{i.measure.pct}%</div>
              </div>
            ) : null}
            <div style={{ gridColumn: i.measure?.pct != null ? 'span 11' : 'span 19' }}>
              <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{i.text}</p>
              <Who line={null} tag={i.tag} style={{ paddingTop: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Where the company stands: each rival's share of the market's talk (the
 *  design's brand table), the company's own posts said once, and what people
 *  praise and criticise it for. */
function SharesPage({ ctx, s, continued }: { ctx: Ctx; s: BriefSection; continued: boolean }) {
  const { data } = ctx
  const talk = s.groups.find((g) => g.items.some((i) => i.measure?.comments != null) || (g.lines?.length ?? 0) > 0) ?? null
  const said = s.groups.filter((g) => g !== talk)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <SectionHead s={s} continued={continued} sub={talk?.label ? `${talk.label}: shares of the market's comments and videos.` : null} />
      <div style={{ display: 'flex', gap: 40, flexGrow: 1, minHeight: 0, alignItems: 'flex-start' }}>
        {talk ? (
          <div style={{ flex: 1.5, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 16, paddingBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted }}>
              <div style={{ gridColumn: 'span 8' }}>Brand</div>
              <div style={{ gridColumn: 'span 6', textAlign: 'right' }}>Comments</div>
              <div style={{ gridColumn: 'span 6', textAlign: 'right' }}>Videos</div>
            </div>
            {talk.items.map((i, k) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 16, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${P.hair}` }}>
                <div style={{ gridColumn: 'span 8', fontSize: 16, fontWeight: 600 }}>{i.title}</div>
                {i.measure?.comments != null ? (
                  <>
                    <div data-copy="figure" style={{ gridColumn: 'span 6', textAlign: 'right', fontFamily: MONO, fontSize: 15 }}>{i.measure.comments.toFixed(1)}%</div>
                    <div data-copy="figure" style={{ gridColumn: 'span 6', textAlign: 'right', fontFamily: MONO, fontSize: 15 }}>{(i.measure.videos ?? 0).toFixed(1)}%</div>
                  </>
                ) : <div data-copy="figure" style={{ gridColumn: 'span 12', fontSize: 14 }}>{i.text}</div>}
              </div>
            ))}
            {(talk.lines ?? []).map((t, k) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: `1px solid ${P.hair}` }}>
                <Dot color={P.gold} /><p data-copy="figure" style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{t}</p>
              </div>
            ))}
          </div>
        ) : null}
        {!said.length ? <div style={{ flex: 1, minWidth: 0 }} /> : null}
        {said.length ? (
          <div style={{ flex: 1, minWidth: 0, background: P.ground, borderRadius: 16, padding: '16px 22px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!continued ? <Lead text={s.lead} size={16} /> : null}
            {said.map((g, gi) => (
              <div key={gi} style={{ display: 'flex', flexDirection: 'column' }}>
                {g.label ? <Label color={gi === 0 ? P.ink : P.orangeText} size={12} style={{ paddingBottom: 6, paddingTop: gi ? 8 : 0 }}>{g.label}</Label> : null}
                {g.items.map((i, k) => (
                  <div key={k} style={{ display: 'flex', gap: 12, padding: '11px 0', borderTop: `1px solid ${P.rule}` }}>
                    <Dot />
                    <div style={{ minWidth: 0 }}>
                      <ItemText i={i} />
                      <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** What buyers weigh, and what makes them switch: the lead and a voice on
 *  top, what they weigh on the left, what keeps them and what moves them in
 *  the grey panel. */
function WeighPage({ ctx, s, continued }: { ctx: Ctx; s: BriefSection; continued: boolean }) {
  const { data } = ctx
  const quote = s.quote ? (s.quote as ResolvedBriefQuote) : null
  const [first, ...rest] = s.groups
  const list = (items: BriefItem[], rule: string) => items.map((i, k) => (
    <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 0', borderTop: `1px solid ${rule}` }}>
      <div {...STORED} style={{ fontSize: 16, fontWeight: 700 }}>{i.title}</div>
      <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{i.text}</p>
      <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} style={{ paddingTop: 2 }} />
    </div>
  ))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <SectionHead s={s} continued={continued} sub={null} />
      {!continued && s.lead ? (
        <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
          <div style={{ flex: 1.9, minWidth: 0 }}><Lead text={s.lead} size={20} /></div>
          {quote ? <div style={{ flex: 1, minWidth: 0 }}><QuotePanel q={quote} company={data.company} noun={data.noun} size={15} pad="14px 18px" /></div> : null}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 36, flexGrow: 1, minHeight: 0 }}>
        {first ? (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Label color={P.ink}>{first.label}</Label>
            <div style={{ paddingTop: 6 }}>{list(first.items, P.hair)}</div>
          </div>
        ) : null}
        {/* No lead: the voice sits in the bottom row, beside what they weigh. */}
        {!s.lead && quote ? <div style={{ flex: 1, minWidth: 0 }}><QuotePanel q={quote} company={data.company} noun={data.noun} size={15} pad="14px 18px" /></div> : null}
        {rest.length ? (
          <div style={{ flex: 1.9, minWidth: 0, background: P.ground, borderRadius: 16, padding: '16px 22px', display: 'flex', gap: 28, alignSelf: 'stretch' }}>
            {rest.map((g, gi) => (
              <div key={gi} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <Label color={gi === rest.length - 1 && rest.length > 1 ? P.orangeText : P.ink}>{g.label}</Label>
                <div style={{ paddingTop: 6 }}>{list(g.items, P.rule)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** The risks as dark cards, and the questions for the business under them. */
function RisksPage({ ctx, s, continued, companion, offset, across }: { ctx: Ctx; s: BriefSection; continued: boolean; companion: BriefSection | null; offset: number; across?: number }) {
  const { data } = ctx
  const questions = companion ? allItems(companion) : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <SectionHead s={s} continued={continued} sub={null} />
      {!continued ? <Lead text={s.lead} size={17} /> : null}
      <div style={{ display: 'flex', gap: 20 }}>
        {allItems(s).map((i, k, all) => (
          <div key={k} style={{ flex: `0 0 calc((100% - ${20 * ((across ?? all.length) - 1)}px) / ${across ?? all.length})`, minWidth: 0, background: P.ink, color: '#FFFFFF', borderRadius: 16, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.yellow }}>Risk <span data-copy="figure">{offset + k + 1}</span></div>
            <div {...STORED} style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.25 }}>{i.title}</div>
            <p {...STORED} style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: P.onInk }}>{i.text}</p>
            <div style={{ flexGrow: 1 }} />
            <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} style={{ fontSize: 13, color: '#B9BDC2' }} />
          </div>
        ))}
      </div>
      {questions.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Label color={P.ink}>{companion?.title}</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 36px', paddingTop: 6 }}>
            {questions.map((q, k) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: `1px solid ${P.hair}` }}>
                <div style={{ flexShrink: 0, fontFamily: MONO, fontSize: 13, color: P.muted, paddingTop: 2 }}>{String(k + 1).padStart(2, '0')}</div>
                <div style={{ minWidth: 0 }}>
                  <p {...STORED} style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{q.text}</p>
                  <Who line={whoLineOf(q.videos, q.who, data.company, data.noun)} tag={q.tag} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Where the confusion starts: the lead in the serif, then each confusion on
 *  its own grey card. */
function ConfusionPage({ ctx, s, continued, across }: { ctx: Ctx; s: BriefSection; continued: boolean; across?: number }) {
  const { data } = ctx
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, height: '100%' }}>
      <SectionHead s={s} continued={continued} sub={null} />
      {!continued ? <Lead text={s.lead} size={24} maxWidth={1100} /> : null}
      {!continued && s.lead ? <div style={{ flexGrow: 1 }} /> : null}
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
        {allItems(s).map((i, k, all) => (
          <div key={k} style={{ flex: `0 0 calc((100% - ${14 * ((across ?? Math.max(4, all.length)) - 1)}px) / ${across ?? Math.max(4, all.length)})`, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 18px 16px', background: P.ground, borderRadius: 14 }}>
            <div {...STORED} style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{i.title}</div>
            <ItemText i={i} size={14} />
            <div style={{ flexGrow: 1 }} />
            <Who line={whoLineOf(i.videos, i.who, data.company, data.noun)} tag={i.tag} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** How many of a section's items printed on its earlier pages, for numbering
 *  carried across a continued page. */
function offsetOf(ctx: Ctx, page: DeckPage): number {
  if (page.body.kind !== 'section') return 0
  const key = page.body.section.key
  let n = 0
  for (const p of ctx.pages) {
    if (p.n >= page.n) break
    if (p.body.kind === 'section' && p.body.section.key === key) n += allItems(p.body.section).length
  }
  return n
}

function SectionPage({ ctx, page }: { ctx: Ctx; page: DeckPage }) {
  if (page.body.kind !== 'section') return null
  const { section: s, continued, companion, asPair, across } = page.body
  const offset = offsetOf(ctx, page)
  // A carried-on panel (praised and criticised for; what keeps and moves
  // buyers) is the design's two-column page.
  if (asPair) return <PairPage ctx={ctx} s={s} continued={continued} />
  switch (s.key) {
    case 'sales.buyers': return <BuyersPage ctx={ctx} s={s} continued={continued} across={across} />
    case 'sales.deciders':
    case 'sales.stops':
    case 'content.more': return <RowsPage ctx={ctx} s={s} continued={continued} companion={companion} />
    case 'sales.care': return <CarePage ctx={ctx} s={s} continued={continued} />
    case 'marketing.say_hear': return <SayHearPage ctx={ctx} s={s} continued={continued} />
    case 'sales.rivals':
    case 'marketing.rivals': return <CardsPage ctx={ctx} s={s} continued={continued} across={across} />
    case 'sales.triggers': return <ColumnsPage ctx={ctx} s={s} continued={continued} offset={offset} across={across} />
    case 'marketing.believe':
    case 'marketing.recall':
    case 'content.watch': return <PairPage ctx={ctx} s={s} continued={continued} />
    case 'sales.settle':
    case 'content.questions':
    case 'leadership.decisions': return <QuestionsPage ctx={ctx} s={s} continued={continued} offset={offset} />
    case 'marketing.words': return <WordsPage ctx={ctx} s={s} continued={continued} />
    case 'content.borrow': return <VoicesPage ctx={ctx} s={s} continued={continued} />
    case 'content.formats': return <FormatsPage ctx={ctx} s={s} continued={continued} />
    case 'content.confusion': return <ConfusionPage ctx={ctx} s={s} continued={continued} across={across} />
    case 'leadership.market': return <MarketPage ctx={ctx} s={s} continued={continued} />
    case 'leadership.shares': return <SharesPage ctx={ctx} s={s} continued={continued} />
    case 'leadership.weigh': return <WeighPage ctx={ctx} s={s} continued={continued} />
    case 'leadership.risks': return <RisksPage ctx={ctx} s={s} continued={continued} companion={companion} offset={offset} across={across} />
  }
}

// ---- The deck ----------------------------------------------------------------------------------------

/**
 * Every page of a hydrated brief (quotes resolved), at 1280×720, one under
 * the other. `print` adds the sheet's page size and breaks for the render
 * route; on screen the viewer scales the column to its pane.
 */
export function BriefDeck({ data, builtAt, print = false, gap = 24 }: { data: StoredBriefData; builtAt: string; print?: boolean; gap?: number }) {
  const pages = deckPages(data)
  const ctx: Ctx = { data, date: writtenOn(builtAt), pages, total: pages.length }
  return (
    <div data-brief-deck="" style={{ fontFamily: SANS, color: P.ink, display: 'flex', flexDirection: 'column', gap: print ? 0 : gap, width: SHEET.width }}>
      {/* Every width here is the box's whole width, padding in, as the
          design measures it. */}
      <style>{'[data-brief-deck] *, [data-brief-deck] *::before, [data-brief-deck] *::after { box-sizing: border-box; }'}</style>
      {print ? <style>{`@page { size: ${SHEET.width}px ${SHEET.height}px; margin: 0; } [data-brief-page] { break-after: page; page-break-after: always; } [data-brief-page]:last-child { break-after: auto; page-break-after: auto; }`}</style> : null}
      {pages.map((page) => (
        <div
          key={page.n}
          data-brief-page={page.n}
          style={{ width: SHEET.width, height: SHEET.height, overflow: 'hidden', background: P.paper, ...(print ? {} : { borderRadius: 6, boxShadow: '0 1px 2px rgba(38, 41, 44, 0.06), 0 8px 24px rgba(38, 41, 44, 0.06)' }) }}
        >
          {page.body.kind === 'cover'
            ? <Cover ctx={ctx} />
            : (
              <Frame ctx={ctx} page={page}>
                {page.body.kind === 'in_short' ? <InShort ctx={ctx} summarySize={page.body.summarySize} tocSize={page.body.tocSize} /> : null}
                {page.body.kind === 'finding' && page.body.part === 1 ? <Finding ctx={ctx} f={page.body.finding} plan={page.body.plan} /> : null}
                {page.body.kind === 'finding' && page.body.part === 2 ? <FindingContinued ctx={ctx} f={page.body.finding} plan={page.body.plan} /> : null}
                {page.body.kind === 'section' ? <SectionPage ctx={ctx} page={page} /> : null}
              </Frame>
            )}
        </div>
      ))}
    </div>
  )
}

/** How many pages a brief prints: the viewer's header and the PDF agree. */
export const briefPageCount = (data: StoredBriefData): number => deckPages(data).length
