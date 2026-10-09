import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, CalendarDays, MessageSquareText, Sparkles } from 'lucide-react'
import { Drawer, Hub, Riffle } from '@lucasmarkes/hairline/react'
import { KIND_ICON } from '@/components/colour-roles'
import { translationLabel, translationNote } from '@/components/quote-block'
import { aboutName, type AboutPart } from '@/lib/brands/attribution'
import { fmtInt, longMonth, platformLabel } from '@/lib/format'
import { surface } from '@/lib/nav'
import { PERSONA_VIDEO_FLOOR, voiceSurfaceHref, type VoiceSurfaceData } from '@/lib/pages/voice-surface'
import {
  CONV_KIND_ROWS,
  MAKER_LINE_SHARE_FLOOR,
  WHERE_SHOWN,
  firstSentence,
  makerPostsSentence,
  shareOf,
  stripEmoji,
  type ConvKind,
  type ConvQuote,
  type ConversationExtras,
} from '@/lib/pages/voice-conversation'
import type { Quote } from '@/lib/renderables/types'
import { voiceBoard } from '../board'
import { voiceContext } from '..'
import { withLook } from './look'
import { Shelves, type Shelf } from './shelves'

// DESIGN TEST: Conversation in the Hairline look (hairline.lucasmarkes.com),
// behind `?look=hairline` only. THIS DELIBERATELY DEPARTS FROM
// design-system/verbatim/MASTER.md: no palette A, no Plex, no yellow, no
// colour roles, no PageBar. It is here to be looked at beside the shipped page
// (`../conversation.tsx`), never to replace it, and nothing outside this
// folder renders it.
//
// Same data, same words, same order of blocks as the shipped page: the board
// of every conversation, one in full, where the market talks, who is talking,
// the market's words kind by kind. What changes is the drawing: a centred
// hero with one Instrument Serif word and a stock Hairline figure, the
// /figures page's shelf list as the page's index, white tiles on a hairline
// ring and a soft lift, Geist Mono for every count, quotes in Instrument
// Serif italic, ink and one grey. The copy contract still holds (`data-copy`
// on every figure, theme label, persona line and quote), and every link keeps
// `look=hairline` so a click stays in the test.
//
// Styles: `./hairline.css`, every rule under `[data-look="hairline"]`.

type Params = Record<string, string | undefined>
type Names = ConversationExtras['names']

/** A page href with the reader's params, the look kept, and an anchor. */
const href = (params: Params, over: Parameters<typeof voiceSurfaceHref>[1], hash?: string) =>
  withLook(`${voiceSurfaceHref(params, over)}${hash ? `#${hash}` : ''}`)

/** A share where the base can carry one (100 videos or more), else the count.
 *  The shipped page's rule (`../conversation.tsx` shareCell). */
function shareCell(k: number, n: number): { pct: number; text: string } {
  if (n >= 100) {
    const p = shareOf(k, n)
    return { pct: p, text: `${p}%` }
  }
  return { pct: n > 0 ? (100 * k) / n : 0, text: fmtInt(k) }
}

/** A hairline bar against 100%: a 1px track, a 3px ink stroke. */
function Bar({ pct }: { pct: number }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <span aria-hidden className="hl-bar">
      <span style={{ width: `${w}%` }} />
    </span>
  )
}

/** Who an item of talk is about, in ink and one grey: the client in ink at
 *  500, a rival in ink, the market muted; counts in mono where there are two
 *  or more parts. The shipped page draws chips (components/brand-who.tsx). */
function Who({ parts, names, className }: { parts: readonly AboutPart[]; names: Names; className?: string }) {
  const shown = parts.filter((p) => p.videos > 0)
  if (shown.length === 0) return null
  const one = shown.length === 1
  return (
    <span data-who="" className={className ? `hl-who ${className}` : 'hl-who'}>
      {shown.map((p, i) => {
        const name = p.about === 'market' ? (one ? names.market.long : names.market.short) : p.about === 'client' ? names.client : aboutName(p.about, names)
        const cls = p.about === 'client' ? 'hl-who-you' : p.about === 'market' ? 'hl-who-market' : 'hl-who-rival'
        return (
          <span key={p.about}>
            {i > 0 ? <span className="hl-who-sep"> · </span> : null}
            <span className={cls}>{name}</span>
            {one ? null : <>{' '}<span data-copy="figure" className="hl-mono">{fmtInt(p.videos)}</span></>}
          </span>
        )
      })}
    </span>
  )
}

