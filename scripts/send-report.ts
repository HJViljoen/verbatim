import { writeFileSync } from 'fs'
import { previewWeeklyReport, generateWeeklyReport } from '../lib/report'

// Preview / test the weekly report. Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/send-report.ts [flags]
//
// Default mode is a safe PREVIEW — builds the report HTML and writes it to a file,
// no DB write and no email. Use --commit to actually store it (weekly_reports) and,
// unless --no-send, attempt delivery via Resend.
//
// Flags:
//   --client <uuid>  client_id (default: Ossur)
//   --run <uuid>     specific pipeline run (default: latest completed/partial)
//   --out <file>     where to write the HTML preview (default: report-preview.html)
//   --commit         persist to weekly_reports (and send unless --no-send)
//   --no-send        with --commit, store but don't email

const OSSUR = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

function parseArgs(argv: string[]) {
  const a = { clientId: OSSUR, runId: undefined as string | undefined, out: 'report-preview.html', commit: false, send: true }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--client') a.clientId = next()!
    else if (flag === '--run') a.runId = next()
    else if (flag === '--out') a.out = next()!
    else if (flag === '--commit') a.commit = true
    else if (flag === '--no-send') a.send = false
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.commit) {
    const preview = await previewWeeklyReport({ clientId: args.clientId, runId: args.runId })
    if (!preview) {
      console.error('No completed run to report on for client', args.clientId)
      process.exit(1)
    }
    writeFileSync(args.out, preview.html)
    console.log('PREVIEW (no DB write, no email)')
    console.log('  run:       ', preview.runId)
    console.log('  subject:   ', preview.subject)
    console.log('  recipients:', preview.recipients.length ? preview.recipients.join(', ') : '(none configured)')
    console.log('  html ->    ', args.out, `(${preview.html.length} bytes)`)
    console.log('\n--- text version ---\n' + preview.text)
    return
  }

  const res = await generateWeeklyReport({ clientId: args.clientId, runId: args.runId, send: args.send })
  console.log('COMMITTED')
  console.log(JSON.stringify(res, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
