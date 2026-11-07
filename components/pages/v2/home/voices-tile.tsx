import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandChip } from '@/components/colour-roles'
import { toMax } from '@/components/v2'
import { ROW } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import { tileHref } from '@/lib/pages/home'
import type { TileRead } from '@/lib/pages/v2/home'
import type { TopVoices } from '@/lib/pages/v2/voices'
import { voicesGroupHref } from '@/lib/pages/v2/voices-address'
import { inlineMonth } from '@/lib/reading/month-label'
import { cn } from '@/lib/utils'
import { Bar, BAR_ROW, CSUB, TILE, TILE_FAILED, TileHead, TileLine, TT } from './parts'

// THE DASHBOARD'S VOICES TILE, drawn to the audit design's board
// (Dashboard.dc.html, "Voices in October", 7 Nov), from `topVoices`: the
// group of people commenting on the most videos this month as the heading,
// every group's videos as a bar of its own against the largest (decision 5),
// each opening the group's page, and the two brands named most unprompted,
// each opening its page.
//
// DECISION 2: no share and no change of the mix; a video can hold more than
// one group, so the groups are counts of the month's videos, one bar each,
// never stacked. The month's base is the figures row's where the tile reads
// the same month; where it reads another (the last full month, decision 3)
// the note says the base itself.

/** Groups the tile draws bars for (the lead and three more). */
export const VOICES_GROUP_BARS = 4

/** Where no group prints and Voices has no words of its own for why. */
export const VOICES_NONE = 'No group of people commenting has been read yet.'
/** Where the brands' reads failed: the row says so instead of vanishing. */
export const VOICES_BRANDS_FAILED = 'could not be read just now'
/** The brands row's words where it has no count to print (parity pass,
 *  13 Oct): the row keeps its place, its brands' names where the page tracks
 *  them, and says why once. */
export const VOICES_BRANDS_NOT_COUNTED = 'not counted yet'
/** The row's name where its names are the tracked brands, not counted. */
export const VOICES_TRACKED = 'Tracked'
export const VOICES_BRANDS_NOT_READ = 'not read for this workspace yet'
export const voicesNoneNamed = (monthWords: string): string => `none named unprompted in ${monthWords}`

/** The heading's words (small call 8: the model's name as it is written,
 *  never made plural). */
export const VOICES_LEAD = 'In the most videos'
/** The note under the bars (the board's). */
export const VOICES_NOTE = 'A video can hold more than one group.'
/** The brands row's name where it names brands (the board's). */
export const VOICES_NAMED = 'Brand named most'

/** "Össur (41), Ottobock (37)": each brand's name opening its page, its
 *  count beside it; or the names alone where nothing is counted. */
function BrandList({ brands }: { brands: readonly { label: string; you: boolean; href: string; k?: number; n?: number }[] }) {
  return (
    <>
      {brands.map((b, i) => (
        <span key={b.label}>
          {i > 0 ? ', ' : null}
          <Link href={b.href} className={ROW} aria-label={b.k != null && b.n != null ? `${b.label}: named in ${fmtInt(b.k)} of ${fmtInt(b.n)} videos` : `${b.label}: ${VOICES_BRANDS_NOT_COUNTED}`}>
            <BrandChip who={b.you ? 'you' : 'rival'} plain>{b.label}</BrandChip>
          </Link>
          {b.k != null ? <>{' ('}<span data-copy="figure">{fmtInt(b.k)}</span>)</> : null}
        </span>
      ))}
    </>
  )
}

/** The board's "Brand named most" row, in every state: the two brands named
 *  most with their counts, or the tracked brands with "not counted yet", or
 *  why there is nothing to name. */
