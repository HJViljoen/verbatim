import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEDULE_RECIPIENTS_MAX } from '../config'
import { recordConfigChange, scriptActor, type ConfigActor } from '../config-log'
import { WEEKLY_STARTER_KEY } from './artefact'
import { normaliseRecipients } from './validate'
import type { ScheduleRow } from './types'

/**
 * The workspace's default schedule — its "Weekly digest" — is where a new
 * teammate lands (accepting an invite, T0-10) and what a new workspace is
 * given at birth (onboarding, provisioning, the demo seed). One per
 * workspace, enforced by report_schedules_one_default.
 *
 * Both writers log to config_changes under the `schedule` surface (WP2): who
 * receives the update is a configuration change, and no trigger can see it —
 * the trigger watches tracking_configs, and recipients left that table when
 * they moved to report_schedules (T0-10). `report_sends` records what went
 * out, never who was on the list before it did.
 *
 * `actor` is who to credit. It defaults to the file itself rather than to a
 * person, because two of the four callers (provisioning, the demo seed) have
 * no person to name.
 */

// THE NEW WORKSPACE GETS THE WEEKLY REPORT (Phase 1 WP17). The digest is
// retired; a workspace created from here on is born on the artefact the design
// asks for — "a weekly report goes to everyone, every update". Existing rows
// are untouched: `ensureDefaultSchedule` returns the row it finds, and an
// operator migrates a live schedule with scripts/migrate-schedule-keys.ts.
export const DEFAULT_SCHEDULE_NAME = 'Weekly report'
export const DEFAULT_SCHEDULE_STARTER = WEEKLY_STARTER_KEY

/** Create the default schedule if the workspace has none; returns the row either way. */
export async function ensureDefaultSchedule(admin: SupabaseClient, clientId: string, recipients: string[] = [], createdBy: string | null = null, actor?: ConfigActor): Promise<ScheduleRow> {
  const { data: existing } = await admin.from('report_schedules').select('*').eq('client_id', clientId).eq('is_default', true).maybeSingle()
  if (existing) return existing as ScheduleRow
  const { data, error } = await admin
    .from('report_schedules')
    .insert({
      client_id: clientId,
      name: DEFAULT_SCHEDULE_NAME,
      starter_key: DEFAULT_SCHEDULE_STARTER,
      cadence: 'every_update',
      recipients: normaliseRecipients(recipients),
      attach_pdf: true,
      share_days: 30,
      active: true,
      is_default: true,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`default schedule: ${error?.message ?? 'no row'}`)
  const row = data as ScheduleRow
  await recordConfigChange(admin, {
    clientId,
    surface: 'schedule',
    field: 'report_schedules',
    before: null,
    after: { id: row.id, name: row.name, cadence: row.cadence, recipients: row.recipients, active: row.active, is_default: true },
    actor: actor ?? scriptActor('lib/schedules/default.ts ensureDefaultSchedule'),
    note: 'the workspace digest, created with the workspace',
  })
  return row
}

/** Add an address to the default schedule's list (case-insensitive, no
 *  duplicates, the 25 cap respected). Returns whether anything changed. */
export async function joinDefaultSchedule(admin: SupabaseClient, clientId: string, email: string, actor?: ConfigActor): Promise<boolean> {
  const s = await ensureDefaultSchedule(admin, clientId, [], null, actor)
  const next = normaliseRecipients([...s.recipients, email])
  if (next.length === s.recipients.length || next.length > SCHEDULE_RECIPIENTS_MAX) return false
  const { error } = await admin.from('report_schedules').update({ recipients: next, updated_at: new Date().toISOString() }).eq('id', s.id)
  if (error) throw new Error(`default schedule: ${error.message}`)
  await recordConfigChange(admin, {
    clientId,
    surface: 'schedule',
    field: 'report_schedules.recipients',
    before: s.recipients,
    after: next,
    actor: actor ?? scriptActor('lib/schedules/default.ts joinDefaultSchedule'),
    note: `${email} joined the workspace digest`,
  })
  return true
}

/** Every active schedule's list, for "who gets the update" surfaces. */
export async function recipientsBySchedule(admin: SupabaseClient, clientId: string): Promise<{ id: string; name: string; recipients: string[]; active: boolean; is_default: boolean }[]> {
  const { data } = await admin.from('report_schedules').select('id, name, recipients, active, is_default').eq('client_id', clientId).order('is_default', { ascending: false }).order('created_at')
  return (data ?? []) as { id: string; name: string; recipients: string[]; active: boolean; is_default: boolean }[]
}
