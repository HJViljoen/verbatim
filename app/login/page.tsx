'use client'

import { use, useActionState } from 'react'
import Link from 'next/link'
import { linkNotice } from '@/lib/auth-link-errors'
import { AuthCard } from '@/components/auth/auth-card'
import { login, type LoginState } from './actions'

const idle: LoginState = { message: '' }

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const [state, formAction, pending] = useActionState(login, idle)
  const notice = linkNotice('login', use(searchParams).error)

  return (
    <AuthCard subtitle="Consumer intelligence, in their own words." notice={notice}>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            disabled={pending}
            className="w-full rounded-xl border border-input bg-background/60 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            disabled={pending}
            className="w-full rounded-xl border border-input bg-background/60 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
          />
        </div>

        {state.message && <p className="text-destructive text-sm">{state.message}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:brightness-110 active:translate-y-px disabled:opacity-50 transition cursor-pointer"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/reset" className="font-medium text-foreground hover:underline">Forgot your password?</Link>
      </p>

      <p className="mt-2 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-foreground hover:underline">Sign up</Link>
      </p>
    </AuthCard>
  )
}
