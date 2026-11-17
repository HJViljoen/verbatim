import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createAdminClient } from '../lib/supabase-admin'
import { INVOICE_BUCKET } from '../lib/finance/html'
import { applyPayments } from '../lib/finance/ledger'
import { fmtMoney } from '../lib/finance/money'
import { checkSeed, insertOrder, seedSql, seedUploads, type Seed } from '../lib/finance/seed'
import type { Invoice, Payment } from '../lib/finance/types'

/**
 * Finance backfill (2026-11-17): the issuer, the billing profiles, the
 * invoices and credit notes made by hand, the payments and the counters,
 * into the finance tables, and the PDFs already sent into the private
 * `invoices` bucket.
 *
 * The data is a seed JSON kept OUTSIDE the repository (the repository is
 * public): names, addresses, bank lines, amounts. lib/finance/seed.ts checks
 * it and writes one idempotent SQL script: rows already there are left alone,
 * counters only move forward, nothing is updated or deleted.
 *
 * DRY BY DEFAULT: prints what it would write and what the books would say,
 * and connects to nothing.
 *
 *   node --env-file=.env.local --import tsx scripts/finance-backfill.ts \
 *     --seed ~/path/to/finance-seed.local.json [--pdf-dir <dir>] [--sql-out <file>]
 *
 * --apply writes, through psql (PSQL, else `psql` on PATH), in one
 * transaction, to the database whose URL is in the env var named by
 * --target. It refuses production (mkwjlckescdveosvrvaq) unless
 * --i-mean-prod is passed as well. The PDFs go up through the service role
 * of NEXT_PUBLIC_SUPABASE_URL, and only when that is the same project as the
 * target (a local database has no storage: pass --skip-pdfs).
 *
 *   PROD_DB_URL=postgresql://… node --env-file=.env.local --import tsx \
 *     scripts/finance-backfill.ts --seed <seed> --apply --target PROD_DB_URL --i-mean-prod
 */

const PROD_REF = 'mkwjlckescdveosvrvaq'

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const has = (name: string) => process.argv.includes(name)
const die = (msg: string): never => {
  console.error(`finance-backfill: ${msg}`)
  process.exit(1)
}

function asInvoices(seed: Seed): Invoice[] {
  const ids = new Map(seed.invoices.map((i) => [i.number, `seed:${i.number}`]))
  return seed.invoices.map((i): Invoice => ({
    id: `seed:${i.number}`, number: i.number, kind: i.kind ?? (i.number.startsWith('CN-') ? 'credit_note' : 'invoice'),
    clientId: i.client_id, profileId: null, billTo: i.bill_to, subjectLine: i.subject_line ?? '', yourRef: i.your_ref ?? null,
    periodLabel: i.period_label, periodStart: i.period_start ?? null, issuedOn: i.issued_on, dueOn: i.due_on ?? null, currency: i.currency,
    fxNote: i.fx_note ?? null, lines: i.lines.map((l) => ({ description: l.description, qty: l.qty, unit: l.unit ?? 'month', unitPrice: l.unit_price, amount: l.amount })),
    total: i.total, relatesTo: i.relates_to ? (ids.get(i.relates_to) ?? null) : null, status: i.status, expectedOn: null, sentAt: i.sent_at ?? null,
    pdfPath: null, emailMessageId: null, sendError: null, sendClaimedAt: null, note: i.note ?? null,
  }))
}

