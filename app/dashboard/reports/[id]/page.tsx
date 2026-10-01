import { redirect } from 'next/navigation'
import { STUDIO_HREF } from '@/lib/studio-visibility'

// An old link to one sent report: straight to it in the Studio's past issues
// (Reports folded into the Studio on 1 Oct), not through Reports' own redirect.
export default async function ReportViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`${STUDIO_HREF}?group=sent&item=${encodeURIComponent(id)}`)
}
