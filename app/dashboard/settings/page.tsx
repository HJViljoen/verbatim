import {
  ConnectionRow, FactRow, SettingsCard, SettingsFrame, SettingsRow, SettingsTable,
} from '@/components/settings-frame'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { platformLabel } from '@/lib/format'
import { HANDLE_FORMAT_CAVEAT } from '@/lib/provisioning'
import { REDDIT_CAP_LINE } from '@/lib/reading/method'
import { communityRows, communityWords, tableRows, unconfiguredShare } from '@/lib/settings/communities'
import { RIVAL_PRECEDENCE, rivalRows, rivalState } from '@/lib/settings/rivals-view'
import { termDateWords } from '@/lib/settings/terms'
import { loadTrackingPage } from '@/lib/settings/tracking-load'
import { createAdminClient } from '@/lib/supabase-admin'
import { RivalRename } from './rival-rename'
import { SearchTermsForm, type SearchTermsConfig } from './search-terms-form'
import { SettingsForm, type TrackingConfig } from './settings-form'
import { canSeeStudio } from '@/lib/studio-visibility'
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
  const session = await getSessionContext()
  const { supabase, clientId, role } = session
  // Whether this session is shown a door into the Studio (main, 2026-09-17,
  // lib/studio-visibility.ts). The cadence card's "who receives what" line is
  // one of those doors, so it asks here and the form takes the answer.
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

  const dates = Object.fromEntries([...inputs.termDates].map(([term, date]) => [term, termDateWords(date)]))
  const communities = communityRows({ entries: inputs.entries, roi: inputs.roi, gate: inputs.communityKept ?? [] })
  const table = tableRows(communities)
  const unconfigured = unconfiguredShare(communities)
  const rivals = rivalRows({ names, handles, identities: inputs.rivals, census: inputs.census, month: inputs.censusMonth })

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
              {table.shown.map((r) => (
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
            {table.hidden > 0 && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                {table.hidden} further communit{table.hidden === 1 ? 'y is' : 'ies are'} not shown, between them
                carrying {table.hiddenPosts.toLocaleString('en-GB')} post{table.hiddenPosts === 1 ? '' : 's'} — one
                or two each, dragged in by a search and not by anyone&rsquo;s choice.
              </p>
            )}
            {unconfigured.posts > 0 && unconfigured.fromUnconfigured > 0 && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                {unconfigured.pct.toFixed(0)}% of the Reddit posts we hold for you came from communities nobody put
                on the list — the search found them. They are counted the same way, and they are the first place to
                look when a Reddit figure looks wrong.
              </p>
            )}
            {/* `settings.reddit.footer` — THE CAP AND THE EXCLUSION, printed
                where the counts are. A client reading "292 posts · 1,880
                comments" off this table has no way to know the comment column
                is capped per thread, or that none of those posts is in an
                engagement figure anywhere. The sentence is the method
                footnote's own (lib/reading/method.ts REDDIT_CAP_LINE), not a
                second wording of it. */}
            <p className="mt-2 text-[11.5px] text-muted-foreground">{REDDIT_CAP_LINE}</p>
            {inputs.communityKept === null && (
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                How much of each community we kept is shown to owners and admins only — it is read off the accounts
                other people posted from, and the fewer copies of those we hand around the better.
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
                            {/* No `@` on YouTube: it is read by CHANNEL ID and
                                an @name reads nothing at all, so printing one
                                as a handle would teach a client the wrong shape
                                to paste (lib/provisioning.ts YOUTUBE_CHANNEL_ID). */}
                            {platformLabel(p.platform)} {p.handle ? (p.platform === 'youtube' ? p.handle : `@${p.handle}`) : '— not tracked'}
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
                // No `@` on YouTube here either: it is read by CHANNEL ID, and
                // an @name reads nothing at all, so printing one as a handle
                // teaches a client the wrong shape to paste (the rivals block
                // above, lib/provisioning.ts YOUTUBE_CHANNEL_ID).
                what={p === 'reddit'
                  ? 'Read by community, not by account.'
                  : !ownHandles[p] ? 'No account of yours is configured — the search still finds you.'
                    : p === 'youtube' ? `Your channel: ${ownHandles[p]}`
                      : `Your account: @${ownHandles[p]}`}
                status={platforms.includes(p) ? 'connected' : 'not-connected'}
              />
            ))}
            <FactRow label="Your accounts">
              {Object.entries(ownHandles).filter(([, v]) => v).length > 0
                ? Object.entries(ownHandles).filter(([, v]) => v)
                  .map(([p, h]) => `${platformLabel(p)} ${p === 'youtube' ? h : `@${h}`}`).join(' · ')
                : <span className="text-muted-foreground">none yet</span>}
            </FactRow>
          </SettingsCard>

          {/* ---- Cadence --------------------------------------------------- */}
          <SettingsForm cfg={c} canEdit={canEdit} showStudio={showStudio} />

        </div>
      )}
    </SettingsFrame>
  )
}
