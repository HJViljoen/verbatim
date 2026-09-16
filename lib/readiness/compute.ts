import { fmtInt, fmtPct, fullDate, listNames } from '../format'
import { changeLogBoundary } from '../config-log'
import { baselineLabel, BASELINE_MONTHS } from '../reading/anomaly'
import { shapeCoverage, type MonthCounts } from '../reading/coverage'
import { monthStartOf, trailingCompleteMonths } from '../reading/monthly'
import {
  audienceLabel,
  type ReadinessInputs,
  type ReadinessRow,
  type ReadinessStatus,
  type OwnerRole,
} from './types'

// The thirteen rows (Phase 0 WP10, design item 18). Pure: every number here
// comes from the `ReadinessInputs` object `load.ts` fills, and nothing in this
// file reads a clock, a database or an environment variable.
//
// THE RULE EVERY ROW FOLLOWS. `exists` means the block can be built and drawn
// for this workspace today. `partial` means the input is there but does not
// cover what the block will be asked to draw — half a corpus embedded, a
// discard record that starts after updates already sent. `missing` means the
// block has nothing to stand on. A row whose table is not there yet is
// `missing` and says so in words ("not recorded yet"), because a page that
// throws on an unapplied migration is a page nobody can use to decide whether
// to apply it.
//
// WHY THE NOTES MATTER MORE THAN THE PILL. Three of these rows are green or
// amber in aggregate and red for one rival, one community or one audience —
// Sealand's rival accounts are configured for all three and read for one, and
// Rareform has never appeared in a month at all. The per-item lines under each
// row are where that lives; the pill is the summary, never the whole answer.

const pct = (part: number, whole: number): string => (whole > 0 ? fmtPct((part / whole) * 100) : '—')

const plural = (n: number, word: string, many = `${word}s`): string => `${fmtInt(n)} ${n === 1 ? word : many}`

const dateOrNever = (iso: string | null | undefined, never: string): string => (iso ? fullDate(iso) : never)

/** The worst of a set of statuses — a block is only as ready as its weakest
 *  input. Used where one row summarises several things. */
function worst(...statuses: ReadinessStatus[]): ReadinessStatus {
  if (statuses.includes('missing')) return 'missing'
  if (statuses.includes('partial')) return 'partial'
  return 'exists'
}

function row(
  id: string,
  block: string,
  input: string,
  status: ReadinessStatus,
  detail: string,
  owner: OwnerRole,
  unlocks: string,
  notes: string[] = [],
  clientDetail?: string,
): ReadinessRow {
  return { id, block, input, status, detail, owner, unlocks, notes, ...(clientDetail ? { clientDetail } : {}) }
}

// ---- 1 · the rival accounts --------------------------------------------------

/** The cheapest red on the page and the only one a client can close without an
 *  engineering day, which is why it is first (design l.1778, and the research's
 *  own recommendation). Configured, captured and read are three states: a row
 *  that stops at "configured" reads green while the block it gates still has
 *  nothing to say. */
function rivalAccounts(i: ReadinessInputs): ReadinessRow {
  const rivals = i.rivals
  const configured = rivals.filter((r) => r.handlePlatforms.length > 0)
  const read = rivals.filter((r) => r.analysed > 0)
  const captured = rivals.reduce((n, r) => n + r.captured, 0)
  const analysed = rivals.reduce((n, r) => n + r.analysed, 0)

  const status: ReadinessStatus =
    rivals.length === 0 || configured.length === 0 ? 'missing'
      : read.length === rivals.length ? 'exists'
        : 'partial'

  const detail = rivals.length === 0
    ? 'No rival is named for this workspace.'
    : configured.length === 0
      ? `No accounts configured for ${plural(rivals.length, 'tracked rival')} — nothing they publish is being read.`
      : `${configured.length} of ${rivals.length} tracked rivals have accounts configured · ${plural(captured, 'post')} of their own captured, ${fmtInt(analysed)} read.`

  const notes = rivals.map((r) => {
    if (r.handlePlatforms.length === 0) return `${r.name} — no accounts configured`
    const where = listNames(r.handlePlatforms)
    const recent = r.capturedRecently > 0 ? `, ${fmtInt(r.capturedRecently)} in the last 30 days` : ''
    const readPart = r.analysed > 0 ? `${fmtInt(r.analysed)} read` : 'none read yet'
    return `${r.name} — ${where} · ${plural(r.captured, 'post')} captured${recent}, ${readPart}`
  })

  return row(
    'rival-accounts', 'Competitive', 'the rival accounts we read',
    status, detail, 'client',
    'Give us each rival’s account name per platform — the next update reads what they publish themselves.',
    notes,
  )
}

