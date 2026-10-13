// The week's post ideas for one run (depth v2, T13): the run's question
// conversations its client's own posts have not touched, the writer's one
// call, the scrub and compose, printed as a readable rendering (the ideas top
// to bottom, then the workings) plus the stored rows as JSON.
//
//   node --env-file=.env.local --import tsx scripts/post-ideas.ts \
//     --client <uuid> [--run <uuid>] [--dry-run] [--out <file.md>]
//
// DRY BY DEFAULT (`--dry-run` says so out loud). Nothing is written to any
// database: no `post_ideas` row and no `ai_call_log` row. The call is still
// paid for (gpt-5.4 at medium effort, typically $0.05 to $0.15 a run; the
// answer is capped at 16,000 tokens, so never more than about $0.55 with its
// one retry). Without --run it reads the client's newest finished run with a
// window.
//
// --write stores the run's ideas as the step does (upsert on run_id, rank),
// logging the call to `ai_call_log`. It is a paste for Heinrich against
// production, the fallback when the step failed or was not deployed, and it
// refuses a run that already has ideas: `post_ideas` grants no DELETE, so a
// smaller set could not take back a rank a larger one wrote.
//
// --out <file.md> writes the rendering there and the JSON beside it
// (<file>.json). The rendering prints up to two of the comments behind each
// sub-question so a reader can judge the grouping: a stranger's words, for the
// operator's own machine only, never the repository or the vault.
//
// READING A PROMPT BEFORE PAYING FOR IT, without reading production twice:
//   --prompt-only [--save-inputs <file.json>]   reads the inputs, prints the
//       writer's two messages, saves what it read, and stops: no model call;
//   --inputs <file.json>   builds from saved inputs instead of reading them:
//       the model call, and no database read at all;
//   --recompose <file.json>   takes a dry run's own JSON (--out's) and
//       composes its saved writer output again under the code as it is now:
//       no model call and no read.
//
// .env.local IS PRODUCTION. It probes first (a timed read of the one client
// row) and will not go on if that takes over 3 s or fails: wait fifteen
// minutes. A run's inputs are about twenty small statements.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { workedLabel } from '../lib/pages/week'
import { subquestionCounts } from '../lib/post-ideas/types'
import {
  buildPostIdeas, existingPostIdeas, finishPostIdeas, loadPostIdeaInputs, ownedFrom, savePostIdeas,
  type BuiltPostIdeas, type PostIdeaInputs,
} from '../lib/post-ideas/step'
import { buildPostIdeaPrompts, POST_IDEAS_MODEL, type PostIdeasOutput } from '../lib/post-ideas/write'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const has = (name: string): boolean => args.includes(`--${name}`)

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  })
}

async function probe(db: SupabaseClient, clientId: string): Promise<string> {
  const started = Date.now()
  const { data, error } = await db.from('clients').select('id, company_name').eq('id', clientId).maybeSingle()
  const ms = Date.now() - started
  if (error) throw new Error(`probe: ${error.message} (${ms} ms): do not read this instance for fifteen minutes`)
  if (!data) throw new Error(`probe: no client ${clientId}`)
  console.log(`Probe: the client row answered in ${ms} ms.`)
  if (ms > 3_000) {
    console.error(`The probe took ${ms} ms (the line is 3,000). Wait fifteen minutes and probe again.`)
    process.exit(3)
  }
  return String((data as { company_name: string }).company_name)
}

/** The client's newest finished run that carries a window. */
async function newestRun(db: SupabaseClient, clientId: string): Promise<string> {
  const { data, error } = await db.from('pipeline_runs').select('id, status, window_start, window_end')
    .eq('client_id', clientId).in('status', ['completed', 'partial']).not('window_end', 'is', null)
    .order('window_end', { ascending: false }).limit(1)
  if (error) throw new Error(`newest run: ${error.message}`)
  const row = (data ?? [])[0] as { id: string; status: string; window_start: string | null; window_end: string } | undefined
  if (!row) throw new Error(`no finished run with a window for client ${clientId}`)
  console.log(`Newest finished run: ${row.id} (${row.status}), window ${row.window_start ?? '?'} to ${row.window_end}`)
  return row.id
}

