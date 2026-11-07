import Link from 'next/link'
import { BrandChip } from '@/components/colour-roles'
import type { CSSProperties } from 'react'
import { CARD, EmptyBox, SectionHead } from '@/components/v2'
import { GO, ROW, TBL, TD, TD_NUM, TH } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import type { VoicesCreatorRow, VoicesCreators } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { Fig, Followers } from './parts'

// THE CREATORS (the audit design, 7 Nov: Voices.dc.html's "Creators who
// drive the talk"; since 17 Oct each row opens the creator's own page): the
// accounts behind most of the market's videos this month, at the floor of
// three, as a table. A creator's followers are as of the month's videos and
// never Reddit's (there the field holds a subreddit's subscribers); "Most
// made in" names the conversation the creator made most of, and "Brand named
// most" the brand named in most of its videos, a column only where some row
// has one (small call 10: the board, drawn on a month with none, has no such
// column). Reddit is not listed (the lead's ruling, 13 Oct): there a post's
// account is its subreddit, a community and not a creator, and communities
// show in each group's platforms; one line under the table says so.

function CreatorRow({ row, brands }: { row: VoicesCreatorRow; brands: boolean }) {
  return (
    <tr data-creator={row.key}>
      <td className={cn(TD, 'font-semibold')}><Link href={row.href} className={ROW}>{row.account}</Link></td>
      <td className={TD}>{row.platformLabel}</td>
      <td className={cn(TD, 'whitespace-nowrap text-secondary-foreground')}><Followers n={row.followers} word={row.followerWord} /></td>
      <td className={TD}>
        {row.top ? (
          <>
            <span data-copy="subject" data-slot="pass_b_theme">{row.top.label}</span>{' '}
            <span className="whitespace-nowrap text-muted-foreground">(made <Fig>{fmtInt(row.top.k)}</Fig> of <Fig>{fmtInt(row.top.ofTheme)}</Fig>)</span>
          </>
        ) : null}
      </td>
      {brands ? (
        <td className={cn(TD, 'whitespace-nowrap')}>
          {row.brand ? <><BrandChip who={row.brand.you ? 'you' : 'rival'} plain>{row.brand.label}</BrandChip> (<Fig>{fmtInt(row.brand.k)}</Fig>)</> : <span className="text-muted-foreground">None</span>}
        </td>
      ) : null}
      <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 font-semibold')}><Fig>{fmtInt(row.videos)}</Fig></td>
    </tr>
  )
}

/** "Creators who drive the talk": the section head outside, then the table
 *  in its tile. `id="creators"`: a creator's page links
 *  `?creators=all#creators`. */
export function CreatorsCard({ creators, monthWords, style }: { creators: VoicesCreators; monthWords: string; style?: CSSProperties }) {
  const brands = creators.rows.some((r) => r.brand)
  return (
    <>
      <SectionHead id="voices-creators" title="Creators who drive the talk" note={`Accounts with the most of your market’s videos, ${monthWords}`} />
      <section id="creators" aria-labelledby="voices-creators" style={style} className={cn(CARD, 'scroll-mt-[76px]')}>
        {creators.empty ? <EmptyBox>{creators.empty}</EmptyBox> : (
          <>
            {/* On a phone the table scrolls inside its card, as the board's
                own phone rule does. */}
            <div className="-mx-1 overflow-x-auto px-1">
              <table className={cn(TBL, 'min-w-[600px]')}>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Creator</th>
                    <th scope="col" className={TH}>Platform</th>
                    <th scope="col" className={TH}>Audience</th>
                    <th scope="col" className={TH}>Most made in</th>
                    {brands ? <th scope="col" className={TH}>Brand named most</th> : null}
                    <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Videos</th>
                  </tr>
                </thead>
                <tbody>
                  {creators.rows.map((r) => <CreatorRow key={r.key} row={r} brands={brands} />)}
                </tbody>
              </table>
            </div>
            {creators.communitiesLeftOut ? (
              <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">Reddit is left out: there a post’s account is the community it was posted in, not who made it.</p>
            ) : null}
            {creators.more > 0 || creators.expanded ? (
              <Link href={creators.toggleHref} scroll={false} className={cn(GO, 'self-start')}>
                {creators.expanded
                  ? 'Show the first five'
                  : <>All <Fig>{fmtInt(creators.atFloor)}</Fig> accounts with <Fig>{fmtInt(creators.floor)}</Fig> or more videos</>}
              </Link>
            ) : null}
          </>
        )}
      </section>
    </>
  )
}