// ---- 2 · the tracked terms ---------------------------------------------------

function trackedTerms(i: ReadinessInputs): ReadinessRow {
  const t = i.terms
  const buckets = [t.brand, t.competitor, t.industry]
  const empty = buckets.filter((n) => n === 0).length
  const termsStatus: ReadinessStatus = buckets.every((n) => n === 0) ? 'missing' : empty > 0 ? 'partial' : 'exists'
  // Terms with no record of when they changed are terms nobody can audit.
  const logStatus: ReadinessStatus = i.changeLog.available && i.changeLog.rows > 0 ? 'exists' : 'partial'
  const status = worst(termsStatus, logStatus)

  // OWNER FOLLOWS THE BRANCH THAT PRODUCED THE STATUS. With every bucket
  // filled, the only thing holding this row short of green is that nothing in
  // the product records a change — and no client can apply a migration. Asking
  // them to "tell us what to add or drop" would not move the pill by a word,
  // which is exactly the confusion the owner column exists to prevent.
  const heldByLogOnly = termsStatus === 'exists' && !i.changeLog.available

  // `tracking_configs.updated_at` IS NOT A LAST-EDIT DATE, and printing it as
  // one was wrong by 26 days on the paying workspace. Four of the ten write
  // paths deliberately skip the column (`lib/gather/subreddit-discovery.ts`:
  // "the log is the record now, and `updated_at` never was one") — Össur's row
  // carries a community discovered on 13 Sep while the stamp still reads
  // 18 Aug. So the stamp is printed as what it is, a floor, and the change log
  // takes the sentence over the moment there is one, because the log is the
  // record.
  const changed = i.changeLog.available && i.changeLog.lastChangeAt
    ? `last change recorded ${fullDate(i.changeLog.lastChangeAt)}`
    : t.updatedAt
      ? `last stamped ${fullDate(t.updatedAt)} — not every edit stamps that date, so they may have changed since`
      : 'no edit has ever been stamped on them'
  const detail =
    `${plural(t.brand, 'brand term')}, ${plural(t.competitor, 'rival term')}, ${plural(t.industry, 'category term')}` +
    (t.exclude > 0 ? `, ${plural(t.exclude, 'exception')}` : '') +
    ` · ${changed}.`

  return row(
    'tracked-terms', 'Tracking', 'the words each update searches, and a record of when they changed',
    status, detail, heldByLogOnly ? 'ops' : 'client',
    heldByLogOnly
      ? 'Apply the change log, so that an edit to these words is written down when it happens.'
      : 'Tell us what to add or drop; the change log then carries who changed it and when.',
    [changeLogBoundary(i.changeLog.firstLoggedAt)],
  )
}

// ---- 3 · the watched communities --------------------------------------------

/** "Unprobed" is not the same as "needs probing": `r/onebag` was set watched by
 *  hand, deliberately and with a reason, and a row that counts it as a gap
 *  marks an operator decision as an oversight. So the count is of PROPOSED
 *  communities nobody has sampled, and a watched one with no sample is named
 *  instead. */
