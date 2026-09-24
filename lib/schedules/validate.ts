import { z } from 'zod'
import { SCHEDULE_NAME_MAX, SCHEDULE_RECIPIENTS_MAX } from '../config'

/** A pasted list — commas, semicolons, newlines or spaces between addresses. */
export function splitRecipients(text: string): string[] {
  return text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
}

/** Lower-cased, deduplicated, in first-seen order. */
export function normaliseRecipients(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const e = raw.trim().toLowerCase()
    if (!e || seen.has(e)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}

export const recipientsSchema = z
  .array(z.string().trim().toLowerCase().max(120).pipe(z.email('That is not an email address.')))
  .transform(normaliseRecipients)
  .refine((r) => r.length <= SCHEDULE_RECIPIENTS_MAX, `Send to at most ${SCHEDULE_RECIPIENTS_MAX} addresses.`)

export const shareDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90), z.null()])

/** What a browser may put into a schedule — the form and the routes share it. */
export const scheduleInputSchema = z
  .object({
    name: z.string().trim().min(1, 'A schedule needs a name.').max(SCHEDULE_NAME_MAX),
    starterKey: z.string().trim().max(60).nullable().default(null),
    reportId: z.uuid().nullable().default(null),
    // The Studio's own form, and it accepts what the product can serve. It was
    // the two the picker offered while nothing built a quarterly artefact —
    // accepting 'quarterly' then would have let a crafted POST create a
    // schedule the builder could not serve. WP20 builds it, and refusing it
    // here meant a quarterly schedule created through Settings › Reports and
    // recipients could never afterwards be edited in the Studio.
    cadence: z.enum(['every_update', 'monthly', 'quarterly']),
    recipients: recipientsSchema,
    attachPdf: z.boolean(),
    shareDays: shareDaysSchema,
    active: z.boolean(),
    review: z.boolean().default(false),
  })
  .refine((s) => Boolean(s.starterKey) !== Boolean(s.reportId), { message: 'Pick one template.', path: ['starterKey'] })

export type ScheduleInput = z.infer<typeof scheduleInputSchema>

/**
 * The database refusing a cadence this build offers.
 *
 * `report_schedules_cadence_check` allows `every_update` and `monthly` until
 * M8 widens it (supabase/migrations/20260918097000_settings.sql), and M8 is
 * authored and not applied. The Studio's picker and this schema both offer
 * `quarterly` now that WP20 builds the artefact, so until the migration lands
 * an owner who picks Quarterly gets a CHECK violation — and answered with the
 * generic "Could not save that. Try again." that is a form that lies twice: it
 * asks for a retry that cannot succeed, and it names no cause. Settings' own
 * path already degrades honestly for the missing `artefact` COLUMN
 * (`isMissingArtefact`); this is the same courtesy for a refused VALUE.
 *
 * Postgres 23514 is check_violation; the constraint's name is in the message
 * and, on PostgREST, in `details` too.
 */
export function isUnsupportedCadence(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string | null; message?: string | null; details?: string | null }
  if ((e.code ?? '') !== '23514') return false
  const said = `${e.message ?? ''} ${e.details ?? ''}`
  return said.includes('report_schedules_cadence_check')
}

/** What to tell the person, in the product's own words for "not shipped yet"
 *  — the sentence Settings › Reports and recipients already uses. */
export const CADENCE_NOT_STORED =
  'We cannot store that cadence yet — the part of the product that records it has not shipped.'
