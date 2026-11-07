import { PageFrame } from '@/components/shell/page-grid'
import { LevelBar } from '@/components/shell/level-bar'
import { voicesBrandHref, voicesCreatorHref, voicesGroupHref } from '@/lib/pages/v2/voices-address'
import { VOICES_ONE_MONTH_SHORT, type BrandPage, type CreatorPage, type GroupPage, type LevelMissing, type LevelParams } from '@/lib/pages/v2/voices-levels'
import { BrandPageBody, brandStats, brandSub } from './brand-page'
import { CreatorPageBody, creatorStats } from './creator-page'
import { GroupPageBody, groupStats } from './group-page'
import { LevelMonthSwitch, VoicesLevelMissing } from './levels'

// VOICES' LEVEL PAGES (depth as pages, 17 Oct; the G3 boards; since the
// audit design, 7 Nov, drawn to Voices-Group, -Brand and -Creator.dc.html): a
// group, a brand and a creator, each its own address under Voices
// (lib/pages/v2/voices-address.ts). Voices stays the sidebar's active surface
// on every one (`surfaceForPath`: the longest match). Each opens with
// Market's path and the audit design's title block (`LevelBar` with `sub` and
// `stats`): the crumb row, "Voices / {name} ⌃⌄" with the switcher of its
// siblings, the 28px title, the level said under it ("A group in your
// market"), the month switch as Voices honours it with its line, and the
// figures row; no tile and no label over the title. On a phone the row
// becomes "‹ Voices".

const keep = (p: LevelParams) => (p.month ? { month: p.month } : {})

/** A group's page (`/dashboard/voices/groups/[key]`). */
export function VoicesGroupPage({ data, params = {}, switcherOpen = false }: { data: GroupPage | LevelMissing; params?: LevelParams; switcherOpen?: boolean }) {
  if (data.kind === 'missing') return <VoicesLevelMissing line={data.line} />
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={data.crumbs}
        level="group"
        sub="A group in your market"
        stats={groupStats(data)}
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
        sub={brandSub(data)}
        stats={brandStats(data)}
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
        sub={`A creator on ${data.platformLabel}`}
        stats={creatorStats(data)}
        controls={<LevelMonthSwitch month={data.month} href={voicesCreatorHref(data.platform, data.account, keep(params))} reason={VOICES_ONE_MONTH_SHORT} />}
        open={switcherOpen ? 'current' : undefined}
      />
      <CreatorPageBody page={data} />
    </PageFrame>
  )
}
