import { createAdminClient, selectAll } from '../supabase-admin'
import type { VideoRow } from './types'

// Cross-reference detection (Redesign Spec 2026-07-03 §8) — client-brand
// mentions in comments under competitor/industry videos. These are switching
// signals attributed to the client ("what their customers say about you" on
// the Competitive page), previously lost inside the competitor's bucket.
// Deterministic regex, no GPT. Re-derives the flags for the whole corpus each
// run (a comment's flag is a property of its text, so recomputing is idempotent
// and picks up keyword-config changes).

export interface CrossReferenceResult {
  commentsScanned: number
  mentionsFlagged: number
  flagsCleared: number
}

/** Word-boundary, case-insensitive matcher over the client's brand terms.
 *  Keywords are escaped literally; multi-word terms tolerate any whitespace. */
export function buildBrandMatcher(terms: string[]): RegExp | null {
  const cleaned = [...new Set(terms.map((t) => t.trim()).filter(Boolean))]
  if (cleaned.length === 0) return null
  const parts = cleaned.map((t) =>
    t
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+'),
  )
  // \b fails on terms starting/ending with non-word chars (e.g. "#runningblade");
  // lookarounds on word chars only apply where the term edge is a word char.
  return new RegExp(`(?<![\\w])(${parts.join('|')})(?![\\w])`, 'iu')
}

export async function runCrossReference(clientId: string): Promise<CrossReferenceResult> {
  const admin = createAdminClient()

  const [{ data: tc }, { data: client }] = await Promise.all([
    admin.from('tracking_configs').select('brand_keywords').eq('client_id', clientId).maybeSingle(),
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
  ])
  const matcher = buildBrandMatcher([
    ...(tc?.brand_keywords ?? []),
    ...(client?.company_name ? [client.company_name] : []),
  ])

  const result: CrossReferenceResult = { commentsScanned: 0, mentionsFlagged: 0, flagsCleared: 0 }
  if (!matcher) return result

  // Comments on NON-client videos only — a brand mention under the client's own
  // video is ordinary audience chatter, not a switching signal.
  const videos = await selectAll<Pick<VideoRow, 'platform' | 'video_id' | 'is_client'>>(() =>
    admin.from('videos').select('platform, video_id, is_client').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const nonClientVideos = new Set(videos.filter((v) => !v.is_client).map((v) => `${v.platform}::${v.video_id}`))

  const comments = await selectAll<{
    id: string; platform: string; video_id: string; text: string | null
    client_brand_mention: boolean; brand_mention_keyword: string | null
  }>(() =>
    admin
      .from('comments')
      .select('id, platform, video_id, text, client_brand_mention, brand_mention_keyword')
      .eq('client_id', clientId)
      .order('id', { ascending: true }),
  )

  const toFlag: { id: string; keyword: string }[] = []
  const toClear: string[] = []
  for (const c of comments) {
    const eligible = nonClientVideos.has(`${c.platform}::${c.video_id}`)
    if (eligible) result.commentsScanned++
    const match = eligible ? matcher.exec(c.text ?? '') : null
    if (match) {
      const keyword = match[1].toLowerCase()
      if (!c.client_brand_mention || c.brand_mention_keyword !== keyword) toFlag.push({ id: c.id, keyword })
    } else if (c.client_brand_mention) {
      toClear.push(c.id)
    }
  }

  // Batch by matched keyword, chunking each .in() — a long id list in the URL
  // is the same overflow that bit pass-a.ts at ~1k+ videos.
  const CHUNK = 200
  const byKeyword = new Map<string, string[]>()
  for (const f of toFlag) {
    const ids = byKeyword.get(f.keyword)
    if (ids) ids.push(f.id)
    else byKeyword.set(f.keyword, [f.id])
  }
  for (const [keyword, ids] of byKeyword) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { error } = await admin
        .from('comments')
        .update({ client_brand_mention: true, brand_mention_keyword: keyword })
        .in('id', ids.slice(i, i + CHUNK))
      if (error) throw new Error(`flag brand mentions: ${error.message}`)
    }
    result.mentionsFlagged += ids.length
  }
  for (let i = 0; i < toClear.length; i += CHUNK) {
    const { error } = await admin
      .from('comments')
      .update({ client_brand_mention: false, brand_mention_keyword: null })
      .in('id', toClear.slice(i, i + CHUNK))
    if (error) throw new Error(`clear brand mentions: ${error.message}`)
  }
  result.flagsCleared = toClear.length

  return result
}
