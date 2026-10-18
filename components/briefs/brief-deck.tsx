import type { ReactNode } from 'react'
import {
  SHEET, contentsOf, continuedTitle, deckPages, heardIn, ideasArgued, monthYear, pairColumn, quoteCite, quoteWords, tagLine, writtenOn,
  type DeckPage, type FindingPlan,
} from '@/lib/reports/briefs/deck'
import { BRIEF_LENS, BRIEF_NAME, type BriefFinding, type BriefItem, type BriefRole, type BriefSection, type SayHearStatus, type StoredBriefData } from '@/lib/reports/briefs/types'

/**
 * The monthly department brief as a deck of 1280×720 sheets, drawn EXACTLY to
 * the approved canvas (the Claude Design canvas "Verbatim reports and colour",
 * page "Monthly briefs": the Brief-{Sales,Marketing,Content,Leadership}-*
 * artboards). Heinrich, 12 Oct: "look just like the design", the same page set
 * and order, the same components, layout, type, colours, spacing, pills,
 * chips, bars and tags, and no deviation. Every size, weight, colour, radius
 * and gap here is the artboard's, read from its HTML. ONE body for the in-app
 * viewer, the printed PDF (the render route, `print`) and a share link, so they
 * cannot disagree.
 *
 * Palette A, as the canvas draws it: yellow #FFD43B, orange #F2651D with the
 * text-safe #C2410C for eyebrows and the orange labels, gold #9A6B00 for the
 * company, rival grey #8A9097, ink #26292C, muted #5F656B, the ground #F7F6F2
 * for panels, hairlines #E3E5E8 and #D9DCE0. IBM Plex Sans for the page, the
 * serif for In short, the leads and every quote (italic), the mono for page
 * numbers and figures, Bricolage Grotesque 700 for the wordmark; each brief's
 * own cover (Sales yellow, Marketing orange, Content white, Leadership ink).
 *
 * THE BANS (Heinrich, 30 Sep): no left-stripe accent on any block, no
 * highlighted phrase, no em dash in visible copy, and no shadow on the paper
 * (hairlines only: Chrome prints a shadow as a grey slab in some PDF viewers).
 *
 * WHAT IT PRINTS AND NOTHING ELSE: the frozen brief, its quotes resolved at
 * render (the words are never stored), every number code's. Copy markers for
 * the render tier (`data-copy`): the writers' words are `stored` from the
 * `monthly_brief` slot (scrubbed at write time), the long-run read's from
 * `week_read`, code's counts `figure`, a commenter's words `quote`.
 *
 * Which page holds what is lib/reports/briefs/deck.ts (pure).
 */

import {
  BRIEF_PALETTE, BRAND, Bar, Dot, Footnote, LONGRUN, Label, MONO, Mark, QuotePanel, SANS, SERIF, STORED, TitleBlock, resolved,
  type ResolvedBriefQuote,
} from './parts'
import { AppSectionPage } from './app-pages'

export { BRIEF_PALETTE, type ResolvedBriefQuote }

const P = BRIEF_PALETTE

/** Each brief's cover, as the canvas colours it. */
const COVER: Readonly<Record<BriefRole, { bg: string; fg: string; mark: string; giant: string }>> = {
  sales: { bg: P.yellow, fg: P.ink, mark: P.ink, giant: P.ink },
  marketing: { bg: P.orange, fg: P.ink, mark: P.ink, giant: P.yellow },
  content: { bg: P.paper, fg: P.ink, mark: P.ink, giant: P.yellow },
  leadership: { bg: P.ink, fg: '#FFFFFF', mark: P.yellow, giant: P.yellow },
}

// ---- The frame ---------------------------------------------------------------------------------------

interface Ctx {
  data: StoredBriefData
  date: string
  pages: DeckPage[]
  total: number
  /** The app's address a page's links are drawn against (relative on
   *  screen; the app's own in a PDF, so a link there clicks through). */
  appUrl: string
}

