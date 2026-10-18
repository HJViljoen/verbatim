import type { CSSProperties, ReactNode } from 'react'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { fmtInt, longMonth, platformLabel, shortDate } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import {
  adviceDetail, categoryProducts, ideaReadLine, inTheirVideos, moveLine, multipleText, NO_RECIPE, ownTouchWords, recipeLabel, recordLine, slotWords, whoAsks,
} from '@/lib/reports/briefs/app-words'
import { continuedTitle, groupRows, quoteCite, quoteWords } from '@/lib/reports/briefs/deck'
import type { BriefGroup, BriefHookTable, BriefItem, BriefSection, BriefVerdict, StoredBriefData } from '@/lib/reports/briefs/types'
import { Dot, Footnote, LONGRUN, Label, MONO, P, SANS, SERIF, STORED, TitleBlock, resolved } from './parts'

/**
 * THE OCTOBER CANVAS'S PAGES READ FROM THE APP (the boards Heinrich approved
 * on 18 Oct: briefs-2026-10, which copy the 12 Oct canvas's kit exactly).
 * Every size, weight, colour, radius and gap is the board's, read from its
 * HTML: Brief-Leadership-03 (Where the market stands, each subject in Market's
 * own words), -04 (Who is in your market), -07 (Your moves), Brief-Sales-05
 * and -06 (Who is buying, Voices' groups), Brief-Marketing-05 (Your products)
 * and -06 (Who gets named without being asked), Brief-Content-04 (What to
 * post next) and -05 (Hooks and formats, on Content's measure).
 *
 * EVERY NAMED ITEM LINKS TO ITS PAGE IN THE APP, with the month: a subject, a
 * group, a category, a product, a brand, an idea, a piece of advice, a move.
 * The link is a plain `<a>` drawn as the board draws the name (no underline,
 * the ink): Chrome keeps it clickable in the PDF. Its address is the stored
 * path against the app's (`appUrl`; relative on screen).
 *
 * COPY MARKERS (the render tier): a stored model word names its slot (a
 * group's words `pass_e_persona`, a conversation's label `pass_b_theme`, an
 * advice title `pass_d_b_recommendation`, a post idea `post_idea`, a
 * subject's own read `week_read`, the writer's sentence `monthly_brief`);
 * the client's own names (a subject, a move) are `quote`; code's counts and
 * sentences are `figure`, a k of n a `level`, a comparison a `verdict`.
 */

export interface AppPageProps {
  data: StoredBriefData
  appUrl: string
  s: BriefSection
  continued: boolean
  sub: string | null
  footnote: string | null
}

const OPEN = { fontSize: 13, fontWeight: 600, color: P.orangeText, textDecoration: 'none', whiteSpace: 'nowrap' } as const

/** A link into the app, drawn as the board draws the words it wraps. */
function A({ href, appUrl, style, children }: { href: string | null | undefined; appUrl: string; style?: CSSProperties; children: ReactNode }) {
  if (!href) return <span style={style}>{children}</span>
  return <a href={`${appUrl}${href}`} style={{ textDecoration: 'none', ...style }}>{children}</a>
}

/** The foot the boards draw under a page: one muted line and the page's own
 *  page in the app. */
function FootRow({ s, appUrl, gap = 32 }: { s: Pick<BriefSection, 'foot' | 'link'>; appUrl: string; gap?: number }) {
  if (!s.foot && !s.link) return null
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap, paddingTop: 8 }}>
      <div data-copy="figure" style={{ fontSize: 13, lineHeight: 1.45, color: P.muted }}>{s.foot ?? ''}</div>
      {s.link ? <A href={s.link.href} appUrl={appUrl} style={OPEN}>{s.link.text}</A> : null}
    </div>
  )
}

/** A bar on its track, as the boards draw one. */
function Track({ pct, color = P.yellow, h = 10 }: { pct: number; color?: string; h?: number }) {
  return (
    <div style={{ flexGrow: 1, height: h, borderRadius: h / 2, background: P.track, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: h, background: color }} />
    </div>
  )
}

/** A comparison's words (the badge's: `MovementBadge`). */
export function verdictWords(v: BriefVerdict): string {
  return v.state === 'moved' && v.change != null
    ? `${v.change > 0 ? '▲' : '▼'} ${Math.abs(v.change).toLocaleString('en-US')} pts${v.band != null ? ` · band ±${Math.abs(v.band).toLocaleString('en-US')} pts` : ''}`
    : MOVEMENT_WORDS[v.state === 'moved' ? 'too_little_data' : v.state]
}

/** A comparison's words in their own node. With `width`, in a slot of that
 *  width, drawn empty where the row has none, so every row's bar beside it
 *  has the same track. */
