import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandChip } from '@/components/colour-roles'
import { NAV_ICON } from '@/components/nav-icons'
import { TickBar } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { tileHref } from '@/lib/pages/home'
import type { TileRead } from '@/lib/pages/v2/home'
import type { TopVoices } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { MID, MONO_MUTED, TILE, TILE_FAILED, TileHead, TileLine, TileMonth, TT } from './parts'

// THE DASHBOARD'S VOICES TILE (Design v2, T8; E1-Dashboard's second row),
// from `topVoices`: the group of people commenting on the most videos this
// month, which opens its panel on Voices (`?group=`); every group's videos as
// separate bars; and the two brands named most, each opening its panel
// (`?brand=`).
//
// DECISION 2: no share and no change of the mix. The board's "Caregivers are
// a bigger part of the talk", "9% → 14%" and its stacked share bar go: a
// video can hold more than one group, so the groups are counts of the
// month's videos, one bar each, never stacked. The board's line under the bar
// is a claim and a model's sentence, and level 1 prints neither.

/** Groups the tile draws bars for (the lead and three more). */
export const VOICES_GROUP_BARS = 4

/** Where no group prints and Voices has no words of its own for why. */
export const VOICES_NONE = 'No group of people commenting has been read yet.'
/** Where the brands' reads failed: the row says so instead of vanishing. */
export const VOICES_BRANDS_FAILED = 'could not be read just now'
/** The "Named most" row's words where it has no count to print (parity pass,
 *  13 Oct): the row keeps its place, its brands' chips where the page tracks
 *  them, and says why once. */
export const VOICES_BRANDS_NOT_COUNTED = 'not counted yet'
/** The row's name where its chips are the tracked brands, not counted. */
export const VOICES_TRACKED = 'Tracked'
export const VOICES_BRANDS_NOT_READ = 'not read for this workspace yet'
export const voicesNoneNamed = (monthWords: string): string => `none named unprompted in ${monthWords}`

/** The board's "Named most" row, in every state: the two brands named most
 *  with their counts, or the tracked brands' chips with "not counted yet", or
 *  why there is nothing to name. */
function NamedMost({ top }: { top: TopVoices }) {
  const named = top.named
  const tracked = top.tracked ?? []
  const quiet = (words: string) => <span className="text-[12.5px] text-muted-foreground">{words}</span>
  let body: ReactNode
  if (top.brandsState === 'unread') body = quiet(VOICES_BRANDS_FAILED)
  else if (named.length > 0) {
    body = named.map((b) => (
      <Link key={b.label} href={b.href} className="no-underline" aria-label={`${b.label}: named in ${fmtInt(b.k)} of ${fmtInt(b.n)} videos`}>
        <BrandChip who={b.you ? 'you' : 'rival'}>{b.label} <span data-copy="figure" className="font-mono font-normal">{fmtInt(b.k)}</span></BrandChip>
      </Link>
    ))
  } else if (top.brandsState === 'not_counted' && tracked.length > 0) {
    // The chips stay, with no count; "not counted yet" is said once, under
    // the row's name.
    body = tracked.map((b) => (
      <Link key={b.label} href={b.href} className="no-underline" aria-label={`${b.label}: not counted yet`}>
        <BrandChip who={b.you ? 'you' : 'rival'}>{b.label}</BrandChip>
      </Link>
    ))
  } else if (top.brandsState === 'not_counted') body = quiet(VOICES_BRANDS_NOT_COUNTED)
  else if (top.brandsState === 'not_read') body = quiet(VOICES_BRANDS_NOT_READ)
  else body = quiet(voicesNoneNamed(top.monthWords))
  const header = top.brandsState === 'not_counted' && named.length === 0 && tracked.length > 0
  return (
    <div data-named={top.brandsState} className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-t border-track pt-2.5 text-[13.5px] max-sm:hidden">
      {/* Chips with nothing counted are no ranking: the row is the brands
          tracked, "not counted yet", never "Named most". */}
      <span className="flex flex-col whitespace-nowrap text-muted-foreground">
        {header ? VOICES_TRACKED : 'Named most'}
        {header ? <span className="text-[12px] leading-[1.3]">{VOICES_BRANDS_NOT_COUNTED}</span> : null}
      </span>
      <span className="flex flex-wrap items-center justify-end gap-1.5 text-right">{body}</span>
    </div>
  )
}

export function VoicesTileView({ read }: { read: TileRead<TopVoices | null> }) {
  const top = read.state === 'ok' ? read.top : null
  const lead = top?.group ?? null
  const n = top?.videos ?? null
  const bars = (top?.groups ?? []).filter((g) => g.videos > 0).slice(0, VOICES_GROUP_BARS)
  return (
    <article aria-labelledby="home-voices" data-tile="voices" className={cn(TILE, 'col-span-12 min-[1180px]:col-span-4')}>
      <TileHead icon={NAV_ICON.voices} name="Voices" id="home-voices" href={lead?.href ?? top?.href ?? tileHref('voices')} />
      {/* A failed read of the groups is a failure, never "nothing yet"; a
          workspace whose groups are not switched on, or too thin to describe,
          gets Voices' own words for it, and its "Named most" row stays. */}
      {read.state === 'failed' || top?.groupsState === 'unread' ? <TileLine>{TILE_FAILED}</TileLine>
        : !top ? <TileLine>{VOICES_NONE}</TileLine> : (
        <>
          {/* Decision 3: September beside Market's October, labelled. */}
          <TileMonth words={top.monthWords} label={top.monthLabel} />
          {lead ? (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="m-0 text-[12px] leading-[1.3] font-semibold uppercase tracking-[0.06em] text-orange-text">In the most videos in {top.monthWords}</p>
                <h3 className={TT}><span data-copy="subject" data-slot="pass_e_persona">{lead.name}</span></h3>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2.5">
                <span data-copy="figure" className={MID}>{fmtInt(lead.videos)}</span>
                {n ? <span data-copy="level" className={MONO_MUTED}>of {fmtInt(n)} videos</span> : <span className={MONO_MUTED}>videos</span>}
              </div>
              {/* Every group's videos this month, one bar each (they overlap). */}
              {n && bars.length > 1 ? (
                <div role="list" aria-label={`The groups commenting in ${top.monthWords}`} className="flex flex-col gap-2 max-sm:hidden">
                  {bars.map((g) => (
                    <div key={g.key} role="listitem" className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px] leading-[1.3]">
                      <span className={cn('min-w-0', g.key === lead.key ? 'font-semibold text-foreground' : 'text-secondary-foreground')}>
                        <span data-copy="subject" data-slot="pass_e_persona">{g.name}</span>
                      </span>
                      <TickBar pct={(100 * g.videos) / n} size="sm" tone="market" label={`${g.name}: ${fmtInt(g.videos)} of ${fmtInt(n)} videos`} />
                      <span data-copy="figure" className="w-8 text-right font-mono tabular-nums text-muted-foreground">{fmtInt(g.videos)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : <TileLine>{top.groupsEmpty ?? VOICES_NONE}</TileLine>}
          <NamedMost top={top} />
        </>
      )}
    </article>
  )
}