/** A section's head, the /figures shelf head: a 14px name and a mono count
 *  beside it, then an optional muted line. */
function Head({ id, title, count, lede }: { id: string; title: string; count?: ReactNode; lede?: ReactNode }) {
  return (
    <div className="hl-head-wrap">
      <div className="hl-head">
        <h2 id={`${id}-h`}>{title}</h2>
        {count != null ? <span className="hl-count">{count}</span> : null}
      </div>
      {lede ? <p className="hl-lede">{lede}</p> : null}
    </div>
  )
}

/** A quote, set in Instrument Serif italic, its source in mono beneath. */
function Voice({ q, names, size = 'md' }: { q: ConvQuote; names: Names | null; size?: 'md' | 'sm' }) {
  const note = translationNote({ lang: q.quote.lang, english: q.quote.english })
  const label = translationLabel(note)
  return (
    <figure className={`hl-voice hl-voice-${size}`}>
      <blockquote>
        <p data-copy="quote">“{stripEmoji(q.quote.text)}”</p>
        {label ? <p className="hl-voice-note">{label}</p> : null}
        {note.english ? <p data-copy="quote" className="hl-voice-en">{stripEmoji(note.english)}</p> : null}
      </blockquote>
      <figcaption>
        <span>{q.source}</span>
        {q.who.length > 0 && names ? <><span className="hl-who-sep"> · </span><Who parts={q.who} names={names} /></> : null}
      </figcaption>
    </figure>
  )
}

// ---- the hero -----------------------------------------------------------------

function Hero({ data }: { data: VoiceSurfaceData }) {
  const month = longMonth(data.month)
  const n = data.board.n
  const comments = data.market.comments
  const platforms = data.market.platformMix.length
  return (
    <section className="hl-hero" aria-labelledby="hl-title">
      <h1 id="hl-title" className="hl-title">
        Everything your market <br /><em>said</em>, in full.
      </h1>
      <p className="hl-sub">
        Every conversation on 10 or more of the category’s <span data-copy="figure">{fmtInt(n)}</span> videos in {month}, who it was about, and the words people used.
      </p>
      <div className="hl-get">
        <div className="hl-pill" aria-label={`The base for ${month}`}>
          <MessageSquareText aria-hidden className="hl-pill-icon" strokeWidth={1.75} />
          <span className="hl-pill-line">
            <span data-copy="figure">{fmtInt(n)}</span> videos
            {comments != null ? <> · <span data-copy="figure">{fmtInt(comments)}</span> comments</> : null}
            {platforms > 0 ? <span className="hl-pill-extra"> · <span data-copy="figure">{platforms}</span> {platforms === 1 ? 'platform' : 'platforms'}</span> : null}
          </span>
        </div>
        <Link href={surface('ask').href} className="hl-btn hl-btn-primary">
          Ask the Agent
        </Link>
      </div>
      <Link href={surface('week').href} className="hl-aside-link">
        <CalendarDays aria-hidden strokeWidth={1.5} />
        <span>Or read this week in your market</span>
      </Link>
      <div className="hl-hero-figure">
        <Riffle theme="light" intensity={0.55} label={`A tray of filed cards, one for each conversation in ${month}. Move across it to stand one up.`} />
      </div>
    </section>
  )
}

// ---- every conversation ----------------------------------------------------------

