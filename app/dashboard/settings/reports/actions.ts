'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { canManageTenant, getSessionContext } from '@/lib/auth'
import { SCHEDULE_RECIPIENTS_MAX } from '@/lib/config'
import { actorStamp, recordConfigChange } from '@/lib/config-log'
import { DEFAULT_SCHEDULE_STARTER } from '@/lib/schedules/default'
import { normaliseRecipients, splitRecipients } from '@/lib/schedules/validate'
import { ARTEFACTS, ARTEFACT_COPY, isArtefact } from '@/lib/settings/artefacts'
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
  const { data: existing, error: readError } = await admin
    .from('report_schedules')
    .select('id, name, cadence, recipients, active')
    .eq('client_id', clientId)
    .eq('artefact', parsed.data.artefact)
    .maybeSingle()

  if (readError) {
    if (isMissingArtefact(readError)) {
      return { ok: false, message: 'We cannot store this yet — the part of the product that records it has not shipped.' }
    }
    return { ok: false, message: 'Could not save just now. Try again, and tell us if it keeps happening.' }
  }

  const label = ARTEFACT_COPY[parsed.data.artefact].label
  const before = existing
    ? { recipients: existing.recipients as string[], active: existing.active as boolean }
    : null

  const write = existing
    ? admin.from('report_schedules')
      .update({ recipients: parsed.data.recipients, active: parsed.data.active, updated_at: new Date().toISOString() })
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
      active: parsed.data.active,
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
    after: { recipients: parsed.data.recipients, active: parsed.data.active },
    actor: actorStamp(session, 'reports and recipients'),
    note: parsed.data.recipients.length === 0
      ? `${label} now goes to nobody.`
      : `${label} now goes to ${parsed.data.recipients.length} address${parsed.data.recipients.length === 1 ? '' : 'es'}${parsed.data.active ? '' : ', and is switched off'}.`,
  })

  revalidatePath('/dashboard/settings/reports')
  return { ok: true, message: 'Saved.' }
}
