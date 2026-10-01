import { redirect } from 'next/navigation'
import { STUDIO_HREF } from '@/lib/studio-visibility'

// "New report" was always the Studio's; Reports folded into it on 1 Oct, so
// this lands there for every session (the Studio's own guard decides the rest).
export default function NewReportPage() {
  redirect(STUDIO_HREF)
}
