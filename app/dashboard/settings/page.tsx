import { SettingsFrame } from '@/components/settings-frame'
import { LastSaveStrip } from '@/components/settings/save-state-strip'
import { CommunitiesSection } from '@/components/settings/tracking/communities'
import { PlatformsSection } from '@/components/settings/tracking/platforms'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { shortDate } from '@/lib/format'
import { audienceLabel } from '@/lib/readiness/types'
import { communityRows, tableRows, unconfiguredShare } from '@/lib/settings/communities'
import { platformRows, platformShareBasis } from '@/lib/settings/connections'
import { deliveryRecord, updatesInMonth } from '@/lib/settings/delivery'
import { rivalRows } from '@/lib/settings/rivals-view'
import { saveState } from '@/lib/settings/save-state'
import { termDateShort } from '@/lib/settings/terms'
import { loadTrackingPage } from '@/lib/settings/tracking-load'
import { canSeeStudio } from '@/lib/studio-visibility'
import { createAdminClient } from '@/lib/supabase-admin'
import { TermPerformance } from './term-performance'
import { TrackingForm } from './tracking-form'
import type { SearchTermsConfig, TrackingConfig } from './config-shapes'

// Settings › Tracking (Phase 1 WP16, design ST2 and ST4; ported to the
// artboard in Block D wave 2) — everything about what we look at for this
// workspace, in one sub-page: the terms, what each one brought back, the
// communities, the rivals, the platforms and the cadence.
//
// CONNECTIONS AND INITIATIVES RETIRE INTO THIS PAGE. Connections was three
// rows: the sources we read (now the platforms block below), the rival accounts
// we read (now the rivals block, where the capture-versus-read census makes it
// mean something), and where reports go (now Settings › Reports and
// recipients). Initiatives is parked until Market's moves panel can do what it
// does, and is reached from there.
//
// THE ONE FIGURE HERE ON THE RUN CLOCK, LABELLED. A term's yield is a property
// of the GATHER — what that search brought back on the day it ran — and
// `keyword_performance.created_at` is the run's date. Every other month in this
// product is dated by the comment. The two cannot share an axis, and the panel
// says so rather than letting a reader assume they can.
//
// THIS FILE IS A LOADER AND A COMPOSITION AND NOTHING ELSE NOW. Every section
// is a component under components/settings/tracking/ with a static render test;
// what is left here is which reads happen and which props they become.

