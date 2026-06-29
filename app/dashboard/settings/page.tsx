import { getSessionContext, canManageTenant } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { SettingsForm, type TrackingConfig } from './settings-form'

// Settings — edit the client's tracking_configs (what gather scrapes + report
// schedule). Owners/admins can save; members get a read-only form. Authorization
// is enforced server-side in the action and by RLS — the disabled fieldset is
// only UX.

export default async function SettingsPage() {
  // Auth + tenant + role via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId, role } = await getSessionContext()

  const [{ data: client }, { data: cfg }] = await Promise.all([
    supabase.from('clients').select('company_name, plan').eq('id', clientId).maybeSingle(),
    supabase.from('tracking_configs').select('*').eq('client_id', clientId).maybeSingle(),
  ])
  const c = cfg as TrackingConfig | null
  const canEdit = canManageTenant(role)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {client?.company_name ?? 'Client'}
          {client?.plan ? ` · ${client.plan} plan` : ''}
          {!canEdit && ' · read-only'}
        </p>
      </div>

      {!c ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No tracking config for this client — gather has nothing to scrape until this is set.
        </CardContent></Card>
      ) : (
        <SettingsForm cfg={c} canEdit={canEdit} />
      )}
    </div>
  )
}