const seconds = (s: number): string => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`)

function render(built: BuiltPostIdeas, mode: string): string {
  const { inputs } = built
  const out: string[] = []
  out.push(`# Post ideas: ${inputs.company}, run ${inputs.runId}`)
  out.push('')
  out.push(`${mode}. Window ${inputs.window.from} to ${inputs.window.to} (reading month ${inputs.month.slice(0, 7)}). Status: ${built.status}. ${built.ideas.length} idea(s), ${built.held.length} held. Model ${built.called ? POST_IDEAS_MODEL : 'not called'}, $${built.costUsd.toFixed(4)}.`)
  for (const idea of built.ideas) {
    const cand = inputs.candidates.find((x) => x.themeId === idea.registryId)
    const textOf = new Map((cand?.comments ?? []).map((x) => [x.commentId, x.text]))
    out.push('')
    out.push(`## ${idea.rank}. ${idea.title}`)
    out.push('')
    out.push(`- Conversation: "${cand?.label ?? idea.registryId}" (registry ${idea.registryId}); ${cand?.weekVideos ?? '?'} category videos in the window, ${cand?.lenientVideos ?? '?'} with a counted citation.`)
    out.push(`- Your posts: ${cand?.touch === 'unread' ? 'could not be read' : `none of the client's ${inputs.ownPosts ?? '?'} own posts published since ${ownedFrom(inputs.month).slice(0, 7)} touched it`}.`)
    out.push(`- Format: ${idea.format ? `${workedLabel(idea.format)} · ${idea.formatMultiple}×` : 'none chosen'}. Open with: ${idea.opening ? `${workedLabel(idea.opening)} · ${idea.openingMultiple}×` : 'none chosen'}. (1× = a typical market video on this question; read over ${cand?.play.videos ?? '?'} videos, ${cand?.play.rated ?? '?'} rated.)`)
    const len = idea.cover.length
    out.push(`- Length: ${len ? `${seconds(len.fromSeconds)}${len.toSeconds !== len.fromSeconds ? ` to ${seconds(len.toSeconds)}` : ''}, from ${len.videos} ${len.basis === 'format' ? `${idea.format ?? ''} videos` : 'videos in any format'} at or above the typical response` : 'none (too few durations)'}.`)
    out.push(`- Cover: ${idea.cover.text}`)
    out.push(`- What they want to know (of ${idea.cover.asked?.videos ?? '?'} videos, ${idea.cover.asked?.comments ?? '?'} comments read):`)
    for (const s of idea.subquestions) {
      const n = subquestionCounts(s)
      out.push(`  - ${s.label}: ${n.videos} ${n.videos === 1 ? 'video' : 'videos'}, ${n.comments} ${n.comments === 1 ? 'comment' : 'comments'}`)
      for (const id of s.commentIds.slice(0, 2)) out.push(`    - e.g. "${textOf.get(id) ?? '?'}"`)
    }
  }
  out.push('')
  out.push('## Workings')
  out.push('')
  out.push(`Question conversations on three or more category videos in the window (${inputs.considered.length}):`)
  for (const x of inputs.considered) {
    const handle = inputs.candidates.find((k) => k.themeId === x.themeId)?.handle
    const covered = inputs.covered.find((k) => k.themeId === x.themeId)
    const fate = handle ? `sent as ${handle} (${x.asks ?? '?'} comments that ask)` : covered ? `left out: own posts touched it (${covered.posts.length})` : !x.eligible ? 'not eligible (the week pool\'s gate)' : x.asks === 0 ? 'not sent: none of its comments asks' : 'not sent (past the cap)'
    out.push(`- "${x.label}" (filed as ${x.kind ?? '?'}, mostly ${x.dominantKind ?? '?'} this week): week ${x.weekVideos}, counted ${x.lenientVideos}; ${fate}`)
  }
  out.push(`Own posts read for the touch test: ${inputs.ownPosts ?? 'unread'}.`)
  for (const h of built.held) out.push(`Held: ${h.question} "${h.label}": ${h.reason}`)
  if (built.scrub) {
    const s = built.scrub
    out.push(`Scrub: ${s.dropped} sentence(s) dropped (digits ${s.droppedDigits}, medical ${s.droppedMedical}${s.medical.length ? ` [${s.medical.join(', ')}]` : ''}, movement ${s.droppedMovement}, first person ${s.droppedFirstPerson}, how-it-was-made ${s.droppedBanned}, over cap ${s.droppedLong}, copied a comment ${s.droppedCopied ?? 0}); comments under a sub-question that do not ask: ${s.droppedNotAsking ?? 0}; direction words kept and counted: ${s.flaggedDirection}.`)
  }
  for (const k of inputs.candidates) {
    const sent = built.raw?.ideas.find((i) => i.question === k.handle)
    out.push(`Writer, ${k.handle} "${k.label}" (${k.comments.length} comments on ${k.asked.videos} videos): ${sent ? `title "${sent.title}" · cover "${sent.cover}" · ${sent.subquestions.length} sub-question(s)` : 'nothing written'}`)
  }
  return out.join('\n')
}

