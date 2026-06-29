// Email delivery — stubbed until an email provider is wired (needs an account +
// API key, which is Heinrich's to provision).
//
// Every outbound email goes through this module so swapping in a real provider
// later (Resend / Postmark / SES) is one implementation change, not a hunt
// across the codebase. Until then, sends are logged no-ops — and the invite flow
// stays fully usable because the team UI surfaces the invite link for the owner
// to share manually.

export interface InviteEmail {
  to: string
  inviteUrl: string
  companyName: string
  invitedByEmail?: string
}

// Returns whether the email was actually dispatched. With no provider wired this
// is always false; callers fall back to showing the link in the UI.
export async function sendInviteEmail(invite: InviteEmail): Promise<{ sent: boolean }> {
  // TODO(email provider): when EMAIL_API_KEY etc. exist, dispatch a real email
  // here and return { sent: true }.
  console.log(
    `[email:stub] invite for "${invite.companyName}" -> ${invite.to}: ${invite.inviteUrl}`,
  )
  return { sent: false }
}
