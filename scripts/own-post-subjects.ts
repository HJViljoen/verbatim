import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { ANALYSIS_TEMPERATURE, SEALAND_CLIENT_ID } from '../lib/config'
import { chunk } from '../lib/chunk'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import {
  OWN_POST_JUDGE_MODEL, OWN_POST_JUDGE_PASS, OWN_POST_JUDGE_VERSION, OwnPostJudgeSchema,
  defaultSince, judgeCostEstimate, judgeMode, judgePosts, postsToJudge, readRowsFile, unfiledRows,
  type JudgeCall, type JudgePost, type JudgeSubject, type OwnPostSubjectInsert,
} from '../lib/own-posts/subject-judge'
import { TABLE_OWN_POST_SUBJECTS, isMissingOwnPostSubjects } from '../lib/reading/own-posts'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// The post-and-claim-to-subject judge's script (market-first WP3.6; MF3
// `own_post_subjects`). It files your own posts, and the claims on them,
// against your active subjects, so Your moves can say which posts touched a
// subject and count your claims by subject, and read "not checked yet"
// before they are filed.
//
// READ-ONLY BY DEFAULT: it prints the plan (the posts in the window, their
// claims, the subjects, what is already filed) and the price, and calls no
// model. Three other modes, by flags alone; it NEVER prompts, so it runs
// through `!`:
//
//   --spend --out <rows.json>          judge now (about $0.05 once, about $0.01
//                                      a month), write the rows to a local file,
//                                      insert nothing
//   --spend --apply --project <ref>    judge now and insert
//   --apply --from-file <rows.json>    insert an earlier --spend's file; no model
//
// `--project` is always required and allow-listed, and the Supabase URL must
// be that project's (`assertProject`, before any read). A model is reached
// ONLY with --spend (a dry run never calls one: plan §7 rule 8 counts a dry
// run that calls a model as spend). The spend waits for Heinrich's yes with
// deploy 5.
//
//   node --env-file=.env.local --import tsx scripts/own-post-subjects.ts --project <ref> \
//     [--client <uuid>] [--since YYYY-MM-DD] [--budget 0.20] \
//     [--spend [--out <rows.json>] [--apply] | --apply --from-file <rows.json>]

const NAME = 'own-post-subjects'
const ACTOR = `scripts/${NAME}.ts --apply`
const INSERT_CHUNK = 500

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME, values: ['since', 'budget', 'out', 'from-file'], flags: ['spend'], defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  const mode = judgeMode({ apply: args.apply, spend: args.flags.has('spend'), fromFile: args.values['from-file'] ?? null })
  console.log(modeLine(args, NAME))
  const admin = createAdminClient()

  // The judge's rows already held (none before MF3: the table is not there).
  let existing: { video_id: string; claim_id: string | null; subject_id: string; judge_version: string | null; method: string }[] | null
  try {
    existing = await selectAll(() => admin.from(TABLE_OWN_POST_SUBJECTS)
      .select('video_id, claim_id, subject_id, judge_version, method')
      .eq('client_id', args.clientId)
      .order('decided_at').order('video_id').order('subject_id').order('claim_id', { nullsFirst: true }))
  } catch (e) {
    if (!isMissingOwnPostSubjects(e)) throw e
    existing = null
  }
  if (existing == null) {
    console.log(`  ${TABLE_OWN_POST_SUBJECTS} is not there on ${args.project}: MF3 is not applied, so nothing can be written and every post reads "not checked yet"`)
    if (args.apply) throw new Error(`${NAME}: REFUSED: apply MF3 first. Nothing written.`)
  }

  if (mode === 'apply_file') {
    const rows = readRowsFile(JSON.parse(readFileSync(args.values['from-file'] as string, 'utf8')), args.clientId)
    await insertRows(admin, unfiledRows(rows, existing ?? []), rows.length)
    return
  }

  // What the judge reads: your posts in the window, the claims on them, and
  // your active subjects.
  const since = args.values.since ?? defaultSince(new Date().toISOString())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`${NAME}: --since takes YYYY-MM-DD, got ${since}`)
  const posts = await selectAll<{ id: string; caption: string | null; topics: string[] | null; transcript: string | null; transcript_en: string | null }>(() =>
    admin.from('videos')
      .select('id, caption, topics, transcript, transcript_en')
      .eq('client_id', args.clientId).eq('is_client', true).gte('upload_date', since)
      .order('id'))
  const claimRows = posts.length === 0 ? [] : (await Promise.all(chunk(posts.map((p) => p.id), 200).map((ids) =>
    selectAll<{ id: string; source_video_id: string; claim: string; quote: string | null }>(() =>
      admin.from('video_claims').select('id, source_video_id, claim, quote')
        .eq('client_id', args.clientId).eq('entity', 'client').in('source_video_id', ids).order('id'))))).flat()
  const subjects = await selectAll<JudgeSubject & { status: string }>(() =>
    admin.from('subjects').select('id, name, description, status').eq('client_id', args.clientId).eq('status', 'active').order('id'))

  // ONE CLAIM, ONE JUDGEMENT: rows repeating a claim across updates (Sealand,
  // staging: 120 rows, 98 distinct) are judged once, on the first row's id.
  const claimsOf = new Map<string, JudgePost['claims'][number][]>()
  const seen = new Set<string>()
  for (const c of claimRows) {
    const key = `${c.source_video_id}|${c.claim.toLowerCase().replace(/\s+/g, ' ').trim()}`
    if (seen.has(key)) continue
    seen.add(key)
    claimsOf.set(c.source_video_id, [...(claimsOf.get(c.source_video_id) ?? []), { id: c.id, claim: c.claim, quote: c.quote }])
  }
  const judgePostsIn: JudgePost[] = posts.map((p) => ({
    id: p.id, caption: p.caption, topics: p.topics, transcript: p.transcript_en ?? p.transcript, claims: claimsOf.get(p.id) ?? [],
  }))
  const todo = postsToJudge(judgePostsIn, subjects, existing ?? [])
  const budget = Number(args.values.budget ?? '0.20')
  if (!Number.isFinite(budget) || budget <= 0) throw new Error(`${NAME}: --budget takes dollars, got ${args.values.budget}`)
  console.log(`  posts since ${since}: ${posts.length} · claims on them: ${seen.size} distinct · active subjects: ${subjects.length}`)
  console.log(`  already filed under ${OWN_POST_JUDGE_VERSION}: ${(existing ?? []).filter((e) => e.judge_version === OWN_POST_JUDGE_VERSION).length} rows · posts still to judge: ${todo.length}`)
  console.log(`  price: about $${judgeCostEstimate(todo.length).toFixed(3)} at ${OWN_POST_JUDGE_MODEL} (budget $${budget.toFixed(2)})`)

  if (mode === 'plan') {
    console.log('read-only: no model called and nothing written (add --spend to judge; --spend --apply to judge and write)')
    return
  }

  // ── SPEND: the only path that reaches a model ─────────────────────────────
  const call = await openAiCall(args.apply ? admin : null, args.clientId)
  const res = await judgePosts({
    posts: todo, subjects, clientId: args.clientId, call, budgetUsd: budget, now: () => new Date().toISOString(), actorLabel: ACTOR,
  })
  console.log(`  judged: ${res.calls} calls · $${res.costUsd.toFixed(4)} · ${res.rows.length} rows · ${res.rows.filter((r) => r.touches).length} touching${res.failed.length ? ` · ${res.failed.length} posts unanswered (left unfiled)` : ''}${res.budgetStopped ? ' · stopped at the budget' : ''}`)
  if (args.values.out) {
    mkdirSync(dirname(args.values.out), { recursive: true })
    writeFileSync(args.values.out, JSON.stringify({ judge_version: OWN_POST_JUDGE_VERSION, client_id: args.clientId, rows: res.rows }, null, 2))
    console.log(`  rows written to ${args.values.out}`)
  }
  if (mode === 'judge') {
    console.log('nothing written to the database (add --apply to insert, or --apply --from-file with the file above)')
    return
  }
  await insertRows(admin, unfiledRows(res.rows, existing ?? []), res.rows.length)
}