function communities(i: ReadinessInputs): ReadinessRow {
  const active = i.communities.filter((c) => c.status === 'active')
  const proposedUnsampled = i.communities.filter((c) => c.status === 'candidate' && !c.probed)
  const ruledOut = i.communities.filter((c) => c.status === 'rejected')
  const silent = active.filter((c) => c.postsStored === 0)
  const unconfiguredShare = i.reddit.postsStored > 0
    ? (i.reddit.postsFromUnconfigured / i.reddit.postsStored) * 100
    : 0

  const status: ReadinessStatus =
    active.length === 0 ? 'missing'
      : silent.length > 0 || unconfiguredShare >= 50 ? 'partial'
        : 'exists'

  const detail =
    `${fmtInt(active.length)} watched, ${fmtInt(proposedUnsampled.length)} proposed and not yet sampled, ${fmtInt(ruledOut.length)} ruled out` +
    (i.reddit.postsStored > 0
      ? ` · ${fmtPct(unconfiguredShare, 0)} of stored Reddit posts come from communities nobody configured.`
      : ' · no Reddit post stored yet.')

  // Every watched community and what it has returned, not just the silent
  // ones: a list of three where one is dead is a different picture from a
  // list of three where one is carrying the whole thing.
  const notes = active.map((c) =>
    `r/${c.name} — ${c.postsStored === 0 ? 'nothing stored from it yet' : plural(c.postsStored, 'post')}` +
    (c.probed ? '' : ' · watched by hand, never sampled'))

  return row(
    'communities', 'Reddit', 'the communities worth watching, and what they return',
    status, detail, 'ops',
    'Sample the proposed communities, drop the silent ones, and add the ones already producing posts from outside the list.',
    notes,
  )
}

// ---- 4 · the searchable corpus ----------------------------------------------

function embeddings(i: ReadinessInputs): ReadinessRow {
  const { embedded, total, lastEmbeddedAt } = i.embeddings
  const status: ReadinessStatus =
    total === 0 ? 'missing'
      : embedded === 0 ? 'missing'
        : embedded >= total ? 'exists'
          : 'partial'
  const detail = total === 0
    ? 'Nothing has been read for this workspace yet, so there is nothing to search.'
    : `${fmtInt(embedded)} of ${fmtInt(total)} findings are searchable (${pct(embedded, total)}) · ` +
      (lastEmbeddedAt ? `last written ${fullDate(lastEmbeddedAt)}.` : 'no date recorded.')

  return row(
    'searchable-findings', 'Ask', 'every finding searchable, and kept that way',
    status, detail, 'ops',
    'Run the one-off backfill; from then on each update makes its own findings searchable.',
    embedded < total && embedded > 0
      ? [`${fmtInt(total - embedded)} findings cannot be found by a question asked about them`]
      : [],
  )
}

// ---- 5 · the subject set -----------------------------------------------------

function subjectSet(i: ReadinessInputs): ReadinessRow {
  const defined = i.subjectSet.defined
  const status: ReadinessStatus = defined === null || defined === 0 ? 'missing' : 'exists'
  const detail = defined === null
    ? 'There is no subject set — the product holds no such thing yet.'
    : defined === 0
      ? 'No subject has been named for this workspace yet.'
      : `${plural(defined, 'subject')} named.`

  return row(
    'subject-set', 'Subjects', 'the five to eight subjects this workspace is read against',
    status, detail, 'engineering',
    'Phase 1 builds the subject set and the form that names them; nothing can be entered before it.',
  )
}

// ---- 6 · the months of history ----------------------------------------------

/** One audience's months, shaped against the floor. Separated out because rows
 *  6 and 7 read the same stored months and must never disagree about them. */
function byAudience(i: ReadinessInputs): Map<string, MonthCounts[]> {
  const out = new Map<string, MonthCounts[]>()
  for (const audience of i.monthly?.tracked ?? []) out.set(audience, [])
  for (const m of i.monthly?.months ?? []) {
    out.set(m.audience, [...(out.get(m.audience) ?? []), { month: m.month, videos: m.videos, comments: m.comments }])
  }
  return out
}

const NOT_SEEDED = 'Not seeded yet — nothing has been written down month by month for this workspace.'

