// ON THE PLATFORM, NOT EMAILED: the pure rule (the backfill, 1 Oct evening;
// migration 20261106090000_platform_publish.sql). A weekly build is on the
// client's platform when it was emailed (`status = 'sent'`) or when the
// operator put it there without its email (`published_at`, the writes in
// lib/schedules/publish.ts). The page gate (lib/written/published.ts), the
// held-build rule (lib/reports/held.ts) and the Studio all ask this one rule,
// which has no imports at all, so a page reader and a client component can
// both take it.

/** The Studio's words for a build that is on the platform and was not
 *  emailed (the lead's wording). */
export const PUBLISHED_NOT_EMAILED = 'On the platform · not emailed'

/** A send row as the platform rule reads it. `published_at` is optional: a
 *  row read before the migration, or by a select that does not name it, has
 *  none, and reads as not published. */
export interface PlatformSendState {
  status: string
  published_at?: string | null
}

/** Is this build on the client's platform: emailed, or published without an
 *  email? Pure. */
export function onPlatform(s: PlatformSendState): boolean {
  return s.status === 'sent' || (s.published_at != null && s.published_at !== '')
}

/** Published, and not (yet) emailed: the state the Studio names
 *  `PUBLISHED_NOT_EMAILED`. Pure. */
export function publishedNotEmailed(s: PlatformSendState): boolean {
  return s.status !== 'sent' && s.published_at != null && s.published_at !== ''
}

/** The `report_sends` columns are not in this database yet (the migration
 *  has not been applied): Postgres' undefined_column or PostgREST's. A reader
 *  then retries without them and reads every row as not published, which is
 *  what each one is. */
export function isMissingPublishColumns(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  // `isMissingColumnError`'s test (lib/supabase-admin.ts), restated so this
  // module stays importable from a client component: 42703 or PostgREST's
  // PGRST204, with the column named in the message.
  const { code, message } = error as { code?: string; message?: string }
  const named = /published_(?:at|by)/.test(message ?? '')
  return named && (code === '42703' || code === 'PGRST204')
}
