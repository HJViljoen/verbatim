import { readFileSync, writeFileSync } from 'fs'

import { createAdminClient, selectAll } from '../lib/supabase-admin'
import {
  calibrationQuota,
  calibrationScoreFloor,
  clearsPrecisionGate,
  formatPrecisionTable,
  pickCalibrationPairs,
  precisionAt,
  precisionTable,
  type LabelledPair,
} from '../lib/subjects/calibration'
import { loadActiveSubjects } from '../lib/subjects/membership'
import {
  JUDGE_VERSION,
  RPC_SUBJECT_BAND,
  SUBJECT_CALIBRATION_SAMPLE,
  SUBJECT_MATCH_HIGH,
  SUBJECT_MATCH_LOW,
  SUBJECT_PRECISION_FLOOR,
  TABLE_SUBJECTS,
  TABLE_SUBJECT_MEMBERSHIPS,
} from '../lib/subjects/types'

// The precision gate (design :891). Two commands and a person in between.
//
//   1. node --env-file=.env.local --import tsx scripts/subject-calibration.ts \
//        --client <uuid> --emit labels.jsonl
//      Writes one line per (subject, insight) PAIR: the subject, what the
//      audience said, the machine's similarity score, and `"label": null` for a
//      person to fill in.
//
//      THE BUDGET IS 200 PAIRS PER TENANT, NOT 200 INSIGHTS. A decision is
//      about a pair, so 200 insights crossed with every active subject is
//      1,000-1,600 labels — days of reading, not the afternoon the design
//      budgets. The sheet is split evenly across the subjects instead (40 each
//      at five, 25 at eight) and drawn only from pairs at or above the lowest
//      threshold the table tries: below that the shipped procedure answers "not
//      a member" whatever the label says, so those labels buy nothing. What
//      that costs is honest and stated — recall below the floor is NOT measured
//      by this sheet, and `missed` counts only the members it could have found.
//
//   2. …edit labels.jsonl, replacing every null with true or false…
//
//   3. node --env-file=.env.local --import tsx scripts/subject-calibration.ts \
//        --client <uuid> --score labels.jsonl [--apply]
//      Prints precision at every threshold pair, and with --apply records the
//      shipped pair's figure on each subject. A subject whose figure is under
//      85% — or absent — prints "calibrating" everywhere and its share is not
//      shown to a client.
//
// WHY A PERSON. Nothing here can tell whether an insight really is about
// "comfort"; that IS the question the whole mechanism answers, so there is no
// ground truth to compute against. The sample is hashed rather than strided so
// the sheet that gets labelled is the sheet that gets scored, and so the sample
// is not secretly a sample of whichever run last re-read the corpus.
//
// SPENDS NOTHING. It reads vectors that already exist and judge decisions that
// have already been paid for. A pair inside the band with no decision on file
// is counted as `unknown` and printed, never scored as a miss.

interface Args { clientId: string; emit: string | null; score: string | null; apply: boolean; sample: number }

// `sample` is the tenant's WHOLE sheet in pairs, split across its subjects —
// see calibrationQuota.

function parseArgs(argv: string[]): Args {
  const args: Args = { clientId: '', emit: null, score: null, apply: false, sample: SUBJECT_CALIBRATION_SAMPLE }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--emit') args.emit = argv[++i]
    else if (argv[i] === '--score') args.score = argv[++i]
    else if (argv[i] === '--apply') args.apply = true
    else if (argv[i] === '--sample') args.sample = Number(argv[++i])
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (!args.clientId) throw new Error('--client <uuid> is required')
  if (!args.emit && !args.score) throw new Error('one of --emit <file> or --score <file> is required')
  if (args.emit && args.score) throw new Error('--emit and --score are two different runs; pass one')
  if (!Number.isFinite(args.sample) || args.sample <= 0) throw new Error('--sample must be a positive integer')
  return args
}

type Admin = ReturnType<typeof createAdminClient>

/** Every live insight's similarity to one subject, at no threshold at all —
 *  p_low 0 makes subject_band a plain scorer, which is what a calibration needs
 *  and a membership pass must never do. p_judge is a version nothing has ever
 *  been decided under, so no judged pair is filtered out. A pair a PERSON has
 *  corrected is filtered out, at every judge version, and belongs out: the
 *  shipped procedure's answer there is the person's, not the one this sheet is
 *  measuring. */
async function scoreAll(admin: Admin, clientId: string, subjectId: string) {
  return selectAll<{ audience_insight_id: string; score: number }>(() =>
    admin
      .rpc(RPC_SUBJECT_BAND, {
        p_client: clientId,
        p_subject: subjectId,
        p_low: 0,
        p_high: 1.1,
        p_judge: '__calibration__',
      })
      .order('audience_insight_id', { ascending: true }),
  )
}