function monthsOfHistory(i: ReadinessInputs): ReadinessRow {
  const unlocks = 'Apply the monthly reading and seed it once per workspace; every update after that keeps it.'
  if (!i.monthly) {
    return row('months-of-history', 'History', `months carrying ${i.floor} videos, audience by audience`,
      'missing', NOT_SEEDED, 'ops', unlocks)
  }

  const shaped = [...byAudience(i).entries()]
    .map(([audience, months]) => shapeCoverage(audience, months, i.floor))
    .sort((a, b) => a.audience.localeCompare(b.audience))
  const clearing = shaped.filter((s) => s.monthsVideos > 0)
  const comparable = shaped.filter((s) => s.monthsVideos >= BASELINE_MONTHS)

  const status: ReadinessStatus =
    comparable.length > 0 ? 'exists' : clearing.length > 0 ? 'partial' : 'missing'
  const best = shaped.reduce((a, b) => (b.monthsVideos > a.monthsVideos ? b : a), shaped[0])
  const detail = shaped.length === 0
    ? NOT_SEEDED
    : clearing.length === 0
      ? `No month yet carries ${i.floor} videos in any audience — the biggest holds ${fmtInt(Math.max(...shaped.map((s) => s.biggestVideos), 0))}.`
      : `${plural(best.monthsVideos, 'month')} clear ${i.floor} videos in ${audienceLabel(best.audience).toLowerCase()}; ${clearing.length} of ${shaped.length} audiences clear any.`

  // An audience with months stored under a name nobody tracks any more is a
  // rival that was renamed after its months were seeded: `audience` is the
  // literal `competitor:<name>` string and part of the frozen rows' primary
  // key, so the old months stay where they are and the new name starts from
  // zero. Named here because the two rows would otherwise just look short.
  const tracked = new Set(i.monthly.tracked)
  const notes = shaped.map((s) =>
    `${audienceLabel(s.audience)} — ${s.monthsVideos} of ${s.monthsWithAny} months clear ${i.floor} videos (${s.monthsComments} clear ${i.floor} comments)` +
    (s.monthsWithAny === 0 ? ' · no month at all' : '') +
    (!tracked.has(s.audience) ? ' · filed under a name this workspace no longer tracks, so its months are a series of their own' : ''))

  return row('months-of-history', 'History', `months carrying ${i.floor} videos, audience by audience`,
    status, detail, 'ops', unlocks, notes)
}

// ---- 7 · the baseline the unusual-week check needs ---------------------------

function anomalyBaseline(i: ReadinessInputs): ReadinessRow {
  const unlocks = `Seed the monthly reading, then wait: a baseline is ${BASELINE_MONTHS} complete months carrying ${i.floor} videos.`
  if (!i.monthly) {
    return row('anomaly-baseline', 'Unusual weeks', `${BASELINE_MONTHS} complete months behind each audience`,
      'missing', NOT_SEEDED, 'ops', unlocks)
  }

  const trailing = new Set(trailingCompleteMonths(i.now, BASELINE_MONTHS))
  const shaped = [...byAudience(i).entries()].map(([audience, months]) => {
    const clearing = months.filter((m) => trailing.has(monthStartOf(m.month)) && m.videos >= i.floor).length
    return { audience, clearing }
  }).sort((a, b) => a.audience.localeCompare(b.audience))

  const ready = shaped.filter((s) => s.clearing >= BASELINE_MONTHS)
  const status: ReadinessStatus =
    ready.length > 0 ? 'exists' : shaped.some((s) => s.clearing > 0) ? 'partial' : 'missing'
  const detail = shaped.length === 0
    ? NOT_SEEDED
    : ready.length > 0
      ? `Baseline ready in ${ready.length} of ${shaped.length} audiences; the rest are still forming.`
      : `No audience has a baseline yet — the fullest is ${Math.max(...shaped.map((s) => s.clearing), 0)} of ${BASELINE_MONTHS} months.`

  const notes = shaped.map((s) => `${audienceLabel(s.audience)} — ${baselineLabel(s.clearing)}`)
  // WHAT THE CHECK HAS ACTUALLY SAID, not only whether it could speak. A
  // baseline that is ready and a check that has never raised anything are two
  // different states of this row, and until WP8 the page could only show the
  // first. The flags are the record the check writes (`anomaly_flags`); "not
  // recorded yet" is the answer before its migration is applied, and is not the
  // same sentence as "nothing has been unusual".
  notes.push(anomalyRecordLine(i.anomaly))

  return row('anomaly-baseline', 'Unusual weeks', `${BASELINE_MONTHS} complete months behind each audience`,
    status, detail, 'ops', unlocks, notes)
}