function VerdictText({ v, color = P.muted, width }: { v: BriefVerdict | null; color?: string; width?: number }) {
  const slot = width ? { width, flexShrink: 0 } : {}
  if (!v) return width ? <span data-verdict-slot="" style={slot} /> : null
  return <span data-copy="verdict" {...(width ? { 'data-verdict-slot': '' } : {})} style={{ fontSize: 12.5, color, whiteSpace: 'nowrap', ...slot }}>{verdictWords(v)}</span>
}

/** The slot a table's verdicts share: as wide as its longest, none where no
 *  row has one. A bar's track then has the same length on every row, so the
 *  longest bar is the largest count (a verdict beside one row alone had
 *  shortened that row's track: The North Face's 11 drew shorter than
 *  Cotopaxi's 8). */
export function verdictSlotWidth(verdicts: readonly (BriefVerdict | null)[]): number {
  const longest = Math.max(0, ...verdicts.map((v) => (v ? verdictWords(v).length : 0)))
  return longest ? Math.ceil(longest * 12.5 * 0.5) + 4 : 0
}

const pct1 = (x: number): string => `${(Math.round(x * 10) / 10).toFixed(1)}%`

// ---- Leadership: Where the market stands (Brief-Leadership-03) -------------------------------------

function SubjectCell({ i, data, appUrl }: { i: BriefItem; data: StoredBriefData; appUrl: string }) {
  const q = !i.text ? resolved(i.quote) : null
  const own = i.slot === 'week_read' ? LONGRUN : STORED
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 0 8px', borderTop: `1px solid ${P.hair}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 256, flexShrink: 0 }}>
          <A href={i.href} appUrl={appUrl} style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25, color: P.ink }}><span data-copy="quote">{i.title}</span></A>
        </div>
        {i.measure?.pct != null ? (
          <>
            <Track pct={i.measure.pct} />
            <div data-copy="figure" style={{ width: 44, flexShrink: 0, fontFamily: MONO, fontSize: 15, fontWeight: 500 }}>{i.measure.pct}%</div>
          </>
        ) : null}
      </div>
      {i.text && i.detail ? <div {...own} style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.35 }}>{i.text}</div> : null}
      {i.text && !i.detail ? <p {...own} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{i.text}</p> : null}
      {i.detail ? <p {...LONGRUN} style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: P.soft }}>{i.detail}</p> : null}
      {q ? (
        <p style={{ margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, lineHeight: 1.45 }}>
          <span data-copy="quote">“{quoteWords(q)}”</span> <span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 12, color: P.muted }}>{quoteCite(q, data.company)}</span>
        </p>
      ) : null}
    </div>
  )
}

const MOOD_COLOUR: Readonly<Record<string, string>> = { positive: P.yellow, mixed: P.mixed, neutral: P.neutral, negative: P.orangeText }
const moodPct = (x: number): string => `${Number.isInteger(x) ? x : x.toFixed(1)}%`

export function SubjectsPage({ data, appUrl, s, sub, footnote }: AppPageProps) {
  const items = s.groups.flatMap((g) => g.items)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em' }}>{s.title}</div>
        {sub ? <div data-copy="figure" style={{ fontSize: 14, color: P.muted, paddingBottom: 6 }}>{sub}</div> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 44px' }}>
        {items.map((i, k) => <SubjectCell key={k} i={i} data={data} appUrl={appUrl} />)}
      </div>
      {s.also ? <div data-copy="figure" style={{ padding: '10px 0 0', borderTop: `1px solid ${P.hair}`, fontSize: 14, color: P.muted }}>{s.also}</div> : null}
      <Footnote text={footnote} />
      <div style={{ flexGrow: 1 }} />
      {s.kinds || s.mood ? (
        <div style={{ display: 'flex', gap: 40, background: P.ground, borderRadius: 16, padding: '12px 22px' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.kinds ? (
              <>
                <Label color={P.ink} size={11}>What people do in the comments</Label>
                <div data-copy="figure" style={{ fontSize: 12, color: P.muted }}>{s.kinds.base}</div>
                {s.kinds.rows.map((r, k) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 150, flexShrink: 0, fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                    <Track pct={r.pct} color={P.ink} h={8} />
                    <div data-copy="figure" style={{ width: 50, fontFamily: MONO, fontSize: 14 }}>{Math.round(r.pct)}%</div>
                  </div>
                ))}
              </>
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: MOOD_COLOUR[r.mood] ?? P.rival }} />{r.label} <span data-copy="figure" style={{ fontFamily: MONO }}>{moodPct(r.pct)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <FootRow s={s} appUrl={appUrl} />
    </div>
  )
}

// ---- Leadership: Who is in your market (Brief-Leadership-04) ---------------------------------------

function GroupCard({ g, market, appUrl }: { g: BriefGroup; market: number; appUrl: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: P.ground, borderRadius: 16, padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <A href={g.href} appUrl={appUrl} style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15, color: P.ink }}><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></A>
        <div data-copy="level" style={{ flexShrink: 0, fontFamily: MONO, fontSize: 14 }}>
          <span style={{ fontWeight: 500 }}>{fmtInt(g.videos)}</span> <span style={{ color: P.muted }}>of {fmtInt(market)}</span>
        </div>
      </div>
      {/* Voices draws a group's videos against the market's (a count, never
          a share of the groups: they overlap). */}
      <div style={{ display: 'flex' }}><Track pct={market > 0 ? (100 * g.videos) / market : 0} /></div>
      <p data-copy="subject" data-slot="pass_e_persona" style={{ margin: 0, fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.45 }}>{g.oneLiner}</p>
      <div style={{ flexGrow: 1 }} />
      {g.top ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 9, borderTop: `1px solid ${P.rule}` }}>
          <Label color={P.muted} size={10}>Talks most about</Label>
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>
            <A href={g.top.href} appUrl={appUrl} style={{ fontWeight: 600, color: P.ink }}><span data-copy="quote">{g.top.label}</span></A>{' '}
            <span data-copy="figure" style={{ fontFamily: MONO, fontSize: 13, color: P.muted }}>{fmtInt(g.top.k)} of their {fmtInt(g.videos)} videos</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function GroupsPage({ appUrl, s, sub }: AppPageProps) {
  const p = s.people
  if (!p) return null
  // Each row's groups, cut in order before the render.
  const counts = groupRows(p.groups.length)
  const rows = counts.map((c, r) => p.groups.slice(counts.slice(0, r).reduce((a, b) => a + b, 0), counts.slice(0, r).reduce((a, b) => a + b, 0) + c))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flexGrow: 1, minHeight: 0 }}>
        {rows.map((row, r) => {
          // A row never shorter than its tallest card: one that would not fit
          // shows as clipping (scripts/brief-render.ts), never as a card
          // spilling into the next.
          return <div key={r} style={{ display: 'flex', gap: 14, flex: 1 }}>{row.map((g) => <GroupCard key={g.key} g={g} market={p.market} appUrl={appUrl} />)}</div>
        })}
      </div>
      <FootRow s={s} appUrl={appUrl} />
    </div>
  )
}

