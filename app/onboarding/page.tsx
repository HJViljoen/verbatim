import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { OnboardingForm } from './onboarding-form'

// Workspace setup for a signed-in user who has no membership yet (just signed
// up, or abandoned an invite). Owners land here once; everyone with a workspace
// is bounced to the dashboard.
export default async function OnboardingPage() {
  const { user } = await requireUser()

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) redirect('/dashboard')

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-background p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Set up your workspace</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          A few details so SocialLens knows what to track. You can change all of this later in Settings.
        </p>
        <OnboardingForm />
      </div>
    </div>
  )
}
