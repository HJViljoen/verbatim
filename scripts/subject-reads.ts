// The subjects' own reads for one run (14 Oct; the `write-subject-reads`
// step's code, lib/written/subject-reads-step.ts): for each READY subject,
// what people said across the conversations the pages place inside it, then
// what it means for the company, and (since v3) its one-line headline; one
// call per subject with enough to say,
// code's one line for a thin one. It reads the inputs through the step's own
// `loadSubjectReadInputs` and builds through its own `buildSubjectReads`, so it
// reads exactly what the step reads.
//
//   node --env-file=.env.local --import tsx scripts/subject-reads.ts \
//     --client <uuid> --run <uuid> [--write] [--out <file.md>] [--force]
//
// THE SWITCH (`subjectReadsEnabled`, lib/config.ts: OPT-IN, on for Össur
// since 14 Oct and for Sealand since 16 Oct). For a tenant switched off it refuses; `--force` lets a
// DRY run go ahead (to read a tenant's reads before it is turned on), and is
// refused beside `--write`: a stored read of a tenant switched off prints
// nowhere, and the switch is the one place a tenant is turned on.
//
// DRY BY DEFAULT. Nothing is written to any database: no `week_reads` change
// and no `ai_call_log` row. The calls ARE paid for (gpt-5.4 at medium effort,
// about $0.03 to $0.06 a subject with enough to say; none for a thin one),
// held to `SUBJECT_READS_BUDGET_USD` ($1) between them.
//
// --write builds again (its own calls, logged to `ai_call_log` as pass
// `subject_read`, so its words are not the dry run's) and puts the reads on
// the run's `week_reads` row of kind 'week' (`data.subjectReads`) through the
// step's own `saveSubjectReads`, replacing any the run had. It refuses a run
// with no ready week read: a page prints a subject's read only through its
// run's published week read. It is the fallback when the step failed or was
// not deployed, and a paste for Heinrich against production.
//
// READING A PROMPT BEFORE PAYING FOR IT, without reading production twice:
//   --prompt-only [--save-inputs <file.json>]   reads the inputs, prints each
//       subject's two messages, saves what it read, and stops: no call;
//   --inputs <file.json>   builds from saved inputs instead (a dry run, no
//       database read at all; how the prompt was tested offline, on
//       fixtures). The inputs hold Pass A's paraphrases and labels, never a
//       comment's words.
//
// .env.local IS PRODUCTION. It probes first (a timed read of the one client
// row) and will not go on if that takes over 3 s or fails: wait fifteen
// minutes. A run's inputs are the placement's membership, the run's
// conversations, the ready subjects' month of comment citations (a statement
// per 250 members, with their translations and video context), the company's
// own claims and the rivals: about twenty to forty small statements.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { SUBJECT_READS_BUDGET_USD, subjectReadsEnabled } from '../lib/config'
import {
  buildSubjectReads, loadSubjectReadInputs, loadWeekRowForReads, saveSubjectReads,
  type BuiltSubjectReads, type SubjectReadInputs,
} from '../lib/written/subject-reads-step'
import { buildSubjectReadPrompts, SUBJECT_READ_MODEL } from '../lib/written/subject-reads'

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

async function probe(db: SupabaseClient, clientId: string): Promise<void> {
  const started = Date.now()
  const { data, error } = await db.from('clients').select('id').eq('id', clientId).maybeSingle()
  const ms = Date.now() - started
  if (error) throw new Error(`probe: ${error.message} (${ms} ms): do not read this instance for fifteen minutes`)
  if (!data) throw new Error(`probe: no client ${clientId}`)
  console.log(`Probe: the client row answered in ${ms} ms.`)
  if (ms > 3_000) {
    console.error(`The probe took ${ms} ms (the line is 3,000). Wait fifteen minutes and probe again.`)
    process.exit(3)
  }
}

function render(built: BuiltSubjectReads, mode: string): string {
  const { inputs, data } = built
  const out: string[] = []
  out.push(`# Subject reads: ${inputs.company}, run ${inputs.runId}`)
  out.push('')
  out.push(`${mode}. Read ${inputs.read.from} to ${inputs.read.to} (month ${inputs.month.slice(0, 7)}${inputs.complete ? ', in full' : ', so far'}). ${data.subjects.length} ready subject(s), ${built.called} call(s), model ${SUBJECT_READ_MODEL}, $${data.costUsd.toFixed(4)}.`)
  for (const s of data.subjects) {
    const m = inputs.subjects.find((x) => x.subjectId === s.subjectId)
    const labelOf = new Map((m?.conversations ?? []).map((c) => [c.themeId, c.label]))
    out.push('')
    out.push(`## ${s.name} (${s.status})`)
    out.push('')
    if (s.headline) out.push(`Headline: ${s.headline}`, '')
    for (const p of s.saying) out.push(p, '')
    if (s.means) out.push(`What it means: ${s.means}`, '')
    if (s.reason) out.push(`Why: ${s.reason}`, '')
    out.push(`- Rests on: ${s.basedOn.map((id) => `"${labelOf.get(id) ?? id}"`).join(', ') || 'no conversation of its own'}.`)
    if (m) {
      out.push(`- Material: ${m.videos} market videos with a gated citation; ${m.conversations.length} conversation(s) placed in it with talk this month (${m.conversations.filter((c) => c.notes.length > 0).length} with notes); ${m.loose.length} note(s) outside them; ${m.enough ? 'enough to write' : 'thin: code wrote its line'}.`)
      for (const c of m.conversations) out.push(`  - "${c.label}" (${c.kind ?? '?'}): ${c.videos} gated video(s), ${c.notes.length} note(s)`)
    }
    const scrub = built.scrub[s.subjectId]
    if (scrub) out.push(`- Scrub: ${scrub.dropped} sentence(s) dropped${scrub.headline ? `; the headline ${scrub.headline}` : ''}.`)
    const raw = built.raw[s.subjectId]
    if (raw) out.push(`- The writer's answer before the scrub: ${JSON.stringify(raw)}`)
  }
  return out.join('\n')
}