// ---- Sales: Who is buying (Brief-Sales-05, -06) -----------------------------------------------------

function BuyerGroupCard({ g, market, month, appUrl }: { g: BriefGroup; market: number; month: string; appUrl: string }) {
  const facts = inTheirVideos(g)
  return (
    // Never shorter than its words (v1's buyer card): a sheet of one group
    // that fills it keeps its card round all of it.
    <div style={{ flex: 1, border: `1px solid ${P.hair}`, borderRadius: 16, padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1.15, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <A href={g.href} appUrl={appUrl} style={{ fontSize: 24, fontWeight: 700, color: P.ink }}><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></A>
            <div data-copy="level" style={{ fontFamily: MONO, fontSize: 13, color: P.muted }}>{fmtInt(g.videos)} of {fmtInt(market)} videos in {longMonth(month)}</div>
          </div>
          <p data-copy="subject" data-slot="pass_e_persona" style={{ margin: 0, fontFamily: SERIF, fontSize: 15, lineHeight: 1.45 }}>{g.oneLiner}</p>
        </div>
        {([['What they want', g.wants], ['What stops them', g.stops], ['What tips them', g.tips]] as const).map(([label, text]) => (
          <div key={label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {text ? <><Label color={P.muted} size={10}>{label}</Label><p data-copy="subject" data-slot="pass_e_persona" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>{text}</p></> : null}
          </div>
        ))}
      </div>
      <div style={{ flexGrow: 1 }} />
      {facts ? (
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', paddingTop: 10, borderTop: `1px solid ${P.hair}` }}>
          <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: P.yellow, borderRadius: 6, padding: '3px 8px' }}>In their videos</div>
          <p data-copy="figure" style={{ margin: 0, flexGrow: 1, fontSize: 14, fontWeight: 500, lineHeight: 1.45 }}>{facts}</p>
          <A href={g.href} appUrl={appUrl} style={OPEN}>Open in Voices →</A>
        </div>
      ) : null}
    </div>
  )
}

export function BuyerGroupsPage({ appUrl, s, continued, sub }: AppPageProps) {
  const p = s.people
  if (!p) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={continued ? continuedTitle(s.title) : s.title} sub={sub} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexGrow: 1, minHeight: 0 }}>
        {p.groups.map((g) => <BuyerGroupCard key={g.key} g={g} market={p.market} month={p.month} appUrl={appUrl} />)}
        {p.groups.length === 1 ? <div style={{ flex: 1 }} /> : null}
      </div>
      {s.foot || s.link ? (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24, fontSize: 13, color: P.muted }}>
          {/* "Also in your market: Long-term user, in 50 of October's videos."
              (`alsoInMarket`), its names and counts drawn as the board does. */}
          {p.rest?.length ? (
            <div data-copy="figure">
              Also in your market:{' '}
              {p.rest.length === 1
                ? <><span data-copy="subject" data-slot="pass_e_persona" style={{ color: P.ink, fontWeight: 600 }}>{p.rest[0].name}</span>, in <span style={{ fontFamily: MONO }}>{fmtInt(p.rest[0].videos)}</span> of {longMonth(p.month)}’s videos.</>
                : p.rest.map((g, k) => <span key={g.name}>{k > 0 ? (k === p.rest!.length - 1 ? ' and ' : ', ') : null}<span data-copy="subject" data-slot="pass_e_persona" style={{ color: P.ink, fontWeight: 600 }}>{g.name}</span> (<span style={{ fontFamily: MONO }}>{fmtInt(g.videos)}</span> videos)</span>)}
              {p.rest.length > 1 ? '.' : null}
            </div>
          ) : <div data-copy="figure">{s.foot ?? ''}</div>}
          {s.link ? <A href={s.link.href} appUrl={appUrl} style={OPEN}>{s.link.text}</A> : null}
        </div>
      ) : null}
    </div>
  )
}

