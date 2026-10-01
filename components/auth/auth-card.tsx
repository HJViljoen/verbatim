import type { ReactNode } from 'react'
import { VerbatimMark } from '@/components/brand/mark'

// The one frame every signed-out page wears: sign in, sign up, the reset
// request, the new password and an invitation. They were two families: sign in
// on the crowd with a plain green square where the mark belongs, the rest on a
// bare grey page with the name alone. One frame, and the ditto mark the
// sidebar and the favicon already carry (components/brand/mark.tsx): the brand
// yellow, as the sidebar draws it, with the name beside it in ink.

/** The fields and the button inside the frame, so a form built from `Input`
 *  and `Button` matches the sign-in form's hand-written ones. */
export const AUTH_INPUT = 'h-auto rounded-xl bg-background/60 px-3.5 py-2.5 text-sm'
export const AUTH_BUTTON = 'h-auto w-full rounded-xl py-2.5 text-sm font-semibold cursor-pointer'

export function AuthCard({
  subtitle,
  notice,
  children,
}: {
  /** The line under the name: what this page is for. */
  subtitle?: ReactNode
  /** Why the reader landed here, when a link brought them broken
   *  (lib/auth-link-errors.ts). Sits above the form. */
  notice?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-10 overflow-hidden">
      <div className="crowd-bg" aria-hidden />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card ring-1 ring-border/70 shadow-tile-hover p-8">
        <div className="flex items-center gap-2.5 mb-1.5">
          <VerbatimMark size={24} className="shrink-0 text-brand" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Verbatim</h1>
        </div>
        {subtitle ? <p className="text-muted-foreground mb-7 text-sm">{subtitle}</p> : <div className="mb-6" />}
        {notice ? (
          <p role="status" className="mb-5 rounded-xl bg-muted px-3.5 py-2.5 text-sm text-foreground">
            {notice}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  )
}
