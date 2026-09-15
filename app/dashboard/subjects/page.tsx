import { SurfaceShell } from '@/components/shell/surface-shell'

// Subjects — "how are we seen on this subject?" A new address in Phase 1
// (there has never been a /dashboard/subjects). WP12 fills it from
// lib/subjects/* and the month_subject_readings the pipeline now writes.

export default function Page() {
  return <SurfaceShell nav="subjects" />
}
