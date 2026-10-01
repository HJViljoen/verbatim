import Link from 'next/link'
import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { BrandWho, WhoInline, WHO_GOLD } from '@/components/brand-who'
import { translationLabel, translationNote } from '@/components/quote-block'
import type { AboutPart } from '@/lib/brands/attribution'
import { aboutName } from '@/lib/brands/attribution'
import { fmtInt, longMonth, platformLabel } from '@/lib/format'
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
import { cn } from '@/lib/utils'

// Conversation, drawn to the approved artboard (Page-Conversation.dc.html,
// the pages build of 1 Oct): the board of every conversation beside one in
// full and where the market talks; who is talking; the market's words, kind
// by kind. Palette A literals throughout (yellow #FFD43B, track #ECEAE4, ink
// #26292C, muted #5F656B, hair #E4E2DC, ground #F7F6F2, orange #C2410C): the
// app's tokens are still the old brand's until the colour swap.
//
// NO LEFT STRIPE, NO HIGHLIGHT, NO EMOJI, NO EM DASH. Bars are drawn against
// 100%. A block with nothing to show is not drawn.

const HAIR = 'border-[#E4E2DC]'
const MUTED = 'text-[#5F656B]'

/** The artboard's card: white, 16px corners, its own padding and gap. */
export function ConvCard({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} data-card="" className={cn('flex min-w-0 scroll-mt-6 flex-col rounded-[16px] bg-white shadow-tile', className)}>
      {children}
    </section>
  )
}

function H2({ title, sub, stacked = false }: { title: string; sub?: string; stacked?: boolean }) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[20px] font-bold">{title}</h2>
        {sub ? <div className={cn('text-[13px]', MUTED)}>{sub}</div> : null}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="m-0 text-[20px] font-bold">{title}</h2>
      {sub ? <div className={cn('text-[13px]', MUTED)}>{sub}</div> : null}
    </div>
  )
}

function H3({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <h3 className="m-0 text-[16px] font-bold">{title}</h3>
      {sub ? <div className={cn('text-[13px]', MUTED)}>{sub}</div> : null}
    </div>
  )
}

/** A bar drawn against 100%, never against the top row. */
export function Bar({ pct, width }: { pct: number; width?: number }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <span aria-hidden className={cn('block h-2 overflow-hidden rounded bg-[#ECEAE4]', width ? 'shrink-0' : 'grow')} style={width ? { width } : undefined}>
      <span className="block h-2 bg-[#FFD43B]" style={{ width: `${w}%` }} />
    </span>
  )
}

/** A figure in mono at the row's right-hand end, with its unit. */
function Num({ n, unit, size = 14 }: { n: number; unit?: string; size?: number }) {
  return (
    <div className="shrink-0 whitespace-nowrap text-right font-mono font-medium" style={{ fontSize: size }}>
      <span data-copy="figure">{fmtInt(n)}</span>
      {unit ? <span className={cn('font-sans text-[12px] font-normal', MUTED)}> {unit}</span> : null}
    </div>
  )
}

/** A quote on a plain panel, its source line carrying who it is about. */
export function QuotePanel({ q, names, size = 15 }: { q: ConvQuote; names: ConversationExtras['names'] | null; size?: number }) {
  const note = translationNote({ lang: q.quote.lang, english: q.quote.english })
  const label = translationLabel(note)
  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-[#F7F6F2] px-[18px] py-4">
      <p data-copy="quote" className="m-0 font-serif italic leading-[1.5] text-[#26292C]" style={{ fontSize: size }}>“{stripEmoji(q.quote.text)}”</p>
      {label ? <div className={cn('text-[12px]', MUTED)}>{label}</div> : null}
      {note.english ? <p data-copy="quote" className={cn('m-0 font-serif text-[14px] leading-[1.5]', MUTED)}>{stripEmoji(note.english)}</p> : null}
      <div className={cn('text-[12px]', MUTED)}>
        {q.source}
        {q.who.length > 0 && names ? <><span> · </span><WhoInline parts={q.who} names={names} /></> : null}
      </div>
    </div>
  )
}

function sizeWords(data: VoiceSurfaceData, c: ConversationExtras | null | undefined): string {
  return c?.monthWords ?? `in ${longMonth(data.month)}`
}

/** A share where the base can carry one (100 videos or more), else the count. */
function shareCell(k: number, n: number): { pct: number; text: string } {
  if (n >= 100) {
    const p = shareOf(k, n)
    return { pct: p, text: `${p}%` }
  }
  return { pct: n > 0 ? (100 * k) / n : 0, text: fmtInt(k) }
}

// ---- the board ------------------------------------------------------------------

