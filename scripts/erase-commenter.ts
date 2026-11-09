import { createHash } from 'node:crypto'
import { chunk } from '../lib/chunk'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { authorKey, handleVariants } from '../lib/gather/suppression'
import { deleteCommentsProperly } from '../lib/retention/youtube-refresh-io'
import { AI_LOG_BODY_RETENTION_DAYS, DEMO_CLIENT_ID } from '../lib/config'
import { markSnapshotsStale } from '../lib/artifacts'
import { scrubStoredPlanChecks, scrubStoredPostIdeas } from '../lib/retention/stored-prose'
import { deleteHeldBy, ERASURE_CLOCK_MARGIN_MS, loadRunsSince, runErasure, unfinishedMessage } from '../lib/retention/erase-run'
import { ANALYSIS_PROSE_TABLES, scrubStoredProse } from '../lib/retention/analysis-prose'
import { deletePendingSnapshotFiles, recordSnapshotFiles, storedObjectsOf } from '../lib/retention/snapshot-files'
import { erasedTexts, loadTranslations } from '../lib/retention/erased-texts'
import { escapeLike, findBackedUpComments, removeBackedUpCopies, scrubRegateBackup } from '../lib/retention/regate-backup-erase'
import { scrubRawPayloads } from '../lib/retention/raw-payloads-erase'

// Erase one commenter on request (Tier 1.5, 2026-08-22). The privacy notice
// says: write with the handle and platform and we will remove the comments tied
// to it, within 7 days. This is the runbook, as code. Dry-run by default; the
// SLA is met by running it, not by promising it.
//
//   node --env-file=.env.local --import tsx scripts/erase-commenter.ts \
//     --platform youtube --handle "@someone" [--apply] [--note "ticket/email ref"]
//
// What it touches, in order:
//   1. comments rows on that platform whose author matches the handle
//      (case-insensitive, with or without a leading '@'), across EVERY tenant.
//   1b. the same author's comments a regate removed and kept in `regate_backup`
//      for 30 days (lib/retention/regate-backup-erase.ts): their words are looked
//      for like the live ones', and an undo must never put them back.
//   2. the demo tenant's clone of those rows. The clone keeps platform +
//      comment_id unchanged, so it is found by THAT (verified on prod: 156/156
//      YouTube clones match by comment_id, 0 by pseudonym — source author
//      strings changed shape when YouTube moved from Apify to the API). The
//      pseudonym is only a secondary net: the Tier 0 migration hashed with md5
//      (20260820130000_demo_pseudonymise.sql), a re-seed hashes with sha256
//      (scripts/seed-demo.ts) — both shapes are tried.
//   3. what the delete cascades: insight_evidence and language_samples (FKs),
//      counted so the reply can say how many insights lost a quote.
//   4. hero_quote copies in recommendations / market_insights /
//      competitive_insights / account_events (no FK — verbatim text that would
//      otherwise survive), nulled where they quote one of the erased comments.
//   5. ai_call_log prompt bodies inside the 30-day window that carry the text
//      (older bodies are already stripped by the retention sweep), nulled.
//   6. a suppressed_commenters row per key variant, so a re-scrape never brings
//      the handle back (lib/gather/suppression.ts filters at ingest).
//   7. weekly_reports.html_content — the stored copy of every report we sent —
//      scrubbed of the erased text (raw and HTML-escaped forms), best-effort.
//   7b. plan_checks / plan_check_evaluations — an Ask answer's `theySay` and
//      its judgement are model prose written after the model was shown real
//      comments, so they can carry the commenter's words even though no quote
//      field is stored. Scrubbed the same way. (The insight ids those rows
//      store resolve through evidence rows already deleted in step 3, so the
//      live quote panel goes empty on its own.)
//   7e. post_ideas — what a post should cover and its sub-questions' labels
//      are model prose written from comments sent to the model; scrubbed the
//      same way.
//   7f. the analysis's own prose (lib/retention/analysis-prose.ts): insights,
//      themes and their registry, market and competitive insights,
//      recommendations, account events, the run's brief, the profiles, the
//      written reads, statement readings, held brief headlines, the frozen
//      snapshots and the report documents, one step a table. A text of one
//      word is not looked for there (it would erase other people's words).
//      A snapshot is put on the stored files' pending list before its words
//      are scrubbed, and every run then deletes every version of every listed
//      snapshot's files and clears its record (lib/retention/snapshot-files.ts):
//      a delete that fails stays listed, fails the step, and is retried.
//   7g. the regate backup's prose (an insight's, an event's), scrubbed the same way.
//   9. with the delete: the regate backup's copies of these comments and the
//      rows hanging off them, removed; and not at all while an update is
//      running for one of the workspaces, or if one started or finished since
//      this script began (lib/retention/erase-run.ts, rule 4).
// Every text is looked for in its own words and in its stored English
// (lib/retention/erased-texts.ts).
// The ORDER they run in is not that list's (lib/retention/erase-run.ts):
// matching (1, 2), suppression (6) first, every scrub (5, 7, 7b to 7e) each on
// its own with a failure logged and the next one run, and the delete (3, 4,
// 8) LAST, only where every scrub succeeded, so a re-run still finds the
// comments' words. A run that did not finish exits 1 and prints no reply.
//   7h. video_raw, the raw actor payloads (30 days): an Instagram post's item
//      very likely carries its latest comments with their authors; this
//      handle's are dropped and the words scrubbed, on every tenant's rows of
//      the platform (lib/retention/raw-payloads-erase.ts). Unconfirmed shape:
//      the step changes nothing where the payload holds no such comment.
// What it cannot undo, and the reply must say so: reports already emailed;
// OpenAI's copy of API inputs for its retention period (until zero-data-retention).
// What it cannot find: a model's paraphrase of the words, or a part of a comment
// quoted without the rest. It matches a comment's whole text, nothing looser.