/** The one line the row prints about the check's own record.
 *
 *  THREE STATES, NOT TWO. "Not recorded yet" (no table), "no update has run the
 *  check", and "N updates were compared and this is what they said" are
 *  different answers, and an update the check REFUSED to compare — a thin week
 *  — is a fourth thing again: it is counted separately rather than folded into
 *  the updates that were compared, because a week nobody looked at cannot
 *  support "nothing was unusual". */
function anomalyRecordLine(a: ReadinessInputs['anomaly']): string {
  if (!a.available) return 'Flags raised — not recorded yet.'
  if (a.checks.length === 0) return 'Flags raised — no update has run the check yet.'
  const compared = a.checks.filter((c) => c.outcome === 'flagged' || c.outcome === 'nothing_unusual').length
  const skipped = a.checks.length - compared
  const aside = skipped === 0
    ? ''
    : skipped === 1
      ? ' One update was not compared with the months behind it.'
      : ` ${fmtInt(skipped)} updates were not compared with the months behind them.`
  if (compared === 0) return `Flags raised — none: no update has been compared yet.${aside}`
  const updates = compared === 1 ? 'one update' : `${fmtInt(compared)} updates`
  if (a.flags.length === 0) return `Flags raised — none in the ${updates} compared so far.${aside}`
  const newest = a.flags[0]
  const word = a.flags.length === 1 ? 'one' : fmtInt(a.flags.length)
  // THE LABEL NEEDS A FRAME. A flag's label is whatever the flagged object is
  // called, and for a KIND that is a verb phrase built to be a row label —
  // KIND_LABELS gives "Pushing back", "Saying it worked", "What made them look"
  // — so the bare sentence read "the most recent Pushing back in the week of
  // 7 Sep 2026". The labels are right; the sentence around them assumed a noun.
  return `Flags raised — ${word} in the ${updates} compared so far, the most recent about “${newest.label}” in the week of ${fullDate(newest.weekStart)}.${aside}`
}

// ---- 8 · how much of each video was read ------------------------------------

/** Reddit is out of the denominator by construction: a Reddit post has no
 *  speech and no screen, and leaving it in understates every share by the
 *  6–13% of the corpus it holds. */
