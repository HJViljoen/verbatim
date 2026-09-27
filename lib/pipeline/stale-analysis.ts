import { chunk } from '../chunk'
import { parseRef } from '../renderables/quotes-freeze'
import { selectAll, type createAdminClient } from '../supabase-admin'
import { isMissingSubjects, TABLE_SUBJECT_MEMBERSHIPS } from '../subjects/types'
import { protectedKeptIds, staleInsightIds } from './pass-a-plan'

// What a run's prune takes, and the one table that has to hear about it BEFORE
// the month freeze rather than after the close (deploy 5b, 27 Sep).
//
// citedEvidenceIds and pruneStaleAnalysis moved here from
// inngest/functions/pipeline.ts unchanged but for two things: the admin client
// is passed in (so the offline tests can run them on lib/test/s3-run-fake-admin.ts),
// and the prune keeps a superseded insight a subject membership still counts
// (below). The `prune-stale-analysis` step calls the prune from the same
// position, under the same id.
//
// THE DEFECT THE REST OF THIS FILE CLOSES. freeze-months writes the month
// tables before close-run, and prune-stale-analysis runs after close-run. A
// subject's month counts its videos through `subject_memberships`, which
// cascades from `audience_insights`, and monthly_subject_readings joins the
// BASE table (AGENTS.md: an id-set lookup resolves rows an in-flight run has
// superseded but not yet pruned). So each run's freeze counted, for every video
// that run re-read, the member insights of the video's OLD reading too, and
// minutes later the prune deleted them. Production, Sun 27 Sep: Sealand's
// September was read at 07:22 with Buying & delivery at 203 videos; the run
// closed at 07:28, the prune ran, and the same SQL reads 199 now; seven of
// eight subjects differ by 1 to 4 (exec/logs/subjects-set-check-prod-
// 20260927T175643Z.log). The Subjects pane prints its kinds and "Where we
// found them" only where its set read now is the headline's k, so both went
// dark. A filling month is re-read next Sunday; the Sun 4 Oct run FREEZES
// August the same way, and a frozen month is never rewritten.
//
// THE FIX IS THREE PARTS, AND EACH HOLDS WHEN ANOTHER FAILS.
//
//  1. `trim-stale-memberships`, its own step immediately before freeze-months,
//     deletes the `subject_memberships` rows of exactly the insights the prune
//     will delete: the same rule (staleInsightIds) under the same protection
//     (citedEvidenceIds), called from this file by both. It is the prune's own
//     cascade on that one table, taken before the freeze instead of after the
//     close. Of the six functions freeze-months reads, only
//     monthly_subject_readings reads `subject_memberships`
//     (lib/pipeline/freeze-parity.test.ts §6), so the denominator, theme, kind,
//     stats and evidence-id rows cannot move, and a subject's rows lose exactly
//     the videos only a prune-bound insight reached.
//  2. When the trim does not finish, freeze-months writes no subject rows that
//     visit (`trimFreezeHold`, beside `subjectFreezeHold`): a month frozen over
//     memberships that still name prune-bound insights would keep the phantom
//     count for ever. The subject months keep their stored rows, and the next
//     run, trim first, writes them. The same trade subjectFreezeHold makes.
//  3. The prune keeps any superseded insight a subject membership still counts
//     (member = true). After a trim that ran there is none, and the prune is
//     the prune it was. After a trim that failed or stopped part way, the
//     insights it did not reach stay, so no stored subject row counts a member
//     that is gone; the next run's trim releases them and its prune takes them.
//
// So nothing can make a month count a member that is gone: the freeze reads
// memberships, the trim removes only memberships of rows that are going, and
// the prune removes only rows no membership counts.

