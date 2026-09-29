import Link from 'next/link'
import { AuthCard } from '@/components/auth/auth-card'

// The 404 for any address nothing else claims (finish-list item 25 polish).
// There was no not-found file at all, so a mistyped or stale link got Next's
// bare "404 | This page could not be found" with no way back. The dashboard
// and the marketing site each have their own (inside the shell, and on the
// site's own chrome); this one is the frame the signed-out pages already wear.
// "/" is the right way back on both hosts: the app sends it to the dashboard
// (or sign in), the apex to the home page.
export default function NotFound() {
  return (
    <AuthCard subtitle="Page not found">
      <p className="text-sm text-muted-foreground">
        There’s nothing at this address. The link may be mistyped, or the page may have moved.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110"
      >
        Go to Verbatim
      </Link>
    </AuthCard>
  )
}