function howMuchWasRead(i: ReadinessInputs): ReadinessRow {
  const r = i.reads
  const firstUpdate = [...i.updates].reverse().find((u) => u.status === 'completed' || u.status === 'partial')
  const recordCoversHistory = Boolean(r.gateFirstAt && firstUpdate && r.gateFirstAt <= firstUpdate.startedAt)
  // WHAT WAS NOT READ IS NOT THE SAME AS WHAT WAS NOT MEASURED. On a tenant
  // session before M8 the discard half of this row is unreadable rather than
  // empty (lib/gate-record.ts), and calling that `missing` did two things at
  // once: it printed "not recorded at all" about 1,700 verdicts, and — missing,
  // owned by engineering — it dropped the row out of Settings › Readiness under
  // a sentence saying this is part of the product we have not finished, about a
  // row that reads 798 of 1,596 videos today. Where the record cannot be read,
  // the row is what the READ DEPTH says it is and the discard note is withheld.
  // PARTIAL, never `exists`, where the record cannot be read: half of what this
  // row measures was not measured, and a greener badge on less information is
  // the wrong direction to round in.
  const status: ReadinessStatus =
    r.analysed === 0 ? 'missing'
      : !r.gateReadable ? 'partial'
        : r.gateFirstAt === null ? 'missing'
          : recordCoversHistory && r.unflagged === 0 ? 'exists'
            : 'partial'

  const detail = r.analysed === 0
    ? 'No video has been read for this workspace yet.'
    : `Speech read on ${fmtInt(r.speech)} of ${fmtInt(r.analysed)} videos (${pct(r.speech, r.analysed)}), translated ${fmtInt(r.translated)} (${pct(r.translated, r.analysed)}), on-screen text ${fmtInt(r.onScreenText)} (${pct(r.onScreenText, r.analysed)}) · Reddit excluded.`

  const notes: string[] = []
  if (!r.gateReadable) {
    notes.push('What we looked at and set aside is recorded, and we do not yet show it to you, so the share left out is not drawn here.')
  } else if (r.gateFirstAt === null) {
    notes.push('What was looked at and set aside is not recorded at all, so the share left out cannot be drawn for any month.')
  } else {
    notes.push(`${pct(r.gateRows - r.gateKept, r.gateRows)} of what was looked at was set aside — recorded only from ${fullDate(r.gateFirstAt)}, so no month before that can show it.`)
  }
  if (r.unflagged > 0) notes.push(`${fmtInt(r.unflagged)} videos were read before the product recorded which of the three it managed`)

  return row(
    'read-depth', 'How sound is this', 'what each update managed to read of a video, and what it set aside',
    status, detail, 'engineering',
    'Nothing to configure: the shares rise as transcripts, translation and on-screen text reach more videos, and the set-aside record only covers months after it began.',
    notes,
  )
}

// ---- 9 · the delivery record -------------------------------------------------

const SETTLED = new Set(['completed', 'partial'])

/** What an update's stored state means to a reader. `partial` is a real state
 *  and not a failure — the update went out, with something missing from it. */
const UPDATE_WORD: Record<string, string> = {
  completed: 'finished',
  partial: 'finished, with gaps',
  failed: 'did not finish',
}
const updateWord = (status: string): string => UPDATE_WORD[status] ?? 'still going'

/** The longest stretch between two updates that produced something, in whole
 *  days. Null when there are fewer than two. */
export function longestGapDays(updates: readonly { status: string; startedAt: string }[]): number | null {
  const times = updates
    .filter((u) => SETTLED.has(u.status))
    .map((u) => Date.parse(u.startedAt))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  if (times.length < 2) return null
  let longest = 0
  for (let n = 1; n < times.length; n++) longest = Math.max(longest, times[n] - times[n - 1])
  return Math.round(longest / 86_400_000)
}

function updateRecord(i: ReadinessInputs): ReadinessRow {
  const all = i.updates
  const settled = all.filter((u) => SETTLED.has(u.status))
  const recent = all.slice(0, i.recentUpdates)
  const recentSettled = recent.filter((u) => SETTLED.has(u.status))
  const stalled = recent.filter((u) => u.stalled === true)
  const first = settled.at(-1) ?? null
  const gap = longestGapDays(all)

  const status: ReadinessStatus =
    settled.length === 0 ? 'missing'
      : recentSettled.length < recent.length || stalled.length > 0 ? 'partial'
        : 'exists'

  const detail = settled.length === 0
    ? 'No update has finished for this workspace yet.'
    : `${recentSettled.length} of the last ${recent.length} updates finished · ` +
      `${plural(settled.length, 'update')} since ${first ? fullDate(first.startedAt) : '—'}` +
      (gap === null ? '.' : `, longest gap ${plural(gap, 'day')}.`)

  // The recent updates one line each, newest first — the shape of a run of
  // weeks is the thing an operator is actually reading this row for, and a
  // count of six out of eight hides whether the two were consecutive.
  const notes = [
    ...recent.map((u) =>
      `${fullDate(u.startedAt)} — ${updateWord(u.status)}` +
      (u.stalled === true ? ' · took longer than the stretch it covered' : '') +
      (i.slotsRecorded ? (u.scheduledFor ? ' · on schedule' : ' · by hand') : '')),
    ...(i.slotsRecorded
      ? []
      : ['Which scheduled slot each update served is not recorded yet, so a missed slot cannot be told from a manual update.']),
  ]

  return row(
    'update-record', 'Updates', 'a record of what ran, when, and over what stretch',
    status, detail, 'ops',
    'Nothing to configure: every finished update writes its own row, and the slot it served is recorded once the delivery record ships.',
    notes,
  )
}