async function main() {
  const seedPath = arg('--seed') ?? die('--seed <path> is required')
  const seed = JSON.parse(readFileSync(resolve(seedPath), 'utf8')) as Seed
  const problems = checkSeed(seed)
  if (problems.length) die(`the seed does not hold together:\n  ${problems.join('\n  ')}`)

  const pdfDir = resolve(arg('--pdf-dir') ?? dirname(resolve(seedPath)))
  const skipPdfs = has('--skip-pdfs')
  const uploads = seedUploads(seed).map((u) => ({ ...u, full: join(pdfDir, u.file) }))
  const missing = uploads.filter((u) => !existsSync(u.full))
  if (missing.length && !skipPdfs) die(`PDFs not found in ${pdfDir}:\n  ${missing.map((m) => m.file).join('\n  ')}`)

  // ---- What it would write ----------------------------------------------------
  console.log(`issuer        ${seed.issuer.name} (${seed.issuer.address_lines.length} address lines, ${seed.issuer.bank_lines.length} bank lines, from ${seed.issuer.email_from ?? 'NO SENDER'})`)
  for (const p of seed.profiles) {
    const month = p.lines.reduce((s, l) => s + Math.round(l.unit_usd * (p.currency === 'ZAR' ? p.fx_rate : 1) * 100) * l.qty, 0) / 100
    console.log(`profile       ${p.bill_to}: ${fmtMoney(month, p.currency)} a month (${p.lines.length} lines, R${p.fx_rate}/$), issued day ${p.issue_day}, ${p.due_rule}, ${p.send_mode}${p.hold_next ? ', next held' : ''}; to ${p.email_to.length}, cc ${p.email_cc?.length ?? 0}, bcc ${p.email_bcc?.length ?? 0}${p.note_once ? '; one-off note set' : ''}`)
  }
  for (const i of insertOrder(seed.invoices)) {
    const pdf = uploads.find((u) => u.number === i.number)
    console.log(`invoice       ${i.number.padEnd(8)} ${i.status.padEnd(9)} ${i.currency} ${fmtMoney(i.total, i.currency).padStart(11)}  issued ${i.issued_on}  due ${i.due_on ?? 'on receipt'}  ${i.period_label}${i.relates_to ? `  → ${i.relates_to}` : ''}  pdf ${pdf ? `${pdf.file} (${existsSync(pdf.full) ? `${Math.round(statSync(pdf.full).size / 1024)} KB` : 'MISSING'})` : '-'}`)
  }
  for (const p of seed.payments) console.log(`payment       ${p.received_on} ${fmtMoney(p.amount, p.currency)} ${p.reference ?? ''}`)
  console.log(`counters      next invoice ${String(seed.counters.invoice).padStart(4, '0')}, next credit note CN-${String(seed.counters.credit_note).padStart(4, '0')}`)

  const today = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10)
  const ledger = applyPayments(asInvoices(seed), seed.payments.map((p, n): Payment => ({ id: `p${n}`, clientId: p.client_id, receivedOn: p.received_on, amount: p.amount, currency: p.currency, reference: p.reference ?? null, note: p.note ?? null })), today)
  const owed = new Map<string, number>()
  for (const b of ledger.byId.values()) if (b.balanceCents > 0) owed.set(b.currency, (owed.get(b.currency) ?? 0) + b.balanceCents)
  console.log(`books after   owed ${[...owed].map(([c, cents]) => fmtMoney(cents / 100, c as 'ZAR' | 'USD')).join(' + ') || 'nothing'}; ` +
    [...ledger.byId.values()].map((b) => `${b.number} ${b.state}`).join(', '))

  const sql = seedSql(seed)
  const sqlOut = arg('--sql-out')
  if (sqlOut) {
    writeFileSync(sqlOut, sql)
    console.log(`sql           written to ${sqlOut}`)
  }

  if (!has('--apply')) {
    console.log('\ndry run: nothing written. --apply --target <ENV_VAR> writes.')
    return
  }

  // ---- Writing ----------------------------------------------------------------
  const envName = arg('--target') ?? die('--apply needs --target <ENV_VAR> holding the database URL')
  const url = process.env[envName] ?? die(`${envName} is not set`)
  if (!/^postgres(ql)?:\/\//.test(url)) die(`${envName} is not a postgres:// URL`)
  if (url.includes(PROD_REF) && !has('--i-mean-prod')) die('that is production. Pass --i-mean-prod as well if you mean it.')

  const psql = process.env.PSQL ?? 'psql'
  const run = spawnSync(psql, [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', '-'], { input: sql, encoding: 'utf8' })
  if (run.status !== 0) die(`psql failed (nothing written: one transaction):\n${run.stderr || run.stdout}`)
  console.log('rows          written (rows already there left alone)')

  if (skipPdfs) {
    console.log('pdfs          skipped (--skip-pdfs)')
    return
  }
  const storageRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://none').hostname.split('.')[0]
  if (!storageRef || !url.includes(storageRef)) {
    die(`the PDFs would go to project ${storageRef || '(none)'}, which is not the target database's. Rows are written; rerun with --skip-pdfs, or point NEXT_PUBLIC_SUPABASE_URL at the target's project.`)
  }
  const storage = createAdminClient().storage.from(INVOICE_BUCKET)
  for (const u of uploads) {
    const { error } = await storage.upload(u.path, readFileSync(u.full), { contentType: 'application/pdf', upsert: true })
    if (error) die(`upload ${u.file} → ${u.path}: ${error.message}`)
    console.log(`pdf           ${u.file} → ${INVOICE_BUCKET}/${u.path}`)
  }
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)))
