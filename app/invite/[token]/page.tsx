import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { loadInvite } from './data'
import { AcceptButton, SignupAcceptForm } from './invite-ui'
import { AuthCard } from '@/components/auth/auth-card'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Join a workspace' }

// Public invite-acceptance page. Validates the token, then renders the right
// action based on the visitor's session. All authorization lives in
// acceptInvitation — this page only chooses what to show.

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AuthCard>
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      {children}
    </AuthCard>
  )
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { invite, reason } = await loadInvite(token)

  if (!invite) {
    return (
      <Shell title="Invite unavailable">
        <p className="text-sm text-muted-foreground">{reason}</p>
        <Link href="/login" className="mt-4 inline-block text-sm text-foreground underline">Go to sign in</Link>
      </Shell>
    )
  }

  // Company name for context (service role — the visitor has no tenant yet).
  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients').select('company_name').eq('id', invite.client_id).maybeSingle()
  const company = client?.company_name ?? 'a workspace'

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Signed in with a different email — must sign out first.
  if (user && (user.email ?? '').toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <Shell title={`Join ${company}`}>
        <p className="text-sm text-muted-foreground">
          This invite is for <strong>{invite.email}</strong>, but you’re signed in as{' '}
          <strong>{user.email}</strong>. Sign out and open this link again to accept.
        </p>
      </Shell>
    )
  }

  return (
    <Shell title={`Join ${company}`}>
      <p className="mb-5 text-sm text-muted-foreground">
        You’ve been invited to join <strong>{company}</strong> on Verbatim as{' '}
        {/^[aeiou]/i.test(invite.role) ? 'an' : 'a'} <strong>{invite.role}</strong>.
      </p>
      {user
        ? <AcceptButton token={token} />
        : <SignupAcceptForm token={token} email={invite.email} />}
    </Shell>
  )
}
