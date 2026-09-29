'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AuthCard, AUTH_INPUT, AUTH_BUTTON } from '@/components/auth/auth-card'
import { updatePassword, type ResetState } from '../actions'

const idle: ResetState = { ok: false, message: '' }

// Supabase's recovery link lands here with a session already established, so
// the form only has to set the new password. A stale link means no session,
// and the action says so rather than failing silently.
export default function ResetConfirmPage() {
  const [state, formAction, pending] = useActionState(updatePassword, idle)

  return (
    <AuthCard subtitle="Choose a new password">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">New password</label>
          <Input className={AUTH_INPUT}
            name="password" type="password" autoComplete="new-password"
            required minLength={8} placeholder="At least 8 characters" disabled={pending}
          />
        </div>

        {state.message && <p className="text-sm text-destructive">{state.message}</p>}

        <Button type="submit" disabled={pending} className={AUTH_BUTTON}>
          {pending ? 'Saving…' : 'Set password'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Need a new link? <Link href="/reset" className="text-foreground underline">Start over</Link>
      </p>
    </AuthCard>
  )
}
