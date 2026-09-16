'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { canManageTenant, getSessionContext } from '@/lib/auth'
import { SCHEDULE_RECIPIENTS_MAX } from '@/lib/config'
import { actorStamp, recordConfigChange } from '@/lib/config-log'
import { DEFAULT_SCHEDULE_STARTER } from '@/lib/schedules/default'
import { normaliseRecipients, splitRecipients } from '@/lib/schedules/validate'
import { ARTEFACTS, ARTEFACT_COPY, isArtefact, isBuildable, notBuiltYet } from '@/lib/settings/artefacts'
import { isMissingArtefact } from '@/lib/settings/reports-load'
import { createAdminClient } from '@/lib/supabase-admin'

// Settings › Reports and recipients — who receives which artefact (design ST6).
//
// EVERY WRITE CARRIES AN ACTOR, and not through the trigger. The
// tracking_configs_audit trigger watches tracking_configs; recipients left that
// table when they moved to report_schedules, so nothing in the database can see
// this change at all. `recordConfigChange` under the `schedule` surface is the
// only record there is, which is exactly the case lib/config-log.ts names as
// "surfaces the trigger cannot see".
//
// ON THE ADMIN CLIENT. report_schedules carries a tenant SELECT policy and no
// tenant UPDATE policy: recipients have always been written by the service
// role (lib/schedules/default.ts does it for an accepted invite). The role
// check above is the gate, as it is for every other settings write.
//
// UPSERT BY ARTEFACT, NOT BY ID. The form names an artefact, and the row for it
// may not exist yet — six of the seven do not on either live tenant. Creating
// it here is what makes the table an answer to "who receives the monthly
// reading" rather than a list of whatever happens to exist.
//
// AND IT NEVER ARMS ONE. The runner takes every active, due schedule for the
// tenant and resolves the document from the artefact column and then from
// `starter_key` (WP17 — `artefact` is the FIRST thing the send path reads, and
// the sentence here used to say the opposite). A row written here for the
// monthly reading or a brief names a starter because every schedule needs
// exactly one source, and left active it would email the WEEKLY REPORT under
// that artefact's name and stamp last_sent_at so this page called it sent. So a
// list for an artefact nothing builds is stored SWITCHED OFF, whatever the
// checkbox said, and the form says so (lib/settings/artefacts.ts
// BUILDABLE_ARTEFACTS).

export interface RecipientsState {
  ok: boolean
  message: string
}

const schema = z.object({
  artefact: z.enum(ARTEFACTS),
  recipients: z.array(z.string().email('that is not an email address')).max(
    SCHEDULE_RECIPIENTS_MAX,
    `at most ${SCHEDULE_RECIPIENTS_MAX} addresses`,
  ),
  active: z.boolean(),
})

export async function updateArtefactRecipients(
  _prev: RecipientsState,
  formData: FormData,
): Promise<RecipientsState> {
  const session = await getSessionContext()
  const { clientId, role, userId } = session
  if (!canManageTenant(role)) {
    return { ok: false, message: 'You don’t have permission to change who receives a report.' }
  }

  const artefact = String(formData.get('artefact') ?? '')
  if (!isArtefact(artefact)) return { ok: false, message: 'We could not tell which report that was.' }

  const parsed = schema.safeParse({
    artefact,
    recipients: normaliseRecipients(splitRecipients(String(formData.get('recipients') ?? ''))),
    active: formData.get('active') === 'on',
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, message: `Could not save: ${first?.message ?? 'check the addresses.'}` }
  }

  const admin = createAdminClient()
  let { data: existing, error: readError } = await admin
    .from('report_schedules')
    .select('id, name, cadence, recipients, active')
    .eq('client_id', clientId)
    .eq('artefact', parsed.data.artefact)
    .maybeSingle()

  // ADOPT THE WORKSPACE'S OWN WEEKLY ROW RATHER THAN INSERT BESIDE IT.
  //
  // Both live tenants have one `is_default` schedule — "Weekly digest", active,
  // cadence every_update — and its `artefact` is null, because M8's backfill
  // deliberately does not claim it (a migration must not flip what a tenant
  // receives). Matching on `artefact` alone therefore found nothing here and
  // took the INSERT branch: a SECOND active every_update schedule, so
  // inngest/functions/report.ts would run both on one update — two emails, two
  // recipient lists, on the page whose whole premise is "who receives what".
  // It also blocked scripts/migrate-schedule-keys.ts for ever, because
  // `report_schedules_one_per_artefact` refuses the artefact it wants to write.
  //
  // WEEKLY ONLY. The other six artefacts have no legacy row to adopt, and
  // is_default names the workspace's weekly send and nothing else. Naming the
  // column on this row is what makes the weekly report the thing it sends —
  // which is the owner's own deliberate act, on a form that says so, and it is
  // recorded below.
  if (!existing && !readError && parsed.data.artefact === 'weekly') {
    const adopted = await admin
      .from('report_schedules')
      .select('id, name, cadence, recipients, active')
      .eq('client_id', clientId)
      .eq('is_default', true)
      .is('artefact', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (adopted.error) { readError = adopted.error } else { existing = adopted.data }
  }

  if (readError) {
    if (isMissingArtefact(readError)) {
      return { ok: false, message: 'We cannot store this yet — the part of the product that records it has not shipped.' }
    }
    return { ok: false, message: 'Could not save just now. Try again, and tell us if it keeps happening.' }
  }

  const label = ARTEFACT_COPY[parsed.data.artefact].label
  // The one value the form does not get to decide.
  const buildable = isBuildable(parsed.data.artefact)
  const active = buildable && parsed.data.active
  const before = existing
    ? { recipients: existing.recipients as string[], active: existing.active as boolean }
    : null

  const write = existing
    ? admin.from('report_schedules')
      .update({ artefact: parsed.data.artefact, recipients: parsed.data.recipients, active, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    : admin.from('report_schedules').insert({
      client_id: clientId,
      name: label,
      // Every schedule needs exactly one source (report_schedules_one_source).
      // A new artefact row points at the starter until WP17 and WP19 give each
      // artefact its own; the artefact column is what actually decides what is
      // sent, and the starter is the fallback the builder already understands.
      starter_key: DEFAULT_SCHEDULE_STARTER,
      artefact: parsed.data.artefact,
      cadence: parsed.data.artefact === 'weekly' ? 'every_update'
        : parsed.data.artefact === 'quarterly' ? 'quarterly' : 'monthly',
      recipients: parsed.data.recipients,
      active,
      created_by: userId,
    })

  const { error } = await write
  if (error) {
    console.error(`[settings] recipients not saved for ${clientId}/${parsed.data.artefact}: ${error.code ?? '?'} ${error.message}`)
    return { ok: false, message: 'Could not save just now. Try again, and tell us if it keeps happening.' }
  }

  await recordConfigChange(admin, {
    clientId,
    surface: 'schedule',
    field: `report_schedules.${parsed.data.artefact}`,
    before,
    after: { recipients: parsed.data.recipients, active },
    actor: actorStamp(session, 'reports and recipients'),
    note: parsed.data.recipients.length === 0
      ? `${label} now goes to nobody.`
      : `${label} now goes to ${parsed.data.recipients.length} address${parsed.data.recipients.length === 1 ? '' : 'es'}${active ? '' : ', and is switched off'}.`,
  })

  revalidatePath('/dashboard/settings/reports')
  return {
    ok: true,
    message: buildable ? 'Saved.' : `Saved. ${notBuiltYet(parsed.data.artefact)}`,
  }
}