interface Args { platform: string; handle: string; apply: boolean; note: string }
function parseArgs(argv: string[]): Args {
  const a: Args = { platform: '', handle: '', apply: false, note: '' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--platform') a.platform = argv[++i]
    else if (argv[i] === '--handle') a.handle = argv[++i]
    else if (argv[i] === '--apply') a.apply = true
    else if (argv[i] === '--note') a.note = argv[++i]
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (!['youtube', 'tiktok', 'instagram', 'reddit'].includes(a.platform)) throw new Error('--platform must be youtube | tiktok | instagram | reddit')
  if (!a.handle?.trim()) throw new Error('--handle is required')
  return a
}

/** Both pseudonym shapes the demo has carried: md5 (Tier 0 migration) and
 *  sha256 (scripts/seed-demo.ts pseudonymise). Secondary net only — the primary
 *  match is by comment_id. */
function demoPseudonyms(author: string): string[] {
  return ['md5', 'sha256'].map((alg) => `user_${createHash(alg).update(author).digest('hex').slice(0, 8)}`)
}

// PostgREST turns '*' into '%' inside ilike patterns, so a display name like
// "**Sarah**" would otherwise match every author containing "sarah" — escape it
// too (`escapeLike`), and post-filter in JS for exact (case-insensitive)
// equality anyway.

interface CommentRow { id: string; client_id: string; author: string | null; text: string | null; platform: string; video_id: string; comment_id: string }

async function main() {
  // When this erasure began, for rule 4 (lib/retention/erase-run.ts): an update
  // that starts or finishes after it holds the delete back.
  const since = new Date(Date.now() - ERASURE_CLOCK_MARGIN_MS).toISOString()
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()
  const bare = args.handle.trim().replace(/^@/, '').replace(/^\/?u\//i, '')
  const patterns = [...new Set([bare, `@${bare}`, ...(args.platform === 'reddit' ? [`u/${bare}`, `/u/${bare}`] : [])])]
  const patternSet = new Set(patterns.map((p) => p.toLowerCase()))

  console.log(`erase-commenter · platform=${args.platform} · handle="${args.handle}" · ${args.apply ? 'APPLY' : 'DRY RUN (add --apply to execute)'}\n`)

  // 1. Real rows across every tenant (ilike without wildcards = case-insensitive equality).
  const found = new Map<string, CommentRow>()
  for (const p of patterns) {
    const rows = await selectAll<CommentRow>(() =>
      admin.from('comments').select('id, client_id, author, text, platform, video_id, comment_id').eq('platform', args.platform).ilike('author', escapeLike(p)).order('id', { ascending: true }),
    )
    for (const r of rows) if (r.author && patternSet.has(r.author.trim().toLowerCase())) found.set(r.id, r)
  }
  // 1b. Comments a regate removed and kept in its backup (30 days): not in
  //     `comments`, but their words are this person's and an undo would put
  //     them back.
  const backupOnly = new Set<string>()
  for (const b of await findBackedUpComments(admin, args.platform, patterns)) {
    if (!found.has(b.id)) { found.set(b.id, b); backupOnly.add(b.id) }
  }
  const exactAuthors = [...new Set([...found.values()].map((r) => r.author).filter((a): a is string => !!a))]

  // 2. Demo clones — by comment_id first (the clone keeps it), pseudonyms second.
  const realCommentIds = [...new Set([...found.values()].filter((r) => r.client_id !== DEMO_CLIENT_ID).map((r) => r.comment_id))]
  const demoRows: CommentRow[] = []
  for (const part of chunk(realCommentIds, 200)) {
    demoRows.push(...await selectAll<CommentRow>(() =>
      admin.from('comments').select('id, client_id, author, text, platform, video_id, comment_id').eq('client_id', DEMO_CLIENT_ID).eq('platform', args.platform).in('comment_id', part).order('id', { ascending: true }),
    ))
  }
  const pseudonyms = [...new Set([...exactAuthors, ...handleVariants(args.handle)].flatMap(demoPseudonyms))]
  demoRows.push(...await selectAll<CommentRow>(() =>
    admin.from('comments').select('id, client_id, author, text, platform, video_id, comment_id').eq('client_id', DEMO_CLIENT_ID).eq('platform', args.platform).in('author', pseudonyms).order('id', { ascending: true }),
  ))
  for (const r of demoRows) found.set(r.id, r)

  const rows = [...found.values()]
  const byClient = new Map<string, number>()
  for (const r of rows) byClient.set(r.client_id, (byClient.get(r.client_id) ?? 0) + 1)
  console.log(`comments matched: ${rows.length} (${rows.filter((r) => r.client_id === DEMO_CLIENT_ID).length} of them demo-tenant clones, ${backupOnly.size} only in the regate backup)`)
  for (const [c, n] of byClient) console.log(`   ${c === DEMO_CLIENT_ID ? 'DEMO' : c}: ${n}`)
  console.log(`author strings seen: ${exactAuthors.map((a) => JSON.stringify(a)).join(', ') || '(none)'}`)
  if (!rows.length) {
    console.log('\nnothing to erase. Suppression will still be recorded with --apply so a future scrape never adds this handle.')
  }

  const clientIds = [...byClient.keys()]
  // Each comment's words, and their English where the product translated them.
  const texts = erasedTexts(rows.map((r) => r.text), await loadTranslations(admin, rows.map((r) => r.id)))
  let editsScrubbed = 0
  // Rule 4, at the start: an update already running will hold the delete back.
  const runningAtStart = deleteHeldBy(await loadRunsSince(admin, clientIds, since), since)
  if (runningAtStart.length) {
    console.log(`an update is running for ${runningAtStart.map((l) => `${l.clientId} (run ${l.runId})`).join(', ')}: the scrubs run, the delete will wait for it`)
  }
  // Filled by the delete step (a holder: an assignment inside a closure is not
  // seen by the type narrowing at the reply template).
  const deleted: { del: Awaited<ReturnType<typeof deleteCommentsProperly>> | null } = { del: null }

  // THE ORDER (lib/retention/erase-run.ts): suppression first; then every
  // scrub of stored text, each on its own, a failure logged and the next one
  // run; then the comments are deleted, LAST and only where every scrub
  // succeeded, because a scrub needs their words to find them: while one has
  // failed they stay, and a re-run finds them and tries again.
  // Every key variant we know of: what suppression records, and what the raw
  // payloads are searched by.
  const keys = [...new Set([authorKey(args.platform, args.handle), ...exactAuthors.map((a) => authorKey(args.platform, a))].filter((k): k is string => !!k))]
  const outcome = await runErasure({
    suppress: {
      name: 'suppression',
      run: async () => {
        // 6. Suppression — every key variant we know of.
        console.log(`suppression keys (${args.platform}): ${keys.join(', ')} → ${args.apply ? 'recorded' : 'would be recorded'}`)
        if (args.apply && keys.length) {
          const { error } = await admin.from('suppressed_commenters').upsert(
            keys.map((k) => ({ platform: args.platform, author_key: k, note: args.note || null })),
            { onConflict: 'platform,author_key' },
          )
          if (error) throw new Error(`suppress: ${error.message}`)
        }
      },
    },
    scrubs: [
      {
        name: 'ai_call_log bodies',
        run: async () => {
          // 5. ai_call_log bodies inside the window that carry the text.
          let bodiesMatched: string[] = []
          if (clientIds.length && texts.length) {
            const since = new Date(Date.now() - AI_LOG_BODY_RETENTION_DAYS * 86_400_000).toISOString()
            const logs = await selectAll<{ id: string; request: { user?: string } | null }>(() =>
              admin.from('ai_call_log').select('id, request').in('client_id', clientIds).gte('created_at', since).not('request', 'is', null).order('id', { ascending: true }),
            )
            bodiesMatched = logs.filter((l) => { const u = String(l.request?.user ?? ''); return texts.some((t) => u.includes(t)) }).map((l) => l.id)
            console.log(`ai_call_log bodies in the last ${AI_LOG_BODY_RETENTION_DAYS}d carrying the text: ${bodiesMatched.length} of ${logs.length} scanned → ${args.apply ? 'nulled' : 'would be nulled'}`)
            if (args.apply) {
              for (const part of chunk(bodiesMatched, 200)) {
                const { error } = await admin.from('ai_call_log').update({ request: null, response: null }).in('id', part)
                if (error) throw new Error(`null ai_call_log bodies: ${error.message}`)
              }
            }
          }
        },
      },
      {
        name: 'stored report copies',
        run: async () => {
          // 7. Stored report copies — the LEGACY weekly_reports rows only (nothing has
          //    written there since Stage 3; a scheduled send stores ids, and its
          //    snapshot is caught by step 6 like any other). Best-effort: the renderer
          //    HTML-escaped text, so both the raw and the escaped forms are replaced.
          //    Reports already emailed cannot be recalled — the reply says so.
          let reportsScrubbed = 0
          if (clientIds.length && texts.length) {
            const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
            const needles = [...new Set(texts.flatMap((t) => [t, esc(t)]))]
            const reports = await selectAll<{ id: string; html_content: string }>(() =>
              admin.from('weekly_reports').select('id, html_content').in('client_id', clientIds).order('id', { ascending: true }),
            )
            for (const r of reports) {
              let html = r.html_content
              for (const n of needles) html = html.split(n).join('[removed at the commenter\'s request]')
              if (html !== r.html_content) {
                reportsScrubbed++
                if (args.apply) {
                  const { error } = await admin.from('weekly_reports').update({ html_content: html }).eq('id', r.id)
                  if (error) throw new Error(`scrub weekly_reports ${r.id}: ${error.message}`)
                }
              }
            }
            console.log(`stored report copies carrying the text: ${reportsScrubbed} of ${reports.length} → ${args.apply ? 'scrubbed' : 'would be scrubbed'}`)
          }
        },
      },
      {
        name: 'stored Ask answers',
        run: async () => {
          // 7b. Stored Ask answers. A plan check's model prose is written AFTER the
          //     model was shown real comments, so it can carry a commenter's words even
          //     though no quote field is stored: each claim's `theySay` and, since
          //     9 Nov, the judgement ("What I'd take from that", written from those
          //     readings), on the upload's row and on every re-reading's
          //     (lib/retention/stored-prose.ts). Nothing else reaches them: there is no
          //     FK, and the insight ids they store resolve through evidence rows that
          //     this script has already deleted. Same treatment as the report copies:
          //     replace the text in place, best effort.
          let askAnswersScrubbed = 0
          if (clientIds.length && texts.length) {
            askAnswersScrubbed = await scrubStoredPlanChecks(admin, clientIds, texts, { apply: args.apply })
            console.log(`stored Ask answers carrying the text: ${askAnswersScrubbed} → ${args.apply ? 'scrubbed' : 'would be scrubbed'}`)
          }
        },
      },
      {
        name: 'stored agent answers',
        run: async () => {
          // 7c. Stored Verbatim Agent turns. Same escape as 7b through a different
          //     door: `agent_messages.content` is the agent's own prose for an answer
          //     row, and `result.grounded[].text` is prose written AFTER the model was
          //     shown real comments — both can carry a commenter's words even though no
          //     quote text is stored anywhere in the table (CORRECTED 2026-08-22: it
          //     WAS, for a few hours — grounded[].quotes[].text held real comment text
          //     and this sweep walked straight past it. The route no longer stores it
          //     and the words resolve live, but this still scrubs those keys, because a
          //     sweep that only works if the writer behaved is not a sweep). The
          //     `nearest[]` and `judgement[]` registers are model prose written AFTER
          //     the model was shown real comments, so they are scrubbed too.
          //
          //     User rows are deliberately NOT scrubbed: their `content` is the
          //     client's own question, not a third party's words, and rewriting a
          //     client's question would corrupt the demand-signal log this table exists
          //     to keep. If a question happened to quote a commenter verbatim it came
          //     from the client, not from us.
          let agentTurnsScrubbed = 0
          if (clientIds.length && texts.length) {
            interface AgentRow {
              id: string
              role: string
              content: string | null
              result: {
                answer?: string | null
                grounded?: { text?: string | null; quotes?: { text?: string | null }[] }[]
                nearest?: { text?: string | null }[]
                judgement?: { text?: string | null }[]
              } | null
            }
            const scrub = (s: string): string => {
              let out = s
              for (const t of texts) out = out.split(t).join('[removed at the commenter\'s request]')
              return out
            }
            const turns = await selectAll<AgentRow>(() =>
              admin
                .from('agent_messages')
                .select('id, role, content, result')
                .in('client_id', clientIds)
                .eq('role', 'agent')
                .order('id', { ascending: true }),
            )
            for (const row of turns) {
              const patch: { content?: string; result?: unknown } = {}
              if (typeof row.content === 'string') {
                const cleaned = scrub(row.content)
                if (cleaned !== row.content) patch.content = cleaned
              }
              const res = row.result
              if (res && typeof res === 'object') {
                let touched = false
                const mapText = <T extends { text?: string | null }>(items: T[] | undefined): T[] | undefined => {
                  if (!Array.isArray(items)) return items
                  return items.map((it) => {
                    const text = typeof it?.text === 'string' ? it.text : null
                    if (!text) return it
                    const cleaned = scrub(text)
                    if (cleaned === text) return it
                    touched = true
                    return { ...it, text: cleaned }
                  })
                }
                const answer = typeof res.answer === 'string' ? scrub(res.answer) : res.answer
                if (typeof res.answer === 'string' && answer !== res.answer) touched = true
                // grounded[] needs both its own prose AND the quotes hanging off it.
                const grounded = Array.isArray(res.grounded)
                  ? mapText(res.grounded)?.map((g) => {
                      const gq = (g as { quotes?: { text?: string | null }[] }).quotes
                      if (!Array.isArray(gq)) return g
                      return { ...g, quotes: mapText(gq) }
                    })
                  : res.grounded
                const next = {
                  ...res,
                  answer,
                  grounded,
                  nearest: mapText(res.nearest),
                  judgement: mapText(res.judgement),
                }
                if (touched) patch.result = next
              }
              if (!patch.content && !patch.result) continue
              agentTurnsScrubbed++
              if (args.apply) {
                const { error } = await admin.from('agent_messages').update(patch).eq('id', row.id)
                if (error) throw new Error(`scrub agent_messages ${row.id}: ${error.message}`)
              }
            }
            console.log(`stored agent answers carrying the text: ${agentTurnsScrubbed} → ${args.apply ? 'scrubbed' : 'would be scrubbed'}`)
          }
        },
      },
      {
        name: 'edited report text',
        run: async () => {
          // 7d. Operator edits of a written report. `report_edits.text` is a person's
          //     own words typed over a block, saved literally (no scrub at write
          //     time, deliberately) — so an operator who quoted a commenter while
          //     editing has put that commenter's words in a table nothing else
          //     reaches: the snapshot's own quotes are refs, and this text is not.
          //     Same treatment as the report copies, and the snapshot's artifacts are
          //     staled so the next download re-renders without the words.
          if (clientIds.length && texts.length) {
            const stored = await selectAll<{ id: string; snapshot_id: string; text: string }>(() =>
              admin.from('report_edits').select('id, snapshot_id, text').in('client_id', clientIds).order('id', { ascending: true }),
            )
            const touchedSnapshots = new Set<string>()
            for (const row of stored) {
              let cleaned = row.text
              for (const t of texts) cleaned = cleaned.split(t).join('[removed at the commenter\'s request]')
              if (cleaned === row.text) continue
              editsScrubbed++
              touchedSnapshots.add(row.snapshot_id)
              if (args.apply) {
                const { error } = await admin.from('report_edits').update({ text: cleaned }).eq('id', row.id)
                if (error) throw new Error(`scrub report_edits ${row.id}: ${error.message}`)
              }
            }
            if (touchedSnapshots.size) {
              const staled = await markSnapshotsStale(admin, [...touchedSnapshots], { apply: args.apply })
              console.log(`edited report text carrying the words: ${editsScrubbed} of ${stored.length} → ${args.apply ? 'scrubbed' : 'would be scrubbed'}, ${staled.artifacts} export(s) ${args.apply ? 'flagged for re-render' : 'would be flagged'}`)
            } else {
              console.log(`edited report text carrying the words: 0 of ${stored.length}`)
            }
          }
        },
      },
      {
        name: 'stored post ideas',
        run: async () => {
          // 7e. The week's post ideas. Written from comments sent to the model by
          //     handle: a title or label that copies one is held at write time, but
          //     what the post should cover is never checked, so it can carry the
          //     commenter's words (lib/retention/stored-prose.ts). Same treatment.
          if (clientIds.length && texts.length) {
            const ideas = await scrubStoredPostIdeas(admin, clientIds, texts, { apply: args.apply })
            console.log(`stored post ideas carrying the text: ${ideas} → ${args.apply ? 'scrubbed' : 'would be scrubbed'}`)
          }
        },
      },
      // 7f. The analysis's own prose (lib/retention/analysis-prose.ts), one
      //     step a table, so a table that fails is named and the rest still run.
      ...ANALYSIS_PROSE_TABLES.map((spec) => ({
        name: `stored prose: ${spec.table}`,
        run: async () => {
          // The share page and "the email as sent" re-render from a snapshot,
          // so scrubbing it reaches them. A PDF or PNG built before the scrub
          // holds the words: the snapshot is put on the pending list first,
          // then every listed snapshot's files go (lib/retention/snapshot-files.ts).
          const isSnapshots = spec.table === 'report_snapshots'
          if (clientIds.length && texts.length) {
            const before = isSnapshots
              ? async (row: Record<string, unknown>) => {
                  await recordSnapshotFiles(admin, { clientId: String(row.client_id), snapshotId: String(row.id), platform: args.platform, authorKey: keys[0] ?? args.handle })
                }
              : undefined
            const r = await scrubStoredProse(admin, spec, clientIds, texts, { apply: args.apply, before })
            console.log(`${spec.table} carrying the text: ${r.rows} → ${args.apply ? 'scrubbed' : 'would be scrubbed'}`)
            if (isSnapshots && !args.apply) {
              for (const k of r.keys) {
                const paths = await storedObjectsOf(admin, String(k.client_id), String(k.id))
                if (paths.length) console.log(`   snapshot ${k.id}: ${paths.length} stored file(s) would be deleted (${paths.join(', ')})`)
              }
            }
          }
          if (!isSnapshots) return
          // The whole pending list, this request's and any earlier run's that
          // did not finish, so a delete that failed is tried again here.
          for (const d of await deletePendingSnapshotFiles(admin, { apply: args.apply })) {
            console.log(`   snapshot ${d.snapshotId}: ${d.paths.length} stored file(s) ${args.apply ? 'deleted, flagged to re-render' : 'listed from an earlier run, would be deleted'}${d.paths.length ? ` (${d.paths.join(', ')})` : ''}`)
          }
        },
      })),
      {
        name: 'regate backup prose',
        run: async () => {
          // 7g. The regate backup's prose (lib/retention/regate-backup-erase.ts).
          if (!clientIds.length || !texts.length) return
          const n = await scrubRegateBackup(admin, clientIds, texts, { apply: args.apply })
          console.log(`regate backup prose carrying the text: ${n} → ${args.apply ? 'scrubbed' : 'would be scrubbed'}`)
        },
      },
      {
        name: 'raw actor payloads',
        run: async () => {
          // 7h. On the handle alone, so it runs where no comment matched too.
          const n = await scrubRawPayloads(admin, args.platform, new Set(keys), texts, { apply: args.apply })
          console.log(`raw ${args.platform} payloads carrying the handle's comments or words: ${n} → ${args.apply ? 'scrubbed' : 'would be scrubbed'}`)
        },
      },
    ],
    erase: {
      name: 'delete the comments',
      run: async () => {
        // Not while an update is running for one of the workspaces, nor if one
        // started or finished since this script began (lib/retention/erase-run.ts,
        // rule 4): prose it wrote from these comments after the scrubs could
        // never be found once they are gone.
        const held = deleteHeldBy(await loadRunsSince(admin, clientIds, since), since)
        if (held.length) {
          const which = held.map((l) => `${l.clientId} (run ${l.runId}, ${l.why})`).join(', ')
          if (args.apply) throw new Error(`an update ran or is running for ${which} since this erasure began: it can have written these comments' words after the scrubs. Re-run when no update is running.`)
          console.log(`an update ran or is running for ${which}: with --apply the delete would wait`)
        }
        // 9. The regate backup's copies of these comments, and the rows hanging
        //    off them, before the comments themselves (a failure here leaves
        //    the comments for a re-run to find).
        const copies = await removeBackedUpCopies(admin, rows.map((r) => r.id), { apply: args.apply })
        console.log(`regate backup copies: ${copies.comments} comment row(s) + ${copies.dependents} row(s) hanging off them → ${args.apply ? 'deleted' : 'would be deleted'}`)
        // 3–4. Dependents + hero quotes, counted; deleted with --apply (cascade).
        const ids = rows.map((r) => r.id)
        let evidenceRows = 0
        let sampleRows = 0
        for (const part of chunk(ids, 200)) {
          const [ev, ls] = await Promise.all([
            admin.from('insight_evidence').select('id', { count: 'exact', head: true }).in('comment_id', part),
            admin.from('language_samples').select('id', { count: 'exact', head: true }).in('comment_id', part),
          ])
          evidenceRows += ev.count ?? 0
          sampleRows += ls.count ?? 0
        }
        const del = await deleteCommentsProperly(admin, rows, { dryRun: !args.apply })
        console.log(`\nwill ${args.apply ? '' : '(would) '}delete ${del.deleted} comment row(s) → cascades ${evidenceRows} evidence row(s) + ${sampleRows} language sample(s), touching ${del.insightsAffected} insight(s); hero quotes nulled: ${del.heroQuotesNulled}`)
        // 8. Stored exports (Reports & Exports): a PDF/PNG whose snapshot cited one of
        //    these voices has the words in a file. deleteCommentsProperly finds those
        //    snapshots by ref, deletes the files and flags the artifacts stale; the
        //    next download re-renders without the voice. Copies already downloaded
        //    or emailed are out of reach — say so in the reply.
        console.log(`stored exports carrying the voice: ${del.artifactsStaled} → ${args.apply ? 'files deleted, flagged for re-render' : 'would have files deleted + be flagged for re-render'}`)
      deleted.del = del
      },
    },
  })

  // A FAILED ERASURE NEVER READS AS A FINISHED ONE: no reply template, the
  // failed steps named, and exit 1.
  const unfinished = unfinishedMessage(outcome)
  if (unfinished) {
    console.error(`\n${unfinished}`)
    process.exitCode = 1
    return
  }

  console.log(`\n--- reply template ---
We have removed the ${rows.length} comment(s) tied to ${args.handle} on ${args.platform} from Verbatim, together with every quote of them in our analysis${deleted.del?.heroQuotesNulled ? ' and in report headlines' : ''}, and we have recorded the handle so it is not collected again.
What we cannot undo: report emails and exported files already sent or downloaded by our customers before your request, and our AI provider's copy of any analysis input for its own retention period (up to 30 days).${editsScrubbed ? '\nWhere one of our customers had typed your words into a report of their own, we have replaced them and the report will re-print without them.' : ''}
${args.apply ? '' : '(DRY RUN — nothing has been changed yet.)'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
