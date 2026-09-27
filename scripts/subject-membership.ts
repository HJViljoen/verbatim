import { createAdminClient } from '../lib/supabase-admin'
import { embeddingCoverage } from '../lib/agent/retrieve'
import {
  coverageClears,
  embedSubjects,
  judgeAllSubjects,
  judgeSubject,
  loadActiveSubjects,
  membershipSummary,
  subjectBudgetUsd,
  type SubjectMembershipOptions,
  type SubjectMembershipResult,
} from '../lib/subjects/membership'
import { JUDGE_VERSION, SUBJECT_MIN_COVERAGE, type Subject } from '../lib/subjects/types'

// Decide subject membership across a tenant's whole live insight population.
// DRY BY DEFAULT — pass --apply to spend and write.
//
//   node --env-file=.env.local --import tsx scripts/subject-membership.ts --client <uuid>
//   node --env-file=.env.local --import tsx scripts/subject-membership.ts --client <uuid> --apply
//   node --env-file=.env.local --import tsx scripts/subject-membership.ts --client <uuid> \
//     --subjects "Travel fit & carry-on,Materials & origin" [--apply]
//
// --subjects (market-first WP3.1): judge only the active subjects of these
// names, comma-separated, matched case-blind. For the subjects confirmed on the
// 13 Oct call: today's subjects are already judged at the live key, so the
// spend is the new ones' first pass alone, and a dry run prices exactly that.
// A name that is not an active subject refuses the whole run before anything is
// priced or sent. Without it, every active subject, as before.
//
// WHAT THIS IS FOR. Two things, and they are the same code path on purpose.
// The first is the ONE-OFF BACKFILL the design requires before a single subject
// row is shown to a client (:229, :685): every live insight, every confirmed
// subject, once. The second is catching a tenant up when its pipeline step
// failed for a run or two — and Sealand needs that more than it sounds, because
// its report_period is 'paused', which lib/config.ts defines as "never due" to
// the scheduler, so its `subject-membership` step does not fire on a schedule
// at all.
//
// Everything below the argument parsing is lib/subjects/membership.ts, the same
// module the pipeline step runs. Deliberately: two copies of a judge is how the
// two end up with different prompts and only one of them logging what it spent.
//
// THE PREREQUISITE THIS SCRIPT WILL NOT WORK AROUND. An unembedded insight is
// invisible to subject_band(), so a subject scored against a half-embedded
// corpus does not read low — it reads wrong, silently. Below 95% coverage every
// subject refuses. Run scripts/embed-insights.ts --apply first, per tenant.

interface Args { clientId: string; apply: boolean; budget: number; subjects: string[] | null }