function NamedMost({ top }: { top: TopVoices }) {
  const named = top.named
  const tracked = top.tracked ?? []
  const quiet = (words: string) => <span className="font-normal text-secondary-foreground">{words}</span>
  let body: ReactNode
  if (top.brandsState === 'unread') body = quiet(VOICES_BRANDS_FAILED)
  else if (named.length > 0) body = <BrandList brands={named} />
  // The names stay, with no count; "not counted yet" is said once, under the
  // row's name.
  else if (top.brandsState === 'not_counted' && tracked.length > 0) body = <BrandList brands={tracked} />
  else if (top.brandsState === 'not_counted') body = quiet(VOICES_BRANDS_NOT_COUNTED)
  else if (top.brandsState === 'not_read') body = quiet(VOICES_BRANDS_NOT_READ)
  else body = quiet(voicesNoneNamed(top.monthWords))
  const header = top.brandsState === 'not_counted' && named.length === 0 && tracked.length > 0
  return (
    <div data-named={top.brandsState} className="mt-auto flex items-start justify-between gap-x-4 border-t border-track pt-3 text-[14px] leading-[1.45]">
      {/* Names with nothing counted are no ranking: the row is the brands
          tracked, "not counted yet", never "Brand named most". */}
      <span className="flex shrink-0 flex-col text-muted-foreground">
        {header ? VOICES_TRACKED : VOICES_NAMED}
        {header ? <span className="text-[13px] leading-[1.3]">{VOICES_BRANDS_NOT_COUNTED}</span> : null}
      </span>
      <span className="min-w-0 text-right font-semibold">{body}</span>
    </div>
  )
}

export function VoicesTileView({ read }: { read: TileRead<TopVoices | null> }) {
  const top = read.state === 'ok' ? read.top : null
  const lead = top?.group ?? null
  const n = top?.videos ?? null
  const bars = (top?.groups ?? []).filter((g) => g.videos > 0).slice(0, VOICES_GROUP_BARS)
  const bar = toMax(bars.map((g) => g.videos))
  // Decision 3: the month the tile reads, in its label, in the one helper's
  // words where it is not the current month ("Voices in September, the last
  // full month"). A failed read names no month.
  const month = top && top.groupsState !== 'unread' ? inlineMonth(top.monthWords, top.monthLabel) : null
  return (
    <article aria-labelledby="home-voices" data-tile="voices" className={cn(TILE, 'min-[1180px]:col-span-1')}>
      <TileHead label={month ? `Voices in ${month}` : 'Voices'} id="home-voices" open={{ href: tileHref('voices'), words: 'Open Voices' }} />
      {/* A failed read of the groups is a failure, never "nothing yet"; a
          workspace whose groups are not switched on, or too thin to describe,
          gets Voices' own words for it, and its brands row stays. */}
      {read.state === 'failed' || top?.groupsState === 'unread' ? <TileLine>{TILE_FAILED}</TileLine>
        : !top ? <TileLine>{VOICES_NONE}</TileLine> : (
        <>
          {lead ? (
            <>
              <h2 className={TT}>{VOICES_LEAD}: <span data-copy="subject" data-slot="pass_e_persona">{lead.name}</span></h2>
              {/* Every group's videos this month, one bar each (they overlap),
                  each against the largest (decision 5). */}
              {bars.length > 0 ? (
                <div role="list" aria-label={`The groups commenting in ${top.monthWords}`} className="flex flex-col gap-2.5 text-[14.5px] leading-[1.35]">
                  {bars.map((g) => (
                    <div key={g.key} role="listitem" className={BAR_ROW}>
                      <Link href={voicesGroupHref(g.key)} className={cn(ROW, 'min-w-0', g.key === lead.key ? null : 'font-normal')}>
                        <span data-copy="subject" data-slot="pass_e_persona">{g.name}</span>
                      </Link>
                      <Bar pct={bar(g.videos)} />
                      <span data-copy="figure" className={cn('text-right tabular-nums', g.key === lead.key ? 'font-semibold' : null)}>{fmtInt(g.videos)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <p data-voices-note="" className={CSUB}>
                {/* The base is the figures row's for the week's month; a tile
                    on another month says its own (decision 2). */}
                {top.monthLabel && n
                  ? <>Videos per group, of <span data-copy="figure">{fmtInt(n)}</span> in {top.monthWords}. </>
                  : 'Videos per group. '}
                {VOICES_NOTE}
              </p>
            </>
          ) : <TileLine>{top.groupsEmpty ?? VOICES_NONE}</TileLine>}
          <NamedMost top={top} />
        </>
      )}
    </article>
  )
}
