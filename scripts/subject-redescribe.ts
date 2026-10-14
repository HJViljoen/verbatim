import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { CONFIG_CHANGES_TABLE, recordConfigChange, scriptActor } from '../lib/config-log'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import { embedSubjects } from '../lib/subjects/membership'
import {
  planRedescribe,
  redescribeChange,
  successorRow,
  type RedescribePlan,
  type RedescribeSeed,
  type RedescribeSubject,
} from '../lib/subjects/redescribe'
import { TABLE_SUBJECTS, type Subject } from '../lib/subjects/types'
import { createAdminClient } from '../lib/supabase-admin'

// Re-describe a tenant's subjects from a seed (14 Oct). What a re-description
// is, and why each one is a NEW subject that supersedes the old, is
// lib/subjects/redescribe.ts. This file reads, prints the plan, and with
// --apply writes it.
//
//   node --env-file=.env.local --import tsx scripts/subject-redescribe.ts \
//     --client <uuid> --project <ref> --seed scripts/seeds/<tenant>-subjects.ts [--apply]
//
// READ-ONLY BY DEFAULT (lib/ops/market-first-args.ts): it reads the tenant's
// subjects, its `subjects` change-log rows and its running updates, three
// small reads after a timed probe, and prints what each subject needs. A
// subject the seed was not written against (a moved name or description) is
// refused, and then nothing is written for any of them.
//
// WITH --apply, per subject, in this order:
//   1. retire the old subject (`subjects_status_audit` logs it; the
//      retirement trigger closes the months it still had open);
//   2. insert the successor, active, with the old name, origin and source and
//      the new words (`subjects_insert_audit` logs it);
//   3. point the old subject at it (`superseded_by`);
//   4. embed the successor's phrase (one embeddings call for the set, about a
//      millionth of a dollar), so the membership dry run plans off a real band;
//   5. one `config_changes` row with the command as its actor and both
//      descriptions (`redescribeChange`).
// A stop part-way is finished by running the same command again.
//
// IT SPENDS NOTHING ELSE. The judging is scripts/subject-membership.ts, run
// next: the successors have no memberships, so their first pass is a full one.
//
// NOT WHILE AN UPDATE RUNS. A run that planned its subjects before the write
// would judge and freeze the old ones; the script refuses with --apply while
// the tenant has a running update, unless --allow-running.

const NAME = 'subject-redescribe'
const PROBE_MAX_MS = 3000
const SUBJECT_COLUMNS =
  'id, client_id, name, description, origin, source_ref, named_at, status, superseded_by, embedded_at, embed_input_version, calibrated_at, calibration_precision, calibration_n, calibration_judge_version'

async function loadSeed(path: string): Promise<RedescribeSeed> {
  const mod = (await import(pathToFileURL(resolve(path)).href)) as Record<string, unknown>
  const seed = (mod.default ?? Object.values(mod).find((v) => typeof v === 'object' && v !== null && 'subjects' in v)) as RedescribeSeed | undefined
  if (!seed || !Array.isArray(seed.subjects)) throw new Error(`${NAME}: ${path} exports no subject seed`)
  return seed
}