function Board({ data, params }: { data: VoiceSurfaceData; params: Params }) {
  const c = data.conversation ?? null
  const b = data.board
  const n = b.n
  const makers = b.segments === 'measured' ? b.makers ?? [] : []
  const count = b.rows.length + makers.length
  if (count === 0) return null
  const month = longMonth(data.month)
  const openId = data.theme.state === 'ready' ? data.theme.id : null
  return (
    <section id="board" className="hl-sec" aria-labelledby="board-h">
      <Head
        id="board"
        title={`Every conversation in ${month}`}
        count={<><span data-copy="figure">{fmtInt(count)}</span> conversations</>}
        lede={<>On 10 or more videos each, as a share of the category’s <span data-copy="figure">{fmtInt(n)}</span> videos {c?.monthWords ?? `in ${month}`}.</>}
      />
      <div className="hl-tile">
        <ol className="hl-rows">
          {b.rows.map((t) => {
            const on = t.registryId === openId
            const row = c?.rows[t.registryId]
            const meta = [row?.subject, row?.makers].filter((x): x is string => Boolean(x))
            const cell = shareCell(t.k, n)
            return (
              <li key={t.registryId}>
                <Link href={href(params, { theme: t.registryId }, 'theme')} aria-current={on ? 'true' : undefined} className="hl-row">
                  <span className="hl-row-main">
                    <span data-copy="subject" data-slot="pass_b_theme" className="hl-row-label">{t.label}</span>
                    {row?.who.length || meta.length ? (
                      <span className="hl-row-meta">
                        {row?.who.length && c ? <Who parts={row.who} names={c.names} /> : null}
                        {meta.length ? <span>{row?.who.length ? ' · ' : ''}{meta.join(' · ')}</span> : null}
                      </span>
                    ) : null}
                  </span>
                  <Bar pct={cell.pct} />
                  <span data-copy="figure" className="hl-row-n">{cell.text}</span>
                </Link>
              </li>
            )
          })}
        </ol>
        {makers.length > 0 ? (
          <div className="hl-foot hl-makers">
            <span className="hl-foot-label">Makers’ own talk, set apart</span>
            <p>
              {makers.map((t, i) => {
                const p = shareOf(t.k, n)
                return (
                  <span key={t.registryId}>
                    {i > 0 ? ', ' : ''}
                    <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
                    {n >= 100 && p >= MAKER_LINE_SHARE_FLOOR ? <> <span data-copy="figure" className="hl-mono hl-muted">{p}%</span></> : null}
                  </span>
                )
              })}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

// ---- one in full -------------------------------------------------------------------

function InFull({ data }: { data: VoiceSurfaceData }) {
  const t = data.theme
  if (t.state !== 'ready' || t.k == null || t.n == null) return null
  const c = data.conversation ?? null
  const row = t.id ? c?.rows[t.id] : undefined
  const k = t.k
  const cell = shareCell(k, t.n)
  const makers = data.board.segments === 'measured' ? makerPostsSentence(data.board.rows.find((r) => r.registryId === t.id)?.makerShare ?? null) : null
  const kinds = (t.kinds ?? []).filter((x) => x.videos > 0)
  const voices: ConvQuote[] = c ? c.voices : t.voices.map((v) => ({ quote: v.quote as Quote, source: v.cite, who: [] }))
  const month = longMonth(data.month)
  return (
    <section id="theme" className="hl-sec" aria-labelledby="theme-h">
      <Head id="theme" title="A conversation in full" count={<><span data-copy="figure">{fmtInt(k)}</span> of <span data-copy="figure">{fmtInt(t.n)}</span></>} />
      <article className="hl-tile hl-pane">
        <div className="hl-pane-top">
          <h3 data-copy="subject" data-slot="pass_b_theme" className="hl-pane-title">{t.label}</h3>
          <div className="hl-pane-figure">
            <span data-copy="figure" className="hl-big">{cell.text}</span>
            <span className="hl-muted">of the category’s <span data-copy="figure">{fmtInt(t.n)}</span> videos {c?.monthWords ?? `in ${month}`}</span>
          </div>
          {row?.who.length && c ? <div className="hl-pane-who"><Who parts={row.who} names={c.names} /></div> : null}
          {row?.subject || makers ? (
            <div className="hl-pane-tags">
              {row?.subject ? <span className="hl-chip">Part of {row.subject}</span> : null}
              {makers ? <span className="hl-muted">{makers}</span> : null}
            </div>
          ) : null}
        </div>
        {kinds.length > 0 ? (
          <div className="hl-pane-part">
            <div className="hl-mini-head"><span>What people did in it</span><span>Of its <span data-copy="figure">{fmtInt(k)}</span> videos</span></div>
            <ul className="hl-kv">
              {kinds.map((kd) => (
                <li key={kd.kind}>
                  <span className="hl-kv-label">{c?.kindLabels?.[kd.kind] ?? kd.label}</span>
                  <Bar pct={k > 0 ? (100 * kd.videos) / k : 0} />
                  <span data-copy="figure" className="hl-kv-n">{fmtInt(kd.videos)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {voices.length > 0 ? (
          <div className="hl-pane-part">
            <div className="hl-mini-head"><span>Voices</span></div>
            <div className="hl-voices">
              {voices.map((q) => <Voice key={q.quote.ref} q={q} names={c?.names ?? null} />)}
            </div>
          </div>
        ) : null}
        <div className="hl-pane-actions">
          <Link href={t.askHref} className="hl-btn hl-btn-primary">
            <Sparkles aria-hidden strokeWidth={1.75} />
            Ask the Agent about this
          </Link>
        </div>
      </article>
    </section>
  )
}

// ---- where your market talks ----------------------------------------------------------

function Where({ data, params }: { data: VoiceSurfaceData; params: Params }) {
  const w = data.where
  if (!w || w.rows.length === 0) return null
  const rows = w.expanded ? w.rows : w.rows.slice(0, WHERE_SHOWN)
  return (
    <section id="where" className="hl-sec" aria-labelledby="where-h">
      <Head
        id="where"
        title="Where your market talks"
        count={<><span data-copy="figure">{fmtInt(rows.length)}</span> of <span data-copy="figure">{fmtInt(w.listed)}</span></>}
        lede={<>Accounts with 3 or more of the category’s videos in {longMonth(data.month)}.</>}
      />
      <div className="hl-tile hl-where">
        <div className="hl-where-figure">
          <Hub theme="light" intensity={0.5} label="A hub with tiles around it on dashed links, standing for the accounts the market talks on." />
        </div>
        <div className="hl-where-list">
          <ul className="hl-accounts">
            {rows.map((a) => (
              <li key={a.key}>
                <span className="hl-acc-main">
                  <span className="hl-acc-name">{stripEmoji(a.name)}</span>
                  <span className="hl-acc-meta">{platformLabel(a.platform)}{w.segments === 'measured' && a.maker ? ' · makers' : ''}</span>
                </span>
                <span className="hl-acc-n"><span data-copy="figure" className="hl-mono">{fmtInt(a.videos)}</span> videos</span>
                <span className="hl-acc-c"><span data-copy="figure" className="hl-mono">{fmtInt(a.comments)}</span> comments</span>
              </li>
            ))}
          </ul>
          {!w.expanded && w.listed > rows.length ? (
            <Link href={href(params, { accounts: 'all' }, 'where')} className="hl-more">
              <span className="hl-more-text">All <span data-copy="figure">{fmtInt(w.listed)}</span> accounts</span>
              <ArrowRight aria-hidden strokeWidth={1.75} />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}

// ---- who is talking --------------------------------------------------------------

function WhoTalks({ data }: { data: VoiceSurfaceData }) {
  const cast = data.cast
  if (cast.state !== 'ready') return null
  const personas = [...cast.personas].filter((p) => p.videos >= PERSONA_VIDEO_FLOOR).sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name))
  if (personas.length === 0) return null
  return (
    <section id="who" className="hl-sec" aria-labelledby="who-h">
      <Head id="who" title="Who is talking" count={<><span data-copy="figure">{personas.length}</span> groups</>} lede="Videos each group comments on, all comments to date." />
      <div className="hl-tile">
        <ul className="hl-people">
          {personas.map((p) => {
            const wants = firstSentence(p.wants)
            const stops = firstSentence(p.blockers)
            return (
              <li key={p.key}>
                <div className="hl-person-name">
                  <span>{p.name}</span>
                  <span className="hl-muted"><span data-copy="figure" className="hl-mono">{fmtInt(p.videos)}</span> videos</span>
                </div>
                <div className="hl-person-body">
                  {p.oneLiner ? <p data-copy="subject" data-slot="pass_e_persona" className="hl-person-line">{p.oneLiner}</p> : null}
                  {wants || stops ? (
                    <div className="hl-person-cols">
                      {wants ? (
                        <div>
                          <span className="hl-label">What they want</span>
                          <p data-copy="subject" data-slot="pass_e_persona">{wants}</p>
                        </div>
                      ) : null}
                      {stops ? (
                        <div>
                          <span className="hl-label">What stops them</span>
                          <p data-copy="subject" data-slot="pass_e_persona">{stops}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

// ---- the market's words ------------------------------------------------------------

/** The kinds in the shipped page's order (its pairs, flattened). */
function shownKinds(c: ConversationExtras | null | undefined): ConvKind[] {
  if (!c || c.kinds.length === 0) return []
  const byKind = new Map(c.kinds.map((k) => [k.kind, k]))
  return CONV_KIND_ROWS.flat().map((kind) => byKind.get(kind)).filter((k): k is ConvKind => k != null)
}

/** One kind as a tile: its name, count and who it was about in the tile's
 *  caption bar (the /figures tile foot, moved to the top so a list is never
 *  read before its name), the market's own words beneath, then what was said
 *  most and what was said about the brands. */
function KindTile({ k, names }: { k: ConvKind; names: Names }) {
  const Icon = KIND_ICON[k.kind]
  return (
    <article id={`kind-${k.kind}`} className="hl-tile hl-kind" aria-labelledby={`kind-${k.kind}-h`}>
      <header className="hl-kind-head">
        <div className="hl-kind-name">
          {Icon ? <Icon aria-hidden strokeWidth={1.75} /> : null}
          <h3 id={`kind-${k.kind}-h`}>{k.label}</h3>
        </div>
        <span className="hl-kind-n"><span data-copy="figure" className="hl-mono">{fmtInt(k.videos)}</span> videos</span>
        <Who parts={k.split} names={names} className="hl-kind-who" />
      </header>
      {k.quote ? <div className="hl-kind-stage"><Voice q={k.quote} names={names} size="sm" /></div> : null}
      {k.items.length > 0 ? (
        <div className="hl-kind-part">
          <div className="hl-mini-head"><span>Said most</span><span>Videos</span></div>
          <ul className="hl-said">
            {k.items.map((it) => (
              <li key={it.themeId}>
                <span className="hl-said-main">
                  <span data-copy="subject" data-slot="pass_b_theme">{it.label}</span>
                  <Who parts={it.who} names={names} className="hl-said-who" />
                </span>
                <span data-copy="figure" className="hl-mono">{fmtInt(it.videos)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {k.brandItems.length > 0 ? (
        <div className="hl-kind-part">
          <div className="hl-mini-head"><span>On videos about {names.client} and its rivals</span></div>
          <ul className="hl-brands">
            {k.brandItems.map((it) => (
              <li key={`${it.about}|${it.themeId}`}>
                <span className={it.about === 'client' ? 'hl-who-you' : 'hl-who-rival'}>{it.about === 'client' ? names.client : aboutName(it.about, names)}</span>
                <span data-copy="subject" data-slot="pass_b_theme">{it.label}</span>
                <span data-copy="figure" className="hl-mono">{fmtInt(it.videos)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

function Words({ data }: { data: VoiceSurfaceData }) {
  const c = data.conversation
  const kinds = shownKinds(c)
  if (!c || kinds.length === 0) return null
  return (
    <section id="words" className="hl-sec" aria-labelledby="words-h">
      <Head
        id="words"
        title="The market’s words"
        count={<><span data-copy="figure">{kinds.length}</span> kinds</>}
        lede={<>What people said most in {longMonth(data.month)}, by what they were doing. Makers’ own talk is set apart.</>}
      />
      <div className="hl-kinds">
        {kinds.map((k) => <KindTile key={k.kind} k={k} names={c.names} />)}
      </div>
    </section>
  )
}

// ---- the page --------------------------------------------------------------------

/** The page's index, the /figures shelves: each block with its count, then
 *  the market's words kind by kind. */
function shelves(data: VoiceSurfaceData): Shelf[] {
  const c = data.conversation ?? null
  const b = data.board
  const out: Shelf[] = []
  const boardCount = b.rows.length + (b.segments === 'measured' ? b.makers?.length ?? 0 : 0)
  if (data.brandView || boardCount > 0) out.push({ id: 'board', label: 'Every conversation', count: data.brandView ? null : fmtInt(boardCount), icon: 'board' })
  if (data.theme.state === 'ready' && data.theme.k != null) out.push({ id: 'theme', label: 'One in full', count: fmtInt(data.theme.k), icon: 'theme' })
  if (data.where && data.where.rows.length > 0) out.push({ id: 'where', label: 'Where it talks', count: fmtInt(data.where.listed), icon: 'where' })
  const personas = data.cast.state === 'ready' ? data.cast.personas.filter((p) => p.videos >= PERSONA_VIDEO_FLOOR).length : 0
  if (personas > 0) out.push({ id: 'who', label: 'Who is talking', count: fmtInt(personas), icon: 'who' })
  const kinds = shownKinds(c)
  if (kinds.length > 0) {
    out.push({ id: 'words', label: 'The market’s words', count: fmtInt(kinds.length), icon: 'words' })
    for (const k of kinds) out.push({ id: `kind-${k.kind}`, label: k.label, count: fmtInt(k.videos), icon: k.kind, sub: true })
  }
  return out
}

/** The page body in the Hairline look: hero, then the index beside the blocks. */
export function HairlineConversation({ data, params }: { data: VoiceSurfaceData; params: Params }) {
  const legacyBoard = data.brandView ? (
    // `?brand=`: the legacy brand board in the board's place, as the shipped
    // page does. Not redrawn for the test: it keeps its own styles.
    <section id="board" className="hl-sec" aria-labelledby="board-h">
      <Head id="board" title={`${data.brandView.name}’s videos`} />
      <div className="hl-tile hl-legacy">{voiceBoard.render(data, 'app', voiceContext(params))}</div>
    </section>
  ) : null
  return (
    <>
      <Hero data={data} />
      <div className="hl-body">
        <Shelves items={shelves(data)} />
        <div className="hl-main">
          {legacyBoard ?? <Board data={data} params={params} />}
          <InFull data={data} />
          <Where data={data} params={params} />
          <WhoTalks data={data} />
          <Words data={data} />
        </div>
      </div>
    </>
  )
}

/** Before the first month: the hero alone, over an empty drawer. */
export function HairlineEmpty() {
  return (
    <section className="hl-hero hl-hero-empty" aria-labelledby="hl-title">
      <h1 id="hl-title" className="hl-title">
        Nothing <em>said</em> yet.
      </h1>
      <p className="hl-sub">Your market’s first month will appear here.</p>
      <div className="hl-hero-figure hl-hero-figure-sm">
        <Drawer theme="light" intensity={0.5} label="A filing cabinet of three drawers, empty for now." />
      </div>
    </section>
  )
}

/** The quiet bar above the hero: the page's name and month, and the way back
 *  to the shipped look. */
export function HairlineTopbar({ data, params }: { data: VoiceSurfaceData | null; params: Params }) {
  return (
    <header className="hl-topbar">
      <div className="hl-topbar-name">
        <span>{surface('voice').label}</span>
        {data ? <span className="hl-topbar-meta">{longMonth(data.month)}</span> : null}
      </div>
      <nav aria-label="Look">
        <Link href={voiceSurfaceHref(params)} className="hl-topbar-link">Usual look</Link>
      </nav>
    </header>
  )
}