function Frame({ ctx, page, children }: { ctx: Ctx; page: DeckPage; children: ReactNode }) {
  const { data } = ctx
  return (
    <div style={{ width: SHEET.width, height: SHEET.height, boxSizing: 'border-box', padding: '40px 60px 28px', display: 'flex', flexDirection: 'column', background: P.paper }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 22 }}>
        {/* The October canvas: every page's header links to its page in the
            app (v1 links nowhere, and draws as it always did). */}
        <Label size={13}>{page.href ? <a href={`${ctx.appUrl}${page.href}`} style={{ color: 'inherit', textDecoration: 'none' }}>{page.eyebrow}</a> : page.eyebrow}</Label>
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
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Mark color={c.mark} size={24} />
          <span style={{ fontFamily: BRAND, fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em', color: c.fg }}>Verbatim</span>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{data.company}</div>
        <div style={{ fontSize: 104, fontWeight: 700, lineHeight: 0.98, letterSpacing: '-0.025em' }}>{BRIEF_NAME[data.role]}</div>
        <div style={{ fontSize: 28, fontWeight: 500 }}>{monthYear(data.month)}</div>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>In this brief · <span data-copy="figure">{ctx.total}</span> pages</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px 32px', maxWidth: 980 }}>
          {items.map((t) => <div key={t.n} {...STORED} style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{t.title}</div>)}
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
                <span data-copy="figure" style={{ fontFamily: MONO, color: P.muted, width: 20, flexShrink: 0 }}>{t.n}</span><span {...STORED}>{t.title}</span>
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
  const chips = f.heardFor ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ display: 'flex', gap: 48, flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 1.45, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div {...STORED} style={{ fontSize: plan.headline, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{f.headline}</div>
          {f.saw.map((p, i) => <p key={i} {...STORED} style={{ margin: 0, fontSize: plan.saw, lineHeight: 1.58 }}>{p}</p>)}
          {plan.practice > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
              <Label color={P.muted} size={11}>In practice</Label>
              {f.practice.slice(0, plan.practice).map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}><Dot /><div {...STORED} style={{ fontSize: Math.min(15, plan.saw), lineHeight: 1.5 }}>{t}</div></div>
              ))}
            </div>
          ) : null}
          {placed('left').map((q, k) => <QuotePanel key={k} q={q} company={data.company} size={15} pad="14px 18px" />)}
          <div style={{ flexGrow: 1 }} />
          {heard ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div data-copy="figure" style={{ fontSize: 13, color: P.muted }}>{heard}</div>
              {f.subjectLine ? <div data-copy="figure" style={{ fontSize: 13, color: P.ink }}>{f.subjectLine}</div> : null}
            </div>
          ) : null}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: P.yellow, borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label color={P.ink}>{BRIEF_LENS[data.role]}</Label>
            <p {...STORED} style={{ margin: 0, fontSize: plan.means, fontWeight: 500, lineHeight: 1.5 }}>{f.means}</p>
          </div>
          {placed('right').map((q, k) => <QuotePanel key={k} q={q} company={data.company} size={k === 0 ? 18 : 16} pad={k === 0 ? '20px 24px' : '16px 20px'} />)}
        </div>
      </div>
      {chips.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <Label color={P.muted} size={11}>What each brand is heard for</Label>
          <div style={{ display: 'flex', gap: 12 }}>
            {chips.map((c, k) => (
              <div key={k} style={{ flex: 1, minWidth: 0, padding: '12px 16px', borderRadius: 12, background: c.you ? P.ink : P.ground, ...(c.you ? { color: '#FFFFFF' } : {}) }}>
                <Label size={12} spacing="0.06em" color={c.you ? P.yellow : P.muted}>{c.name}</Label>
                <div {...STORED} style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, paddingTop: 3 }}>{c.phrase}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---- Section pages -------------------------------------------------------------------------------------

const allItems = (s: BriefSection): BriefItem[] => s.groups.flatMap((g) => g.items)

interface PageProps { ctx: Ctx; s: BriefSection; continued: boolean; companion: BriefSection | null; sub: string | null; footnote: string | null }

const titleOf = (s: BriefSection, continued: boolean) => (continued ? continuedTitle(s.title) : s.title)

/** Who is buying: two buyer cards a page, each with its columns and the
 *  "For a sale" row (Brief-Sales-04, -05). */
function BuyersPage({ s, continued, sub, footnote }: PageProps) {
  const items = allItems(s)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={titleOf(s, continued)} sub={sub} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexGrow: 1, minHeight: 0 }}>
        {/* Equal halves, as the canvas draws them; a card never draws
            shorter than its words (the plan fits two only where both do). */}
        {items.map((i, k) => (
          <div key={k} style={{ flex: 1, border: `1px solid ${P.hair}`, borderRadius: 16, padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ flex: 1.15, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div {...STORED} style={{ fontSize: 24, fontWeight: 700, ...(i.muted ? { color: P.muted } : {}) }}>{i.title}</div>
                {i.pill ? <div {...STORED} style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted, border: `1px solid ${P.pill}`, borderRadius: 999, padding: '3px 9px' }}>{i.pill}</div> : null}
                <p {...STORED} style={{ margin: 0, fontFamily: SERIF, fontSize: 15, lineHeight: 1.45 }}>{i.text}</p>
              </div>
              {([['What they want', i.persona?.want], ['What stops them', i.persona?.stops], ['What moves them', i.persona?.moves]] as const).map(([label, text]) => (
                <div key={label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {text ? <><Label color={P.muted} size={10}>{label}</Label><p {...STORED} style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>{text}</p></> : null}
                </div>
              ))}
            </div>
            <div style={{ flexGrow: 1 }} />
            {i.persona?.forSale ? (
              <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', paddingTop: 10, borderTop: `1px solid ${P.hair}` }}>
                <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: i.muted ? P.track : P.yellow, borderRadius: 6, padding: '3px 8px' }}>For a sale</div>
                <p {...STORED} style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: 1.45 }}>{i.persona.forSale}</p>
              </div>
            ) : null}
          </div>
        ))}
        {/* Two to a page, as the canvas draws them: one buyer keeps half, or
            what it needs. */}
        {items.length === 1 ? <div style={{ flex: 1 }} /> : null}
      </div>
      <Footnote text={footnote} />
    </div>
  )
}

/** What stops them: the rows, and beside them the voice and what they want
 *  settled first (Brief-Sales-06). */
