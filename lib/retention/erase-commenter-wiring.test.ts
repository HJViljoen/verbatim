import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { ANALYSIS_PROSE_TABLES } from './analysis-prose'

// THE WIRING (fresh review, 9 Nov): the real scripts/erase-commenter.ts, run
// end to end over a fake database and bucket in which every table the erasure
// is meant to reach holds the erased person's words. Only the admin client is
// stood in for. After an --apply run none of the words is left anywhere,
// another person's are untouched, the stored files are gone, and the comments
// and the backup's copies are deleted; with an update since the start, the
// scrubs run and the comments stay. Synthetic handles and words.

const holder = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('../supabase-admin', async (orig) => ({ ...(await orig<typeof import('../supabase-admin')>()), createAdminClient: () => holder.client }))

const ERASED = 'my socket rubs raw after an hour every single day'
const ERASED_BACKED_UP = 'the liner slipped twice on the stairs today'
const ERASED_DUTCH = 'mijn koker schuurt na een uur elke dag'
const ERASED_ENGLISH = 'my socket chafes after an hour every day'
const OTHER = 'my socket rubs a little after a long day'
const WORDS = [ERASED, ERASED_BACKED_UP, ERASED_ENGLISH]

const TEXT_ARRAY = new Set(['member_themes', 'supporting_theme_labels'])
const TEXT = new Set(['theme', 'description', 'label', 'canonical_label', 'title', 'finding', 'reasoning', 'explanation', 'headline', 'subject'])
const carrying = (column: string, said: string): unknown =>
  TEXT.has(column) ? `People keep saying "${said}" about the fit.`
    : TEXT_ARRAY.has(column) ? ['Fit', `Saying "${said}"`]
    : { kind: 'x', lines: [{ body: `One wrote "${said}".`, n: 3 }], quote: { ref: 'e:1', text: '' } }

function world(over: { runs?: Record<string, unknown>[] } = {}) {
  const now = new Date().toISOString()
  const prose = Object.fromEntries(ANALYSIS_PROSE_TABLES.map((spec) => {
    const row = (n: number, said: string) => ({
      ...Object.fromEntries(spec.key.map((k) => [k, k === 'id' ? `${spec.table}-${n}` : `${k}-${n}`])),
      client_id: 'c1',
      ...Object.fromEntries(spec.columns.map((c) => [c, carrying(c, said)])),
    })
    // The erased person's words (each kind of text in turn) and another's.
    return [spec.table, [row(1, ERASED), row(2, ERASED_BACKED_UP), row(3, ERASED_ENGLISH), row(4, OTHER)]]
  }))
  const tables: Record<string, Record<string, unknown>[]> = {
    ...prose,
    comments: [
      { id: 'k1', client_id: 'c1', author: '@SockFan', text: ERASED, platform: 'youtube', video_id: 'v1', comment_id: 'yt-k1' },
      { id: 'k4', client_id: 'c1', author: '@SockFan', text: ERASED_DUTCH, platform: 'youtube', video_id: 'v1', comment_id: 'yt-k4' },
      { id: 'k2', client_id: 'c1', author: '@someoneelse', text: OTHER, platform: 'youtube', video_id: 'v1', comment_id: 'yt-k2' },
    ],
    comment_translations: [{ client_id: 'c1', comment_id: 'k4', text_hash: 'h4', language: 'nl', english: ERASED_ENGLISH }],
    suppressed_commenters: [],
    insight_evidence: [],
    language_samples: [],
    pipeline_runs: over.runs ?? [],
    ai_call_log: [
      { id: 'l1', client_id: 'c1', created_at: now, request: { user: `[C1] ${ERASED}` }, response: { ok: 1 } },
      { id: 'l2', client_id: 'c1', created_at: now, request: { user: `[C1] ${OTHER}` }, response: { ok: 1 } },
    ],
    weekly_reports: [{ id: 'w1', client_id: 'c1', html_content: `<p>${ERASED}</p>` }],
    plan_checks: [{ id: 'pc1', client_id: 'c1', claims: [{ theySay: `They say "${ERASED}".` }], judgement: [{ text: `So: ${ERASED}` }] }],
    plan_check_evaluations: [],
    agent_messages: [{ id: 'm1', client_id: 'c1', role: 'agent', content: `One said ${ERASED}.`, result: { answer: `One said ${ERASED}.` } }],
    report_edits: [{ id: 'e1', client_id: 'c1', snapshot_id: 'report_snapshots-4', text: `Quoted: ${ERASED}` }],
    post_ideas: [{ id: 'p1', client_id: 'c1', title: 'What to wear under a liner', cover: { text: `Answer "${ERASED}" first.` }, subquestions: [] }],
    regate_backup: [
      { batch_id: 'b1', client_id: 'c1', source_table: 'comments', row_data: { id: 'k5', client_id: 'c1', author: '@sockfan', text: ERASED_BACKED_UP, platform: 'youtube', video_id: 'v9', comment_id: 'yt-k5' } },
      { batch_id: 'b1', client_id: 'c1', source_table: 'audience_insights', row_data: { id: 'i9', theme: 'Liner', description: `One said "${ERASED_BACKED_UP}".` } },
      { batch_id: 'b1', client_id: 'c1', source_table: 'insight_evidence', row_data: { id: 'e9', comment_id: 'k5', quote: 'slipped twice' } },
    ],
    video_raw: [{ id: 1, client_id: 'c1', platform: 'youtube', raw: { id: 'v1', latestComments: [{ ownerUsername: 'SockFan', text: 'nice one' }, { ownerUsername: 'someoneelse', text: OTHER }] } }],
    artifacts: [
      { id: 'a1', client_id: 'c1', snapshot_id: 'report_snapshots-1', storage_path: 'c1/report_snapshots-1/page-v2.pdf', stale: false },
      { id: 'a4', client_id: 'c1', snapshot_id: 'report_snapshots-4', storage_path: 'c1/report_snapshots-4/page-v1.pdf', stale: false },
    ],
    erasure_pending_files: [],
  }
  const objects = new Set(['c1/report_snapshots-1/page-v1.pdf', 'c1/report_snapshots-1/page-v2.pdf', 'c1/report_snapshots-4/page-v1.pdf'])
  const storage = {
    from: () => ({
      list: async (folder: string) => ({ data: [...objects].filter((p) => p.startsWith(`${folder}/`)).map((p) => ({ name: p.slice(folder.length + 1), id: p })), error: null }),
      remove: async (ps: string[]) => { for (const p of ps) objects.delete(p); return { data: ps, error: null } },
    }),
  }
  const db = fakeDb(tables)
  holder.client = { ...(db.client as object), storage }
  return { tables, objects }
}

