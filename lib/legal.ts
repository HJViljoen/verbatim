/**
 * The one mailbox a client or a commenter can write to (29 Sep 2026). A
 * rights channel that does not receive mail is worse than none: this is the
 * address that reaches Heinrich today. The site's footer prints it, and so
 * does every in-app line that tells a client to ask for something. Change it
 * only to another mailbox someone reads.
 *
 * Deliberately its own module with no server-only imports: client components
 * read it, and lib/site reads `next/headers`, which a client bundle cannot
 * import. (The legal pages' links lived here too until the pages came off the
 * site, 9 Nov 2026; see proxy.ts.)
 */
export const CONTACT_EMAIL = 'heinrichviljoen@verbatimintel.com'