function BoardCard({ data, params }: { data: VoiceSurfaceData; params: Record<string, string | undefined> }) {
  const c = data.conversation ?? null
  const b = data.board
  const n = b.n
  const makers = b.segments === 'measured' ? b.makers ?? [] : []
  const count = b.rows.length + makers.length
  if (count === 0) return null
  const month = longMonth(data.month)
  const openId = data.theme.state === 'ready' ? data.theme.id : null
  return (
    <ConvCard className="gap-3 px-7 pt-6 pb-6">
      <H2 stacked title={`Every conversation in ${month}`} sub={`${fmtInt(count)} conversations on 10 or more videos · share of the category’s ${fmtInt(n)} videos ${sizeWords(data, c)}`} />
      <div className="flex flex-col">
        {b.rows.map((t) => {
          const on = t.registryId === openId
          const row = c?.rows[t.registryId]
          const meta = [row?.subject, row?.makers].filter((x): x is string => Boolean(x))
          const cell = shareCell(t.k, n)
          return (
            <Link
              key={t.registryId}
              href={`${voiceSurfaceHref(params, { theme: t.registryId })}#theme`}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'flex items-center gap-3.5 border-t text-[#26292C] no-underline',
                on ? '-mx-3 rounded-[10px] border-transparent bg-[rgba(38,41,44,0.07)] px-3 py-[9px]' : cn('py-[9px]', HAIR),
              )}
            >
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <div data-copy="subject" data-slot="pass_b_theme" className={cn('text-[14.5px]', on ? 'font-bold' : 'font-semibold')}>{t.label}</div>
                {row?.who.length || meta.length ? (
                  <div className="text-[12px] leading-[1.45]">
                    {row?.who.length ? <WhoInline parts={row.who} names={c!.names} /> : null}
                    {meta.length ? <span className={MUTED}>{row?.who.length ? ' · ' : ''}{meta.join(' · ')}</span> : null}
                  </div>
                ) : null}
              </div>
              <Bar pct={cell.pct} width={96} />
              <div data-copy="figure" className="w-10 shrink-0 text-right font-mono text-[14px] font-medium">{cell.text}</div>
            </Link>
          )
        })}
      </div>
      {makers.length > 0 ? (
        <div className={cn('border-t pt-2.5 text-[13px] leading-[1.55]', HAIR, MUTED)}>
          <span className="font-semibold text-[#26292C]">Makers’ own talk, set apart:</span>{' '}
          {makers.map((t, i) => {
            const p = shareOf(t.k, n)
            return (
              <span key={t.registryId}>
                {i > 0 ? ', ' : ''}
                <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
                {n >= 100 && p >= MAKER_LINE_SHARE_FLOOR ? <> (<span data-copy="figure">{p}%</span>)</> : null}
              </span>
            )
          })}
          .
        </div>
      ) : null}
    </ConvCard>
  )
}

// ---- the conversation in full ------------------------------------------------------

