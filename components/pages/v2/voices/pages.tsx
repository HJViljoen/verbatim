import type { ReactNode } from 'react'
import { PageFrame } from '@/components/shell/page-grid'
import { LevelBar } from '@/components/shell/level-bar'
import { fmtCompact, fmtInt } from '@/lib/format'
import { voicesBrandHref, voicesCreatorHref, voicesGroupHref } from '@/lib/pages/v2/voices-address'
import { levelBarMonth, VOICES_ONE_MONTH_SHORT, type BrandPage, type CreatorPage, type GroupPage, type LevelMissing, type LevelParams } from '@/lib/pages/v2/voices-levels'
import { BrandPageBody } from './brand-page'
import { CreatorPageBody } from './creator-page'
import { describedAt, GroupPageBody } from './group-page'
import { LevelMonthSwitch, VoicesLevelMissing, VoicesLevelTile } from './levels'

// VOICES' LEVEL PAGES (depth as pages, 17 Oct; the G3 boards): a group, a
// brand and a creator, each its own address under Voices
// (lib/pages/v2/voices-address.ts). Voices stays the sidebar's active surface
// on every one (`surfaceForPath`: the longest match). Each opens with
// Market's path and title block (`LevelBar`, F3-Market-Nav): the slim crumb
// row, "Voices / {name} ⌃⌄" with the switcher of its siblings, then the level's
// tile, its label, the 28px title, the mono meta line and the month switch as
// Voices honours it. On a phone the row becomes "‹ Voices".

const lv = (k: number, n: number) => <span data-copy="level">{fmtInt(k)} of {fmtInt(n)}</span>

/** A group's meta line: the month, its videos of the market's, when the
 *  groups were described. */
export function groupMeta(page: GroupPage): ReactNode[][] {
  const described = describedAt(page.profileDate)
  return [
    [levelBarMonth(page.month)],
    page.month.n != null ? [<>{lv(page.videos, page.month.n)} videos</>] : [],
    described ? [described] : [],
  ]
}

/** A brand's meta line: the month, named without being asked, named at all. */
export function brandMeta(page: BrandPage): ReactNode[][] {
  return [
    [levelBarMonth(page.month)],
    page.state === 'counted' && page.named ? [<>named without being asked in {lv(page.named.k, page.named.n)} videos</>] : [],
    page.state === 'counted' && page.any ? [<>named at all in {lv(page.any.k, page.month.n ?? page.any.n)}</>] : [],
  ]
}

/** A creator's meta line: the month, their videos of the market's, their
 *  following as of the month's videos (never Reddit's). */
export function creatorMeta(page: CreatorPage): ReactNode[][] {
  return [
    [levelBarMonth(page.month)],
    page.month.n != null ? [<>{lv(page.videos, page.month.n)} videos</>] : [],
    page.followers != null ? [<><span data-copy="figure">{fmtCompact(page.followers)}</span> {page.followerWord}</>] : [],
  ]
}

const keep = (p: LevelParams) => (p.month ? { month: p.month } : {})

/** A group's page (`/dashboard/voices/groups/[key]`). */
export function VoicesGroupPage({ data, params = {}, switcherOpen = false }: { data: GroupPage | LevelMissing; params?: LevelParams; switcherOpen?: boolean }) {
  if (data.kind === 'missing') return <VoicesLevelMissing line={data.line} />
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={data.crumbs}
        level="group"
        tile={<VoicesLevelTile level="group" />}
        label="Group"
        meta={groupMeta(data)}
        controls={<LevelMonthSwitch month={data.month} href={voicesGroupHref(data.key, keep(params))} />}
        open={switcherOpen ? 'current' : undefined}
      />
      <GroupPageBody page={data} />
    </PageFrame>
  )
}

/** A brand's page (`/dashboard/voices/brands/[key]`). */
export function VoicesBrandPage({ data, params = {}, switcherOpen = false }: { data: BrandPage | LevelMissing; params?: LevelParams; switcherOpen?: boolean }) {
  if (data.kind === 'missing') return <VoicesLevelMissing line={data.line} />
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={data.crumbs}
        level="brand"
        tile={<VoicesLevelTile level="brand" you={data.you} />}
        label={data.you ? 'Your brand' : data.watched ? 'Brand you watch' : 'Rival brand'}
        meta={brandMeta(data)}
        controls={<LevelMonthSwitch month={data.month} href={voicesBrandHref(data.brandKey, keep(params))} reason={VOICES_ONE_MONTH_SHORT} />}
        open={switcherOpen ? 'current' : undefined}
      />
      <BrandPageBody page={data} />
    </PageFrame>
  )
}

/** A creator's page (`/dashboard/voices/creators/[platform]/[account]`). */
export function VoicesCreatorPage({ data, params = {}, switcherOpen = false }: { data: CreatorPage | LevelMissing; params?: LevelParams; switcherOpen?: boolean }) {
  if (data.kind === 'missing') return <VoicesLevelMissing line={data.line} />
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={data.crumbs}
        level="creator"
        tile={<VoicesLevelTile level="creator" />}
        label={`Creator on ${data.platformLabel}`}
        meta={creatorMeta(data)}
        controls={<LevelMonthSwitch month={data.month} href={voicesCreatorHref(data.platform, data.account, keep(params))} reason={VOICES_ONE_MONTH_SHORT} />}
        open={switcherOpen ? 'current' : undefined}
      />
      <CreatorPageBody page={data} />
    </PageFrame>
  )
}