function StopsPage({ ctx, s, companion, sub, footnote }: PageProps) {
  const quote = resolved(s.quote)
  return (
    <div style={{ display: 'flex', gap: 44, height: '100%' }}>
      <div style={{ flex: 1.75, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TitleBlock title={s.title} sub={sub} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {allItems(s).map((i, k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 24, padding: '12px 0', borderTop: `1px solid ${P.hair}` }}>
              <div {...STORED} style={{ gridColumn: 'span 3', fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{i.title}</div>
              <p {...STORED} style={{ gridColumn: 'span 7', margin: 0, fontSize: 15, lineHeight: 1.55 }}>{i.text}</p>
            </div>
          ))}
        </div>
        <Footnote text={footnote} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {quote ? <QuotePanel q={quote} company={ctx.data.company} size={17} /> : null}
        {companion ? (
          <div style={{ background: P.ground, borderRadius: 16, padding: '14px 20px 8px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingBottom: 8 }}><Label color={P.ink}>{companion.title}</Label></div>
            {allItems(companion).map((i, k) => (
              <div key={k} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: `1px solid ${P.rule}` }}>
                <Dot />
                <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{i.text}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** What tips them into buying: numbered moments, and a voice for each of the
 *  first moments that has one (Brief-Sales-07). */
function TriggersPage({ ctx, s, sub, footnote }: PageProps) {
  const items = allItems(s)
  const quoted = items.filter((i) => resolved(i.quote))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', gap: 24 }}>
        {Array.from({ length: Math.max(5, items.length) }, (_v, k) => items[k] ?? null).map((i, k) => (
          <div key={k} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {i ? (
              <>
                <div data-copy="figure" style={{ fontFamily: MONO, fontSize: 13, color: P.muted, paddingTop: 12, borderTop: `2px solid ${P.ink}` }}>{String(k + 1).padStart(2, '0')}</div>
                <div {...STORED} style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{i.title}</div>
                <p {...STORED} style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{i.text}</p>
              </>
            ) : null}
          </div>
        ))}
      </div>
      <Footnote text={footnote} />
      <div style={{ flexGrow: 1 }} />
      {quoted.length ? (
        <div style={{ display: 'flex', gap: 20, alignItems: 'stretch' }}>
          {Array.from({ length: 3 }, (_v, k) => quoted[k] ?? null).map((i, k) => (
            <div key={k} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {i ? (
                <>
                  <Label color={P.muted} size={11}><span {...STORED}>{i.title}</span></Label>
                  <QuotePanel q={resolved(i.quote)!} company={ctx.data.company} size={15} pad="14px 18px" grow />
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Who buyers compare you with: a card a rival with the job it is bought for,
 *  what buyers praise and where they push back; "Also in the set" and a voice
 *  on a rival under them (Brief-Sales-08). */
function RivalsBoughtPage({ ctx, s, sub, footnote }: PageProps) {
  const items = allItems(s)
  const quoted = items.find((i) => resolved(i.quote)) ?? null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', gap: 20 }}>
        {Array.from({ length: Math.max(3, items.length) }, (_v, k) => items[k] ?? null).map((i, k) => i ? (
          <div key={k} style={{ flex: 1, minWidth: 0, border: `1px solid ${P.hair}`, borderRadius: 16, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{i.title}</div>
              {i.pill ? <div {...STORED} style={{ alignSelf: 'flex-start', fontSize: 14, fontWeight: 600, background: P.ground, borderRadius: 8, padding: '5px 10px' }}>{i.pill}</div> : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label color={P.muted} size={11}>What buyers praise</Label>
              <p {...STORED} style={{ margin: 0, fontSize: 14.5, lineHeight: 1.52 }}>{i.text}</p>
            </div>
            {i.detail ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label size={11}>Where buyers push back</Label>
                <p {...STORED} style={{ margin: 0, fontSize: 14.5, lineHeight: 1.52 }}>{i.detail}</p>
              </div>
            ) : null}
          </div>
        ) : <div key={k} style={{ flex: 1, minWidth: 0 }} />)}
      </div>
      <Footnote text={footnote} />
      <div style={{ flexGrow: 1 }} />
      {s.also || quoted ? (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, ...(s.also ? { paddingTop: 12, borderTop: `1px solid ${P.hair}` } : {}) }}>
            {s.also ? <><Label color={P.muted} size={11}>Also in the set</Label><p {...STORED} style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{s.also}</p></> : null}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {quoted ? (
              <>
                <Label color={P.muted} size={11}>On {quoted.title}</Label>
                <QuotePanel q={resolved(quoted.quote)!} company={ctx.data.company} size={14} pad="12px 16px" labelled />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Language to handle with care: the words large, what buyers think of them
 *  beside (Brief-Sales-09). */
function CarePage({ s, sub, footnote }: PageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {allItems(s).map((i, k) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 28, alignItems: 'baseline', padding: '22px 0', borderTop: `1px solid ${P.hair}` }}>
            <div {...STORED} style={{ gridColumn: 'span 5', fontSize: 32, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.15 }}>{i.title}</div>
            <p {...STORED} style={{ gridColumn: 'span 7', margin: 0, fontSize: 20, lineHeight: 1.5 }}>{i.text}</p>
          </div>
        ))}
      </div>
      <Footnote text={footnote} />
    </div>
  )
}

/** Believes and doubts: two columns of bullets, the voice at the foot of the
 *  right (Brief-Marketing-05). */
function BelievePage({ ctx, s, sub, footnote }: PageProps) {
  const quote = resolved(s.quote)
  const cols = [s.groups.find((g) => pairColumn(g.label) === 0) ?? null, s.groups.find((g) => pairColumn(g.label) === 1) ?? null]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', gap: 48, flexGrow: 1, minHeight: 0 }}>
        {cols.map((g, c) => (
          <div key={c} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {g?.label ? <Label color={c === 0 ? P.ink : P.orangeText} size={13}>{g.label}</Label> : null}
            <div style={{ paddingTop: 6 }}>
              {(g?.items ?? []).map((i, k) => (
                <div key={k} style={{ display: 'flex', gap: 12, padding: '11px 0', borderTop: `1px solid ${P.hair}` }}>
                  <Dot />
                  <p {...STORED} style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{i.text}</p>
                </div>
              ))}
            </div>
            {c === 0 ? <Footnote text={footnote} /> : null}
            {c === 1 && quote ? <><div style={{ flexGrow: 1 }} /><QuotePanel q={quote} company={ctx.data.company} size={17} /></> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/** In its own words: the market's words as chips, how it describes the
 *  problem, and what makes it stop, share and argue (Brief-Marketing-06). */
function WordsPage({ s, sub }: PageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', gap: 48, flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 1.4, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {(s.chips ?? []).map((c, k) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Label color={P.muted} size={11}>{c.label}</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {c.words.map((w) => <span key={w} {...STORED} style={{ display: 'inline-block', fontSize: 15, fontWeight: 500, border: `1px solid ${P.pill}`, borderRadius: 999, padding: '5px 13px' }}>{w}</span>)}
              </div>
            </div>
          ))}
          {s.lead ? <p {...STORED} style={{ margin: 0, fontFamily: SERIF, fontSize: 18, fontWeight: 500, lineHeight: 1.5 }}>{s.lead}</p> : null}
        </div>
        {s.panel?.rows.length ? (
          <div style={{ flex: 1, minWidth: 0, background: P.ground, borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingBottom: 10 }}><Label color={P.ink}>{s.panel.title}</Label></div>
            {s.panel.rows.map((r, k) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 0', borderTop: `1px solid ${P.rule}` }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{r.title}</div>
                <p {...STORED} style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{r.text}</p>
              </div>
            ))}
          </div>
        ) : <div style={{ flex: 1, minWidth: 0 }} />}
      </div>
    </div>
  )
}

/** The canvas's status pills on Says and hears. */
const STATUS: Readonly<Record<SayHearStatus, { label: string; color: string; bg: string; border: string }>> = {
  heard_back: { label: 'Heard back', color: P.ink, bg: P.yellow, border: P.yellow },
  not_echoed: { label: 'Not echoed', color: P.orangeText, bg: '#FFFFFF', border: P.orangeText },
  heard_as_values: { label: 'Heard as values', color: P.ink, bg: '#FFFFFF', border: P.pillGrey },
  tested: { label: 'Tested', color: P.ink, bg: '#FFFFFF', border: P.pillGrey },
  confused: { label: 'Confused', color: P.orangeText, bg: '#FFFFFF', border: P.orangeText },
}

/** What the company says, and what comes back: each claim, its status, what
 *  the market says back (Brief-Marketing-07). */
function SayHearPage({ ctx, s, footnote }: PageProps) {
  const co = ctx.data.company
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <TitleBlock title={s.title} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 24, paddingBottom: 8 }}>
          <div style={{ gridColumn: 'span 9' }}><Label color={P.muted} size={11}>What {co} says in its own posts</Label></div>
          <div style={{ gridColumn: 'span 4' }} />
          <div style={{ gridColumn: 'span 11' }}><Label color={P.muted} size={11}>What comes back from the market</Label></div>
        </div>
        {allItems(s).map((i, k) => {
          const st = i.status ? STATUS[i.status] : null
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 24, alignItems: 'start', padding: '17px 0', borderTop: `1px solid ${P.hair}` }}>
              <p style={{ gridColumn: 'span 9', margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.45 }}>{i.title}</p>
              <div style={{ gridColumn: 'span 4' }}>
                {st ? <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: st.color, background: st.bg, border: `1px solid ${st.border}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>{st.label}</span> : null}
              </div>
              <p {...STORED} style={{ gridColumn: 'span 11', margin: 0, fontSize: 16, lineHeight: 1.5 }}>{i.text}</p>
            </div>
          )
        })}
      </div>
      <Footnote text={footnote} />
    </div>
  )
}

/** How rivals are heard: a card a rival and the company's own, then each
 *  brand's own posts and how many drew a reply (Brief-Marketing-08). */
function RivalsHeardPage({ ctx, s, sub, footnote }: PageProps) {
  const items = allItems(s)
  const posts = s.posts?.rows ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} size={30} />
      {items.length ? (
        <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
          {items.map((i, k) => (
            <div key={k} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 20px', borderRadius: 16, ...(i.you ? { background: P.ground } : { border: `1px solid ${P.hair}` }) }}>
              <Label size={12} spacing="0.06em" color={i.you ? P.gold : P.muted}>{i.you ? `${ctx.data.company} (you)` : i.title}</Label>
              {i.pill ? <div {...STORED} style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{i.pill}</div> : null}
              <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{i.text}</p>
            </div>
          ))}
        </div>
      ) : null}
      <Footnote text={footnote} />
      {posts.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 6 }}>
          <Label color={P.ink}><span data-copy="figure">{s.posts!.title}</span></Label>
          <div style={{ paddingTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 16, paddingBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted }}>
              <div style={{ gridColumn: 'span 6' }}>Brand</div>
              <div style={{ gridColumn: 'span 3', textAlign: 'right' }}>Posts</div>
              <div style={{ gridColumn: 'span 3', textAlign: 'right' }}>Five or more comments</div>
              <div style={{ gridColumn: 'span 12', paddingLeft: 12 }}>Share of its posts that started a conversation</div>
            </div>
            {posts.map((r, k) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 16, alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${P.hair}` }}>
                <div style={{ gridColumn: 'span 6', fontSize: 15, fontWeight: r.you ? 700 : 600, color: r.you ? P.gold : P.ink }}>{r.you ? `${r.name} (you)` : r.name}</div>
                <div data-copy="figure" style={{ gridColumn: 'span 3', textAlign: 'right', fontFamily: MONO, fontSize: 14 }}>{r.posts}</div>
                <div data-copy="figure" style={{ gridColumn: 'span 3', textAlign: 'right', fontFamily: MONO, fontSize: 14 }}>{r.five}</div>
                <div style={{ gridColumn: 'span 12', display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 12 }}>
                  <Bar pct={r.pct} color={r.you ? P.gold : P.rival} h={10} />
                  <div data-copy="figure" style={{ width: 44, fontFamily: MONO, fontSize: 14, fontWeight: 500 }}>{r.pct}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The questions people ask: numbered, two columns, a makers' question in grey
 *  (Brief-Content-04). */
function QuestionsPage({ s, sub, footnote }: PageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 44px' }}>
        {allItems(s).map((i, k) => (
          <div key={k} style={{ display: 'flex', gap: 14, padding: '15px 0', borderTop: `1px solid ${P.hair}` }}>
            <div data-copy="figure" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 15, background: i.muted ? P.track : P.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 14, fontWeight: 500 }}>{k + 1}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div {...STORED} style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{i.text}</div>
              {i.detail ? <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: P.muted }}>{i.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
      <Footnote text={footnote} />
    </div>
  )
}

/** Hooks and formats that work: the category's formats and openings, the
 *  company's and a rival's counts beside them, and what the numbers say
 *  (Brief-Content-05). */
function FormatsPage({ ctx, s, sub }: PageProps) {
  const { data } = ctx
  const rival = s.rival ?? null
  const lines = s.lines ?? []
  const own = s.groups.some((g) => g.items.some((i) => i.measure?.own != null))
  const cols = { label: 4, cat: rival ? 7 : own ? 10 : 13, own: 3, rival: 3, eng: 3 }
  const head = { display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 14, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', gap: 40, flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 1.85, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {s.groups.map((g, gi) => (
            <div key={gi} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8 }}>
                <div style={head}>
                  <div style={{ gridColumn: `span ${cols.label}` }}>{g.label}</div>
                  <div style={{ gridColumn: `span ${cols.cat}` }}>The category</div>
                  {own ? <div style={{ gridColumn: `span ${cols.own}`, textAlign: 'right' }}>{data.company}</div> : null}
                  {rival ? <div style={{ gridColumn: `span ${cols.rival}`, textAlign: 'right' }}>{rival}</div> : null}
                  <div style={{ gridColumn: `span ${cols.eng}`, textAlign: 'right' }}>Engagement</div>
                </div>
                {g.base ? <div data-copy="figure" style={{ fontSize: 12, color: P.muted }}>{g.base}</div> : null}
              </div>
              {g.items.map((i, k) => {
                const m = i.measure ?? {}
                return (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 14, alignItems: 'center', padding: '9px 0', borderTop: `1px solid ${P.hair}` }}>
                    <div style={{ gridColumn: `span ${cols.label}`, fontSize: 16, fontWeight: 600 }}>{i.title}</div>
                    <div style={{ gridColumn: `span ${cols.cat}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Bar pct={m.pct ?? 0} color={P.yellow} h={10} />
                      <div data-copy="figure" style={{ width: 52, fontFamily: MONO, fontSize: 14 }}>{(m.pct ?? 0).toFixed(1)}%</div>
                    </div>
                    {own ? <div data-copy="figure" style={{ gridColumn: `span ${cols.own}`, textAlign: 'right', fontFamily: MONO, fontSize: 14 }}>{m.own ?? ''}</div> : null}
                    {rival ? <div data-copy="figure" style={{ gridColumn: `span ${cols.rival}`, textAlign: 'right', fontFamily: MONO, fontSize: 14 }}>{m.rival ?? ''}</div> : null}
                    <div data-copy="figure" style={{ gridColumn: `span ${cols.eng}`, textAlign: 'right', fontFamily: MONO, fontSize: 14, ...(m.above ? { fontWeight: 500, color: P.ink } : { color: P.muted }) }}>{m.median != null ? `${m.median.toFixed(1)}%` : ''}</div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {lines.length || s.note ? (
          <div style={{ flex: 1, minWidth: 0, background: P.ground, borderRadius: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingBottom: 8 }}><Label color={P.ink}>What the numbers say</Label></div>
            {lines.map((t, k) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: `1px solid ${P.rule}` }}>
                <Dot /><p data-copy="figure" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{t}</p>
              </div>
            ))}
            <div style={{ flexGrow: 1 }} />
            {s.note ? <div data-copy="figure" style={{ fontSize: 13, color: P.muted }}>{s.note}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** What viewers come for, and what loses them: the lead in the serif, then
 *  the two columns (Brief-Content-06). */
function WatchPage({ s, footnote }: PageProps) {
  const cols = [s.groups.find((g) => pairColumn(g.label) === 0) ?? null, s.groups.find((g) => pairColumn(g.label) === 1) ?? null]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, height: '100%' }}>
      <TitleBlock title={s.title} />
      {s.lead ? <p {...STORED} style={{ margin: 0, fontFamily: SERIF, fontSize: 23, fontWeight: 500, lineHeight: 1.5, maxWidth: 1080 }}>{s.lead}</p> : null}
      <div style={{ display: 'flex', gap: 48, flexGrow: 1, minHeight: 0 }}>
        {cols.map((g, c) => (
          <div key={c} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {g?.label ? <Label color={c === 0 ? P.ink : P.orangeText}>{g.label}</Label> : null}
            <div style={{ paddingTop: 8 }}>
              {(g?.items ?? []).map((i, k) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '18px 0', borderTop: `1px solid ${P.hair}` }}>
                  <div {...STORED} style={{ fontSize: 21, fontWeight: 700 }}>{i.title}</div>
                  <p {...STORED} style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>{i.text}</p>
                </div>
              ))}
            </div>
            {c === 0 ? <Footnote text={footnote} /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/** What people want to be shown: the rows, a voice at the foot beside them
 *  (Brief-Content-07). */
function MorePage({ ctx, s, sub, footnote }: PageProps) {
  const quote = resolved(s.quote)
  return (
    <div style={{ display: 'flex', gap: 48, height: '100%' }}>
      <div style={{ flex: 1.75, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TitleBlock title={s.title} sub={sub} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {allItems(s).map((i, k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 24, padding: '19px 0', borderTop: `1px solid ${P.hair}` }}>
              <div {...STORED} style={{ gridColumn: 'span 3', fontSize: 21, fontWeight: 700, lineHeight: 1.3 }}>{i.title}</div>
              <p {...STORED} style={{ gridColumn: 'span 7', margin: 0, fontSize: 17, lineHeight: 1.55 }}>{i.text}</p>
            </div>
          ))}
        </div>
        <Footnote text={footnote} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'flex-end' }}>
        {quote ? <QuotePanel q={quote} company={ctx.data.company} size={19} /> : null}
      </div>
    </div>
  )
}

/** Where the confusion starts: the lead in the serif, where it starts, then
 *  a card a confusion (Brief-Content-08). */
function ConfusionPage({ s, footnote }: PageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, height: '100%' }}>
      <TitleBlock title={s.title} />
      {s.lead ? <p {...STORED} style={{ margin: 0, fontFamily: SERIF, fontSize: 26, fontWeight: 500, lineHeight: 1.45, maxWidth: 1100 }}>{s.lead}</p> : null}
      {s.note ? <p {...STORED} style={{ margin: 0, fontSize: 19, lineHeight: 1.55, maxWidth: 1040 }}>{s.note}</p> : null}
      <div style={{ flexGrow: 1 }} />
      <Footnote text={footnote} />
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
        {allItems(s).map((i, k) => (
          <div key={k} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 18px 20px', background: P.ground, borderRadius: 14 }}>
            <div {...STORED} style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{i.title}</div>
            <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{i.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The canvas's mood colours, in its order. */
const MOOD_COLOUR: Readonly<Record<string, string>> = { positive: P.yellow, mixed: P.mixed, neutral: P.neutral, negative: P.orangeText }
const pctText = (x: number): string => `${Number.isInteger(x) ? x : x.toFixed(1)}%`

/** Where the market stands: each subject's share as a bar and a line or a
 *  voice beside it, who else is followed, and what people did in the
 *  comments and the mood (Brief-Leadership-03). */
function MarketPage({ ctx, s, sub, footnote }: PageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em' }}>{s.title}</div>
        </div>
        {sub ? <div data-copy="figure" style={{ fontSize: 14, color: P.muted, paddingBottom: 6 }}>{sub}</div> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {allItems(s).map((i, k) => {
          const q = !i.text ? resolved(i.quote) : null
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 24, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${P.hair}` }}>
              <div style={{ gridColumn: 'span 5', fontSize: 18, fontWeight: 700 }}>{i.title}</div>
              <div style={{ gridColumn: 'span 8', display: 'flex', alignItems: 'center', gap: 14 }}>
                {i.measure?.pct != null ? (
                  <>
                    <Bar pct={i.measure.pct} color={P.yellow} h={12} />
                    <div data-copy="figure" style={{ width: 48, fontFamily: MONO, fontSize: 16, fontWeight: 500 }}>{i.measure.pct}%</div>
                  </>
                ) : null}
              </div>
              <div style={{ gridColumn: 'span 11' }}>
                {q ? (
                  <p style={{ margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, lineHeight: 1.5 }}>
                    <span data-copy="quote">“{quoteWords(q)}”</span> <span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 12, color: P.muted }}>{quoteCite(q, ctx.data.company)}</span>
                  </p>
                ) : <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{i.text}</p>}
              </div>
            </div>
          )
        })}
      </div>
      {s.also ? <div data-copy="figure" style={{ padding: '10px 0 0', borderTop: `1px solid ${P.hair}`, fontSize: 14, color: P.muted }}>{s.also}</div> : null}
      <Footnote text={footnote} />
      <div style={{ flexGrow: 1 }} />
      {s.kinds || s.mood ? (
        <div style={{ display: 'flex', gap: 40, background: P.ground, borderRadius: 16, padding: '14px 22px' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {s.kinds ? (
              <>
                <Label color={P.ink} size={11}>What people do in the comments</Label>
                <div data-copy="figure" style={{ fontSize: 12, color: P.muted }}>{s.kinds.base}</div>
                {s.kinds.rows.map((r, k) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 150, flexShrink: 0, fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                    <div style={{ flexGrow: 1, height: 8, borderRadius: 4, background: P.track, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, r.pct)}%`, height: 8, background: P.ink }} /></div>
                    <div data-copy="figure" style={{ width: 50, fontFamily: MONO, fontSize: 14 }}>{Math.round(r.pct)}%</div>
                  </div>
                ))}
              </>
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {s.mood ? (
              <>
                <Label color={P.ink} size={11}>The mood</Label>
                <div data-copy="figure" style={{ fontSize: 12, color: P.muted }}>{s.mood.base}</div>
                <div style={{ display: 'flex', height: 16, borderRadius: 5, overflow: 'hidden', background: P.track, marginTop: 4 }}>
                  {s.mood.rows.map((r) => <div key={r.mood} style={{ width: `${r.pct}%`, background: MOOD_COLOUR[r.mood] ?? P.rival }} />)}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {s.mood.rows.map((r) => (
                    <div key={r.mood} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: MOOD_COLOUR[r.mood] ?? P.rival }} />{r.label} <span data-copy="figure" style={{ fontFamily: MONO }}>{pctText(r.pct)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** One stacked share bar: the company in gold, its rivals in grey, the rest
 *  the track. */
function ShareBarRow({ label, bar }: { label: string; bar: NonNullable<BriefSection['shares']>['comments'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div data-copy="figure" style={{ color: P.muted }}>{bar.line}</div>
      </div>
      <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: P.track }}>
        <div style={{ width: `${bar.client}%`, background: P.gold }} />
        <div style={{ width: 2, background: '#FFFFFF' }} />
        <div style={{ width: `${bar.rivals}%`, background: P.rival }} />
      </div>
    </div>
  )
}

/** Where the company stands against its rivals: the shares of the month's
 *  comments and videos, the brands' table, and the notes (Brief-Leadership-04). */
function SharesPage({ s, sub }: PageProps) {
  const notes = s.lines ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      {s.shares ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ShareBarRow label="Share of comments" bar={s.shares.comments} />
          {s.shares.videos ? <ShareBarRow label="Share of videos" bar={s.shares.videos} /> : null}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 40, flexGrow: 1, minHeight: 0, alignItems: 'flex-start' }}>
        <div style={{ flex: 1.5, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 16, paddingBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted }}>
            <div style={{ gridColumn: 'span 6' }}>Brand</div>
            <div style={{ gridColumn: 'span 3', textAlign: 'right' }}>Comments</div>
            <div style={{ gridColumn: 'span 3', textAlign: 'right' }}>Videos</div>
            <div style={{ gridColumn: 'span 8', paddingLeft: 12 }}>Where it is talked about</div>
          </div>
          {allItems(s).map((i, k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 16, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${P.hair}` }}>
              <div style={{ gridColumn: 'span 6', fontSize: 16, fontWeight: i.you ? 700 : 600, color: i.you ? P.gold : P.ink }}>{i.title}</div>
              <div data-copy="figure" style={{ gridColumn: 'span 3', textAlign: 'right', fontFamily: MONO, fontSize: 15 }}>{(i.measure?.comments ?? 0).toFixed(1)}%</div>
              <div data-copy="figure" style={{ gridColumn: 'span 3', textAlign: 'right', fontFamily: MONO, fontSize: 15 }}>{(i.measure?.videos ?? 0).toFixed(1)}%</div>
              <div style={{ gridColumn: 'span 8', fontSize: 14, color: P.muted, paddingLeft: 12 }}>{i.detail ?? ''}</div>
            </div>
          ))}
        </div>
        {notes.length ? (
          <div style={{ flex: 1, minWidth: 0, background: P.ground, borderRadius: 16, padding: '10px 22px 8px', display: 'flex', flexDirection: 'column' }}>
            {notes.map((t, k) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: `1px solid ${P.rule}` }}>
                <Dot /><p data-copy="figure" style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{t}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** What buyers weigh, and what makes them switch: the lead and a voice on
 *  top, what they weigh on the left, what holds and moves them in the panel
 *  (Brief-Leadership-06). */
function WeighPage({ ctx, s, footnote }: PageProps) {
  const quote = resolved(s.quote)
  const [first, ...rest] = s.groups
  const list = (items: BriefItem[], rule: string) => items.map((i, k) => (
    <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 0', borderTop: `1px solid ${rule}` }}>
      <div {...STORED} style={{ fontSize: 16, fontWeight: 700 }}>{i.title}</div>
      <p {...STORED} style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{i.text}</p>
    </div>
  ))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} />
      {s.lead || quote ? (
        <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
          <p {...STORED} style={{ flex: 1.9, minWidth: 0, margin: 0, fontFamily: SERIF, fontSize: 20, fontWeight: 500, lineHeight: 1.5 }}>{s.lead ?? ''}</p>
          <div style={{ flex: 1, minWidth: 0 }}>{quote ? <QuotePanel q={quote} company={ctx.data.company} size={15} pad="14px 18px" /> : null}</div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 36, flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {first ? <><Label color={P.ink}>{first.label}</Label><div style={{ paddingTop: 6 }}>{list(first.items, P.hair)}</div></> : null}
          <Footnote text={footnote} />
        </div>
        {rest.length ? (
          <div style={{ flex: 1.9, minWidth: 0, background: P.ground, borderRadius: 16, padding: '16px 22px', display: 'flex', gap: 28 }}>
            {rest.map((g, gi) => (
              <div key={gi} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <Label color={pairColumn(g.label) === 1 ? P.orangeText : P.ink}>{g.label}</Label>
                <div style={{ paddingTop: 6 }}>{list(g.items, P.rule)}</div>
              </div>
            ))}
          </div>
        ) : <div style={{ flex: 1.9, minWidth: 0 }} />}
      </div>
    </div>
  )
}

/** The risks, in business terms: dark risk cards, and the questions for the
 *  business under them (Brief-Leadership-07). */
function RisksPage({ s, companion }: PageProps) {
  const questions = companion ? allItems(companion) : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <TitleBlock title={s.title} />
      <div style={{ display: 'flex', gap: 20 }}>
        {allItems(s).map((i, k) => (
          <div key={k} style={{ flex: 1, minWidth: 0, background: P.ink, color: '#FFFFFF', borderRadius: 16, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.yellow }}>Risk <span data-copy="figure">{k + 1}</span></div>
            <div {...STORED} style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.25 }}>{i.title}</div>
            <p {...STORED} style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: P.onInk }}>{i.text}</p>
            <div style={{ flexGrow: 1 }} />
            {tagLine(i.tag) ? <div style={{ fontSize: 13, color: P.onInkMuted }}>{tagLine(i.tag)}</div> : null}
          </div>
        ))}
      </div>
      {questions.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Label color={P.ink}>{companion?.title}</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 36px', paddingTop: 6 }}>
            {questions.map((q, k) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: `1px solid ${P.hair}` }}>
                <div data-copy="figure" style={{ flexShrink: 0, fontFamily: MONO, fontSize: 13, color: P.muted, paddingTop: 2 }}>{String(k + 1).padStart(2, '0')}</div>
                <p {...STORED} style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{q.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** What holds so far: the month's long-run patterns, numbered, the company's
 *  position in one line, and the month's ideas with where each is argued
 *  (Brief-Leadership-08). */
function HoldsPage({ ctx, s, sub }: PageProps) {
  const { data } = ctx
  const ideas = ideasArgued(data)
  const count = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][ideas.length] ?? String(ideas.length)
  return (
    <div style={{ display: 'flex', gap: 56, height: '100%' }}>
      <div style={{ flex: 1.5, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TitleBlock title={s.title} sub={sub} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {allItems(s).map((i, k) => (
            <div key={k} style={{ display: 'flex', gap: 22, padding: '18px 0', borderTop: `1px solid ${P.hair}` }}>
              <div data-copy="figure" style={{ flexShrink: 0, fontFamily: MONO, fontSize: 15, color: P.muted, paddingTop: 4 }}>{String(k + 1).padStart(2, '0')}</div>
              <p {...LONGRUN} style={{ margin: 0, fontFamily: SERIF, fontSize: 22, fontWeight: 500, lineHeight: 1.45 }}>{i.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {s.position ? (
          <div style={{ background: P.yellow, borderRadius: 16, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label color={P.ink} size={11}>{data.company}&apos;s position, in one line</Label>
            <p {...STORED} style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.4 }}>{s.position.text}</p>
          </div>
        ) : null}
        {ideas.length ? (
          <div style={{ background: P.ground, borderRadius: 16, padding: '16px 22px 6px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingBottom: 8 }}><Label color={P.ink} size={11}>The month&apos;s {ideas.length === 1 ? 'idea, and where it is argued' : `${count} ideas, and where each is argued`}</Label></div>
            {ideas.map((x, k) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 0', borderTop: `1px solid ${P.rule}` }}>
                <Label color={x.own ? P.gold : P.muted} size={11}>{x.own ? 'This brief' : BRIEF_NAME[x.brief]}</Label>
                <div {...STORED} style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{x.headline}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** A section the canvas draws no page for, where the switch prints it: the
 *  canvas's rows (What stops them). */
function RowsPage({ s, sub, footnote }: PageProps) {
  return (
    <div style={{ display: 'flex', gap: 44, height: '100%' }}>
      <div style={{ flex: 1.75, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TitleBlock title={s.title} sub={sub} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {allItems(s).map((i, k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 24, padding: '12px 0', borderTop: `1px solid ${P.hair}` }}>
              <div {...STORED} style={{ gridColumn: 'span 3', fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{i.title ?? ''}</div>
              <p {...STORED} style={{ gridColumn: 'span 7', margin: 0, fontSize: 15, lineHeight: 1.55 }}>{i.text}</p>
            </div>
          ))}
        </div>
        <Footnote text={footnote} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }} />
    </div>
  )
}

function SectionPage({ ctx, page }: { ctx: Ctx; page: DeckPage }) {
  if (page.body.kind !== 'section') return null
  const { section: s, continued, companion, sub, footnote } = page.body
  const props: PageProps = { ctx, s, continued, companion, sub, footnote }
  const app = AppSectionPage({ data: ctx.data, appUrl: ctx.appUrl, s, continued, sub, footnote })
  if (app) return app
  switch (s.key) {
    case 'sales.buyers': return <BuyersPage {...props} />
    case 'sales.stops': return <StopsPage {...props} />
    case 'sales.triggers': return <TriggersPage {...props} />
    case 'sales.rivals': return <RivalsBoughtPage {...props} />
    case 'sales.care': return <CarePage {...props} />
    case 'marketing.believe': return <BelievePage {...props} />
    case 'marketing.words': return <WordsPage {...props} />
    case 'marketing.say_hear': return <SayHearPage {...props} />
    case 'marketing.rivals': return <RivalsHeardPage {...props} />
    case 'content.questions': return <QuestionsPage {...props} />
    case 'content.formats': return <FormatsPage {...props} />
    case 'content.watch': return <WatchPage {...props} />
    case 'content.more': return <MorePage {...props} />
    case 'content.confusion': return <ConfusionPage {...props} />
    case 'leadership.market': return <MarketPage {...props} />
    case 'leadership.shares': return <SharesPage {...props} />
    case 'leadership.weigh': return <WeighPage {...props} />
    case 'leadership.risks': return <RisksPage {...props} />
    case 'leadership.holds': return <HoldsPage {...props} />
    default: return <RowsPage {...props} />
  }
}

// ---- The deck ----------------------------------------------------------------------------------------

/**
 * Every page of a hydrated brief (quotes resolved), at 1280×720, one under
 * the other. `print` adds the sheet's page size and breaks for the render
 * route; on screen the viewer scales the column to its pane, each sheet with
 * a hairline round it (never a shadow).
 */
export function BriefDeck({ data, builtAt, print = false, gap = 24, appUrl = '' }: {
  data: StoredBriefData; builtAt: string; print?: boolean; gap?: number
  /** The app's address, where the deck leaves it (the PDF, a share link):
   *  the October canvas's links are drawn against it. */
  appUrl?: string
}) {
  const pages = deckPages(data)
  const ctx: Ctx = { data, date: writtenOn(builtAt), pages, total: pages.length, appUrl }
  return (
    <div data-brief-deck="" style={{ fontFamily: SANS, color: P.ink, display: 'flex', flexDirection: 'column', gap: print ? 0 : gap, width: SHEET.width }}>
      {/* Every width here is the box's whole width, padding in, as the
          canvas measures it. */}
      <style>{'[data-brief-deck] *, [data-brief-deck] *::before, [data-brief-deck] *::after { box-sizing: border-box; }'}</style>
      {print ? <style>{`@page { size: ${SHEET.width}px ${SHEET.height}px; margin: 0; } [data-brief-page] { break-after: page; page-break-after: always; } [data-brief-page]:last-child { break-after: auto; page-break-after: auto; }`}</style> : null}
      {pages.map((page) => (
        <div
          key={page.n}
          data-brief-page={page.n}
          style={{ width: SHEET.width, height: SHEET.height, overflow: 'hidden', background: P.paper, ...(print ? {} : { borderRadius: 6, outline: `1px solid ${P.hair}` }) }}
        >
          {page.body.kind === 'cover'
            ? <Cover ctx={ctx} />
            : (
              <Frame ctx={ctx} page={page}>
                {page.body.kind === 'in_short' ? <InShort ctx={ctx} summarySize={page.body.summarySize} tocSize={page.body.tocSize} /> : null}
                {page.body.kind === 'finding' ? <Finding ctx={ctx} f={page.body.finding} plan={page.body.plan} /> : null}
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