function PaneCard({ data }: { data: VoiceSurfaceData }) {
  const t = data.theme
  if (t.state !== 'ready' || t.k == null || t.n == null) return null
  const c = data.conversation ?? null
  const row = t.id ? c?.rows[t.id] : undefined
  const k = t.k
  const cell = shareCell(k, t.n)
  const makers = data.board.segments === 'measured' ? makerPostsSentence(data.board.rows.find((r) => r.registryId === t.id)?.makerShare ?? null) : null
  const kinds = (t.kinds ?? []).filter((k) => k.videos > 0)
  const voices: ConvQuote[] = c ? c.voices : t.voices.map((v) => ({ quote: v.quote as Quote, source: v.cite, who: [] }))
  return (
    <ConvCard id="theme" className="gap-[18px] px-7 pt-[26px] pb-7">
      <div className={cn('text-[12px] font-bold uppercase tracking-[0.08em]', MUTED)}>A conversation in full</div>
      <div className="flex flex-col gap-2">
        <h2 data-copy="subject" data-slot="pass_b_theme" className="m-0 text-[24px] font-bold leading-[1.25]">{t.label}</h2>
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span data-copy="figure" className="font-mono text-[28px] font-medium">{cell.text}</span>
          <span className={cn('text-[14px]', MUTED)}>of the category’s {fmtInt(t.n)} videos {sizeWords(data, c)}</span>
        </div>
        {row?.who.length ? <BrandWho parts={row.who} names={c!.names} className="text-[13px]" /> : null}
        {row?.subject || makers ? (
          <div className="flex flex-wrap items-center gap-2">
            {row?.subject ? <span className="inline-flex items-center rounded-full bg-[#F7F6F2] px-2.5 py-[5px] text-[12px] leading-[1.3] text-[#26292C]">Part of {row.subject}</span> : null}
            {makers ? <span className={cn('text-[13px]', MUTED)}>{makers}</span> : null}
          </div>
        ) : null}
      </div>
      {kinds.length > 0 ? (
        <div className="flex flex-col gap-2 pt-1.5">
          <H3 title="What people did in it" sub={`Of its ${fmtInt(k)} videos`} />
          <div className="flex flex-col">
            {kinds.map((kd) => (
              <div key={kd.kind} className={cn('flex items-center gap-3.5 border-t py-2', HAIR)}>
                <div className="w-[210px] shrink-0 text-[14px] max-sm:w-[150px]">{c?.kindLabels?.[kd.kind] ?? kd.label}</div>
                <Bar pct={k > 0 ? (100 * kd.videos) / k : 0} />
                <div data-copy="figure" className="w-[34px] shrink-0 text-right font-mono text-[14px] font-medium">{fmtInt(kd.videos)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {voices.length > 0 ? (
        <div className="flex flex-col gap-2.5 pt-1.5">
          <H3 title="Voices" />
          {voices.map((q) => <QuotePanel key={q.quote.ref} q={q} names={c?.names ?? null} />)}
        </div>
      ) : null}
      <div className="pt-1">
        <Link href={t.askHref} className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-[#E4E2DC] bg-white px-4 text-[14px] font-semibold text-[#26292C] no-underline">
          <Sparkles aria-hidden className="size-4" strokeWidth={2} />
          Ask the Agent about this
        </Link>
      </div>
    </ConvCard>
  )
}

// ---- where your market talks --------------------------------------------------------

function WhereCard({ data, params }: { data: VoiceSurfaceData; params: Record<string, string | undefined> }) {
  const w = data.where
  if (!w || w.rows.length === 0) return null
  const rows = w.expanded ? w.rows : w.rows.slice(0, WHERE_SHOWN)
  return (
    <ConvCard id="where" className="gap-3 px-7 pt-6 pb-[22px]">
      <H2 stacked title="Where your market talks" sub={`Accounts with 3 or more of the category’s videos in ${longMonth(data.month)}`} />
      <div className="flex flex-col">
        {rows.map((a) => (
          <div key={a.key} className={cn('flex h-10 items-center gap-3 border-t', HAIR)}>
            <div className="min-w-0 grow truncate text-[14.5px] font-semibold">{stripEmoji(a.name)}</div>
            <div className={cn('w-[112px] shrink-0 whitespace-nowrap text-[13px] max-sm:hidden', MUTED)}>{platformLabel(a.platform)}{w.segments === 'measured' && a.maker ? ' · makers' : ''}</div>
            <div className="w-[66px] shrink-0 text-right text-[13px]"><span data-copy="figure" className="font-mono">{fmtInt(a.videos)}</span> videos</div>
            <div className={cn('w-[100px] shrink-0 text-right text-[13px] max-sm:hidden', MUTED)}><span data-copy="figure" className="font-mono">{fmtInt(a.comments)}</span> comments</div>
          </div>
        ))}
      </div>
      {!w.expanded && w.listed > rows.length ? (
        <Link href={`${voiceSurfaceHref(params, { accounts: 'all' })}#where`} className="text-[14px] font-semibold text-[#C2410C] no-underline">
          All {fmtInt(w.listed)} accounts →
        </Link>
      ) : null}
    </ConvCard>
  )
}

// ---- who is talking ---------------------------------------------------------------

function WhoTalksCard({ data }: { data: VoiceSurfaceData }) {
  const cast = data.cast
  if (cast.state !== 'ready') return null
  const personas = [...cast.personas].filter((p) => p.videos >= PERSONA_VIDEO_FLOOR).sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name))
  if (personas.length === 0) return null
  return (
    <ConvCard className="gap-2.5 px-7 pt-6 pb-2">
      <H2 title="Who is talking" sub="Videos each group comments on, all comments to date" />
      <div className="flex flex-col">
        {personas.map((p) => {
          const wants = firstSentence(p.wants)
          const stops = firstSentence(p.blockers)
          return (
            <div key={p.key} className={cn('grid grid-cols-1 gap-x-7 gap-y-3 border-t py-[18px] xl:grid-cols-[170px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]', HAIR)}>
              <div className="flex flex-col gap-1">
                <div className="text-[17px] font-bold">{p.name}</div>
                <div className={cn('text-[13px]', MUTED)}><span data-copy="figure" className="font-mono text-[#26292C]">{fmtInt(p.videos)}</span> videos</div>
              </div>
              {p.oneLiner ? <p data-copy="subject" data-slot="pass_e_persona" className="m-0 text-[15px] leading-[1.55]">{p.oneLiner}</p> : <div />}
              {wants ? (
                <div className="flex flex-col gap-1">
                  <div className={cn('text-[12px] font-semibold', MUTED)}>What they want</div>
                  <p data-copy="subject" data-slot="pass_e_persona" className="m-0 text-[14px] leading-[1.5]">{wants}</p>
                </div>
              ) : <div />}
              {stops ? (
                <div className="flex flex-col gap-1">
                  <div className={cn('text-[12px] font-semibold', MUTED)}>What stops them</div>
                  <p data-copy="subject" data-slot="pass_e_persona" className="m-0 text-[14px] leading-[1.5]">{stops}</p>
                </div>
              ) : <div />}
            </div>
          )
        })}
      </div>
    </ConvCard>
  )
}

// ---- the market's words, kind by kind ------------------------------------------------

function BrandName({ part, names }: { part: AboutPart; names: ConversationExtras['names'] }) {
  if (part.about === 'client') return <span className={cn('font-semibold', WHO_GOLD)}>{names.client}</span>
  return <span className="font-semibold text-[#26292C]">{aboutName(part.about, names)}</span>
}

export function KindCard({ k, names }: { k: ConvKind; names: ConversationExtras['names'] }) {
  return (
    <ConvCard className="gap-3 px-6 py-[22px]">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="m-0 text-[17px] font-bold">{k.label}</h3>
          <Num n={k.videos} unit="videos" size={15} />
        </div>
        <BrandWho parts={k.split} names={names} />
      </div>
      {k.items.length > 0 ? (
        <div className="flex flex-col gap-1.5 pt-1">
          <div className={cn('flex justify-between pt-0.5 text-[12px] font-semibold', MUTED)}><span>Said most</span><span>Videos</span></div>
          <div className="flex flex-col">
            {k.items.map((it) => (
              <div key={it.themeId} className={cn('flex items-start justify-between gap-4 border-t py-[9px]', HAIR)}>
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <div data-copy="subject" data-slot="pass_b_theme" className="text-[14.5px] font-semibold leading-[1.35]">{it.label}</div>
                  <BrandWho parts={it.who} names={names} />
                </div>
                <Num n={it.videos} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {k.brandItems.length > 0 ? (
        <div className="flex flex-col gap-1 pt-1.5">
          <div className={cn('text-[12px] font-semibold', MUTED)}>On videos about {names.client} and its rivals</div>
          <div className="flex flex-col">
            {k.brandItems.map((it) => (
              <div key={`${it.about}|${it.themeId}`} className={cn('grid grid-cols-[110px_minmax(0,1fr)_auto] items-baseline gap-3 border-t py-[7px] sm:grid-cols-[150px_minmax(0,1fr)_auto]', HAIR)}>
                <div className="text-[13px]"><BrandName part={{ about: it.about, videos: it.videos }} names={names} /></div>
                <div data-copy="subject" data-slot="pass_b_theme" className="text-[13.5px] leading-[1.35]">{it.label}</div>
                <Num n={it.videos} size={13} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {k.quote ? <div className="pt-1"><QuotePanel q={k.quote} names={names} size={14} /></div> : null}
    </ConvCard>
  )
}

function MarketsWords({ data }: { data: VoiceSurfaceData }) {
  const c = data.conversation
  if (!c || c.kinds.length === 0) return null
  const byKind = new Map(c.kinds.map((k) => [k.kind, k]))
  // The artboard's pairs, in order; a pair missing a kind closes up so no
  // card stands beside an empty column.
  const shown = CONV_KIND_ROWS.flat().map((kind) => byKind.get(kind)).filter((k): k is ConvKind => k != null)
  const pairs: ConvKind[][] = []
  for (let i = 0; i < shown.length; i += 2) pairs.push(shown.slice(i, i + 2))
  return (
    <div className="flex flex-col gap-3.5">
      <H2 title="The market’s words" sub={`What people said most in ${longMonth(data.month)}, by what they were doing. Makers’ own talk is set apart.`} />
      <div className="flex flex-col gap-4">
        {pairs.map((pair) => (
          <div key={pair.map((k) => k.kind).join('|')} className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            {pair.map((k) => <KindCard key={k.kind} k={k} names={c.names} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The page body under the title: the artboard's order. */
export function ConversationBody({
  data, params, board,
}: {
  data: VoiceSurfaceData
  params: Record<string, string | undefined>
  /** What stands in the board's place under `?brand=` (the legacy brand view). */
  board?: ReactNode
}) {
  const left = board ?? <BoardCard data={data} params={params} />
  return (
    <>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">{left}</div>
        <div className="flex min-w-0 flex-col gap-5">
          <PaneCard data={data} />
          <WhereCard data={data} params={params} />
        </div>
      </div>
      <WhoTalksCard data={data} />
      <MarketsWords data={data} />
    </>
  )
}