async function main() {
  const clientId = flag('client')
  const recomposeFrom = flag('recompose')
  const inputsFrom = flag('inputs')
  if (!clientId) {
    console.error('Usage: scripts/post-ideas.ts --client <uuid> [--run <uuid>] [--dry-run | --write] [--out <file.md>] [--prompt-only] [--save-inputs <file>] [--inputs <file>] [--recompose <dry-run.json>]')
    process.exit(2)
  }
  const write = has('write')
  if (write && has('dry-run')) throw new Error('--write and --dry-run together: choose one')
  if (write && recomposeFrom) throw new Error('--recompose never writes: store ideas built by a real call')

  // Offline paths read no database at all.
  const offline = Boolean(recomposeFrom || inputsFrom) && !write
  const db = offline ? null : admin()
  const company = db ? await probe(db, clientId) : null
  const runId = flag('run') || (recomposeFrom || inputsFrom ? '' : await newestRun(db!, clientId))

  let inputs: PostIdeaInputs
  let prior: { raw: PostIdeasOutput; costUsd: number } | null = null
  if (recomposeFrom) {
    const saved = JSON.parse(readFileSync(resolve(process.cwd(), recomposeFrom), 'utf8')) as { inputs: PostIdeaInputs; raw: PostIdeasOutput | null; costUsd: number }
    if (!saved.raw) throw new Error(`${recomposeFrom} holds no writer output to compose again (a thin week makes none)`)
    inputs = saved.inputs
    prior = { raw: saved.raw, costUsd: saved.costUsd }
  } else if (inputsFrom) {
    inputs = JSON.parse(readFileSync(resolve(process.cwd(), inputsFrom), 'utf8')) as PostIdeaInputs
  } else {
    inputs = await loadPostIdeaInputs(db!, { clientId, runId })
  }
  if (inputs.clientId !== clientId || (runId && inputs.runId !== runId)) throw new Error('the saved file holds another client or run')
  console.log(`Client: ${company ?? inputs.company} (${clientId}); run ${inputs.runId}; ${write ? 'WRITE' : 'dry run (nothing is written to any database)'}`)

  if (write && db) {
    const existing = await existingPostIdeas(db, clientId, inputs.runId)
    if (existing === null) throw new Error('post_ideas is not in this database: apply supabase/migrations/20261109090000_products.sql first')
    if (existing > 0) {
      console.error(`Run ${inputs.runId} already has ${existing} post idea(s). post_ideas grants no DELETE, so this script will not write over them.`)
      process.exit(4)
    }
  }
  if (flag('save-inputs')) {
    writeFileSync(resolve(process.cwd(), flag('save-inputs')), `${JSON.stringify(inputs, null, 2)}\n`)
    console.log(`Saved the inputs to ${flag('save-inputs')} (they hold comment words: keep the file on this machine).`)
  }
  if (has('prompt-only')) {
    console.log(`\n${inputs.candidates.length} conversation(s) for the writer${inputs.candidates.length === 0 ? ' (THIN: no call would be made)' : ''}; ${inputs.covered.length} left out for the client's own posts.`)
    const { system, user } = buildPostIdeaPrompts({ company: inputs.company, sells: inputs.sells, candidates: inputs.candidates })
    console.log(`\n=== SYSTEM (${system.length} chars) ===\n${system}\n\n=== USER (${user.length} chars) ===\n${user}`)
    return
  }

  const started = Date.now()
  const built = prior
    ? finishPostIdeas(inputs, prior.raw, prior.costUsd)
    : await buildPostIdeas(db as SupabaseClient, { clientId, runId: inputs.runId, log: write, inputs })
  console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s: ${built.status}, ${built.ideas.length} idea(s), ${built.held.length} held, $${built.costUsd.toFixed(4)}.`)

  const mode = write ? 'WRITTEN' : prior ? 'DRY RUN, not stored; composed again from the saved call' : 'DRY RUN, not stored'
  const text = render(built, mode)
  console.log(`\n${text}\n`)
  const json = JSON.stringify({ status: built.status, rows: built.rows, held: built.held, scrub: built.scrub, costUsd: built.costUsd, raw: built.raw, inputs }, null, 2)
  const outPath = flag('out')
  if (outPath) {
    const md = resolve(process.cwd(), outPath)
    const js = `${md.replace(/\.md$/, '')}.json`
    writeFileSync(md, `${text}\n`)
    writeFileSync(js, `${json}\n`)
    console.log(`Wrote the rendering to ${md} and the JSON to ${js}`)
  }

  if (write && db) {
    await savePostIdeas(db, built.rows)
    console.log(`Stored ${built.rows.length} post idea(s) for run ${inputs.runId}.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
