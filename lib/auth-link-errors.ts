/**
 * What a signed-out page says when an emailed link brought someone there
 * broken (finish-list item 25 polish). `/auth/callback` sends a spent or
 * expired reset link to `/reset?error=link_expired` and a link with no code to
 * `/login?error=link_invalid`; both pages used to ignore the parameter, so the
 * reader landed on a blank form with no idea why.
 *
 * The page decides the sentence, not the code: any `error` on the reset page
 * means "your link is no good, ask again", and any on the sign-in page means
 * "that link didn't work, here is the way in". A code nobody sends still gets
 * the page's sentence rather than silence.
 */

export type LinkPage = 'login' | 'reset'

const NOTICE: Record<LinkPage, string> = {
  login: 'That link didn’t work. It may have expired or been used already. Sign in below, or reset your password for a new link.',
  reset: 'That reset link has expired or was used already. Enter your email and we’ll send you a new one.',
}

/** The notice for `?error=` on a signed-out page, or null when there is none. */
export function linkNotice(page: LinkPage, error: string | string[] | undefined): string | null {
  const code = Array.isArray(error) ? error[0] : error
  return code ? NOTICE[page] : null
}

/**
 * Where `/auth/callback` sends a link that arrived without a code. Supabase
 * returns a spent or expired link to the redirect address with `error` and
 * `error_code` (e.g. `otp_expired`) and no code; for a reset link the page
 * that helps is the reset form, which can send a new one. Anything else lands
 * on sign in.
 */
export function codelessCallbackTarget(params: URLSearchParams, next: string): string {
  const failed = params.has('error') || params.has('error_code')
  return failed && next.startsWith('/reset') ? '/reset?error=link_expired' : '/login?error=link_invalid'
}
