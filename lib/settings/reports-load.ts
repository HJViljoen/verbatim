import type { SupabaseClient } from '@supabase/supabase-js'

import type { ScheduleLike } from './artefacts'

/**
 * The reads behind Settings › Reports and recipients (design ST6's recipient
 * half).
 *
 * `report_schedules` carries a tenant SELECT policy already, so this runs on
 * the session client. What it must survive is the `artefact` column not being
 * there yet: before M8 a select naming it fails with 42703 / PGRST204 and the
 * page would 500 on a migration being a day behind. It degrades to "the
 * schedules that exist, none of them named", which is the truth — the seven
 * rows are still drawn and every one of them reads "nobody receives this",
 * which is also the truth.
 */

/** PostgREST's two ways of saying "that column isn't there" — Postgres 42703
 *  from a statement it forwarded, PGRST204 from its own schema cache. */
export function isMissingArtefact(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string | null; message?: string | null }
  const code = e.code ?? ''
  return (code === '42703' || code === 'PGRST204') && (e.message ?? '').includes('artefact')
}

export interface ReportsPageInputs {
  /** False until M8 is applied: no schedule can name an artefact, so no row in
   *  the table below can be trusted to be about the artefact it sits under. */
  named: boolean
  schedules: ScheduleLike[]
  /** `tracking_configs.report_period` — a paused workspace sends nothing at
   *  all, whatever a schedule says. */
  period: string
  /** The dead list. Four live Össur addresses that nothing has sent to since
   *  recipients moved to report_schedules; carried so the page can say it is
   *  dead rather than leave it as a trap for the next person who finds it. */
  deadRecipients: string[]
}

export async function loadReportsPage(
  client: SupabaseClient,
  clientId: string,
): Promise<ReportsPageInputs> {
  const [scheduleRead, configRead] = await Promise.all([
    client.from('report_schedules')
      .select('id, name, artefact, cadence, recipients, active, last_sent_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true }),
    client.from('tracking_configs')
      .select('report_period, report_emails')
      .eq('client_id', clientId)
      .maybeSingle(),
  ])

  type Row = {
    id: string; name: string | null; cadence: string | null; recipients: string[] | null
    active: boolean | null; last_sent_at: string | null; artefact?: string | null
  }
  let named = true
  let rows = (scheduleRead.data ?? []) as Row[]
  if (scheduleRead.error) {
    if (!isMissingArtefact(scheduleRead.error)) throw scheduleRead.error
    named = false
    const retry = await client.from('report_schedules')
      .select('id, name, cadence, recipients, active, last_sent_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
    if (retry.error) throw retry.error
    rows = (retry.data ?? []) as Row[]
  }

  return {
    named,
    schedules: rows.map((r): ScheduleLike => ({
      id: r.id,
      name: r.name ?? '',
      artefact: named ? (r.artefact ?? null) : null,
      cadence: r.cadence ?? 'every_update',
      recipients: r.recipients ?? [],
      active: Boolean(r.active),
      lastSentAt: r.last_sent_at ?? null,
    })),
    period: (configRead.data?.report_period as string | undefined) ?? 'weekly',
    deadRecipients: ((configRead.data?.report_emails as string[] | null) ?? []).filter(Boolean),
  }
}
