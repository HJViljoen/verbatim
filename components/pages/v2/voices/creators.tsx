import Link from 'next/link'
import { SquarePlay } from 'lucide-react'
import { BrandChip } from '@/components/colour-roles'
import type { CSSProperties } from 'react'
import { CARD, CardHead } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import type { VoicesCreatorRow, VoicesCreators } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { EmptyLine, Fig, Followers, OLINK, RowChevron } from './parts'

// THE CREATORS (board E3-Voices, "Creators who drive the talk"; since 17 Oct
// G3-Voices: each row opens the creator's own page, ending in the chevron): the accounts
// behind most of the market's videos this month, at the floor of three. A
// creator's followers are as of the month's videos and never Reddit's (there
// the field holds a subreddit's subscribers); the line names the conversation
// the creator made most of, and the chip the brand named in most of its
// videos. Reddit is not listed (the lead's ruling, 13 Oct): there a post's
// account is its subreddit, a community and not a creator, and communities
// show in each group's platforms; one line under the list says so. The
// board's "a clinic" has no source (no account is classified) and
// is not drawn.

function CreatorRow({ row }: { row: VoicesCreatorRow }) {
  return (
    <div
      data-creator={row.key}
      className="grid grid-cols-[36px_minmax(0,1fr)_auto_16px] items-center gap-3 border-t border-track py-3 first:border-t-0"
    >
      <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-track text-[12px] font-semibold text-secondary-foreground">{row.initials}</span>
      <div className="min-w-0">
        <Link
          href={row.href}
          className="block truncate text-[14.5px] font-semibold text-foreground no-underline hover:underline hover:underline-offset-[3px]"
        >
          {row.account}
        </Link>
        <div className="mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">
          {row.platformLabel}
          {row.followers != null ? <> · <Followers n={row.followers} word={row.followerWord} /></> : null}
          {row.top ? (
            <> · made <Fig>{fmtInt(row.top.k)}</Fig> of the <Fig>{fmtInt(row.top.ofTheme)}</Fig> videos in <span data-copy="subject" data-slot="pass_b_theme">{row.top.label}</span></>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 text-right">
        <span className="whitespace-nowrap"><Fig className="text-[15px] text-foreground">{fmtInt(row.videos)}</Fig> <span className="text-[12.5px] text-muted-foreground">{row.videos === 1 ? 'video' : 'videos'}</span></span>
        {row.brand ? <BrandChip who={row.brand.you ? 'you' : 'rival'} className="text-[12px]">{row.brand.label} <Fig>{fmtInt(row.brand.k)}</Fig></BrandChip> : null}
      </div>
      <RowChevron href={row.href} />
    </div>
  )
}

/** "Creators who drive the talk" (the board's right card of the pair). */
export function CreatorsCard({ creators, monthWords, style }: { creators: VoicesCreators; monthWords: string; style?: CSSProperties }) {
  return (
    <article id="creators" aria-labelledby="voices-creators" style={style} className={cn(CARD, 'scroll-mt-6')}>
      <CardHead icon={SquarePlay} id="voices-creators" title="Creators who drive the talk" sub={`Accounts with the most of your market’s videos, ${monthWords}`} />
      {creators.empty ? <EmptyLine>{creators.empty}</EmptyLine> : (
        <>
          <div role="list">
            {creators.rows.map((r) => <div key={r.key} role="listitem"><CreatorRow row={r} /></div>)}
          </div>
          {creators.communitiesLeftOut ? (
            <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">Reddit is left out: there a post’s account is the community it was posted in, not who made it.</p>
          ) : null}
          {creators.more > 0 || creators.expanded ? (
            <Link href={creators.toggleHref} scroll={false} className={OLINK}>
              {creators.expanded
                ? 'Show the first five →'
                : <>All <Fig>{fmtInt(creators.atFloor)}</Fig> accounts with <Fig>{fmtInt(creators.floor)}</Fig> or more videos →</>}
            </Link>
          ) : null}
        </>
      )}
    </article>
  )
}