export default async function SettingsTrackingPage() {
  const session = await getSessionContext()
  const { supabase, clientId, role } = session
  // Whether this session is shown a door into the Studio (main, 2026-09-17,
  // lib/studio-visibility.ts). The cadence section's "who receives what" line
  // is one of those doors, so it asks here and the section takes the answer.
  const showStudio = canSeeStudio(session)
  const canEdit = canManageTenant(role)
  // The one read on this page that a tenant session may never make: the
  // community a verdict was about is `gate_verdicts.account_name`, which M8
  // withholds from `authenticated` for the same reason it withholds the
  // caption. Owners and admins get it through the service role, in this server
  // component; everyone else gets the table without the column and is told so.
  const inputs = await loadTrackingPage(supabase, clientId, canEdit ? createAdminClient() : null)

  const c = inputs.config as TrackingConfig | null
  const terms = inputs.config as SearchTermsConfig | null
  const platforms = (inputs.config?.platforms as string[] | null) ?? []
  const ownHandles = (inputs.config?.own_handles as Record<string, string> | null) ?? {}
  const names = ((inputs.config?.competitor_names as string[] | null) ?? []).filter(Boolean)
  const handles = (inputs.config?.competitor_handles as Record<string, Record<string, string>> | null) ?? {}
  const termCount = [
    (terms?.brand_keywords ?? []).length,
    (terms?.competitor_keywords ?? []).length,
    (terms?.industry_keywords ?? []).length,
  ].reduce((a, b) => a + b, 0)

  const dates = Object.fromEntries([...inputs.termDates].map(([term, date]) => [term, termDateShort(date)]))
  const communities = communityRows({ entries: inputs.entries, roi: inputs.roi, gate: inputs.communityKept ?? [] })
  const table = tableRows(communities)
  const unconfigured = unconfiguredShare(communities)
  const configured = communities.filter((r) => !r.unconfigured).length
  const rivals = rivalRows({ names, handles, identities: inputs.rivals, census: inputs.census, month: inputs.censusMonth })
  const delivery = deliveryRecord({ updates: inputs.updates, slotsRecorded: false })
  const strip = saveState({ lastChange: inputs.lastChange, affectsRecorded: inputs.affectsRecorded })
  const period = (c?.report_period ?? 'weekly') as string

  // D14: BOTH HALVES OF THE CONTEXT LINE ARE WHAT THEY ARE. The artboard reads
  // "tracking since 6 Apr"; the only date we hold is the first update on
  // record, which is evidence that we were already tracking by then and not the
  // day anybody asked us to. "Last saved" is a real `config_changes.changed_at`.
  // FOUR PARTS, AND THE PLAN IS NOT ONE OF THEM. The artboard's context line is
  // the workspace, the tracking date and the last save; the plan is billing's
  // fact, it is on its own sub-page, and a fifth part is what pushed this line
  // past the width it has.
  const context = [
    inputs.tenant,
    delivery.since ? `first update on record ${shortDate(`${delivery.since}T00:00:00.000Z`)}` : null,
    strip.lastSavedAt ? `last saved ${shortDate(strip.lastSavedAt)}` : null,
    !canEdit ? 'read-only' : null,
  ].filter(Boolean).join(' · ')

  return (
    <SettingsFrame
      active="tracking"
      title="Settings"
      context={context}
      contentTitle="Tracking"
      contentMeta={c ? [
        `${termCount} search term${termCount === 1 ? '' : 's'}`,
        `${configured} communit${configured === 1 ? 'y' : 'ies'}`,
        `${names.length} rival${names.length === 1 ? '' : 's'}`,
        `${platforms.length} platform${platforms.length === 1 ? '' : 's'}`,
        period,
      ].join(' · ') : undefined}
      counts={{
        tracking: { value: String(termCount), unit: `search term${termCount === 1 ? '' : 's'}` },
        ...(inputs.railCounts.subjects != null
          ? { subjects: { value: String(inputs.railCounts.subjects), unit: `subject${inputs.railCounts.subjects === 1 ? '' : 's'} being measured` } }
          : {}),
        ...(inputs.updates.length > 0
          ? { record: { value: String(inputs.updates.length), unit: `update${inputs.updates.length === 1 ? '' : 's'} on record` } }
          : {}),
        ...(inputs.railCounts.schedules != null
          ? { reports: { value: String(inputs.railCounts.schedules), unit: `schedule${inputs.railCounts.schedules === 1 ? '' : 's'}` } }
          : {}),
      }}
      railFooter={<LastSaveStrip state={strip} note={inputs.lastChangeNote} />}
    >
      {inputs.configFailed ? (
        <p className="text-[12.5px] text-muted-foreground">We could not load your settings just now. Refresh the page, and tell us if it keeps happening.</p>
      ) : !c || !terms ? (
        <p className="text-[12.5px] text-muted-foreground">No tracking config for this workspace. Nothing is tracked until this is set up with you.</p>
      ) : (
        <TrackingForm
          canEdit={canEdit}
          terms={{
            brand_keywords: terms.brand_keywords ?? [],
            competitor_keywords: terms.competitor_keywords ?? [],
            industry_keywords: terms.industry_keywords ?? [],
            exclude_terms: terms.exclude_terms ?? [],
          }}
          dates={dates}
          datesNote={
            inputs.termDates.size === 0
              ? 'We have not written down when a term was added yet.'
              : 'A date on a term is when it entered the set. “In use by” means we worked it out afterwards from what an update searched: a label, not a record.'
          }
          review={inputs.performance.rows.filter((t) => t.worthReviewing)}
          rivals={rivals}
          names={names}
          month={inputs.censusMonth}
          period={period === 'paused' ? 'weekly' : period}
          storedPeriod={period}
          day={(c.report_day ?? 'monday') as string}
          updatesThisMonth={updatesInMonth(inputs.updates, inputs.censusMonth.slice(0, 7)).map((u) => u.startedAt.slice(0, 10))}
          lastUpdate={delivery.lastOn}
          showStudio={showStudio}
          lastChange={inputs.lastChange}
          affectsRecorded={inputs.affectsRecorded}
          performance={<TermPerformance rows={inputs.performance.rows} updates={inputs.performance.updates} months={inputs.termYield} />}
          communities={
            <CommunitiesSection
              rows={table.shown}
              hidden={table.hidden}
              hiddenPosts={table.hiddenPosts}
              unconfigured={unconfigured}
              canEdit={canEdit}
              keptClosed={inputs.communityKept === null}
            />
          }
          platforms={
            <PlatformsSection
              rows={platformRows({ platforms, communities: configured, mix: inputs.platformMix, videos: inputs.monthVideos })}
              basis={platformShareBasis({
                month: inputs.censusMonth,
                status: inputs.monthStatus,
                videos: inputs.monthVideos,
                unread: inputs.monthUnread,
                audience: audienceLabel('client'),
              })}
              ownAccounts={ownHandles}
            />
          }
        />
      )}
    </SettingsFrame>
  )
}