/**
 * What a prune MAY NOT TAKE: the `audience_insights` / `language_samples` rows
 * something stored still points at.
 *
 * THE DEFECT THIS CLOSES (2026-09-18). `prune-stale-analysis` removes every row
 * a later re-read superseded, and its own comment called the leftovers
 * "harmless, just storage" — true when nothing cited them. Things cite them
 * now: all twelve of Sealand's oldest recommendations, every row its advice
 * ledger actually draws, had lost every `audience_insights` row beneath them,
 * so "Grounded in" resolved to zero live videos down the whole page.
 *
 * FAIL CLOSED. Everything here is loaded BEFORE the first delete, so a read
 * that fails takes the step to its retry and then to its non-fatal catch with
 * nothing deleted. Deleting less than we could is a storage cost; deleting a
 * cited row is unrecoverable.
 *
 * THE FOUR CITATION CLASSES, and why each is resolved the way it is:
 *
 *  1. RECOMMENDATIONS, a two-link chain. `recommendations.based_on.insight_ids`
 *     names insight rows, and it MIXES `market_insights` (M#) and
 *     `competitive_insights` (C#) ids — the resolution lib/pipeline/pass-d.ts
 *     writes, and the same reason app/api/cron/ops-check/route.ts unions both
 *     tables. Their `evidence.supporting_theme_ids` then holds the
 *     `audience_insights` ids (scripts/citation-floor.ts states that mapping).
 *     ONLY THE SECOND LINK IS PROTECTED HERE, and the first needs no protecting
 *     by this step: it deletes `audience_insights` and `language_samples` and
 *     nothing else, so no `market_insights` / `competitive_insights` row is at
 *     risk from a prune. Those two tables ACCUMULATE across runs — lib/pipeline/
 *     pass-d.ts:695 and lib/pipeline/pass-c.ts:285 delete only THEIR OWN run's
 *     rows before re-inserting — which is why 329 of 334 stored refs still
 *     resolved when this was measured. The one way the first link breaks is
 *     documented at lib/pipeline/pass-d.ts:878-895: a D-b retry that fails
 *     after `market_insights` was re-inserted with fresh ids leaves the
 *     surviving recommendations' `based_on` pointing at rows that are gone.
 *     That hole is real, it is deliberate ("degraded beats empty"), and it is
 *     not this step's to close — a row whose market insight is itself gone
 *     reaches lib/reading/afterwards.ts as an empty `based_on`, which is what
 *     `GroundingInput.cited` exists to tell from the other absence.
 *
 *  2. PLAN CHECKS, both tables. `plan_checks.claims[].insightIds` is the
 *     upload's reading and `plan_check_evaluations.claims[].insightIds` each
 *     re-check's; `currentReading` (lib/ask/plan-cards.ts) prints the newest
 *     evaluation that has claims and FALLS BACK to the upload's, so protecting
 *     only one of the two leaves the other printing a card with no voices.
 *
 *  3. SAVED ASK ANSWERS. `agent_messages.result.grounded[].insightIds` stores
 *     the ids an answer was grounded on and stores NO quote text — the column's
 *     own comment says so in as many words, and lib/pages/agent-thread.ts
 *     resolves the words live by comment id through `insight_evidence`, which
 *     cascades from `audience_insights`. The quotes under a grounded point come
 *     only from THAT point's own live insight ids (lib/agent/enforce.ts builds
 *     them from `insights = live.map(...)`, its dedup fallback included), so
 *     protecting `insightIds` is exactly what keeps a reopened thread's quotes
 *     resolving. Id-exact like classes 1 and 2, on the surface a client reopens
 *     most often — NOT the `c:`/`v:`/`m:` case below, which stores no row id.
 *     Only role='agent' rows carry a `result`; a user's message is the question
 *     they typed.
 *
 *  4. FROZEN SNAPSHOT QUOTES. `report_snapshots.evidence_ids` repeats the refs
 *     in the stored artefact (lib/renderables/quotes-freeze.ts). Two of the ref
 *     kinds name a row this prune can delete, and both are id-exact:
 *     `e:<insight_evidence.id>`, which cascades from `audience_insights` and so
 *     resolves back through it, and `p:<language_samples.id>`, which IS one of
 *     these rows. The brief listed snapshots as a named non-goal to be measured
 *     rather than fixed, "unless the count says it is the same one-line set
 *     union". It is the same set union — `p:` needs no resolution at all and
 *     `e:` needs one chunked select — so it is done here rather than left as a
 *     second defect of the same shape. This is also why `language_samples` is
 *     protected at all: it carries no OTHER citation path, but a stored export
 *     names its rows by id.
 *
 *     "REPEATS THE REFS" IS TRUE SINCE 2026-08-31, AND THE DATE IS
 *     LOAD-BEARING. Before T11 `createSnapshot` froze the workings' quotes and
 *     threw their refs away, so a pre-T11 snapshot's `evidence_ids` carries only
 *     what its PAGES cite — this class is therefore exactly as complete as
 *     scripts/backfill-evidence-ids.ts --apply left it. The write path is fixed,
 *     so every new snapshot is whole. The alternative, `collectQuoteRefs` over
 *     `data` / `workings`, means selecting every snapshot's entire jsonb on
 *     every run and is not worth it for a repaired window. Named here so the
 *     dependency is not rediscovered as a bug.
 *
 * WHAT IS DELIBERATELY NOT PROTECTED — read this before treating the four above
 * as all of them. Each exclusion is a judgement, and an unrecorded judgement
 * reads as an oversight to whoever finds the path next:
 *
 *  a. THEME MEMBERS. `theme_observations.member_insight_ids` is a fifth
 *     id-exact path into `audience_insights`: `monthly_theme_readings` walks it
 *     to `insight_evidence` to `comments`
 *     (supabase/migrations/20260915092000_monthly_reading.sql). It is NOT
 *     protected and should not be — a run's themes name most of that run's
 *     corpus, so protecting members would retain nearly everything and the
 *     prune would stop being a prune. The monthly reading is built for this
 *     already: its own header measures 18.2% of stored member references
 *     dangling, 20260918091000_theme_key.sql:87 measures 20.2% at one run old,
 *     and that is the stated reason `member_video_ids` became the PRIMARY
 *     matching key — a video id survives a re-read, an insight id does not.
 *
 *  b. `c:` / `v:` / `m:` SNAPSHOT REFS, and the comment ids stored beside a
 *     saved answer's insight ids. These name no row at all: they resolve by
 *     SEARCHING `insight_evidence` for a live excerpt on that comment or video.
 *     So they keep resolving IF the re-read produced evidence on that comment —
 *     a Pass A re-read is free to quote different comments entirely, and
 *     nothing guarantees it did. The honest reading is "usually still resolves,
 *     possibly to a DIFFERENT excerpt, sometimes to nothing", and whether a
 *     frozen export may change its quoted words is a real and separate
 *     question. They cannot be added to the protected set by id; they have no
 *     id. What class 3 protects is the insight ids stored ALONGSIDE them, which
 *     is what makes a saved answer's quotes hold.
 *
 *  c. `k:` / `t:` / `h:` / `b:` refs read `video_claims`, `videos.ocr_text`, a
 *     hero row and `run_summary`, none of which this step touches. `t:` is the
 *     newest of them (Block D wave 2, lib/renderables/quotes-freeze.ts, written
 *     by lib/pages/overview.ts's on-screen line) and is named here rather than
 *     left to the reader because this arm is the answer to "is that all of
 *     them": with `e:` and `p:` protected in class 4 and `c:` / `v:` / `m:` in
 *     (b), these four close the ref set, so a kind absent from every arm reads
 *     as an oversight whether or not it is one. A NEW REF KIND JOINS THIS LINE
 *     OR A PROTECTED CLASS, NEVER NEITHER.
 *
 * A FIFTH protected class means re-opening this list and AGENTS.md, not
 * appending a set union to the code.
 */
