'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AuthCard, AUTH_INPUT, AUTH_BUTTON } from '@/components/auth/auth-card'
import { LegalConsent } from '@/components/legal-consent'
import { signUp, type SignupState } from './actions'

const idleSignup: SignupState = { ok: false, message: '' }

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUp, idleSignup)

  return (
    <AuthCard subtitle="Create your account">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Your name</label>
          <Input className={AUTH_INPUT} name="full_name" required placeholder="Jordan Lee" disabled={pending} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Work email</label>
          <Input className={AUTH_INPUT} name="email" type="email" required placeholder="you@brand.com" disabled={pending} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <Input className={AUTH_INPUT} name="password" type="password" required minLength={8} placeholder="At least 8 characters" disabled={pending} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Invite code</label>
          <Input className={AUTH_INPUT} name="invite_code" required placeholder="From your invitation" disabled={pending} />
          <p className="mt-1 text-xs text-muted-foreground">
            Verbatim is invite-only while we work with our first partners.{' '}
            <a href="https://verbatimintel.com" className="cursor-pointer text-foreground underline">Request access</a>.
          </p>
        </div>

        <LegalConsent disabled={pending} />

        {state.message && (
          <p className="text-sm text-destructive">
            {state.message}
            {state.needsLogin && (
              <> <Link href="/login" className="underline">Sign in</Link></>
            )}
          </p>
        )}

        <Button type="submit" disabled={pending} className={AUTH_BUTTON}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground underline">Sign in</Link>
      </p>
    </AuthCard>
  )
}
