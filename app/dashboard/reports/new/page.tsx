import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import { canSeeStudio, STUDIO_HREF } from '@/lib/studio-visibility'

// The template picker moved into the Studio (Stage 3); old links land there.
// Since 2026-09-17 they land there only for someone who may see the Studio
// (lib/studio-visibility.ts) — a client following an old link is put on the
// Reports archive instead of a page nothing else mentions.
export default async function NewReportPage() {
  const session = await getSessionContext()
  redirect(canSeeStudio(session) ? STUDIO_HREF : '/dashboard/reports')
}