export async function citedEvidenceIds(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
): Promise<{ insights: Set<string>; languageSamples: Set<string>; from: Record<string, number> }> {
  // COUNTED ONE WAY, AND THIS IS WHICH: each class gets its OWN set, counted on
  // its own, and the protected set is their union at the end. The classes
  // OVERLAP heavily — one insight is routinely cited by a recommendation and by
  // a plan check — so the per-class figures do not add up to the union and the
  // log line says so. The first shape of this function counted FIRST
  // ATTRIBUTION instead ("new to the set when this class reached it"), which is
  // order-dependent and reads as a class total: on the two measured tenants
  // 5,445 + 1,750 + 6 first-attribution ids stood against a distinct union of
  // 6,107, so ~1,094 ids would have changed class if these blocks were
  // reordered. Repo rule, verbatim: count them one way and say which.
  const cls = {
    recommendations: new Set<string>(),
    planChecks: new Set<string>(),
    savedAnswers: new Set<string>(),
    snapshots: new Set<string>(),
  }
  const languageSamples = new Set<string>()

  // 1. Recommendations → market/competitive insights → audience insights.
  const recs = await selectAll<{ id: string; based_on: { insight_ids?: string[] } | null }>(() =>
    admin.from('recommendations').select('id, based_on').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const containers = new Set<string>()
  for (const r of recs) for (const id of r.based_on?.insight_ids ?? []) if (typeof id === 'string' && id) containers.add(id)
  for (const table of ['market_insights', 'competitive_insights'] as const) {
    // Chunk 200 for the same PostgREST URL-length reason as the deletes below.
    // A 200-id chunk can return at most 200 rows (`id` is the primary key), so
    // the 1000-row default cap on a bare `.select()` is never in play here.
    for (const part of chunk([...containers], 200)) {
      const { data, error } = await admin.from(table).select('id, evidence').eq('client_id', clientId).in('id', part)
      if (error) throw new Error(`cited ${table}: ${error.message}`)
      for (const row of (data ?? []) as { evidence: { supporting_theme_ids?: string[] } | null }[]) {
        for (const id of row.evidence?.supporting_theme_ids ?? []) {
          if (typeof id === 'string' && id) cls.recommendations.add(id)
        }
      }
    }
  }

  // 2. Plan checks — the upload's claims and every re-evaluation's.
  for (const table of ['plan_checks', 'plan_check_evaluations'] as const) {
    const rows = await selectAll<{ id: string; claims: unknown }>(() =>
      admin.from(table).select('id, claims').eq('client_id', clientId).order('id', { ascending: true }),
    )
    for (const row of rows) {
      if (!Array.isArray(row.claims)) continue
      for (const claim of row.claims as { insightIds?: unknown }[]) {
        if (!claim || !Array.isArray(claim.insightIds)) continue
        for (const id of claim.insightIds) {
          if (typeof id === 'string' && id) cls.planChecks.add(id)
        }
      }
    }
  }

  // 3. Saved Ask answers — the ids each grounded point rests on.
  const answers = await selectAll<{ id: string; result: unknown }>(() =>
    admin.from('agent_messages').select('id, result')
      .eq('client_id', clientId).eq('role', 'agent').not('result', 'is', null)
      .order('id', { ascending: true }),
  )
  for (const a of answers) {
    const grounded = (a.result as { grounded?: unknown } | null)?.grounded
    if (!Array.isArray(grounded)) continue
    for (const point of grounded as { insightIds?: unknown }[]) {
      if (!point || !Array.isArray(point.insightIds)) continue
      for (const id of point.insightIds) {
        if (typeof id === 'string' && id) cls.savedAnswers.add(id)
      }
    }
  }

  // 4. Frozen snapshot quotes.
  const snapshots = await selectAll<{ id: string; evidence_ids: string[] | null }>(() =>
    admin.from('report_snapshots').select('id, evidence_ids').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const evidenceRowIds = new Set<string>()
  for (const s of snapshots) {
    for (const ref of s.evidence_ids ?? []) {
      const parsed = typeof ref === 'string' ? parseRef(ref) : null
      if (!parsed) continue
      if (parsed.kind === 'e') evidenceRowIds.add(parsed.id)
      else if (parsed.kind === 'p') languageSamples.add(parsed.id)
    }
  }
  for (const part of chunk([...evidenceRowIds], 200)) {
    const { data, error } = await admin.from('insight_evidence').select('id, audience_insight_id').in('id', part)
    if (error) throw new Error(`cited insight_evidence: ${error.message}`)
    for (const row of (data ?? []) as { audience_insight_id: string | null }[]) {
      const id = row.audience_insight_id
      if (id) cls.snapshots.add(id)
    }
  }

  // The union is what protects; the class sizes are what the operator reads.
  // `snapshots` and `snapshotSamples` are kept apart because they count rows in
  // two different tables — one figure spanning both would be meaningless.
  const insights = new Set<string>([
    ...cls.recommendations, ...cls.planChecks, ...cls.savedAnswers, ...cls.snapshots,
  ])
  const from: Record<string, number> = {
    recommendations: cls.recommendations.size,
    planChecks: cls.planChecks.size,
    savedAnswers: cls.savedAnswers.size,
    snapshots: cls.snapshots.size,
    snapshotSamples: languageSamples.size,
    insights: insights.size,
  }
  return { insights, languageSamples, from }
}

type Admin = ReturnType<typeof createAdminClient>
type AnalysisRow = { id: string; run_id: string | null; source_video_id: string | null }
type VideoPointer = { id: string; analyzed_run_id: string | null }

/** What one prune did. `heldForSubjects` is the third part of the fix above:
 *  superseded, uncited insights left standing because a subject membership
 *  still counts them. 0 after a trim that ran. */
export interface PruneSummary {
  insights: number
  languageSamples: number
  keptInsights: number
  keptSamples: number
  heldForSubjects: number
}

/** Every insight a subject reading counts right now: the `member = true` rows
 *  of `subject_memberships`, any subject (a retired subject's rows are read by
 *  no month function, and they go with the trim like any other). Empty where M4
 *  is not applied. */
export async function countedMemberIds(admin: Admin, clientId: string): Promise<Set<string>> {
  try {
    const rows = await selectAll<{ subject_id: string; audience_insight_id: string }>(() =>
      admin.from(TABLE_SUBJECT_MEMBERSHIPS).select('subject_id, audience_insight_id')
        .eq('client_id', clientId).eq('member', true)
        .order('subject_id', { ascending: true }).order('audience_insight_id', { ascending: true }),
    )
    return new Set(rows.map((r) => r.audience_insight_id))
  } catch (e) {
    if (isMissingSubjects(e)) return new Set()
    throw e
  }
}

/** Delete every audience_insights / language_samples row that is not the
 *  current analysis of its video (staleInsightIds, lib/pipeline/pass-a-plan.ts)
 *  AND that nothing stored still cites (citedEvidenceIds, above).
 *  Chunked deletes; insight_evidence cascades. video_claims is left alone —
 *  its reader is already newest-run-wins (lib/pipeline/claims.ts).
 *
 *  AND NOT ONE A SUBJECT MEMBERSHIP STILL COUNTS (deploy 5b). The month tables
 *  were written before this runs, over `subject_memberships`; deleting a
 *  member insight here would leave every month that read it counting a video
 *  whose member is gone. trim-stale-memberships removes exactly those
 *  memberships before the freeze, so on a run whose trim ran this keeps
 *  nothing extra; when it did not, the rows wait for the next run's trim. */
export async function pruneStaleAnalysis(admin: Admin, clientId: string): Promise<PruneSummary> {
  // Loaded first, and a failure here throws before anything is deleted.
  const cited = await citedEvidenceIds(admin, clientId)
  const counted = await countedMemberIds(admin, clientId)
  const videos = await selectAll<VideoPointer>(() =>
    admin.from('videos').select('id, analyzed_run_id').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const out: PruneSummary = { insights: 0, languageSamples: 0, keptInsights: 0, keptSamples: 0, heldForSubjects: 0 }
  for (const table of ['audience_insights', 'language_samples'] as const) {
    const rows = await selectAll<AnalysisRow>(() =>
      admin.from(table).select('id, run_id, source_video_id').eq('client_id', clientId).order('id', { ascending: true }),
    )
    const protectedIds = table === 'audience_insights' ? cited.insights : cited.languageSamples
    const staleCited = staleInsightIds(videos, rows, protectedIds)
    // The subject hold, apart from the citation protection so each is counted
    // on its own. language_samples carries no membership.
    const stale = table === 'audience_insights' ? staleCited.filter((id) => !counted.has(id)) : staleCited
    // What protection actually cost, counted against this tenant's own rows
    // rather than against the size of the cited set (protectedKeptIds, same
    // file as the rule, where its tests are): an id cited by a recommendation
    // may name a row that is current anyway, or one this tenant no longer has
    // at all. It walks the protected rows alone, not the table a second time.
    const kept = protectedKeptIds(videos, rows, protectedIds).length
    // Chunk 200, not 500: ~500 uuids in an `in.()` filter overflows the
    // PostgREST URL cap ("fetch failed" — the lesson behind every other chunked
    // .in() in this repo). A first prune on a real tenant is thousands of rows.
    for (const part of chunk(stale, 200)) {
      const { error } = await admin.from(table).delete().in('id', part)
      if (error) throw new Error(`prune ${table}: ${error.message}`)
    }
    if (table === 'audience_insights') { out.insights = stale.length; out.keptInsights = kept; out.heldForSubjects = staleCited.length - stale.length }
    else { out.languageSamples = stale.length; out.keptSamples = kept }
  }
  console.log(
    `[prune-stale-analysis] deleted ${out.insights} insight(s) · ${out.languageSamples} language sample(s); ` +
    `kept ${out.keptInsights} + ${out.keptSamples} superseded row(s) because something still cites them ` +
    `(cited ids PER CLASS, and the classes overlap: recommendations ${cited.from.recommendations} · ` +
    `plan checks ${cited.from.planChecks} · saved answers ${cited.from.savedAnswers} · ` +
    `snapshots ${cited.from.snapshots}; distinct union ${cited.from.insights} insight id(s) ` +
    `+ ${cited.from.snapshotSamples} language sample id(s))` +
    (out.heldForSubjects > 0
      ? `; HELD ${out.heldForSubjects} superseded insight(s) a subject membership still counts ` +
        '(trim-stale-memberships did not release them before the freeze): the next run\'s trim releases them and its prune takes them'
      : ''),
  )
  return out
}

// ---- The trim before the freeze -------------------------------------------------

/** What the trim did, or in a dry run would do. `skipped` names why it had
 *  nothing to read (M4 not applied), which is not a failure. */
export interface TrimSummary {
  /** Membership rows on file, and the distinct insights they name. */
  memberships: number
  membershipInsights: number
  /** Of those insights, the ones that are not their video's current analysis
   *  (before the citation protection), and the ones the prune will delete. */
  superseded: number
  prunable: number
  /** Membership rows removed (or, dry, that would be), and how many of them
   *  were members: the ones a subject reading counts. */
  removed: number
  removedMembers: number
  /** Per subject: member rows removed. */
  bySubject: Record<string, number>
  skipped: string | null
  dryRun: boolean
}

/**
 * Remove, before any month is read, the `subject_memberships` rows of exactly
 * the insights prune-stale-analysis will delete after the close.
 *
 * THE SET IS THE PRUNE'S, BY CONSTRUCTION: staleInsightIds under
 * citedEvidenceIds' protection, the two calls pruneStaleAnalysis makes. The
 * rule is per row, so reading only the insights a membership names gives the
 * prune's set intersected with them, which is all this table can hold. Pass A
 * and the membership judge are done by the time this runs, so no video's
 * pointer and no citation this run adds can move a row INTO the set before the
 * prune; one a person adds in between moves a row OUT of it, and then the
 * prune keeps the insight and its membership is already gone: the month read
 * without it, and reads without it still.
 *
 * Everything is read before the first delete, as the prune does: a read that
 * fails throws with nothing removed. A delete that fails part way leaves the
 * rest standing, and the prune's own hold keeps their insights.
 */
export async function trimStaleMemberships(admin: Admin, clientId: string, opts: { dryRun?: boolean } = {}): Promise<TrimSummary> {
  const dryRun = opts.dryRun === true
  const out: TrimSummary = {
    memberships: 0, membershipInsights: 0, superseded: 0, prunable: 0, removed: 0, removedMembers: 0, bySubject: {}, skipped: null, dryRun,
  }
  let rows: { subject_id: string; audience_insight_id: string; member: boolean }[]
  try {
    rows = await selectAll(() =>
      admin.from(TABLE_SUBJECT_MEMBERSHIPS).select('subject_id, audience_insight_id, member')
        .eq('client_id', clientId)
        .order('subject_id', { ascending: true }).order('audience_insight_id', { ascending: true }),
    )
  } catch (e) {
    if (isMissingSubjects(e)) return { ...out, skipped: `${TABLE_SUBJECT_MEMBERSHIPS} is not there (M4 not applied)` }
    throw e
  }
  out.memberships = rows.length
  const named = [...new Set(rows.map((r) => r.audience_insight_id))].sort()
  out.membershipInsights = named.length
  if (named.length === 0) return out

  const videos = await selectAll<VideoPointer>(() =>
    admin.from('videos').select('id, analyzed_run_id').eq('client_id', clientId).order('id', { ascending: true }),
  )
  // Chunk 200, the prune's reason. The primary key caps a chunk's answer at
  // 200 rows, so no page is ever cut short.
  const insights: AnalysisRow[] = []
  for (const part of chunk(named, 200)) {
    const { data, error } = await admin.from('audience_insights').select('id, run_id, source_video_id')
      .eq('client_id', clientId).in('id', part)
    if (error) throw new Error(`trim: audience_insights: ${(error as { message?: string }).message ?? String(error)}`)
    insights.push(...((data ?? []) as AnalysisRow[]))
  }
  const superseded = staleInsightIds(videos, insights)
  out.superseded = superseded.length
  if (superseded.length === 0) return out

  // Only now the citations: a run that superseded no member pays nothing for them.
  const cited = await citedEvidenceIds(admin, clientId)
  const prunable = staleInsightIds(videos, insights, cited.insights).sort()
  out.prunable = prunable.length
  const going = new Set(prunable)
  for (const r of rows) {
    if (!going.has(r.audience_insight_id)) continue
    out.removed++
    if (r.member) {
      out.removedMembers++
      out.bySubject[r.subject_id] = (out.bySubject[r.subject_id] ?? 0) + 1
    }
  }
  if (dryRun || prunable.length === 0) return out

  // Every row of each insight, members and judged non-members alike: exactly
  // what the prune's cascade removes, minutes early.
  for (const part of chunk(prunable, 200)) {
    const { error } = await admin.from(TABLE_SUBJECT_MEMBERSHIPS).delete()
      .eq('client_id', clientId).in('audience_insight_id', part)
    if (error) throw new Error(`trim: ${TABLE_SUBJECT_MEMBERSHIPS} delete: ${(error as { message?: string }).message ?? String(error)}`)
  }
  return out
}

export const trimSummary = (r: TrimSummary): string =>
  r.skipped
    ? `skipped · ${r.skipped}`
    : `${r.dryRun ? 'would remove' : 'removed'} ${r.removed} membership row(s) (${r.removedMembers} member(s)) of ${r.prunable} insight(s) ` +
      `prune-stale-analysis deletes after the close · ${r.superseded} of the ${r.membershipInsights} insight(s) with a membership ` +
      `are superseded, ${r.superseded - r.prunable} of them kept for a citation · ${r.memberships} membership row(s) on file`

/**
 * Must this visit leave the subject side unwritten because the trim did not
 * finish? `null` (the step ran out of retries) means the memberships on file
 * may still name insights the prune deletes after the close; a month frozen
 * over them would count their videos for ever, and the frozen guard refuses
 * the correction. The subjectFreezeHold trade: the subject months keep their
 * stored rows this visit and the next run, trim first, writes them.
 */
export function trimFreezeHold(trim: TrimSummary | null): string | null {
  if (trim) return null
  return (
    'trim-stale-memberships did not finish, so the memberships on file may still name insights prune-stale-analysis ' +
    'deletes after the close, and a month frozen around them would count videos whose members are gone; the frozen ' +
    'guard refuses the UPDATE. Nothing was written for the subjects this visit; the next run trims first.'
  )
}
