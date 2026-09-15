import { scriptActor } from '../lib/config-log'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import {
  fillingMonths,
  freezeMonths,
  monthStartOf,
  monthsBetween,
  monthsToRefresh,
  readDenominators,
  readThemeReadings,
  windowOf,
} from '../lib/reading/monthly'
import { backReadBlockers, subjectMonthSide, type SubjectBackReadState } from '../lib/subjects/read'
import {
  JUDGE_VERSION,
  RPC_SUBJECT_BAND,
  SUBJECT_MATCH_HIGH,
  SUBJECT_MATCH_LOW,
  TABLE_SUBJECTS,
  TABLE_SUBJECT_MEMBERSHIPS,
  isMissingSubjects,
  type SubjectStatus,
} from '../lib/subjects/types'
import type { EvidenceRefSummary } from '../lib/reading/evidence-refs'
import type { DenominatorReading, ThemeReading } from '../lib/reading/types'

// The comment-dated monthly reading, read out loud — and, with --write, seeded
// (Phase 0 WP3, 2026-09-15).
//
// Every theme number on screen today is a per-RUN reading of a cumulative
// corpus. This prints the other one: one clustering, read month by month, dated
// by when the comment was written. Read-only by default.
//
// --write seeds the back-read: every month the corpus reaches back to, written
// once. Months whose 30-day line has already passed are stored FROZEN and
// marked `back_read`, because that is what they are — a reading of today's
// corpus, not the reading anyone was given at the time, and nothing can
// recover the latter (an older run's citations are 20–44% eroded by the Pass A
// prune and the deleted rows are unrecoverable). The months still open are
// stored `filling` and the pipeline's freeze-months step takes them from there.
//
// The seed reads ONE run's clustering — by default the tenant's latest, the
// same one the product is showing — so every month in the table is the same
// question asked of a different month, which is the whole point.
//
// --write refuses a tenant whose clustering could not be named, unless
// --denominators-only says so out loud: a seed that cannot say which clustering
// it read freezes every back-read month's denominators with no theme readings
// at all, and nothing ever revisits a frozen month (monthsToRefresh only walks
// back through FILLING ones). A second run would write the theme rows under a
// LATER clustering, which is the one thing these two tables exist to prevent.
//
// THE SUBJECT SIDE IS ONE-SHOT, AND THIS IS THE ONLY THING THAT READS ITS
// HISTORY. The pipeline's freeze-months visits the current month, the one
// before it and whatever is still `filling`; a frozen audience-month is never
// revisited. So the 201 audience-months that were already frozen when
// month_subject_readings was created get their subject rows here, once, and
// decision K refuses every later addition to them. The order that has to hold:
//
//   1. every subject named AND confirmed (`activateSubject`);
//   2. scripts/subject-membership.ts --client <uuid> --apply, to completion;
//   3. then this, once, with --write.
//
// Out of order the damage is permanent — a subject with no members at that
// instant writes no row and is refused for ever. So --write ASKS first
// (backReadBlockers) and, when the answer is no, writes the denominators and
// the themes and leaves the subject side unspent, which keeps the one shot.
// --force-subjects overrides that, for an operator who means it.
//
// --write IS ALSO THE ONLY THING THAT WILL EVER GIVE A CLOSED MONTH ITS
// EVIDENCE IDS (item 31a, 2026-09-18). The pipeline's freeze-months step calls
// the refs freeze for the months monthsToRefresh returns, and that is the
// filling months plus the walk-back of open ones — never a closed one. On
// production 2026-09-15 that is 13 audience-months of 214; the other 201
// (2020-10 → 2026-07) can only be given their ids here, through the INSERT
// guard's decision-K arm, which accepts the FIRST back-read of an
// audience-month that closed before month_evidence_refs existed. Once. So this
// is a prerequisite of the tile that prints "8 of 31 voices still quotable",
// not an optional tidy-up: run it per tenant after 20260918095000 is applied
// and before that reader ships, or the historical series opens to nothing and
// the frozen guard refuses the correction.
//
//   node --env-file=.env.local --import tsx scripts/monthly-reading.ts [--client <uuid>] [--run <uuid>] [--all] [--write] [--denominators-only] [--force-subjects]

