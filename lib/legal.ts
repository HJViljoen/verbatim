/**
 * Links to the public legal pages (T0-9, 2026-08-18).
 *
 * Deliberately its own module with no server-only imports: the consent line
 * renders inside client components (/signup, invite acceptance), and lib/site
 * reads `next/headers`, which a client bundle cannot import.
 *
 * The pages live on the apex; the app host 308s /site/* back to it, so in-app
 * links must be absolute. In local dev the apex is not a real host, so fall
 * back to the internal path the dev server actually serves.
 */
const ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
  (process.env.NODE_ENV === 'development' ? '/site' : 'https://verbatimintel.com')

export const PRIVACY_URL = `${ORIGIN}/privacy`
export const TERMS_URL = `${ORIGIN}/terms`

/**
 * The one mailbox a client or a commenter can write to (29 Sep 2026). A
 * rights channel that does not receive mail is worse than none: this is the
 * address that reaches Heinrich today. The legal pages print it, and so does
 * every in-app line that tells a client to ask for something. Change it only
 * to another mailbox someone reads.
 */
export const CONTACT_EMAIL = 'heinrichviljoen@verbatimintel.com'