function parseArgs(argv: string[]): Args {
  const args: { clientId: string | null; apply: boolean; budget: number; subjects: string[] | null } =
    { clientId: null, apply: false, budget: 0, subjects: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--apply') args.apply = true
    else if (argv[i] === '--budget') args.budget = Number(argv[++i])
    else if (argv[i] === '--subjects') args.subjects = subjectNames(argv[++i])
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (!args.clientId) throw new Error('--client <uuid> is required')
  if (!Number.isFinite(args.budget) || args.budget < 0) throw new Error('--budget must be a non-negative number of dollars')
  return { ...args, clientId: args.clientId }
}

/** --subjects' value: comma-separated names, trimmed, none empty. */
export function subjectNames(value: string | undefined): string[] {
  const names = (value ?? '').split(',').map((n) => n.trim()).filter(Boolean)
  if (names.length === 0) throw new Error('--subjects needs one or more subject names, comma-separated')
  return names
}

/** The active subjects of these names, in the set's own order. Throws, naming
 *  every name that is not an active subject, before anything is priced. */
export function pickSubjects<S extends Pick<Subject, 'name'>>(active: readonly S[], names: readonly string[]): S[] {
  const key = (n: string) => n.trim().toLowerCase()
  const wanted = new Set(names.map(key))
  const missing = names.filter((n) => !active.some((s) => key(s.name) === key(n)))
  if (missing.length > 0) {
    throw new Error(`REFUSED: not an active subject of this tenant: ${missing.map((n) => `"${n}"`).join(', ')}. Nothing priced, nothing sent.`)
  }
  return active.filter((s) => wanted.has(key(s.name)))
}

/** judgeAllSubjects (lib/subjects/membership.ts), over the picked subjects
 *  only: the same embed-then-judge order and ONE pass ceiling across them.
 *  That module is on the freeze-months path, so the filter lives here. */
async function judgePicked(
  admin: ReturnType<typeof createAdminClient>,
  picked: readonly Subject[],
  opts: SubjectMembershipOptions,
): Promise<SubjectMembershipResult[]> {
  if (!opts.dryRun) await embedSubjects(admin, picked)
  const coverage = opts.coverage ?? await embeddingCoverage(admin, opts.clientId)
  const out: SubjectMembershipResult[] = []
  let spent = 0
  const budget = opts.budgetUsd ?? subjectBudgetUsd()
  for (const s of picked) {
    const r = await judgeSubject(admin, s, { ...opts, coverage, budgetUsd: Math.max(0, budget - spent) })
    spent += r.costUsd
    out.push(r)
  }
  return out
}

async function main() {
  const { clientId, apply, budget, subjects: names } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()
  const picked = names ? pickSubjects(await loadActiveSubjects(admin, clientId), names) : null
  if (picked) console.log(`[subject-membership] --subjects: ${picked.map((s) => s.name).join(', ')}`)
  const judge = (opts: SubjectMembershipOptions) => picked ? judgePicked(admin, picked, opts) : judgeAllSubjects(admin, opts)

  // Coverage first, before anything is planned or priced. It is the one
  // condition under which the whole exercise is a waste of money, and finding
  // that out after the estimate has been printed is finding it out too late.
  const coverage = await embeddingCoverage(admin, clientId)
  const pct = coverage.total === 0 ? 100 : Math.round((1000 * coverage.embedded) / coverage.total) / 10
  console.log(`[subject-membership] ${clientId}: ${coverage.embedded}/${coverage.total} insights embedded (${pct}%)`)
  if (!coverageClears(coverage)) {
    console.error(
      `[subject-membership] REFUSED: coverage is below ${Math.round(SUBJECT_MIN_COVERAGE * 100)}%. ` +
      'Every unembedded insight is invisible to the band, so every subject would read low with nothing saying so. ' +
      'Run: node --env-file=.env.local --import tsx scripts/embed-insights.ts --client ' + clientId + ' --apply',
    )
    process.exit(1)
  }

  // Price it first, whatever was asked for, so a dry run is a real decision
  // point and not a formality.
  const plan = await judge({ clientId, runId: null, dryRun: true })
  const calls = plan.reduce((n, r) => n + r.calls, 0)
  const priced = plan.reduce((n, r) => n + r.costUsd, 0)
  for (const r of plan) console.log(`  ${membershipSummary(r)}`)
  // A total that mixes a plan read off a real band with an estimate for a
  // subject that has no vector yet is not the same number, and saying which is
  // the whole reason the estimate exists. The estimated subjects contribute
  // their MIDPOINT; the range per subject is on its own line above.
  const estimated = plan.filter((r) => r.estimated)
  const estimatedNote = estimated.length === 0
    ? ''
    : ` · INCLUDES AN ESTIMATE for ${estimated.length} subject(s) with no phrase vector yet ` +
      `(~$${estimated.reduce((n, r) => n + (r.estimated?.costUsd.low ?? 0), 0).toFixed(4)}-` +
      `$${estimated.reduce((n, r) => n + (r.estimated?.costUsd.high ?? 0), 0).toFixed(4)} across them)`
  console.log(
    `[subject-membership] judge ${JUDGE_VERSION} · ${calls} call(s) · ~$${priced.toFixed(4)} ` +
    `· pass ceiling $${(budget || subjectBudgetUsd()).toFixed(2)}${estimatedNote}`,
  )

  if (!apply) {
    console.log('[subject-membership] dry run — nothing sent, nothing written. Re-run with --apply.')
    return
  }

  const results = await judge({
    clientId,
    runId: null,
    ...(budget > 0 ? { budgetUsd: budget } : {}),
  })
  for (const r of results) console.log(`  ${membershipSummary(r)}`)
  const spent = results.reduce((n, r) => n + r.costUsd, 0)
  const written = results.reduce((n, r) => n + r.written, 0)
  console.log(`[subject-membership] ${written} rows · $${spent.toFixed(4)} spent`)
  if (results.some((r) => r.budgetStopped)) {
    console.warn('[subject-membership] the pass stopped at its ceiling. What is left is still undecided and comes back on the next run or the next --apply.')
  }
}

if (process.argv[1]?.endsWith('subject-membership.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
