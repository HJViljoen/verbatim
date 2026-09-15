import {
  ConnectionRow, FactRow, SettingsCard, SettingsFrame, SettingsRow, SettingsTable,
} from '@/components/settings-frame'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { platformLabel } from '@/lib/format'
import { HANDLE_FORMAT_CAVEAT } from '@/lib/provisioning'
import { communityRows, communityWords, unconfiguredShare } from '@/lib/settings/communities'
import { RIVAL_PRECEDENCE, rivalRows, rivalState } from '@/lib/settings/rivals-view'
import { termDateWords } from '@/lib/settings/terms'
import { loadTrackingPage } from '@/lib/settings/tracking-load'
import { RivalRename } from './rival-rename'
import { SearchTermsForm, type SearchTermsConfig } from './search-terms-form'
import { SettingsForm, type TrackingConfig } from './settings-form'
import { TermPerformance } from './term-performance'

// Settings › Tracking (Phase 1 WP16, design ST2 and ST4) — everything about
// what we look at for this workspace, in one sub-page: the terms, what each one
// brought back, the communities, the rivals, the platforms and the cadence.
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

export default async function SettingsTrackingPage() {
  const { supabase, clientId, role } = await getSessionContext()
  const canEdit = canManageTenant(role)
  const inputs = await loadTrackingPage(supabase, clientId)

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

  const dates = Object.fromEntries([...inputs.termDates].map(([term, date]) => [term, termDateWords(date)]))
  const communities = communityRows({ entries: inputs.entries, roi: inputs.roi, gate: inputs.communityKept ?? [] })
  const unconfigured = unconfiguredShare(communities)
  const rivals = rivalRows({ names, handles, identities: inputs.rivals, census: inputs.census })

  return (
    <SettingsFrame
      active="tracking"
      title="Settings"
      context={`${inputs.tenant}${inputs.plan ? ` · ${inputs.plan} plan` : ''}${!canEdit ? ' · read-only' : ''}`}
      contentTitle="Tracking"
      contentMeta={c ? `${termCount} search term${termCount === 1 ? '' : 's'} · ${names.length} rival${names.length === 1 ? '' : 's'}` : undefined}
      counts={{ tracking: `${termCount} terms` }}
    >
      {inputs.configFailed ? (
        <p className="text-[12px] text-muted-foreground">We could not load your settings just now. Refresh the page, and tell us if it keeps happening.</p>
      ) : !c || !terms ? (
        <p className="text-[12px] text-muted-foreground">No tracking config for this workspace — nothing is tracked until this is set up with you.</p>
      ) : (
        <div className="flex flex-col gap-3">

          <SearchTermsForm
            cfg={terms}
            canEdit={canEdit}
            dates={dates}
            datesNote={
              inputs.termDates.size === 0
                ? 'We have not written down when a term was added yet. That record starts with the next change either of us makes.'
                : 'A date on a term is when it entered the set. "In use by" means we worked it out afterwards from what an update searched — a label, not a record.'
            }
          />

          {/* The shipped table, with the two columns ST2 asks for: the
              kept-rate lib/keywords/value.ts has always computed and never
              printed, and the month strip on the update's own clock. */}
          <TermPerformance rows={inputs.performance.rows} updates={inputs.performance.updates} months={inputs.termYield} />

          {/* ---- Watched communities -------------------------------------- */}
          <SettingsCard
            title="Watched communities"
            description="Reddit is read by community, not by search alone. A community is proposed, then sampled, then watched or ruled out."
          >
            <SettingsTable
              head={['Community', 'State', 'Posts', 'Comments', 'Kept', 'Findings']}
              empty="No community is watched for this workspace."
            >
              {communities.map((r) => (
                <SettingsRow
                  key={r.key}
                  cells={[
                    <span key="n" className="block text-left">
                      <span className="font-medium">{r.label}</span>
                      {r.discoveredAt && <span className="block font-mono text-[10.5px] text-muted-foreground">found {r.discoveredAt}</span>}
                    </span>,
                    <span key="s" className="text-left text-[11.5px] text-muted-foreground">
                      {communityWords(r)}
                      {r.probe && <span className="block font-mono text-[10.5px]">sampled {r.probe.at}: {r.probe.kept} of {r.probe.sampled} on topic</span>}
                    </span>,
                    r.posts.toLocaleString('en-GB'),
                    r.comments.toLocaleString('en-GB'),
                    r.keptPct === null ? '—' : `${r.keptPct.toFixed(0)}%`,
                    r.insights.toLocaleString('en-GB'),
                  ]}
                />
              ))}
            </SettingsTable>
            {unconfigured.posts > 0 && unconfigured.fromUnconfigured > 0 && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                {unconfigured.pct.toFixed(0)}% of the Reddit posts we hold for you came from communities nobody put
                on the list — the search found them. They are counted the same way, and they are the first place to
                look when a Reddit figure looks wrong.
              </p>
            )}
            {inputs.communityKept === null && (
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                We cannot yet show you how much of each community we kept. The record exists; opening it to you is
                a change we have not shipped.
              </p>
            )}
          </SettingsCard>

          {/* ---- Rivals ---------------------------------------------------- */}
          <SettingsCard
            title="Rivals"
            description={RIVAL_PRECEDENCE}
          >
            <SettingsTable
              head={['Rival', 'Accounts we read', 'Tracked since', '']}
              empty="No rival is named. Naming one is how the category gets a shape."
            >
              {rivals.map((r) => (
                <SettingsRow
                  key={r.identity?.id ?? r.name}
                  cells={[
                    <span key="n" className="block text-left">
                      <span className="font-medium">{r.name}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{rivalState(r)}</span>
                    </span>,
                    <span key="h" className="block text-right text-[11.5px]">
                      {r.perPlatform.length === 0 ? (
                        <span className="text-muted-foreground">— not tracked</span>
                      ) : (
                        r.perPlatform.map((p) => (
                          <span key={p.platform} className="block font-mono text-[10.5px] text-muted-foreground">
                            {platformLabel(p.platform)} {p.handle ? `@${p.handle}` : '— not tracked'}
                            {p.captured > 0 ? ` · ${p.captured} captured, ${p.read} read` : ''}
                          </span>
                        ))
                      )}
                    </span>,
                    <span key="t" className="font-mono text-[11px] text-muted-foreground">
                      {r.trackedSince ? r.trackedSince.slice(0, 10) : 'not recorded'}
                    </span>,
                    r.identity && !r.retiredAt && canEdit
                      ? <RivalRename key="r" id={r.identity.id} name={r.name} />
                      : <span key="r" />,
                  ]}
                />
              ))}
            </SettingsTable>
            <p className="mt-2 text-[11.5px] text-muted-foreground">{HANDLE_FORMAT_CAVEAT}</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              &ldquo;Tracked since&rdquo; is the earliest evidence in our own data that we were reading the name —
              not the day you asked for it, which nothing recorded until now.
            </p>
          </SettingsCard>

          {/* ---- Where we listen (was Connections) ------------------------- */}
          <SettingsCard
            title="Where we listen"
            description="The platforms we read, and the accounts we count as yours. Set up with you — these drive cost and quality, so they change on request."
          >
            {['tiktok', 'youtube', 'instagram', 'reddit'].map((p) => (
              <ConnectionRow
                key={p}
                name={platformLabel(p)}
                what={p === 'reddit'
                  ? 'Read by community, not by account.'
                  : ownHandles[p] ? `Your account: @${ownHandles[p]}` : 'No account of yours is configured — the search still finds you.'}
                status={platforms.includes(p) ? 'connected' : 'not-connected'}
              />
            ))}
            <FactRow label="Your accounts">
              {Object.entries(ownHandles).filter(([, v]) => v).length > 0
                ? Object.entries(ownHandles).filter(([, v]) => v).map(([p, h]) => `${platformLabel(p)}${p !== 'youtube' ? ` @${h}` : ''}`).join(' · ')
                : <span className="text-muted-foreground">none yet</span>}
            </FactRow>
          </SettingsCard>

          {/* ---- Cadence --------------------------------------------------- */}
          <SettingsForm cfg={c} canEdit={canEdit} />

        </div>
      )}
    </SettingsFrame>
  )
}
