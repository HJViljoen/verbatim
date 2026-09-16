import { SettingsCard, SettingsFrame, SettingsRow, SettingsTable } from '@/components/settings-frame'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { fullDate } from '@/lib/format'
import { CADENCE_COPY, type ScheduleCadence } from '@/lib/schedules/types'
import { notBuiltYet, recipientRows, sendingSummary, unnamedSchedules } from '@/lib/settings/artefacts'
import { loadReportsPage } from '@/lib/settings/reports-load'
import { RecipientsForm } from './recipients-form'

// Settings › Reports and recipients (Phase 1 WP16, design ST6's recipient
// half) — one row per artefact per workspace, whether or not anything sends it.
//
// THE TABLE IS THE SEVEN, NOT THE SCHEDULES. "Nobody receives the monthly
// reading" is the answer this page exists to give, and a table that lists only
// the schedules that exist cannot give it: both live tenants have exactly one
// schedule and six artefacts nothing sends. So the seven rows are drawn from
// lib/settings/artefacts.ts and each one finds its schedule, rather than the
// other way round.
//
// A PAUSED WORKSPACE SENDS NOTHING, whatever a schedule says. That is the T0-7
// rule the settings form already respects; a row reading "active" beside a
// paused cadence is a claim the client can check and find false.
//
// AND NEITHER DOES AN ARTEFACT NOTHING BUILDS. Six of the seven have no builder
// until WP17-WP20, and the send path resolves a due schedule by its starter
// rather than by its artefact — so a row armed here would email the weekly
// digest under another document's name. The table names the recipients, says
// "not yet" where the document does not exist, and the form does not offer to
// send one (lib/settings/artefacts.ts BUILDABLE_ARTEFACTS).

const cadenceLabel = (c: string): string =>
  CADENCE_COPY.find((x) => x.key === (c as ScheduleCadence))?.label ?? c

export default async function SettingsReportsPage() {
  const { supabase, clientId, role } = await getSessionContext()
  const canEdit = canManageTenant(role)

  const [{ data: client }, inputs] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    loadReportsPage(supabase, clientId),
  ])
  const tenant = (client?.company_name as string | undefined) ?? 'Your workspace'

  const rows = recipientRows(inputs.schedules, inputs.period)
  const unnamed = unnamedSchedules(inputs.schedules)
  const sending = rows.filter((r) => r.sending).length

  return (
    <SettingsFrame
      active="reports"
      title="Settings"
      context={`${tenant}${!canEdit ? ' · read-only' : ''}`}
      contentTitle="Reports and recipients"
      contentMeta={`${sending} of ${rows.length} being sent`}
    >
      <div className="flex flex-col gap-3">

        <SettingsCard
          title="Who receives what"
          description={sendingSummary(rows, inputs.period, unnamed)}
        >
          <SettingsTable head={['Report', 'When', 'Who receives it', 'Last sent']}>
            {rows.map((r) => (
              <SettingsRow
                key={r.artefact}
                cells={[
                  <span key="a" className="block text-left">
                    <span className="font-medium">{r.label}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{r.what}</span>
                  </span>,
                  <span key="c" className="text-[11.5px] text-muted-foreground">
                    {r.buildable ? (r.schedule ? cadenceLabel(r.schedule.cadence) : '—') : 'not yet'}
                    {r.schedule && !r.sending && (
                      <span className="block">
                        {!r.buildable ? 'nothing sends this on a schedule yet'
                          : inputs.period === 'paused' ? 'paused'
                            : r.schedule.active ? 'nobody to send to' : 'switched off'}
                      </span>
                    )}
                  </span>,
                  <span key="r" className="flex flex-col items-end gap-1">
                    {r.recipients.length > 0 && (
                      <span className="text-left text-[11.5px] text-secondary-foreground">{r.recipients.join(', ')}</span>
                    )}
                    <RecipientsForm
                      artefact={r.artefact}
                      label={r.label}
                      recipients={r.recipients}
                      active={r.schedule?.active ?? true}
                      buildable={r.buildable}
                      notBuilt={notBuiltYet(r.artefact)}
                      canEdit={canEdit && inputs.named}
                    />
                  </span>,
                  <span key="l" className="font-mono text-[11px] text-muted-foreground">
                    {r.lastSentAt ? fullDate(r.lastSentAt) : 'never'}
                  </span>,
                ]}
              />
            ))}
          </SettingsTable>

          {!inputs.named && (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              We cannot yet record which report a recipient list belongs to, so nothing here can be changed. The
              schedules below are what is actually going out in the meantime.
            </p>
          )}

          <p className="mt-2 text-[11.5px] text-muted-foreground">
            A report rides the update — it goes out after one, and never on a clock of its own. Nothing is sent at
            all while updates are paused.
          </p>
        </SettingsCard>

        {unnamed.length > 0 && (
          <SettingsCard
            title="Older schedules"
            description="Set up before this list existed, and still sending. We will name each one and fold it in."
          >
            <SettingsTable head={['Name', 'When', 'Who receives it', 'Last sent']}>
              {unnamed.map((s) => (
                <SettingsRow
                  key={s.id}
                  cells={[
                    s.name,
                    <span key="c" className="text-[11.5px] text-muted-foreground">{cadenceLabel(s.cadence)}{s.active ? '' : ' · off'}</span>,
                    <span key="r" className="text-[11.5px] text-secondary-foreground">{s.recipients.length > 0 ? s.recipients.join(', ') : 'nobody'}</span>,
                    <span key="l" className="font-mono text-[11px] text-muted-foreground">{s.lastSentAt ? fullDate(s.lastSentAt) : 'never'}</span>,
                  ]}
                />
              ))}
            </SettingsTable>
          </SettingsCard>
        )}

        {inputs.deadRecipients.length > 0 && (
          <SettingsCard
            title="An old list we no longer use"
            description="These addresses are stored against your workspace from before recipients moved onto each report. Nothing has been sent to this list since."
          >
            <p className="font-mono text-[11.5px] text-muted-foreground">{inputs.deadRecipients.join(', ')}</p>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              If any of them should be receiving something, add them to the report above. We will clear this list
              once you say so — deleting it is ours to do, and we would rather you saw it first.
            </p>
          </SettingsCard>
        )}

      </div>
    </SettingsFrame>
  )
}