// ---- Leadership: Your moves (Brief-Leadership-07) ---------------------------------------------------

export function MovesPage({ appUrl, s, sub }: AppPageProps) {
  const m = s.moves
  if (!m) return null
  const move = m.moves[0] ?? null
  const moveMonth = move ? `${move.day.slice(0, 7)}-01` : ''
  const role = (month: string) => (month === moveMonth ? 'the month of the move' : month < moveMonth ? 'before the move' : 'after the move')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', gap: 48, flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 1.45, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {m.waitingCount > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 6 }}>
                <Label color={P.ink}>Waiting for a decision</Label>
                <div data-copy="figure" style={{ fontFamily: MONO, fontSize: 13, color: P.muted }}>{fmtInt(m.waitingCount)}</div>
              </div>
              {m.waiting.map((a, k) => (
                <div key={a.lineageId} style={{ display: 'flex', gap: 20, padding: '13px 0', borderTop: `1px solid ${P.hair}` }}>
                  <div data-copy="figure" style={{ flexShrink: 0, fontFamily: MONO, fontSize: 15, color: P.muted, paddingTop: 3 }}>{String(k + 1).padStart(2, '0')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                    <A href={a.href} appUrl={appUrl} style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, lineHeight: 1.35, color: P.ink }}>
                      <span data-copy="stored" data-slot="pass_d_b_recommendation">{a.title}</span>
                    </A>
                    <AdviceDetail a={a} month={m.month} appUrl={appUrl} />
                  </div>
                </div>
              ))}
              {m.waitingCount > m.waiting.length ? (
                <div data-copy="figure" style={{ fontSize: 13, color: P.muted, padding: '10px 0 0', borderTop: `1px solid ${P.hair}` }}>
                  {fmtInt(m.waitingCount - m.waiting.length)} more waiting, in the record.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {move ? (
            <div style={{ background: P.ink, color: '#FFFFFF', borderRadius: 16, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.yellow }}>Moves you dated · <span data-copy="figure">{fmtInt(m.moves.length)}</span></div>
              <div data-copy="quote" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25 }}>{move.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: P.onInkMuted }}>
                {/* "Dated 5 Oct · Done · read on {what it is about}" (`moveLine`). */}
                Dated {shortDate(`${move.day.slice(0, 10)}T00:00:00.000Z`)} · {move.status}
                {move.label ? <> · read on <A href={move.labelHref} appUrl={appUrl} style={{ color: '#FFFFFF', fontWeight: 600 }}><span {...(move.kind === 'subject' ? { 'data-copy': 'quote' } : { 'data-copy': 'subject', 'data-slot': 'pass_b_theme' })}>{move.label}</span></A></> : null}
              </div>
              <div style={{ display: 'flex', gap: 14, paddingTop: 4 }}>
                {move.slots.map((slot) => (
                  <div key={slot.month} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, borderTop: `2px solid ${slot.month === moveMonth ? P.yellow : P.muted}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.onInkMuted }}>{longMonth(slot.month)}</div>
                    {slot.k != null ? (
                      <>
                        <div data-copy="level" style={{ fontFamily: MONO, fontSize: 18, fontWeight: 500, color: '#FFFFFF' }}>{slotWords(slot)}</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.4, color: P.onInk }}>{role(slot.month)}{slot.soFar ? ', so far' : ''}</div>
                      </>
                    ) : <div style={{ fontSize: 12.5, lineHeight: 1.4, color: P.onInk }}>{slotWords(slot)}</div>}
                  </div>
                ))}
              </div>
              {move.sentence ? <p data-copy="figure" style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: '#FFFFFF' }}>{move.sentence}</p> : null}
              {move.verdict ? <div><VerdictText v={move.verdict} color={P.onInk} /></div> : null}
              {move.axis ? <p data-copy="figure" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: P.onInkMuted }}>{move.axis}</p> : null}
              <div><A href={move.href} appUrl={appUrl} style={{ ...OPEN, color: P.yellow }}>Open the move →</A></div>
            </div>
          ) : null}
          <div style={{ background: P.ground, borderRadius: 16, padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Label color={P.ink} size={11}>The record</Label>
              <A href={m.record.href} appUrl={appUrl} style={OPEN}>Open the record →</A>
            </div>
            <p data-copy="figure" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{recordLine(m)}</p>
          </div>
        </div>
      </div>
      <FootRow s={s} appUrl={appUrl} />
    </div>
  )
}

/** "First raised 12 Oct · would move {label}, 41 of 902 videos in October"
 *  (`adviceDetail`), the label and the level marked. */
function AdviceDetail({ a, month, appUrl }: { a: NonNullable<BriefSection['moves']>['waiting'][number]; month: string; appUrl: string }) {
  if (!a.aim) return <div data-copy="figure" style={{ fontSize: 13, lineHeight: 1.45, color: P.muted }}>{adviceDetail(a, month)}</div>
  return (
    <div style={{ fontSize: 13, lineHeight: 1.45, color: P.muted }}>
      First raised {shortDate(`${a.firstMade.slice(0, 10)}T00:00:00.000Z`)} · would move{' '}
      <A href={a.aim.href} appUrl={appUrl} style={{ color: P.ink, fontWeight: 600 }}><span data-copy="subject" data-slot="pass_b_theme">{a.aim.label}</span></A>
      {a.aim.k != null && a.aim.n != null ? <>, <span data-copy="level" style={{ fontFamily: MONO }}>{fmtInt(a.aim.k)} of {fmtInt(a.aim.n)}</span> videos in {longMonth(month)}</> : null}
    </div>
  )
}

// ---- Marketing: Your products in the conversation (Brief-Marketing-05) -----------------------------

export function ProductsPage({ appUrl, s, sub }: AppPageProps) {
  const p = s.products
  if (!p) return null
  const most = Math.max(1, ...p.categories.map((c) => c.videos))
  const head = { display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 16, paddingBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', gap: 40, flexGrow: 1, minHeight: 0, alignItems: 'flex-start' }}>
        <div style={{ flex: 1.6, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={head}>
            <div style={{ gridColumn: 'span 5' }}>Category</div>
            <div style={{ gridColumn: 'span 6' }}>Videos about it</div>
            <div style={{ gridColumn: 'span 2', textAlign: 'right' }}>Yours named</div>
            <div style={{ gridColumn: 'span 7', paddingLeft: 8 }}>Your products that came up</div>
          </div>
          {p.categories.map((c) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 16, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${P.hair}` }}>
              <div style={{ gridColumn: 'span 5' }}><A href={c.href} appUrl={appUrl} style={{ fontSize: 16, fontWeight: 600, color: P.ink }}>{c.name}</A></div>
              <div style={{ gridColumn: 'span 6', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Track pct={(100 * c.videos) / most} />
                <div data-copy="figure" style={{ width: 30, textAlign: 'right', fontFamily: MONO, fontSize: 14 }}>{fmtInt(c.videos)}</div>
              </div>
              <div data-copy="figure" style={{ gridColumn: 'span 2', textAlign: 'right', fontFamily: MONO, fontSize: 14, color: c.named > 0 ? P.ink : P.muted }}>{fmtInt(c.named)}</div>
              <div style={{ gridColumn: 'span 7', paddingLeft: 8, fontSize: 13.5, lineHeight: 1.5 }}>
                {c.products.length === 0 ? <span style={{ color: P.muted }}>{categoryProducts(c)}</span> : c.products.map((x, k) => (
                  <span key={x.name}>
                    {k > 0 ? ' · ' : null}
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <A href={x.href} appUrl={appUrl} style={{ fontWeight: 600, color: P.ink }}>{x.name}</A> <span data-copy="figure" style={{ fontFamily: MONO }}>{fmtInt(x.videos)}</span>
                    </span>
                    {/* The first-month mark wraps on its own where the name
                        and it overrun the column. */}
                    {x.first ? <span style={{ display: 'inline-block', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.ink, background: P.yellow, borderRadius: 999, padding: '2px 7px', marginLeft: 6, verticalAlign: 1 }}>First time</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {p.standouts.length ? (
          <div style={{ flex: 1, minWidth: 0, background: P.ground, borderRadius: 16, padding: '16px 22px 6px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingBottom: 8 }}><Label color={P.ink}>What stands out</Label></div>
            {p.standouts.map((x, k) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 0', borderTop: `1px solid ${P.rule}` }}>
                <Label color={P.muted} size={11}>{x.label}</Label>
                <A href={x.href} appUrl={appUrl} style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: P.ink }}>{x.name}</A>
                <p data-copy="figure" style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{x.text}</p>
              </div>
            ))}
          </div>
        ) : <div style={{ flex: 1, minWidth: 0 }} />}
      </div>
      <FootRow s={s} appUrl={appUrl} />
    </div>
  )
}

// ---- Marketing: Who gets named without being asked (Brief-Marketing-06) ----------------------------

export function NamedPage({ appUrl, s, sub }: AppPageProps) {
  const n = s.named
  if (!n) return null
  const most = Math.max(1, ...n.rows.map((r) => r.named.k))
  const verdictW = verdictSlotWidth(n.rows.map((r) => r.verdict))
  const notes = s.lines ?? []
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 20 } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...grid, paddingBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted }}>
          <div style={{ gridColumn: 'span 5' }}>Brand</div>
          <div style={{ gridColumn: 'span 8' }}>Named without being asked</div>
          <div style={{ gridColumn: 'span 5' }}>Praised · complained</div>
          <div style={{ gridColumn: 'span 6' }}>Talked about for</div>
        </div>
        {n.rows.map((r) => (
          <div key={r.label} style={{ ...grid, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${P.hair}` }}>
            <div style={{ gridColumn: 'span 5' }}>
              <A href={r.href} appUrl={appUrl} style={{ fontSize: 16, fontWeight: 600, color: r.you ? P.gold : P.ink }}>{r.you ? `${r.label} (you)` : r.label}</A>
            </div>
            <div style={{ gridColumn: 'span 8', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Track pct={(100 * r.named.k) / most} color={r.you ? P.gold : P.rival} />
              <div data-copy="level" style={{ flexShrink: 0, width: 76, fontFamily: MONO, fontSize: 14 }}>
                <span style={{ fontWeight: 500 }}>{fmtInt(r.named.k)}</span> <span style={{ color: P.muted }}>of {fmtInt(r.named.n)}</span>
              </div>
              <VerdictText v={r.verdict} width={verdictW || undefined} />
            </div>
            <div data-copy="level" style={{ gridColumn: 'span 5', fontFamily: MONO, fontSize: 14 }}>
              {r.praised && r.complained ? <>{fmtInt(r.praised.k)} · {fmtInt(r.complained.k)} <span style={{ color: P.muted }}>of {fmtInt(r.praised.n)}</span></> : null}
            </div>
            <div style={{ gridColumn: 'span 6', fontSize: 14 }}>
              {r.top ? <><span data-copy="quote" style={{ fontWeight: 600 }}>{r.top.label}</span> <span data-copy="level" style={{ fontFamily: MONO, color: P.muted }}>{fmtInt(r.top.k)} of {fmtInt(r.top.n)}</span></> : null}
            </div>
          </div>
        ))}
        {s.also ? <div data-copy="figure" style={{ paddingTop: 10, borderTop: `1px solid ${P.hair}`, fontSize: 14, color: P.muted }}>{s.also}</div> : null}
      </div>
      {notes.length ? (
        <div style={{ display: 'flex', gap: 28, background: P.ground, borderRadius: 16, padding: '4px 22px' }}>
          {notes.map((t, k) => (
            <div key={k} style={{ flex: 1, minWidth: 0, display: 'flex', gap: 12, padding: '12px 0' }}>
              <Dot /><p data-copy="figure" style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{t}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ flexGrow: 1 }} />
      <FootRow s={s} appUrl={appUrl} />
    </div>
  )
}

// ---- Content: What to post next (Brief-Content-04) -------------------------------------------------

export function IdeasPage({ appUrl, s, sub }: AppPageProps) {
  const i = s.ideas
  if (!i) return null
  const fact = { display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 10, padding: '5px 0', borderTop: `1px solid ${P.hair}`, fontSize: 13, lineHeight: 1.4 } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      {/* The board's row: the cards share what the strip leaves, and the
          plan holds each card's words to it (deck.ts `H.ideaCard`; the board's
          own run into their bottom padding by a few pixels). */}
      <div style={{ display: 'flex', gap: 16, flexGrow: 1, minHeight: 0 }}>
        {i.ideas.map((x) => {
          const read = ideaReadLine(x, i)
          const recipe = recipeLabel(x)
          return (
            <div key={x.id} style={{ flex: 1, minWidth: 0, border: `1px solid ${P.hair}`, borderRadius: 16, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div data-copy="figure" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 15, background: P.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 14, fontWeight: 500 }}>{x.rank}</div>
                <A href={x.href} appUrl={appUrl} style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3, color: P.ink }}><span data-copy="stored" data-slot="post_idea">{x.title}</span></A>
              </div>
              {/* `ideaReadLine`: the four weeks' figure beside its month, the
                  counts in ink as the board sets them. */}
              {read && x.month ? (
                <div data-copy="level" style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.5, color: P.muted }}>
                  {x.read ? <><span style={{ color: P.ink, fontWeight: 500 }}>{fmtInt(x.read.k)}</span> of {fmtInt(x.read.n)} videos, {i.read.label} · </> : null}
                  <span style={{ color: P.ink, fontWeight: 500 }}>{fmtInt(x.month.k)}</span> of {fmtInt(x.month.n)} in {longMonth(i.month)}
                </div>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={fact}><div style={{ color: P.muted }}>Who&apos;s asking</div><div data-copy="subject" data-slot="pass_e_persona">{whoAsks(x.groups)}</div></div>
                <div style={fact}><div style={{ color: P.muted }}>Your posts</div><div data-copy="figure" style={x.own.state === 'none' ? { color: P.orangeText, fontWeight: 600 } : {}}>{ownTouchWords(x.own)}</div></div>
              </div>
              {x.asks.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div data-copy="level" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.muted }}>What they want to know{x.asksOf ? ` · of ${fmtInt(x.asksOf)} videos` : ''}</div>
                  {x.asks.map((a) => (
                    <div key={a.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, lineHeight: 1.4 }}>
                      <span data-copy="stored" data-slot="post_idea">{a.label}</span>
                      <span data-copy="figure" style={{ flexShrink: 0, fontFamily: MONO, color: P.muted }}>{fmtInt(a.videos)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Label color={P.muted} size={10}>{recipe ?? 'Suggested format and opening'}</Label>
                {x.format || x.opening ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[x.format, x.opening].filter((r): r is NonNullable<typeof r> => r != null).map((r) => (
                      <span key={r.label} style={{ display: 'inline-block', fontSize: 13, fontWeight: 500, border: `1px solid ${P.pill}`, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                        {r.label}{r.multiple != null ? <> <span data-copy="figure" style={{ fontFamily: MONO, fontWeight: 500 }}>{multipleText(r.multiple)}</span></> : null}
                      </span>
                    ))}
                  </div>
                ) : <div style={{ fontSize: 13, color: P.muted }}>{NO_RECIPE}</div>}
              </div>
              <div style={{ flexGrow: 1 }} />
              {i.medical ? <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: P.muted }}>{MEDICAL_LINE}</p> : null}
              <div><A href={x.href} appUrl={appUrl} style={OPEN}>Open the brief →</A></div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 28, background: P.ground, borderRadius: 16, padding: '14px 22px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          {i.asked.length ? (
            <>
              <Label color={P.ink} size={11}>Also asked in {longMonth(i.month)}, and not yet in your posts</Label>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                {i.asked.map((a, k) => (
                  <span key={a.label}>
                    {k > 0 ? ' · ' : null}
                    <A href={a.href} appUrl={appUrl} style={{ color: P.ink, fontWeight: 600 }}><span data-copy="subject" data-slot="pass_b_theme">{a.label}</span></A>{' '}
                    <span data-copy="figure" style={{ fontFamily: MONO, color: P.muted }}>{fmtInt(a.videos)}</span>
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <A href={i.replies} appUrl={appUrl} style={OPEN}>Worth a reply →</A>
          <div style={{ fontSize: 12, color: P.muted }}>{longMonth(i.month)}’s comments that ask you something, push back or want to buy</div>
        </div>
      </div>
    </div>
  )
}

// ---- Content: Hooks and formats that work (Brief-Content-05) ---------------------------------------

function HookTable({ t, label, company, rival }: { t: BriefHookTable; label: string; company: string; rival: string | null }) {
  const own = t.ownOf != null
  const showRival = rival != null && t.rivalOf != null
  const cols = { label: 4, cat: showRival ? 7 : own ? 10 : 13, own: 3, rival: 3, eng: 3 }
  const counts = [
    ...(own ? [`${fmtInt(t.ownOf!)} ${company} ${t.ownOf === 1 ? 'post' : 'posts'}`] : []),
    ...(showRival ? [`${fmtInt(t.rivalOf!)} ${rival} ${t.rivalOf === 1 ? 'video' : 'videos'}`] : []),
  ]
  const head = { display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 14, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8 }}>
        <div style={head}>
          <div style={{ gridColumn: `span ${cols.label}` }}>{label}</div>
          <div style={{ gridColumn: `span ${cols.cat}` }}>The category</div>
          {own ? <div style={{ gridColumn: `span ${cols.own}`, textAlign: 'right' }}>{company}</div> : null}
          {showRival ? <div style={{ gridColumn: `span ${cols.rival}`, textAlign: 'right' }}>{rival}</div> : null}
          <div style={{ gridColumn: `span ${cols.eng}`, textAlign: 'right' }}>Response</div>
        </div>
        <div data-copy="figure" style={{ fontSize: 12, color: P.muted }}>Shares of {fmtInt(t.of)} category videos{counts.length ? ` · counts of ${counts.join(' and ')}` : ''}</div>
      </div>
      {t.rows.map((r) => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', gap: 14, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${P.hair}` }}>
          <div style={{ gridColumn: `span ${cols.label}`, fontSize: 16, fontWeight: 600 }}>{r.label}</div>
          <div style={{ gridColumn: `span ${cols.cat}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Track pct={r.share} />
            <div data-copy="figure" style={{ width: 52, fontFamily: MONO, fontSize: 14 }}>{pct1(r.share)}</div>
          </div>
          {own ? <div data-copy="figure" style={{ gridColumn: `span ${cols.own}`, textAlign: 'right', fontFamily: MONO, fontSize: 14 }}>{r.own ?? ''}</div> : null}
          {showRival ? <div data-copy="figure" style={{ gridColumn: `span ${cols.rival}`, textAlign: 'right', fontFamily: MONO, fontSize: 14 }}>{r.rival ?? ''}</div> : null}
          <div data-copy="figure" style={{ gridColumn: `span ${cols.eng}`, textAlign: 'right', fontFamily: MONO, fontSize: 14, ...(r.multiple != null && r.multiple > 1 ? { fontWeight: 500, color: P.ink } : { color: P.muted }) }}>{r.multiple != null ? multipleText(r.multiple) : ''}</div>
        </div>
      ))}
    </div>
  )
}

export function HooksPage({ data, appUrl, s, sub }: AppPageProps) {
  const h = s.hooks
  if (!h) return null
  const p = h.posts
  const month = longMonth(h.month)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <TitleBlock title={s.title} sub={sub} />
      <div style={{ display: 'flex', gap: 40, flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 1.85, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {h.formats ? <HookTable t={h.formats} label="Format" company={data.company} rival={h.rival} /> : null}
          {h.openings ? <HookTable t={h.openings} label="Opening" company={data.company} rival={h.rival} /> : null}
        </div>
        {p ? (
          <div style={{ flex: 1, minWidth: 0, background: P.ground, borderRadius: 16, padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Label color={P.ink}>Your posts in {month}</Label>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div data-copy="figure" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>{fmtInt(p.total)}</div>
                <div data-copy="figure" style={{ fontSize: 13, lineHeight: 1.4, color: P.muted }}>
                  posts on your own accounts{p.byPlatform.length ? ` · ${p.byPlatform.map((x) => `${platformLabel(x.platform)} ${fmtInt(x.posts)}`).join(', ')}` : ''}
                </div>
              </div>
              {p.response ? (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div data-copy="figure" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>{multipleText(p.response.multiple)}</div>
                  <div data-copy="figure" style={{ fontSize: 13, lineHeight: 1.4, color: P.muted }}>response of your typical post against the market’s, from {fmtInt(p.response.rated)} of {fmtInt(p.total)} with a response figure</div>
                </div>
              ) : null}
            </div>
            {p.sentence ? (
              <div style={{ display: 'flex', gap: 12, paddingTop: 12, borderTop: `1px solid ${P.rule}` }}>
                <Dot /><p data-copy="figure" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{p.sentence}</p>
              </div>
            ) : null}
            {p.best ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 12, borderTop: `1px solid ${P.rule}` }}>
                <Label color={P.muted} size={11}>Best this month</Label>
                <A href={p.best.href} appUrl={appUrl} style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: P.ink }}>
                  <span data-copy="figure">Your {(p.best.format ?? 'post').toLowerCase()} on {platformLabel(p.best.platform)}, {shortDate(`${p.best.date.slice(0, 10)}T00:00:00.000Z`)}</span>
                </A>
                <div data-copy="figure" style={{ fontSize: 13, color: P.muted }}>
                  {platformLabel(p.best.platform)} · {shortDate(`${p.best.date.slice(0, 10)}T00:00:00.000Z`)}{p.best.format ? ` · ${p.best.format}` : ''} · <span style={{ fontFamily: MONO, color: P.ink }}>{multipleText(p.best.multiple)}</span>
                </div>
              </div>
            ) : null}
            <div style={{ flexGrow: 1 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <A href={p.href} appUrl={appUrl} style={OPEN}>All your posts →</A>
              <A href={h.href} appUrl={appUrl} style={OPEN}>What works →</A>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: P.muted }}>{h.basis}</div>
          </div>
        ) : <div style={{ flex: 1, minWidth: 0 }} />}
      </div>
    </div>
  )
}

/** One October page by its key, or null for a key that is not one. */
export function AppSectionPage(props: AppPageProps) {
  switch (props.s.key) {
    case 'leadership.subjects': return <SubjectsPage {...props} />
    case 'leadership.groups': return <GroupsPage {...props} />
    case 'leadership.moves': return <MovesPage {...props} />
    case 'sales.groups': return <BuyerGroupsPage {...props} />
    case 'marketing.products': return <ProductsPage {...props} />
    case 'marketing.named': return <NamedPage {...props} />
    case 'content.ideas': return <IdeasPage {...props} />
    case 'content.hooks': return <HooksPage {...props} />
    default: return null
  }
}

/** The `moveLine` words, for a test that holds the card to them. */
export { moveLine }