interface Args {
  clientId: string | null
  runId: string | null
  all: boolean
  write: boolean
  denominatorsOnly: boolean
  forceSubjects: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { clientId: null, runId: null, all: false, write: false, denominatorsOnly: false, forceSubjects: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--run') args.runId = argv[++i]
    else if (argv[i] === '--all') args.all = true
    else if (argv[i] === '--write') args.write = true
    else if (argv[i] === '--denominators-only') args.denominatorsOnly = true
    else if (argv[i] === '--force-subjects') args.forceSubjects = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  return args
}

const RECENT_MONTHS = 12

/**
 * The ids behind the numbers (item 31a), on the same terms as the counts: on a
 * dry run this is the ONLY preview of what the refs freeze would write, and it
 * is the number an operator needs before deciding to seed a back-read.
 *
 * `refusedLate` is the one that matters most and reads the least: it is the
 * count of points the record declined to take because their audience-month had
 * already closed — a question a reader will ask that will never be answerable.
 */
function printEvidenceRefs(refs: EvidenceRefSummary | undefined, verb: 'would' | 'WROTE'): void {
  if (!refs) {
    console.log('  evidence ids: not read — no clustering to attribute them to (--denominators-only, or no run)')
    return
  }
  if (refs.missing) {
    console.log('  evidence ids: not read — apply supabase/migrations/20260918095000_quote_translations.sql first. The months seed without them, and a month that closes without its ids cannot be given them later.')
    return
  }
  console.log(
    verb === 'would'
      ? `  would write ${refs.written} evidence-id rows (${refs.frozen} frozen at once, back-read), naming ` +
        `${refs.videoIds} videos and ${refs.commentIds} comments; ${refs.keptFrozen} stored rows are already frozen.`
      : `  WROTE ${refs.written} evidence-id rows (${refs.frozen} frozen), naming ${refs.videoIds} videos ` +
        `and ${refs.commentIds} comments; ${refs.keptFrozen} frozen rows untouched, ${refs.deleted} stale filling rows dropped.`,
  )
  if (refs.refusedLate > 0) {
    console.log(
      `  ${refs.refusedLate} evidence-id rows ${verb === 'would' ? 'would be' : 'were'} REFUSED: their audience-months ` +
      'have closed. "Which videos was this read on" stays unanswered for those points, for good.',
    )
  }
}

const mix = (m: Record<string, number>): string =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${p} ${n}`)
    .join(' · ') || '—'

/**
 * Why this tenant's subject history must not be written yet — see
 * `backReadBlockers`. An empty list is a go; a database without M4, or with no
 * subjects at all, returns the same "nothing is confirmed" refusal, which is
 * the right answer: writing no subject rows keeps the one shot for later.
 */
async function subjectBlockers(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
): Promise<string[]> {
  let rows: { id: string; name: string; status: SubjectStatus }[]
  try {
    // Every LIVE subject, not just the active ones: a subject sitting in
    // 'proposed' is the commonest way to lose a whole history, and it is
    // invisible to loadActiveSubjects by design.
    const { data, error } = await admin
      .from(TABLE_SUBJECTS)
      .select('id, name, status')
      .eq('client_id', clientId)
      .neq('status', 'retired')
      .order('named_at', { ascending: true })
    if (error) throw error
    rows = (data ?? []) as { id: string; name: string; status: SubjectStatus }[]
  } catch (e) {
    if (!isMissingSubjects(e)) throw e
    return ['subjects are not switched on for this database yet (20260918093000_subjects.sql is not applied)']
  }

  const state: SubjectBackReadState[] = []
  for (const r of rows) {
    const { count, error } = await admin
      .from(TABLE_SUBJECT_MEMBERSHIPS)
      .select('subject_id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('subject_id', r.id)
      .eq('judge_version', JUDGE_VERSION)
    if (error) throw new Error(`${TABLE_SUBJECT_MEMBERSHIPS} count: ${error.message}`)
    // What the judge has NOT decided yet, asked of the same function the
    // membership pass reads — a pass that stopped at its ceiling leaves rows
    // here and nowhere else. One row is enough to know; the count is what the
    // band would hand the next --apply.
    const { count: bandCount, error: bandError } = await admin.rpc(
      RPC_SUBJECT_BAND,
      {
        p_client: clientId,
        p_subject: r.id,
        p_low: SUBJECT_MATCH_LOW,
        p_high: SUBJECT_MATCH_HIGH,
        p_judge: JUDGE_VERSION,
      },
      { count: 'exact', head: true },
    )
    if (bandError) throw new Error(`${RPC_SUBJECT_BAND}: ${bandError.message}`)
    state.push({ ...r, decided: count ?? 0, undecided: bandCount ?? 0 })
  }
  return backReadBlockers(state)
}

async function main() {
  const { clientId, runId: runOverride, all, write, denominatorsOnly, forceSubjects } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: clients, error: clientErr } = await admin
    .from('clients')
    .select('id, company_name')
    .order('created_at', { ascending: true })
  if (clientErr) throw new Error(`clients: ${clientErr.message}`)
  const tenants = (clients ?? []).filter((c) => !clientId || c.id === clientId)
  if (tenants.length === 0) throw new Error(clientId ? `no client ${clientId}` : 'no clients')

  console.log(`${write ? 'WRITE' : 'DRY RUN'} · ${now}\n`)

  for (const tenant of tenants) {
    const id = tenant.id as string
    const name = tenant.company_name as string

    // The clustering to read the months with: this tenant's latest, unless one
    // was named. A month read with someone else's run is not comparable to one
    // read with this one.
    let runId = runOverride
    let runDate: string | null = null
    {
      // Checked, like every other read here: a dropped error would make "this
      // read failed" look exactly like "this tenant has no clustering yet",
      // and under --write the difference is a permanent freeze with no
      // numerators in it.
      const { data, error: obsErr } = await admin
        .from('theme_observations')
        .select('run_id, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (obsErr) throw new Error(`theme_observations: ${obsErr.message}`)
      const latest = (data ?? [])[0] as { run_id: string | null; created_at: string } | undefined
      if (!runOverride) runId = latest?.run_id ?? null
      runDate = latest?.created_at?.slice(0, 10) ?? null
    }

    // How far back the corpus reaches. Comments, not videos: the reading is
    // dated by when the comment was written, and a 2020 comment on a 2020 post
    // arrived here in one of this year's scrapes.
    const { data: earliestRows, error: earliestErr } = await admin
      .from('comments')
      .select('comment_date')
      .eq('client_id', id)
      .not('comment_date', 'is', null)
      .order('comment_date', { ascending: true })
      .limit(1)
    if (earliestErr) throw new Error(`comments: ${earliestErr.message}`)
    const earliest = (earliestRows ?? [])[0]?.comment_date as string | undefined
    if (!earliest) {
      console.log(`${name} — no dated comments yet, nothing to read.\n`)
      continue
    }

    const months = monthsBetween(earliest, now)
    const window = windowOf(months)
    if (!window) continue

    const denominators = await readDenominators(admin, id, window)
    const themes: ThemeReading[] = runId ? await readThemeReadings(admin, id, runId, window) : []

    // Labels, for the "biggest theme this month" column. theme_registry holds
    // the stable identity and its latest label; the label is what churns, so it
    // is printed as decoration and never used as a key.
    const labels = new Map<string, string>()
    if (themes.length > 0) {
      const rows = await selectAll<{ id: string; canonical_label: string | null }>(() =>
        admin.from('theme_registry').select('id, canonical_label').eq('client_id', id).order('id', { ascending: true }),
      )
      for (const r of rows) labels.set(r.id, r.canonical_label ?? '(unlabelled)')
    }

    const open = monthsToRefresh(now, await fillingMonths(admin, id))
    const openSet = new Set(open)

    const shown = all ? months : months.slice(-RECENT_MONTHS)
    const shownSet = new Set(shown)
    const table = denominators
      .filter((d: DenominatorReading) => shownSet.has(monthStartOf(d.month)))
      .map((d) => {
        const month = monthStartOf(d.month)
        const mine = themes.filter((t) => monthStartOf(t.month) === month && t.audience === d.audience)
        const top = [...mine].sort((a, b) => b.videos - a.videos)[0]
        return {
          month: month.slice(0, 7),
          audience: d.audience,
          videos: d.videos,
          comments: d.comments,
          platforms: mix(d.platform_mix),
          'names a rival': d.dual_mention,
          undated: d.excluded_undated,
          themes: mine.length,
          'biggest theme': top ? `${labels.get(top.theme_id) ?? top.theme_id} (${top.videos})` : '—',
          state: openSet.has(month) ? 'still filling' : 'closed',
        }
      })

    console.log(
      `${name} — ${months.length} months, ${denominators.length} audience-months, ` +
      `${themes.length} theme-months` +
      (runId ? ` · clustering: run ${runId.slice(0, 8)}${runDate ? ` (${runDate})` : ''}` : ' · no clustering yet, denominators only'),
    )
    console.log(`  reading window ${window.from.slice(0, 10)} → ${window.to.slice(0, 10)} · still open: ${open.join(' ') || 'none'}`)
    if (!all && months.length > shown.length) {
      console.log(`  showing the last ${RECENT_MONTHS} months; --all for every month back to ${months[0].slice(0, 7)}`)
    }
    console.table(table)

    // The subject side is part of the SAME visit, here as in the pipeline: the
    // denominator's freeze closes the audience-month, so a numerator written
    // after it is refused. A tenant with no subjects, or a database without
    // M4, simply contributes an empty side.
    //
    // But it rides along ONLY if the subject set is ready, because this visit
    // is the only one those closed months will ever get.
    const blockers = await subjectBlockers(admin, id)
    const carrySubjects = blockers.length === 0 || forceSubjects
    if (blockers.length > 0) {
      console.log(`  subjects: ${carrySubjects ? 'FORCED ON' : 'not written this visit'} —`)
      for (const b of blockers) console.log(`    · ${b}`)
      if (!carrySubjects) {
        console.log(
          '    Fix those, then re-run. The denominators and themes below are written either way; ' +
          'leaving the subject side out is what keeps the one shot at the closed months.',
        )
      }
    }
    const sides = carrySubjects ? [subjectMonthSide(admin, id)] : []
    const plan = await freezeMonths(admin, { clientId: id, runId, months, now, dryRun: true, sides })
    const planSides = Object.values(plan.sides)
    console.log(
      `  a seed would write ${plan.denominators.written} denominator rows ` +
      `(${plan.denominators.frozen} frozen at once, back-read) and ` +
      Object.entries(plan.sides).map(([t, s2]) => `${s2.written} ${t} rows (${s2.frozen} frozen at once)`).join(', ') +
      `; ${plan.denominators.keptFrozen + planSides.reduce((n, s2) => n + s2.keptFrozen, 0)} stored rows are already frozen and would be left alone.`,
    )
    // The row counts for the kind and mood tables are in the line above with
    // every other side; what is NOT in it is the panel those attention numbers
    // were read over, and whether the two tables were there to read at all.
    if (plan.skippedKindMoodAttention) {
      console.log('  kinds, mood and attention: skipped — 20260918094000_kind_mood_attention.sql is not applied here.')
    } else {
      console.log(
        `  the mood/attention rows are read over ` +
        `${plan.panelId ? `panel ${plan.panelId}` : 'no attention panel — the attention half would read nothing'}.`,
      )
    }
    const held = plan.denominators.heldStale + planSides.reduce((n, s2) => n + s2.heldStale, 0)
    if (held > 0) {
      console.log(
        `  ${held} stored filling rows would be held rather than dropped: a reading came back empty, ` +
        'which is a reading that did not happen, not a month that emptied.',
      )
    }
    const late = plan.denominators.refusedLate + planSides.reduce((n, s2) => n + s2.refusedLate, 0)
    if (late > 0) {
      console.log(
        `  ${late} fresh rows would NOT be written: their audience-months have closed and this table ` +
        'already holds a reading of them. A late discovery is an accrual against a fresh reading, ' +
        'never an addition to a month that is already the record.',
      )
    }
    // The ids behind those numbers (item 31a) — "which videos was this read
    // on". Previewing it is the point of a dry run, so it is printed on the
    // same terms as the counts above.
    printEvidenceRefs(plan.evidenceRefs, 'would')

    if (write) {
      // A freeze is permanent (`month_denominators_frozen_guard` refuses any
      // later UPDATE) and unrecoverable for the clustering it was meant to
      // record. Writing denominators with no clustering to attach numerators
      // to is therefore not a degraded seed, it is a wrong one — say so and
      // stop, rather than print one line among many and freeze the months.
      if (!runId && !denominatorsOnly) {
        throw new Error(
          `${name}: no clustering to read the months with, so --write would freeze ` +
          'denominators with no theme readings and nothing would ever revisit those months. ' +
          'Name one with --run <uuid>, or pass --denominators-only if that is genuinely what you want.',
        )
      }
      // The actor lets the seed freeze the tenant's first attention panel —
      // a configuration write, which never happens unattributed.
      const done = await freezeMonths(admin, {
        clientId: id, runId, months, now, sides,
        actor: scriptActor('scripts/monthly-reading.ts --write'),
      })
      const doneSides = Object.values(done.sides)
      const sum = (pick: (s2: (typeof doneSides)[number]) => number) => doneSides.reduce((n, s2) => n + pick(s2), 0)
      console.log(
        `  WROTE ${done.denominators.written} denominator rows and ` +
        Object.entries(done.sides).map(([t, s2]) => `${s2.written} ${t} rows`).join(', ') + '; ' +
        `${done.denominators.keptFrozen + sum((s2) => s2.keptFrozen)} frozen rows untouched, ` +
        `${done.denominators.deleted + sum((s2) => s2.deleted)} stale filling rows dropped, ` +
        `${done.denominators.heldStale + sum((s2) => s2.heldStale)} held because a reading came back empty, ` +
        `${done.denominators.refusedLate + sum((s2) => s2.refusedLate)} refused because their months have closed.` +
        `${done.panelFrozen ? ` An attention panel was frozen (${done.panelReason}: ${done.panelId}).` : ''}`,
      )
      printEvidenceRefs(done.evidenceRefs, 'WROTE')
    }
    console.log()
  }

  console.log(
    write
      ? 'A back-read month is a reading of today\'s corpus, not the reading that was given at the time —\n' +
        'nothing can recover the latter. Every month after this seed is written while it is still open.'
      : 'DRY RUN — nothing written. Re-run with --write to seed the back-read.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
