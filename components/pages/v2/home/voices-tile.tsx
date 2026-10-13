import Link from 'next/link'
import { BrandChip } from '@/components/colour-roles'
import { NAV_ICON } from '@/components/nav-icons'
import { TickBar } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import type { TileRead } from '@/lib/pages/v2/home'
import type { TopVoices } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { MID, MONO_MUTED, TILE, TILE_FAILED, TileHead, TileLine, TT } from './parts'

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

/** Voices' own words for a month with no group read. */
export const VOICES_NONE = 'No group of people commenting has been read yet.'

export function VoicesTileView({ read }: { read: TileRead<TopVoices | null> }) {
  const top = read.state === 'ok' ? read.top : null
  const lead = top?.group ?? null
  const n = top?.videos ?? null
  const bars = (top?.groups ?? []).filter((g) => g.videos > 0).slice(0, VOICES_GROUP_BARS)
  const named = top?.named ?? []
  return (
    <article aria-labelledby="home-voices" data-tile="voices" className={cn(TILE, 'col-span-12 min-[1180px]:col-span-4')}>
      <TileHead icon={NAV_ICON.voices} name="Voices" id="home-voices" href={lead?.href ?? top?.href ?? '/dashboard/voices'} />
      {read.state === 'failed' ? <TileLine>{TILE_FAILED}</TileLine> : !top || !lead ? <TileLine>{VOICES_NONE}</TileLine> : (
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
          {named.length > 0 ? (
            <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-track pt-2.5 text-[13.5px] max-sm:hidden">
              <span className="text-muted-foreground">Named most</span>
              <span className="flex flex-wrap items-center gap-1.5">
                {named.map((b) => (
                  <Link key={b.label} href={b.href} scroll={false} className="no-underline" aria-label={`${b.label}: named in ${fmtInt(b.k)} of ${fmtInt(b.n)} videos`}>
                    <BrandChip who={b.you ? 'you' : 'rival'}>{b.label} <span data-copy="figure" className="font-mono font-normal">{fmtInt(b.k)}</span></BrandChip>
                  </Link>
                ))}
              </span>
            </div>
          ) : null}
        </>
      )}
    </article>
  )
}
