'use client'

import { use, useActionState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { linkNotice } from '@/lib/auth-link-errors'
import { AuthCard, AUTH_INPUT, AUTH_BUTTON } from '@/components/auth/auth-card'
import { requestReset, type ResetState } from './actions'

const idle: ResetState = { ok: false, message: '' }

export default function ResetRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const [state, formAction, pending] = useActionState(requestReset, idle)
  // Once a new link is on its way, the old link's notice has said its piece.
  const { error } = use(searchParams)
  const notice = state.ok ? null : linkNotice('reset', error)

  return (
    <AuthCard subtitle="Reset your password" notice={notice}>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Work email</label>
          <Input className={AUTH_INPUT} name="email" type="email" autoComplete="email" required placeholder="you@brand.com" disabled={pending} />
        </div>

        {state.message && (
          <p className={`text-sm ${state.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{state.message}</p>
        )}

        <Button type="submit" disabled={pending} className={AUTH_BUTTON}>
          {pending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it? <Link href="/login" className="text-foreground underline">Sign in</Link>
      </p>
    </AuthCard>
  )
}
