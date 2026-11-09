import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../chunk'
import { selectAll } from '../supabase-admin'
import { isMissingTable } from './stored-prose'
import { REGATE_BACKUP_TABLE } from './youtube-refresh'

// The texts an erasure looks for (scripts/erase-commenter.ts): each matched
// comment's own words, AND their English. A non-English comment is quoted in
// the product through its translation (`comment_translations`, written by
// lib/pipeline/translate-quotes.ts: the whole comment, and the excerpts the
// product quotes), and the English is what a model working in English can
// repeat. The translation rows go with the comment (a foreign key); a copy of
// the English elsewhere does not, so it is looked for like the original.
// Translations a regate backed up are read from its backup.

/** Whitespace normalised, 8 characters or more, once each: the script's rule
 *  for what a stored string is searched for. Pure. */
export function erasedTexts(...groups: readonly (readonly (string | null | undefined)[])[]): string[] {
  const out = new Set<string>()
  for (const g of groups) for (const t of g) {
    const n = (t ?? '').replace(/\s+/g, ' ').trim()
    if (n.length >= 8) out.add(n)
  }
  return [...out]
}

/** The English of these comments, live and backed up. A database without the
 *  translations table (or without the backup) has none. */
export async function loadTranslations(admin: SupabaseClient, commentIds: readonly string[]): Promise<string[]> {
  if (!commentIds.length) return []
  const out: string[] = []
  const probe = await admin.from('comment_translations').select('comment_id').limit(1)
  const live = !probe.error || !isMissingTable(probe.error, 'comment_translations')
  if (probe.error && live) throw new Error(`read comment_translations: ${(probe.error as { message?: string }).message ?? probe.error}`)
  const backup = await admin.from(REGATE_BACKUP_TABLE).select('batch_id').limit(1)
  const backedUp = !backup.error || !isMissingTable(backup.error, REGATE_BACKUP_TABLE)
  if (backup.error && backedUp) throw new Error(`read ${REGATE_BACKUP_TABLE}: ${(backup.error as { message?: string }).message ?? backup.error}`)
  for (const part of chunk([...commentIds], 150)) {
    if (live) {
      const rows = await selectAll<{ english: string | null }>(() =>
        admin.from('comment_translations').select('english').in('comment_id', part)
          .order('comment_id', { ascending: true }).order('text_hash', { ascending: true }),
      )
      out.push(...rows.map((r) => r.english ?? ''))
    }
    if (backedUp) {
      const rows = await selectAll<{ row_data: { english?: string | null } | null }>(() =>
        admin.from(REGATE_BACKUP_TABLE).select('row_data')
          .eq('source_table', 'comment_translations').in('row_data->>comment_id', part)
          .order('batch_id', { ascending: true }).order('row_data->>text_hash', { ascending: true }),
      )
      out.push(...rows.map((r) => r.row_data?.english ?? ''))
    }
  }
  return out.filter(Boolean)
}
