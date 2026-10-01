import type { SupabaseClient } from '@supabase/supabase-js'
import { hydrateData } from '../snapshots'
import { resolvedQuote } from '../reports/weekly-read'
import { loadPublishedWeekRead } from '../written/published'
import type { SubjectReadLine } from './subjects-view'

// The week read's line on one subject, for the Subjects pane: the writer's
// sentence, the conversations inside it and its one gated quote, as the
// pipeline froze them into the published `week_reads` row
// (lib/written/compose.ts). Nothing is re-derived: the page prints what the
// read says, and only for the read's own month (`subjectsView`).
//
// THE SERVICE ROLE, SCOPED BY THE CALLER. `week_reads` has no tenant policy
// (review L2), so the caller hands in the admin client and the session's
// client id, never one from the URL. One read for the row, and one for the
// quote's words where it has one (`hydrateData`, the share page's own path:
// a withdrawn comment resolves to nothing and the quote is not printed).

export async function loadSubjectReadLine(
  admin: SupabaseClient,
  clientId: string,
  subjectId: string,
): Promise<SubjectReadLine | null> {
  // The PUBLISHED read (lib/written/published.ts): under a review schedule,
  // the newest one that was sent, so the pane prints nothing Heinrich has not
  // approved.
  const row = await loadPublishedWeekRead(admin, clientId)
  const month = row?.data?.month ?? row?.month ?? null
  const standing = row?.data?.standing?.find((s) => s.subjectId === subjectId) ?? null
  if (!month || !standing || standing.calibration === 'failed') return null
  const quote = standing.quote ? resolvedQuote((await hydrateData(admin, { quote: standing.quote })).quote) : null
  return {
    month,
    sentence: standing.sentence ?? '',
    contents: Array.isArray(standing.contents) ? standing.contents.filter((c) => typeof c === 'string' && c.trim() !== '') : [],
    quote,
  }
}
