// Your moves, Design v2 (depth T7): ONE tenant's loader output, dumped once,
// so the page can be drawn from real data offline (scripts/pages-shots.ts
// `--moves-dump <dir>`, keys moves-v2-ossur and moves-v2-sealand) and its
// figures spot-checked against the database.
//
//   node --env-file=<.env.local> --import tsx scripts/moves-v2-dump.ts --confirm \
//     --client <uuid> --out <dir>/ossur.json [--top]
//
// READ-ONLY, AND IT READS PRODUCTION. One page load (about forty statements:
// the advice, decisions, moves, subjects, the month tables, the plan, the
// conclusions, the cited insights and one quote) and, with `--top`, the
// Dashboard tile's lighter read beside it. It writes nothing to the database.
// It makes one embedding call (the short list's: about seventy advice texts,
// a fraction of a cent). It will not start without `--confirm`, and it
// refuses to read past a probe slower than 3 s (AGENTS.md: production reads
// are serialised and rationed).
//
// The dump is the loader's output as a tenant's owner would see it
// (`canDecide: true`), plus how many statements the tenant holds (the page
// draws them only for the operator while they are held).

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

async function main() {
  const clientId = flag('client')
  const out = flag('out')
  if (!args.includes('--confirm') || !clientId || !out) {
    console.error('moves-v2-dump reads PRODUCTION once: --confirm --client <uuid> --out <file.json> [--top]')
    process.exit(2)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const started = Date.now()
  const probe = await createClient(url, key).from('clients').select('id').eq('id', clientId).maybeSingle()
  const probeMs = Date.now() - started
  if (probe.error) throw new Error(`probe failed in ${probeMs} ms: ${probe.error.message}`)
  console.log(`Probe: ${probeMs} ms.`)
  if (probeMs > 3_000) {
    console.error('The probe took over 3 s. Wait fifteen minutes.')
    process.exit(3)
  }

  // Imported after the probe: the loader's modules build an OpenAI client on
  // import.
  const { readingHandle } = await import('../lib/reading/read')
  const { loadMovesPage, topMoves } = await import('../lib/pages/v2/moves')
  const { loadStatements } = await import('../lib/pages/moves-statements')
  const supabase = createClient(url, key)
  const scope = { supabase, clientId, reading: readingHandle(clientId, createClient(url, key)), params: {} }
  const t0 = Date.now()
  const data = await loadMovesPage(scope, { canDecide: true })
  const pageMs = Date.now() - t0
  const statements = await loadStatements(supabase, clientId, { canEdit: false, brand: data?.brand ?? '' })
  let top: unknown = null
  let topMs: number | null = null
  if (args.includes('--top')) {
    const t1 = Date.now()
    top = await topMoves(scope, { canDecide: true })
    topMs = Date.now() - t1
  }
  const file = resolve(process.cwd(), out)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ clientId, at: new Date().toISOString(), pageMs, topMs, statements: statements?.statements.length ?? null, data, top }, null, 2)}\n`)
  console.log(`Wrote ${file} (page ${pageMs} ms${topMs != null ? `, tile ${topMs} ms` : ''}).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