// ---- 10 · where the update goes ---------------------------------------------

function delivery(i: ReadinessInputs): ReadinessRow {
  const paused = i.delivery.period === 'paused'
  const live = i.delivery.schedules.filter((s) => s.active && s.recipients > 0)
  const addresses = live.reduce((n, s) => n + s.recipients, 0)
  const lastSent = i.delivery.schedules
    .map((s) => s.lastSentAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1) ?? null

  const status: ReadinessStatus =
    paused || live.length === 0 ? 'missing'
      : lastSent === null ? 'partial'
        : 'exists'

  const detail = paused
    ? 'Updates are paused for this workspace, so nothing is sent.'
    : live.length === 0
      ? 'No schedule has an address on it, so nothing is sent.'
      : `${plural(live.length, 'schedule')} · ${plural(addresses, 'address', 'addresses')} · ` +
        (lastSent ? `last sent ${fullDate(lastSent)}.` : 'nothing sent yet.')

  return row(
    'delivery', 'Delivery', 'somewhere for the update to go',
    status, detail, 'client',
    'Add the people who should get it in Studio, and turn the schedule on.',
    i.delivery.schedules
      .filter((s) => !s.active || s.recipients === 0)
      .map((s) => `${s.name} — ${s.active ? 'on' : 'off'}, ${s.recipients === 0 ? 'no addresses' : plural(s.recipients, 'address', 'addresses')}`),
  )
}

// ---- 11 · the change record --------------------------------------------------

function changeRecord(i: ReadinessInputs): ReadinessRow {
  const c = i.changeLog
  // `rows` counts RECORDED changes only — the reconstruction's backdated rows
  // are a labelled prehistory, and counting them here would make this row say
  // "in place" about a workspace whose record has not begun. They are named
  // separately so the operator can see the prehistory landed.
  const status: ReadinessStatus = !c.available || c.rows === 0 ? 'missing' : 'exists'
  const prehistory = c.reconstructed > 0
    ? ` ${plural(c.reconstructed, 'earlier entry', 'earlier entries')} reconstructed from what each update searched.`
    : ''
  const detail = !c.available
    ? 'Not recorded yet — nothing in the product writes down a configuration change.'
    : c.rows === 0
      ? `Nothing has been recorded yet.${prehistory}`
      : `${plural(c.rows, 'change')} recorded · last on ${dateOrNever(c.lastChangeAt, '—')}.${prehistory}`

  return row(
    'change-record', 'Change log', 'a record of every change to what we track',
    status, detail, 'ops',
    'Apply the change log, then reconstruct what each update searched to give it a labelled prehistory.',
    [changeLogBoundary(c.firstLoggedAt)],
  )
}

// ---- 12 · what was decided ---------------------------------------------------

function decisions(i: ReadinessInputs): ReadinessRow {
  const r = i.recommendations
  const nothingCanRecord = r.decisions === null
  const status: ReadinessStatus =
    nothingCanRecord || r.decisions === 0 ? 'missing'
      : r.withLineage < r.total ? 'partial'
        : 'exists'

  const lineage = r.total === 0
    ? 'nothing recommended yet'
    : `${fmtInt(r.withLineage)} of ${fmtInt(r.total)} carry a link to the one before (${pct(r.withLineage, r.total)})`
  const decided = r.decisions === null
    ? 'nothing can record a decision yet'
    : r.decisions === 0
      ? 'no decision recorded'
      : `${plural(r.decisions, 'decision')} recorded`

  return row(
    'decisions', 'Recommendations', 'what was decided about each one',
    status, `${decided.charAt(0).toUpperCase()}${decided.slice(1)} · ${lineage}.`,
    // The same rule as row 2 and row 5: while nothing can record a decision,
    // naming the client as owner and "mark a recommendation done" as the act
    // asks for something nobody is able to do. The owner is whoever can move
    // the pill, and that is ops until the record exists.
    nothingCanRecord ? 'ops' : 'client',
    nothingCanRecord
      ? 'Apply the record of what was decided; the client can then mark a recommendation done, working on it, or not now.'
      : 'Mark a recommendation done, working on it, or not now — the next update then carries the answer forward instead of asking again.',
  )
}

