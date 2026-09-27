import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../chunk'
import type { KeywordRow } from '../provenance/searches'
import { selectAll } from '../supabase-admin'
import { foundSplit, searchesAddedIn, type FoundSplit, type ThemeEvidence } from './overview-market/provenance'

// Subjects' "Where we found them" (the approved preview's inner block under the
// pane's headline): the selected subject's videos this month on searches we
// ran before the month, against those found only on searches we added in it,
// by the rule the front page's settled figure uses (`foundSplit`, pure, in
// overview-market/provenance.ts, where the tests are). I/O glue, not tested
// (AGENTS.md).
//
// THE READS. `keyword_performance` once (paged; it names when each search
// first ran), started with the page's month reads and taken by the pane; then,
// only where the month added a search, the three reads the front page's lead
// and Conversation's board make over a theme's videos (`loadThemeEvidence` in
// overview.ts), here over the subject's: `video_provenance`, the videos'
// source_keywords and every gate verdict's keyword, one chunk each at a
// subject's size. Written here rather than imported: overview.ts is not in
// this page's module graph, and importing it would bring the front page's
// whole loader in with it.
//
// FAILS CLOSED: any read that fails, or MF1's table not being there, gives
// null, which the pane prints as nothing, never as a zero.
//
// CLIENT-SAFE IMPORTS ONLY. lib/pages/subjects.ts, which imports this file, is
// also imported by a client component (components/subjects/subject-editor.tsx),
// so nothing here may reach a Node built-in: lib/provenance/load.ts'
// `isMissingObject` (it imports node:fs) is written out below instead.

/** Is this error "that table is not there" (MF1 not applied)? */
const isMissing = (error: unknown, name: string): boolean => {
  const text = String((error as { message?: string })?.message ?? error)
  return text.includes(name) && /schema cache|does not exist|Could not find/i.test(text)
}

/** Every keyword_performance row of the tenant (when each search ran), or
 *  null where it could not be read. */
export function loadKeywordRuns(client: SupabaseClient, clientId: string): Promise<KeywordRow[] | null> {
  return selectAll<KeywordRow>(() =>
    client.from('keyword_performance').select('run_id, platform, keyword, created_at').eq('client_id', clientId).order('id'),
  ).catch((error: unknown) => {
    console.error(`[subjects] where we found them, keyword_performance: ${(error as { message?: string })?.message ?? String(error)}; not measured`)
    return null
  })
}

/** Where the subject's `videoIds` were found (`foundSplit`), or null. */
export async function loadSubjectFound(
  client: SupabaseClient,
  clientId: string,
  month: string,
  videoIds: readonly string[],
  keywordRuns: Promise<KeywordRow[] | null>,
): Promise<FoundSplit | null> {
  if (videoIds.length === 0) return null
  const kp = await keywordRuns
  // No search first run in the month: nothing to split, and no read spent.
  if (!kp || searchesAddedIn(month, kp).size === 0) return null
  const evidence = await loadEvidence(client, clientId, videoIds).catch((error: unknown) => {
    if (!isMissing(error, 'video_provenance')) {
      console.error(`[subjects] where we found them: ${(error as { message?: string })?.message ?? String(error)}; not measured`)
    }
    return null
  })
  return evidence ? foundSplit(videoIds, evidence, kp, month) : null
}

/** The evidence `foundSplit` reads, over these videos. Throws on a failed read. */
async function loadEvidence(client: SupabaseClient, clientId: string, videoIds: readonly string[]): Promise<ThemeEvidence> {
  const provenance: ThemeEvidence['provenance'][number][] = []
  const videos: ThemeEvidence['videos'][number][] = []
  for (const part of chunk([...videoIds], UUID_IN_CHUNK)) {
    const [p, v] = await Promise.all([
      client.from('video_provenance').select('video_id, first_terms, first_subreddits, method').eq('client_id', clientId).in('video_id', part),
      client.from('videos').select('id, platform, video_id, source_keywords').eq('client_id', clientId).in('id', part),
    ])
    if (p.error) throw p.error
    if (v.error) throw v.error
    provenance.push(...((p.data ?? []) as typeof provenance))
    videos.push(...((v.data ?? []) as typeof videos))
  }
  // Every gate verdict's keyword for these videos, by the platform's own id.
  const verdicts: ThemeEvidence['verdicts'][number][] = []
  for (const part of chunk([...new Set(videos.map((v) => v.video_id))], UUID_IN_CHUNK)) {
    verdicts.push(...await selectAll<ThemeEvidence['verdicts'][number]>(() =>
      client.from('gate_verdicts').select('platform, video_id, keyword').eq('client_id', clientId).in('video_id', part).order('id'),
    ))
  }
  return { provenance, videos, verdicts }
}
