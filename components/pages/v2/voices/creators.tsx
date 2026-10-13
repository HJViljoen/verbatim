import Link from 'next/link'
import { SquarePlay } from 'lucide-react'
import { BrandChip } from '@/components/colour-roles'
import type { CSSProperties } from 'react'
import { CARD, CardHead, InPlacePanel, PanelSection, PanelTitle, StatCell, StatRow, type PerBreakpoint } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { PANEL_ID, type CreatorPanel, type VoicesCreatorRow, type VoicesCreators } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { AskButton, EmptyLine, Fig, Followers, LevelText, OLINK, PanelTag } from './parts'

// THE CREATORS (board E3-Voices, "Creators who drive the talk"): the accounts
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
      aria-current={row.selected ? 'true' : undefined}
      className={cn('grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-t border-track py-3 first:border-t-0', row.selected ? '-mx-3 rounded-[10px] bg-accent/45 px-3' : null)}
    >
      <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-track text-[12px] font-semibold text-secondary-foreground">{row.initials}</span>
      <div className="min-w-0">
        <Link
          href={row.href}
          scroll={false}
          aria-expanded={row.selected}
          aria-controls={row.selected ? PANEL_ID.creator : undefined}
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
    </div>
  )
}

/** "Creators who drive the talk" (the board's right card of the pair). */
export function CreatorsCard({ creators, monthWords, style }: { creators: VoicesCreators; monthWords: string; style?: CSSProperties }) {
  return (
    <article aria-labelledby="voices-creators" style={style} className={CARD}>
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

/** The creator's panel (not drawn on the board; laid out as its panels are). */
export function CreatorPanelView({ panel, monthWords, notchAt }: { panel: CreatorPanel; monthWords: string; notchAt?: number | PerBreakpoint }) {
  const top = panel.conversations[0]
  const brand = panel.brands[0]
  return (
    <InPlacePanel
      id={PANEL_ID.creator}
      notchAt={notchAt ?? panel.notchAt}
      openKey={panel.key}
      closeHref={panel.closeHref}
      labelledBy="creator-title"
      closeLabel="Close this creator"
      head={
        <>
          <div className="flex flex-wrap items-center gap-2"><PanelTag>Creator</PanelTag></div>
          <PanelTitle id="creator-title">{panel.account}</PanelTitle>
          <p className="m-0 mt-1 text-[14px] leading-[1.4] text-muted-foreground">
            {panel.platformLabel}
            {panel.followers != null ? <> · <Followers n={panel.followers} word={panel.followerWord} /> as of their videos in {monthWords}</> : null}
          </p>
        </>
      }
    >
      <StatRow>
        {panel.n ? <StatCell value={panel.videos} of={panel.n} label={`market videos in ${monthWords}`} /> : <StatCell value={panel.videos} label={`videos in ${monthWords}`} />}
        {top ? <StatCell value={top.k} of={panel.videos} label={<>are in <span data-copy="subject" data-slot="pass_b_theme">{top.label}</span></>} /> : null}
        {brand ? <StatCell value={brand.k} of={panel.videos} label={<>name {brand.label}</>} /> : null}
      </StatRow>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {panel.conversations.length > 0 ? (
          <PanelSection label={<>The conversations their videos are in · of their <Fig>{fmtInt(panel.videos)}</Fig></>}>
            <div className="flex flex-col gap-0.5">
              {panel.conversations.map((c) => (
                <Link key={c.registryId} href={c.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-foreground no-underline hover:bg-inner">
                  <span className="min-w-0"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></span>
                  <span className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-secondary-foreground">
                    <LevelText k={c.k} n={panel.videos} /> <span className="text-muted-foreground">· <Fig>{fmtInt(c.ofTheme)}</Fig> in the conversation</span>
                  </span>
                </Link>
              ))}
            </div>
            <span className="text-[12px] text-muted-foreground">Each opens in Market</span>
          </PanelSection>
        ) : null}
        {panel.brands.length > 0 ? (
          <PanelSection label="Brands named in their videos">
            <div className="flex flex-wrap gap-2">
              {panel.brands.map((b) => (
                <BrandChip key={b.label} who={b.you ? 'you' : 'rival'} className="px-2 py-1 text-[12.5px]">{b.label} <Fig>{fmtInt(b.k)}</Fig></BrandChip>
              ))}
            </div>
          </PanelSection>
        ) : null}
      </div>

      <AskButton href={panel.askHref}>Ask the Agent about this creator</AskButton>
    </InPlacePanel>
  )
}
