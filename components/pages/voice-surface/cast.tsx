import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, shortDate } from '@/lib/format'
import { carriesShare } from '@/lib/reading/level'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { CastBlock, CastPersona, VoiceSurfaceData } from '@/lib/pages/voice-surface'

// C4 · Who is talking (market-first WP2.4, plan §2.4 C4; key `voice.cast`,
// reworked to the approved preview's table).
//
// ONE ROW PER GROUP, BIGGEST FIRST: who they are in the model's own words, the
// platforms their videos came from, how many videos the group was read on, and
// one of the group's own comments.
//
// DATED BY AN UPDATE, AND THE COLUMN HEAD SAYS SO (§2.4 C4: "grouped at the
// update of {date}, over everything read to date" as the column head, never
// header meta). Every other figure on the page is dated by the comment; a
// stored profile is written over everything the workspace had read at that
// update. The groups overlap, so the counts are counts and no share of the
// month is taken from them; How to read says so once, not a note under the
// block (25 Sep rulings).

/** "YouTube 37% · TikTok 31% · …": a share where the group's platform counts
 *  can carry one, the counts where they cannot, SAID TO BE COUNTS (finish-list
 *  item 9: the Supporter group's "YouTube 29 · TikTok 26" sat among the other
 *  groups' percentages and read as shares): "… (videos, too few for
 *  shares)". */
export function platformLine(p: Pick<CastPersona, 'platformMix'>): string | null {
  if (p.platformMix.length === 0) return null
  const total = p.platformMix.reduce((n, x) => n + x.videos, 0)
  const shares = carriesShare(total) && p.platformMix.every((x) => x.pct != null)
  const line = p.platformMix
    .map((x) => `${x.label} ${shares ? `${Math.round(x.pct as number)}%` : fmtInt(x.videos)}`)
    .join(' · ')
  return shares ? line : `${line} (videos, too few for shares)`
}

/** The Group column's head: when the groups were drawn, and over what. */
export function castHead(c: Pick<CastBlock, 'profileDate'>): string | null {
  return c.profileDate ? `grouped at the ${shortDate(c.profileDate)} update, over everything read to date` : null
}

const byVideos = (c: CastBlock): CastPersona[] => [...c.personas].sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name))

function PersonaRow({ p, max, mode }: { p: CastPersona; max: number; mode: RenderMode }) {
  const mix = platformLine(p)
  if (mode === 'email') {
    return (
      <div style={{ padding: '8px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>
          {p.name} <span data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 400, color: EMAIL.ink2 }}>{fmtInt(p.videos)} videos</span>
        </div>
        {p.oneLiner ? <div data-copy="subject" data-slot="pass_e_persona" style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2 }}>{p.oneLiner}</div> : null}
        {p.quote ? <BlockQuote mode={mode} quote={p.quote} cite={p.quoteCite ?? undefined} /> : null}
      </div>
    )
  }
  return (
    // The last group closes the table with no rule under it, as the preview
    // draws it (d3 polish).
    <div role="row" className="grid grid-cols-1 gap-x-12 gap-y-3 border-b border-border/60 py-6 last:border-b-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_216px_336px]">
      <div role="rowheader" className="flex min-w-0 flex-col gap-2">
        <span className="text-[15px] font-semibold text-foreground">{p.name}</span>
        {/* THE MODEL'S OWN WORDS ABOUT THE GROUP, so `subject` and not `prose`
            (PROSE_POLICY marks `pass_e_persona` 'digits', enforced at write). */}
        {p.oneLiner ? <p data-copy="subject" data-slot="pass_e_persona" className="m-0 text-[15px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">{p.oneLiner}</p> : null}
        {mix ? <span data-copy="figure" className="font-mono text-[12px] text-muted-foreground">{mix}</span> : null}
      </div>
      {/* Stacked (under xl) the bar keeps the preview's column width rather
          than running the tile's. */}
      <div className="flex h-6 max-w-[320px] items-center gap-4 xl:max-w-none">
        <span aria-hidden className="relative block h-1.5 flex-1">
          <span className="absolute inset-y-0 left-0 rounded-[2px] bg-foreground" style={{ width: `${(p.videos / max) * 100}%` }} />
        </span>
        <span className="w-12 flex-none text-right font-mono text-[15px] font-semibold tabular-nums text-foreground"><span data-copy="figure">{fmtInt(p.videos)}</span></span>
      </div>
      <div className="min-w-0">
        {/* The preview's quote face with no rule beside it, as the theme
            pane's voices draw it (`ground="inner"`). */}
        {p.quote ? <BlockQuote mode={mode} quote={p.quote} cite={p.quoteCite ?? undefined} ground="inner" /> : null}
      </div>
    </div>
  )
}

export const voiceCast: Block<VoiceSurfaceData> = {
  key: 'voice.cast',
  title: 'Who is talking',
  question: 'Who are the people behind these comments?',

  render(data, mode = 'app') {
    const c = data.cast
    const empty = voiceCast.emptyState(data)
    if (empty) {
      return (
        <BlockFrame title={voiceCast.title} mode={mode} roomy>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }
    const personas = byVideos(c)
    const max = Math.max(1, ...personas.map((p) => p.videos))
    const head = castHead(c)
    if (mode === 'email') {
      return (
        <BlockFrame title={voiceCast.title} mode={mode}>
          {head ? <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>{head}</div> : null}
          {personas.map((p) => <PersonaRow key={p.key} p={p} max={max} mode={mode} />)}
        </BlockFrame>
      )
    }
    return (
      <BlockFrame title={voiceCast.title} mode={mode} roomy>
        <div role="table" id="cast" className="flex min-w-0 flex-col">
          <div role="row" className="grid grid-cols-1 gap-x-12 border-b border-border pb-2.5 xl:grid-cols-[minmax(0,1fr)_216px_336px]">
            <span role="columnheader" className="flex flex-col text-[13px] font-medium leading-[1.35] text-muted-foreground">
              Group
              {head ? <span className="font-mono text-[12px] font-normal">{head}</span> : null}
            </span>
            <span role="columnheader" className="hidden self-end text-right text-[13px] font-medium text-muted-foreground xl:block">Videos</span>
            <span role="columnheader" className="hidden self-end text-[13px] font-medium text-muted-foreground xl:block">In their words</span>
          </div>
          {personas.map((p) => <PersonaRow key={p.key} p={p} max={max} mode={mode} />)}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    // The largest group only, as a COUNT: the groups overlap and are dated by
    // an update, so the cast is a description, not a measurement ladder.
    const lead = byVideos(data.cast)[0]
    if (lead) out.cast_lead_videos = { value: lead.videos, unit: 'videos', label: `videos the group "${lead.name}" was read on` }
    return out
  },

  quotes(data): QuoteRef[] {
    return data.cast.personas.map((p) => p.quote?.ref).filter((r): r is string => Boolean(r))
  },

  emptyState(data) {
    return data.cast.empty
  },
}