/** Runs the script as `node scripts/erase-commenter.ts …` would, and waits
 *  for its last line. */
async function runScript(argv: string[]): Promise<{ out: string; err: string; exitCode: number | undefined }> {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.map(String).join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { err.push(a.map(String).join(' ')) })
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { err.push(`process.exit(${code})`) }) as never)
  process.argv = ['node', 'scripts/erase-commenter.ts', ...argv]
  vi.resetModules()
  await import('../../scripts/erase-commenter')
  await vi.waitFor(() => {
    const all = [...out, ...err].join('\n')
    if (!/--- reply template ---|ERASURE NOT FINISHED|process\.exit/.test(all)) throw new Error('still running')
  }, { timeout: 5000, interval: 5 })
  return { out: out.join('\n'), err: err.join('\n'), exitCode: process.exitCode as number | undefined }
}

const argv0 = process.argv
beforeEach(() => { process.exitCode = undefined })
afterEach(() => { vi.restoreAllMocks(); process.argv = argv0; process.exitCode = undefined })

describe('the erase script reaches every place it is meant to (end to end)', () => {
  it('--apply: none of the words is left, another person\'s are, the files and the copies are gone', async () => {
    const w = world()
    const run = await runScript(['--platform', 'youtube', '--handle', '@SockFan', '--apply', '--note', 'ticket-1'])
    expect(run.err).toBe('')
    expect(run.exitCode).toBeUndefined()
    expect(run.out).toContain('--- reply template ---')

    // Not one of the words anywhere: every scrub was called and did its job.
    // (A row that cascades from a deleted comment goes in the database with
    // it; the fake keeps no foreign keys, so those rows are set aside here.)
    const live = new Set(w.tables.comments.map((c) => c.id))
    const cascades = (table: string, r: Record<string, unknown>) =>
      ['comment_translations', 'insight_evidence', 'language_samples'].includes(table) && typeof r.comment_id === 'string' && !live.has(r.comment_id)
    for (const t of WORDS) {
      const holding = Object.entries(w.tables).flatMap(([table, rows]) => rows.filter((r) => !cascades(table, r) && JSON.stringify(r).includes(t)).map(() => table))
      expect(holding, t).toEqual([])
    }
    // Table by table, so a step that stops being wired names itself.
    for (const spec of ANALYSIS_PROSE_TABLES) {
      const rows = JSON.stringify(w.tables[spec.table])
      expect(rows, spec.table).toContain("[removed at the commenter's request]")
      expect(rows, spec.table).toContain(OTHER)
    }
    // The person's comments deleted (live and the backup's copy), another's kept.
    expect(w.tables.comments.map((c) => c.id)).toEqual(['k2'])
    expect(w.tables.regate_backup.map((r) => r.source_table)).toEqual(['audience_insights'])
    // Suppressed, the AI audit body nulled, the raw payload's comment dropped.
    expect(w.tables.suppressed_commenters.map((s) => s.author_key)).toEqual(['sockfan'])
    expect(w.tables.ai_call_log.map((l) => l.request === null)).toEqual([true, false])
    expect(JSON.stringify(w.tables.video_raw)).not.toContain('SockFan')
    // The scrubbed snapshot's files, every version; the other snapshot's file kept
    // (its edit was scrubbed through 7d, which stales and deletes it too).
    expect([...w.objects].filter((p) => p.includes('report_snapshots-1/'))).toEqual([])
    expect(w.tables.erasure_pending_files).toEqual([])
    expect(run.out).toMatch(/snapshot report_snapshots-1: 2 stored file\(s\) deleted/)
  })

  it('an update since the start: the scrubs run, the delete waits, exit 1', async () => {
    const w = world({ runs: [{ id: 'r1', client_id: 'c1', status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString() }] })
    const run = await runScript(['--platform', 'youtube', '--handle', '@SockFan', '--apply'])
    expect(run.exitCode).toBe(1)
    expect(run.err).toContain('ERASURE NOT FINISHED. Failed: delete the comments.')
    expect(run.err).toContain('run r1, started')
    expect(run.out).not.toContain('--- reply template ---')
    // The comments stay for a re-run; the prose is scrubbed already.
    expect(w.tables.comments.map((c) => c.id)).toEqual(['k1', 'k4', 'k2'])
    expect(JSON.stringify(w.tables.week_reads)).not.toContain(ERASED)
  })

  it('a dry run changes nothing', async () => {
    const w = world()
    const before = JSON.stringify(w.tables)
    const run = await runScript(['--platform', 'youtube', '--handle', '@SockFan'])
    expect(run.out).toContain('DRY RUN')
    expect(JSON.stringify(w.tables)).toBe(before)
    expect(w.objects.size).toBe(3)
  })
})
