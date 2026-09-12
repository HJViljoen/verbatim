import { SettingsFrame, SettingsCard, FactRow } from '@/components/settings-frame'
import { platformLabel } from '@/lib/format'
import { getSessionContext, canManageTenant } from '@/lib/auth'
import { loadTermPerformance } from '@/lib/keywords/performance'
import { SettingsForm, type TrackingConfig } from './settings-form'
import { SearchTermsForm, type SearchTermsConfig } from './search-terms-form'
import { row } from '@/lib/pages/read'
import { TermPerformance } from './term-performance'

// Settings — edit the client's tracking_configs (what gather scrapes + report
// schedule). Owners/admins can save; members get a read-only form. Authorization
// is enforced server-side in the action and by RLS — the disabled fieldset is
// only UX.
//
// Search terms became client-editable on 2026-09-11 (WP5): the three term
// lists and the exclusions are theirs, with the record of what each term did
// sitting underneath. Platforms, scrape depth and how many videos a search
// buys stay operator knobs and are still read-only facts here.

export default async function SettingsPage() {
  // Auth + tenant + role via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId, role } = await getSessionContext()

  const [clientRes, cfgRes, performance] = await Promise.all([
    supabase.from('clients').select('company_name, plan').eq('id', clientId).maybeSingle(),
    supabase.from('tracking_configs').select('*').eq('client_id', clientId).maybeSingle(),
    loadTermPerformance(supabase, clientId),
  ])
  const client = row<{ company_name: string | null; plan: string | null }>(clientRes, 'settings.client')
  // A failed read and an empty table are the same `null`, and the empty state
  // below is a confident factual claim about what we track. Saying it because
  // the query broke is worse than saying nothing, so the two are told apart.
  const cfgFailed = cfgRes.error !== null
  const cfg = row<Record<string, unknown>>(cfgRes, 'settings.trackingConfig')
  const c = cfg as TrackingConfig | null
  const canEdit = canManageTenant(role)

  // The operator facts ride on the same row (read-only).
  const facts = (cfg ?? null) as { platforms?: string[] | null; own_handles?: Record<string, string> | null } | null
  const platforms = facts?.platforms ?? []
  const handles = facts?.own_handles ?? {}
  const terms = (cfg ?? null) as SearchTermsConfig | null
  const termCount = (terms?.brand_keywords ?? []).length + (terms?.competitor_keywords ?? []).length + (terms?.industry_keywords ?? []).length

  return (
    <SettingsFrame active="tracking" title="Settings" context={`${client?.company_name ?? 'Client'}${client?.plan ? ` · ${client.plan} plan` : ''}${!canEdit ? ' · read-only' : ''}`} contentTitle="Tracking & reports" contentMeta={c ? `${termCount} search term${termCount === 1 ? '' : 's'} · ${(c.competitor_names ?? []).length} competitor${(c.competitor_names ?? []).length === 1 ? '' : 's'}` : undefined}>
      {cfgFailed ? (
        <p className="text-[12px] text-muted-foreground">We could not load your settings just now. Refresh the page, and tell us if it keeps happening.</p>
      ) : !c || !terms ? (
        <p className="text-[12px] text-muted-foreground">No tracking config for this client, nothing is tracked until this is set up with you.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <SettingsCard title="What we track" description="Where we listen, and the accounts we count as yours. Set up with you at onboarding.">
            <FactRow label="Platforms">{platforms.length > 0 ? platforms.map(platformLabel).join(' · ') : <span className="text-muted-foreground">none yet</span>}</FactRow>
            <FactRow label="Your accounts">
              {Object.entries(handles).filter(([, v]) => v).length > 0
                ? Object.entries(handles).filter(([, v]) => v).map(([p, h]) => `${platformLabel(p)}${p !== 'youtube' ? ` @${h}` : ''}`).join(' · ')
                : <span className="text-muted-foreground">none yet</span>}
            </FactRow>
          </SettingsCard>
          <SettingsForm cfg={c} canEdit={canEdit} />
          <SearchTermsForm cfg={terms} canEdit={canEdit} />
          <TermPerformance rows={performance.rows} updates={performance.updates} />
        </div>
      )}
    </SettingsFrame>
  )
}