/** The per-tenant switch, asked before anything is read: off, refused, but
 *  for a dry run under --force. */
function switchGate(id: string, write: boolean): void {
  if (subjectReadsEnabled(id)) return
  if (!has('force') || write) {
    console.error(`Subject reads are switched off for ${id} (SUBJECT_READS_ENABLED, or SUBJECT_READS / SUBJECT_READS_OFF). A dry run may pass --force; --write never does.`)
    process.exit(2)
  }
  console.log('Switched off for this tenant: a dry run under --force, nothing is stored.')
}

async function main() {
  const clientId = flag('client')
  const runId = flag('run')
  const inputsFrom = flag('inputs')
  if (!inputsFrom && (!clientId || !runId)) {
    console.error('Usage: scripts/subject-reads.ts --client <uuid> --run <uuid> [--write] [--prompt-only] [--save-inputs <file>] [--inputs <file>] [--out <file.md>] [--force]')
    process.exit(2)
  }
  const write = has('write')
  if (write && inputsFrom) {
    console.error('--write reads the run itself: it never stores reads built from a saved file.')
    process.exit(2)
  }
  if (write && has('force')) {
    console.error('--force is for a dry run only: a tenant is turned on in SUBJECT_READS_ENABLED (lib/config.ts), never by --write.')
    process.exit(2)
  }

  let inputs: SubjectReadInputs
  let db: SupabaseClient | null = null
  if (inputsFrom) {
    inputs = JSON.parse(readFileSync(resolve(process.cwd(), inputsFrom), 'utf8')) as SubjectReadInputs
    switchGate(inputs.clientId, write)
    console.log(`Inputs from ${inputsFrom}: ${inputs.company}, ${inputs.subjects.length} ready subject(s); no database is read.`)
  } else {
    switchGate(clientId, write)
    db = admin()
    await probe(db, clientId)
    const row = await loadWeekRowForReads(db, clientId, runId)
    if (row === 'missing') throw new Error('week_reads is not in this database')
    if (!row || row.status !== 'ready' || !row.data || !row.month || !row.window) {
      throw new Error(`run ${runId} has no ready week read (${row ? row.status : 'none'}): its subject reads would print nowhere`)
    }
    inputs = await loadSubjectReadInputs(db, { clientId, runId, month: row.month, window: row.window })
    console.log(`Read the inputs: ${inputs.subjects.length} ready subject(s), month ${inputs.month.slice(0, 7)}.`)
  }
  if (flag('save-inputs')) {
    writeFileSync(resolve(process.cwd(), flag('save-inputs')), `${JSON.stringify(inputs, null, 2)}\n`)
    console.log(`Saved the inputs to ${flag('save-inputs')}.`)
  }
  if (has('prompt-only')) {
    for (const m of inputs.subjects) {
      const p = buildSubjectReadPrompts({ company: inputs.company, clientId: inputs.clientId, month: inputs.month, complete: inputs.complete, material: m, context: inputs.context })
      console.log(`\n===== ${m.name} (${m.enough ? 'a call' : 'thin: no call'}) =====\n--- system ---\n${p.system}\n--- user ---\n${p.user}`)
    }
    return
  }
  const built = await buildSubjectReads((db ?? null) as SupabaseClient, {
    clientId: inputs.clientId, runId: inputs.runId, month: inputs.month, window: inputs.read, log: write, inputs, maxUsd: SUBJECT_READS_BUDGET_USD,
  })
  const text = render(built, write ? 'WRITTEN' : 'DRY RUN, not stored')
  console.log(`\n${text}`)
  if (flag('out')) {
    writeFileSync(resolve(process.cwd(), flag('out')), `${text}\n`)
    writeFileSync(resolve(process.cwd(), `${flag('out').replace(/\.md$/, '')}.json`), `${JSON.stringify(built.data, null, 2)}\n`)
    console.log(`Wrote ${flag('out')} and its JSON.`)
  }
  if (write && db) {
    await saveSubjectReads(db, { clientId, runId, reads: built.data })
    console.log(`Stored on run ${runId}'s week read: ${built.data.subjects.filter((s) => s.status === 'ready').length} written, ${built.data.subjects.filter((s) => s.status === 'thin').length} thin, ${built.data.subjects.filter((s) => s.status === 'failed' || s.status === 'held').length} failed or held.`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