async function main() {
  const { clientId, emit, score, apply, sample } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()
  const subjects = await loadActiveSubjects(admin, clientId)
  if (subjects.length === 0) throw new Error('no active subjects for this tenant — confirm a set in Settings first')

  if (emit) {
    const ids = await selectAll<{ id: string; theme: string; description: string }>(() =>
      admin
        .from('audience_insights_current')
        .select('id, theme, description')
        .eq('client_id', clientId)
        .not('embedding', 'is', null)
        .order('id', { ascending: true }),
    )
    const text = new Map(ids.map((r) => [r.id, r]))
    const quota = calibrationQuota(subjects.length, sample)
    const floor = calibrationScoreFloor()
    const lines: string[] = []
    const insights = new Set<string>()
    for (const s of subjects) {
      const scored = (await scoreAll(admin, clientId, s.id))
        .filter((row) => text.has(row.audience_insight_id))
        .map((row) => ({ audienceInsightId: row.audience_insight_id, score: row.score }))
      for (const row of pickCalibrationPairs(s.id, scored, quota, floor)) {
        const t = text.get(row.audienceInsightId)!
        insights.add(row.audienceInsightId)
        lines.push(JSON.stringify({
          subjectId: s.id,
          subject: s.name,
          audienceInsightId: row.audienceInsightId,
          said: `${t.theme.replace(/_/g, ' ')}: ${t.description}`,
          score: Math.round(row.score * 10000) / 10000,
          label: null,
        }))
      }
    }
    writeFileSync(emit, lines.join('\n') + '\n')
    console.log(
      `[subject-calibration] ${lines.length} pairs to label — up to ${quota} for each of ${subjects.length} subjects, ` +
      `over ${insights.size} distinct insights, all at or above ${floor} → ${emit}`,
    )
    console.log('[subject-calibration] replace every "label": null with true or false, then re-run with --score.')
    console.log(`[subject-calibration] pairs below ${floor} are not asked about: no threshold pair in the table would call them members, so a label there changes nothing. Recall below it is not measured.`)
    return
  }

  // --score
  const raw = readFileSync(score!, 'utf8').split('\n').filter((l) => l.trim())
  const rows = raw.map((l) => JSON.parse(l) as { subjectId: string; audienceInsightId: string; score: number; label: boolean | null })
  const unlabelled = rows.filter((r) => r.label === null).length
  if (unlabelled > 0) console.warn(`[subject-calibration] ${unlabelled} pair(s) still unlabelled — they are skipped, not counted as no.`)

  // The judge decisions already on file, so a band pair is scored by what the
  // shipped procedure would actually say rather than by the vector alone.
  const decisions = new Map<string, boolean>()
  for (const s of subjects) {
    const mem = await selectAll<{ audience_insight_id: string; member: boolean }>(() =>
      admin
        .from(TABLE_SUBJECT_MEMBERSHIPS)
        .select('audience_insight_id, member')
        .eq('client_id', clientId)
        .eq('subject_id', s.id)
        .eq('judge_version', JUDGE_VERSION)
        .eq('method', 'judge')
        .order('audience_insight_id', { ascending: true }),
    )
    for (const m of mem) decisions.set(`${s.id}|${m.audience_insight_id}`, m.member)
  }

  const bySubject = new Map<string, LabelledPair[]>()
  for (const r of rows) {
    if (r.label === null) continue
    const pair: LabelledPair = {
      subjectId: r.subjectId,
      audienceInsightId: r.audienceInsightId,
      score: r.score,
      judged: decisions.get(`${r.subjectId}|${r.audienceInsightId}`) ?? null,
      label: r.label,
    }
    const list = bySubject.get(r.subjectId) ?? []
    list.push(pair)
    bySubject.set(r.subjectId, list)
  }

  console.log(`[subject-calibration] judge ${JUDGE_VERSION} · floor ${Math.round(SUBJECT_PRECISION_FLOOR * 100)}%\n`)
  for (const s of subjects) {
    const pairs = bySubject.get(s.id) ?? []
    console.log(`${s.name} — ${pairs.length} labelled pairs`)
    if (pairs.length === 0) { console.log('  (nothing labelled)\n'); continue }
    console.log(formatPrecisionTable(precisionTable(pairs)))
    const shipped = precisionAt(pairs, SUBJECT_MATCH_HIGH, SUBJECT_MATCH_LOW)
    const clears = clearsPrecisionGate(shipped)
    console.log(`  → ${clears ? 'READY' : 'CALIBRATING'} at the shipped pair` + (shipped.unknown > 0 ? ` (${shipped.unknown} band pairs have no judge decision on file; run scripts/subject-membership.ts --apply first for a complete figure)` : ''))
    if (apply) {
      const { error } = await admin
        .from(TABLE_SUBJECTS)
        .update({
          calibrated_at: new Date().toISOString(),
          calibration_precision: shipped.precision,
          calibration_n: pairs.length,
          calibration_judge_version: JUDGE_VERSION,
          updated_at: new Date().toISOString(),
        })
        .eq('id', s.id)
      if (error) throw new Error(`subjects calibration write: ${error.message}`)
      console.log(`  recorded: ${shipped.precision === null ? 'no precision' : `${(100 * shipped.precision).toFixed(1)}%`} over ${pairs.length} pairs`)
    }
    console.log('')
  }
  if (!apply) console.log('[subject-calibration] nothing recorded — re-run with --apply to write these figures onto the subjects.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
