import { createAdminClient } from '../lib/supabase-admin'
import {
  buildProposeUserPrompt,
  loadProposalSources,
  proposalSummary,
  proposeSubjects,
} from '../lib/subjects/propose'
import { SUBJECTS_MAX, SUBJECTS_MIN } from '../lib/subjects/types'

// Propose a tenant's subject candidates (design item 22, decision E).
// DRY BY DEFAULT — the dry run prints the prompt and spends nothing; --apply
// makes the one gpt-4.1-mini call.
//
//   node --env-file=.env.local --import tsx scripts/propose-subjects.ts --client <uuid>
//   node --env-file=.env.local --import tsx scripts/propose-subjects.ts --client <uuid> --apply
//
// This script WRITES NO SUBJECT. It reads two pools — the brand's own-voice
// claims and its category's top themes — asks one model call which of them a
// brand could actually decide to be measured on, and prints the answer for a
// person to choose from. Heinrich confirms 5-8 per tenant in Settings, and that
// confirmation is the write. A proposer that also wrote would be a proposer
// that had made the choice.
//
// One call, both pools in one prompt: ~1,500 in and ~800 out at gpt-4.1-mini is
// about $0.002. There is nothing to batch and nothing to cap.

interface Args { clientId: string; apply: boolean; showPrompt: boolean }

function parseArgs(argv: string[]): Args {
  const args: { clientId: string | null; apply: boolean; showPrompt: boolean } =
    { clientId: null, apply: false, showPrompt: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--apply') args.apply = true
    else if (argv[i] === '--prompt') args.showPrompt = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (!args.clientId) throw new Error('--client <uuid> is required')
  return { ...args, clientId: args.clientId }
}

async function main() {
  const { clientId, apply, showPrompt } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  // Read once. The pools are two full reads of the tenant's claims and themes,
  // and the priced dry run and the real call are asking about the same ones.
  const sources = await loadProposalSources(admin, clientId)
  const claims = sources.filter((s) => s.kind === 'claim').length
  const themes = sources.filter((s) => s.kind === 'theme').length
  console.log(`[propose-subjects] ${clientId}: ${claims} own-voice claims · ${themes} category themes`)
  if (showPrompt) console.log(`\n--- the prompt ---\n${buildProposeUserPrompt(sources)}\n`)

  if (!apply) {
    console.log('[propose-subjects] dry run — nothing sent. Re-run with --apply to make the one model call.')
    return
  }
  if (sources.length === 0) {
    console.log('[propose-subjects] nothing to propose from: no own-voice claims and no category themes on file.')
    return
  }

  const result = await proposeSubjects(admin, clientId, { sources })
  console.log(`\n${proposalSummary(result)}\n`)
  console.log(`[propose-subjects] $${result.costUsd.toFixed(4)} · pick ${SUBJECTS_MIN}-${SUBJECTS_MAX} of these in Settings › Subjects.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
