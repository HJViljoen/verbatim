'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// State shape (a type) — the idle value lives in the client page; a 'use server'
// module may only export async functions. Mirrors app/signup + app/invite.
export interface LoginState {
  message: string
}

// Server-side sign-in. The browser posts credentials to this action (browser →
// our own domain → Supabase), so the browser never contacts Supabase directly —
// only app.verbatimintel.com needs allow-listing on managed/corporate devices.
// Session cookies are written by createServerSupabaseClient's cookie adapter and
// read by proxy.ts on the next request. Same mechanism as signup/invite sign-in.
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { message: 'Enter your email and password.' }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { message: error.message }
  redirect('/dashboard')
}

// Sign-out, also server-side (used by the sidebar) so the browser never calls
// Supabase for auth. Clears the session cookies and returns to /login.
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}