// ---- 13 · the comments due a re-read ----------------------------------------

function retention(i: ReadinessInputs): ReadinessRow {
  const r = i.retention
  const due = r.cohortDay
    ? new Date(Date.parse(`${r.cohortDay}T00:00:00.000Z`) + r.dueAfterDays * 86_400_000).toISOString()
    : null

  const status: ReadinessStatus =
    r.cohortDay === null ? 'exists'
      : r.cohortRows > r.nightlyCap ? 'partial'
        : 'exists'

  // THE BUDGET IS NOT THIS WORKSPACE'S. `refreshYoutubeComments` selects every
  // due comment with no client filter and then caps the distinct ids — so the
  // nightly number is shared with every other workspace, and a batch well
  // under it can still wait because another workspace's batch got there first.
  // The row therefore states the budget and what it is shared with, and claims
  // only what this workspace's own count can settle: a batch larger than the
  // whole night's budget certainly will not clear it.
  const detail = r.cohortDay === null || due === null
    ? 'Nothing is waiting to be read again.'
    : `${plural(r.cohortRows, 'comment')} fall due to be read again on ${fullDate(due)} — ` +
      `one night’s re-read budget is ${fmtInt(r.nightlyCap)} comments, shared across every workspace` +
      (r.cohortRows > r.nightlyCap ? ', and this batch alone is larger, so the rest waits.' : '.')

  // THE BUDGET CLAUSE IS OURS, AND THE FIRST CLAUSE IS THEIRS. WP16 put the
  // operator page's `detail` in front of the tenant on the strength of "detail
  // and notes are already client-safe on every row"; this row is the exception
  // that claim was false about, so it carries the client's half explicitly.
  const clientDetail = r.cohortDay === null || due === null
    ? 'Nothing is waiting to be read again.'
    : `${plural(r.cohortRows, 'comment')} fall due to be read again on ${fullDate(due)}.`

  return row(
    'retention', 'Retention', 'comments read again before they age out',
    status, detail, 'ops',
    'Nothing to configure: each batch is read again nightly, and what the platform has removed is deleted with it.',
    r.cohortDay ? [`Deleting a comment changes any month it was counted in — the count stays as it was written down`] : [],
    clientDetail,
  )
}

// ---- The page ----------------------------------------------------------------

/** The thirteen rows, in the order the page prints them. */
export function computeReadiness(i: ReadinessInputs): ReadinessRow[] {
  return [
    rivalAccounts(i),
    trackedTerms(i),
    communities(i),
    embeddings(i),
    subjectSet(i),
    monthsOfHistory(i),
    anomalyBaseline(i),
    howMuchWasRead(i),
    updateRecord(i),
    delivery(i),
    changeRecord(i),
    decisions(i),
    retention(i),
  ]
}

export interface ReadinessSummary {
  exists: number
  partial: number
  missing: number
  /** The sentence the page bar carries. */
  label: string
}

/** How the workspace reads at a glance — the mock's "Readiness · 3 missing"
 *  badge, with the middle state it leaves out. */
export function summarise(rows: readonly ReadinessRow[]): ReadinessSummary {
  const count = (s: ReadinessStatus) => rows.filter((r) => r.status === s).length
  const summary = { exists: count('exists'), partial: count('partial'), missing: count('missing') }
  const parts = [
    summary.missing > 0 ? `${summary.missing} missing` : null,
    summary.partial > 0 ? `${summary.partial} partly there` : null,
  ].filter(Boolean)
  return {
    ...summary,
    label: parts.length === 0 ? 'everything in place' : parts.join(' · '),
  }
}