/** Insert, append-only: a pair already filed under this version is skipped. */
async function insertRows(admin: ReturnType<typeof createAdminClient>, rows: OwnPostSubjectInsert[], of: number): Promise<void> {
  let written = 0
  for (const part of chunk(rows, INSERT_CHUNK)) {
    const { error } = await admin.from(TABLE_OWN_POST_SUBJECTS).insert(part)
    if (error) throw new Error(`${NAME}: stopped after ${written} rows: ${error.message}`)
    written += part.length
  }
  console.log(`APPLIED: ${written} rows inserted (${of - rows.length} already filed, skipped)`)
}

/**
 * The model call, built only on the spend path: the OpenAI client and the
 * structured-output helper are imported here, never at the top of the file,
 * so the read-only plan cannot construct them. Each call is logged to
 * `ai_call_log` when the run writes (`--apply`); a judge-only run writes
 * nothing to the database, its log included.
 */
async function openAiCall(admin: ReturnType<typeof createAdminClient> | null, clientId: string): Promise<JudgeCall> {
  const { openai } = await import('../lib/openai')
  const { zodResponseFormat } = await import('openai/helpers/zod')
  const { logAiCall } = await import('../lib/pipeline/ai-log')
  let index = 0
  return async ({ system, user }) => {
    const startedAt = Date.now()
    let parsed: unknown = null
    let error: string | null = null
    let usage = { prompt_tokens: 0, completion_tokens: 0 }
    try {
      const completion = await openai.chat.completions.parse({
        model: OWN_POST_JUDGE_MODEL,
        temperature: ANALYSIS_TEMPERATURE,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: zodResponseFormat(OwnPostJudgeSchema, 'own_post_subjects'),
      })
      const msg = completion.choices[0]?.message
      parsed = msg?.parsed ?? null
      error = msg?.refusal ?? (parsed ? null : 'no parsed output')
      usage = { prompt_tokens: completion.usage?.prompt_tokens ?? 0, completion_tokens: completion.usage?.completion_tokens ?? 0 }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    if (admin) {
      await logAiCall(admin, {
        clientId, runId: null, pass: OWN_POST_JUDGE_PASS, callIndex: ++index, model: OWN_POST_JUDGE_MODEL,
        promptVersion: OWN_POST_JUDGE_VERSION, systemPrompt: system, userPrompt: user, response: parsed, error,
        usage, durationMs: Date.now() - startedAt, validationStatus: parsed ? 'valid' : 'parse_error',
      })
    }
    return { parsed, usage, error }
  }
}

if (process.argv[1]?.endsWith(`${NAME}.ts`)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
