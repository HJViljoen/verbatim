import { createAdminClient } from '../lib/supabase-admin'
import { TABLE_STATEMENTS, isMissingStatements } from '../lib/statements/types'

// Seed Sealand's three statements (pages build, package MOVES): the claims the
// approved design shows, in the words a client would type, each one Sealand's
// own (its posts of 10, 12 and 16 Sep). An operator script, not a migration,
// because a statement is the client's to keep or remove.
//
// DRY BY DEFAULT. --write inserts the ones not already live; nothing else is
// touched. Then measure them: scripts/statements.ts --client <uuid> --write.
//
//   node --env-file=.env.local --import tsx scripts/statements-seed.ts --client ac16988e-c4f3-4baf-b388-73895852a554 [--write]

export const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'

export const SEED: Record<string, readonly string[]> = {
  [SEALAND]: [
    'Every Sealand product is a small act of defiance against waste',
    'Protect Our Paths has cared for Cape Town’s natural spaces since 2022',
    'We’re an award-winning B Corp',
  ],
}

async function main() {
  const argv = process.argv.slice(2)
  const clientId = argv[argv.indexOf('--client') + 1] ?? ''
  const write = argv.includes('--write')
  const texts = SEED[clientId]
  if (!texts) throw new Error(`REFUSED: no seed for client ${clientId || '(none)'}; the seed is Sealand's alone`)
  const admin = createAdminClient()
  const { data, error } = await admin.from(TABLE_STATEMENTS).select('text').eq('client_id', clientId).is('retired_at', null)
  if (error) {
    if (isMissingStatements(error)) throw new Error('client_statements does not exist: apply 20261105090000_client_statements.sql first')
    throw error
  }
  const live = new Set(((data ?? []) as { text: string }[]).map((r) => r.text.trim().toLowerCase()))
  const todo = texts.filter((t) => !live.has(t.trim().toLowerCase()))
  console.log(`seed: ${texts.length} statements, ${texts.length - todo.length} already live, ${todo.length} to add${write ? '' : ' (DRY: pass --write)'}`)
  for (const t of todo) console.log(`  + ${t}`)
  if (!write || todo.length === 0) return
  const { error: insertError } = await admin.from(TABLE_STATEMENTS).insert(todo.map((text) => ({ client_id: clientId, text, created_by: null })))
  if (insertError) throw insertError
  console.log(`seed: added ${todo.length}`)
}

if (process.argv[1]?.endsWith('statements-seed.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