function planLine(p: RedescribePlan): string {
  if ('refused' in p) return `  REFUSED  ${p.name}: ${p.refused}`
  if (p.writes.length === 0) return `  done     ${p.name}: already re-described (successor ${p.successorId})`
  return `  ${p.writes.join(', ').padEnd(28)} ${p.name}`
}

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME, values: ['seed'], flags: ['allow-running'], defaultClient: '',
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  const seedPath = args.values.seed
  if (!seedPath) throw new Error(`${NAME}: --seed <file> is required`)
  const seed = await loadSeed(seedPath)
  if (seed.clientId !== args.clientId) {
    throw new Error(`${NAME}: the seed is written for client ${seed.clientId}, not --client ${args.clientId}. Nothing read.`)
  }

  const admin = createAdminClient()
  const t0 = Date.now()
  const probe = await admin.from('clients').select('id').eq('id', args.clientId).limit(1)
  const ms = Date.now() - t0
  if (probe.error) throw new Error(`${NAME}: the probe failed (${probe.error.message}). Back off 15 minutes. Nothing read further.`)
  if (ms > PROBE_MAX_MS) throw new Error(`${NAME}: the probe took ${ms} ms (over ${PROBE_MAX_MS}). Back off 15 minutes. Nothing read further.`)

  const subjectsRes = await admin.from(TABLE_SUBJECTS).select(SUBJECT_COLUMNS).eq('client_id', args.clientId)
  if (subjectsRes.error) throw new Error(`${NAME}: subjects: ${subjectsRes.error.message}. Nothing written.`)
  const subjects = (subjectsRes.data ?? []) as Subject[]
  const changesRes = await admin.from(CONFIG_CHANGES_TABLE).select('after')
    .eq('client_id', args.clientId).eq('surface', 'subjects').eq('field', 'subjects')
  if (changesRes.error) throw new Error(`${NAME}: config_changes: ${changesRes.error.message}. Nothing written.`)
  const runningRes = await admin.from('pipeline_runs').select('id').eq('client_id', args.clientId).eq('status', 'running')
  if (runningRes.error) throw new Error(`${NAME}: pipeline_runs: ${runningRes.error.message}. Nothing written.`)
  const running = (runningRes.data ?? []).map((r) => (r as { id: string }).id)

  const plans = planRedescribe(subjects, changesRes.data ?? [], seed.subjects)
  console.log(`  seed ${seedPath}, written ${seed.writtenOn}: ${seed.subjects.length} subject(s)`)
  for (const p of plans) console.log(planLine(p))
  if (running.length > 0) console.log(`  running update(s): ${running.join(', ')}`)

  const refused = plans.filter((p) => 'refused' in p)
  if (refused.length > 0) throw new Error(`${NAME}: REFUSED: ${refused.length} subject(s) cannot be re-described as the seed says. Nothing written.`)
  if (!args.apply) {
    console.log(`${NAME}: read-only, nothing written. With --apply the writes spend one embeddings call; the judging after it is scripts/subject-membership.ts.`)
    return
  }
  if (running.length > 0 && !args.flags.has('allow-running')) {
    throw new Error(`${NAME}: REFUSED: an update is running for this client (${running.join(', ')}). Run again when it has finished, or pass --allow-running. Nothing written.`)
  }

  const actor = scriptActor(`scripts/${NAME}.ts --client ${args.clientId} --seed <file> --apply`)
  const now = () => new Date().toISOString()
  for (const p of plans) {
    if ('refused' in p || p.writes.length === 0) continue
    const entry = seed.subjects.find((e) => e.id === p.id)!
    const old = subjects.find((s) => s.id === p.id)! as RedescribeSubject
    let successorId = p.successorId

    if (p.writes.includes('retire')) {
      const { data, error } = await admin.from(TABLE_SUBJECTS)
        .update({ status: 'retired', updated_at: now() })
        .eq('id', old.id).eq('client_id', args.clientId).eq('status', 'active')
        .select('id')
      if (error || (data ?? []).length !== 1) {
        throw new Error(`${NAME}: ${old.name}: the retirement did not land (${error?.message ?? 'no row'}). Nothing more written.`)
      }
    }
    if (p.writes.includes('insert')) {
      const { data, error } = await admin.from(TABLE_SUBJECTS).insert(successorRow(old, entry)).select(SUBJECT_COLUMNS).single()
      if (error || !data) {
        throw new Error(
          `${NAME}: ${old.name} is stopped and its successor was NOT saved (${error?.message ?? 'no row'}). ` +
          'Run the same command again: it adds the successor and finishes.',
        )
      }
      const successor = data as unknown as Subject
      successorId = successor.id
      try {
        await embedSubjects(admin, [successor])
      } catch (e) {
        console.warn(`  ${old.name}: the phrase was not embedded (${e instanceof Error ? e.message : String(e)}); the membership pass embeds it first.`)
      }
    }
    if (!successorId) throw new Error(`${NAME}: ${old.name}: no successor to point at. Nothing more written.`)
    if (p.writes.includes('point')) {
      const { error } = await admin.from(TABLE_SUBJECTS)
        .update({ superseded_by: successorId, updated_at: now() })
        .eq('id', old.id).eq('client_id', args.clientId)
      if (error) throw new Error(`${NAME}: ${old.name}: the pointer to ${successorId} was not written (${error.message}). Run the same command again.`)
    }
    if (p.writes.includes('log')) {
      const logged = await recordConfigChange(admin, redescribeChange(old, successorId, entry, actor))
      if (!logged) {
        throw new Error(
          `${NAME}: ${old.name} was re-described but its change-log row was NOT recorded; stopped before the next subject. ` +
          'Run the same command again: it writes only the missing row.',
        )
      }
    }
    console.log(`  ${old.name}: ${p.writes.join(', ')} → ${successorId}`)
  }
  console.log(`${NAME}: done. Next: scripts/subject-membership.ts --client ${args.clientId} (dry), then --apply.`)
}

if (process.argv[1]?.endsWith('subject-redescribe.ts')) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
