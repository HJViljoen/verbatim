import type { SupabaseClient } from '@supabase/supabase-js'
import { fmtInt, shortDate } from '../format'
import { SHARE_BAND } from '../report-bands'
import { isRivalAudience } from '../rivals'
import { isMissingColumnError, selectAll } from '../supabase-admin'

// What an answer was answered AGAINST (design AS3, Phase 1 WP21).
//
// Four facts, all of which existed as functions and none of which had ever
// reached a client's screen: which update the corpus comes from, how many
// monthly readings stand behind a claim about change, how much of the corpus a
// question can actually search, and when it was last indexed.
//
// THE FOURTH IS THE ONE THIS EXISTS FOR. `match_insights` filters
// `embedding is not null`, so a tenant nobody has embedded returns zero rows
// for every question ever asked and is told "nothing in the conversation
// relates to this" about their own customers. On 2026-09-15, before the
// backfill, Sealand's questions were answered against 27% of its own corpus
// with nothing anywhere saying so — the readiness page said it, and that page
// is `notFound()` for anyone who is not a platform admin. Both tenants read
// 100% today; the number stops being decorative the moment a prompt-version
// bump re-reads a corpus and the new rows are waiting on the next run to be
// embedded.
//
// EVERY FIGURE IS READ, NEVER ASSUMED, and every absence has its own sentence.
// "Not recorded" and "none" are different facts and the line says which.

export interface AskBasis {
  /** When the update this was (or will be) answered against started. Null when
   *  the workspace has no delivered update at all. */
  updateAt: string | null
  /** Distinct calendar months a claim about change can actually stand on: one
   *  whose denominator clears the reading layer's video floor, in one of the
   *  audiences an ANSWER is drawn from. Null when the monthly reading is not
   *  recorded in this database yet — which is a different fact from zero
   *  months.
   *
   *  NOT "months we hold a row for". Össur holds 119 rows over 63 months back
   *  to October 2020 and FOUR of them clear the floor; the movement block on
   *  the same page prints "4 months of readings behind it" for the same tenant,
   *  and a line above it reading "63 monthly readings" says the corpus has five
   *  years of comparable history when it has four months. Counted the way
   *  `isReadable` counts (lib/reading/series.ts), so the two agree.
   *
   *  AND NOT A RIVAL'S MONTHS. Retrieval drops every rival's voice before an
   *  answer is written (`scopeToClientVoices`), so the movement block reads
   *  `client` and `industry-other` and never `competitor:<name>`. Counting a
   *  rival's months here would tell a tenant whose tracked rivals carry the
   *  volume that six months stand behind a claim about their own audience when
   *  none do. The count is the same audiences the block reads, so the sentence
   *  and the block under it cannot disagree. */
  monthlyReadings: number | null
  /** Findings a question can reach, and findings there are. NULL is a failed
   *  read, never a zero: they are two independent round trips and the heavier
   *  of them — the one carrying the `embedding is not null` filter over the
   *  joined view — is the likelier to time out under load. Reported as zero,
   *  one timeout printed "none of 3,129 findings searchable" over a fully
   *  embedded corpus AND switched the composer off, which is the confident
   *  falsehood the rest of this file exists to refuse. */
  embedded: number | null
  total: number | null
  /** When the newest vector was written, or null. Null for every vector
   *  written before the column existed, which is most of them — the line says
   *  "not recorded", never "never". */
  lastEmbeddedAt: string | null
}

/**
 * The AS3 sentence.
 *
 * `asked` is the thread's tense: an answer already given was answered against
 * an update, and the box on the landing page will be. `verb` says which kind of
 * turn it was — a document was CHECKED against an update, not answered against
 * it, and the deck that leaves the building should not call it an answer. Pure,
 * so the copy is argued with in a test rather than in production.
 */
export function askBasisLine(
  basis: AskBasis,
  opts: { asked?: boolean; verb?: 'Answered' | 'Checked' } = {},
): string {
  if (!basis.updateAt) {
    return 'Nothing has been read for this workspace yet, so there is nothing to answer from.'
  }
  const lead = opts.asked
    ? `${opts.verb ?? 'Answered'} against the update of ${shortDate(basis.updateAt)}`
    : `Answers are given against the update of ${shortDate(basis.updateAt)}`

  const months =
    basis.monthlyReadings == null
      ? 'monthly readings not recorded here yet'
      : basis.monthlyReadings === 0
        ? 'no month yet carries enough videos to compare on'
        : `${fmtInt(basis.monthlyReadings)} monthly ${basis.monthlyReadings === 1 ? 'reading' : 'readings'}`

  // A share, always with its denominator (the GLOSSARY's rule for a level).
  // Zero embedded is stated as zero rather than as "0 of N", because "0 of
  // 2,872 searchable" reads as a rounding error and it is the whole corpus.
  const searchable =
    basis.total == null || basis.embedded == null
      ? 'how much of it is searchable is not recorded'
      : basis.total === 0
        ? 'nothing to search yet'
        : basis.embedded === 0
          ? `none of ${fmtInt(basis.total)} findings searchable`
          : `${fmtInt(basis.embedded)} of ${fmtInt(basis.total)} findings searchable`

  const embedded = basis.lastEmbeddedAt
    ? `embedded as at ${shortDate(basis.lastEmbeddedAt)}`
    : 'when they were indexed is not recorded'

  // THE TENSE BREAKS AFTER THE UPDATE. Only the first fact belongs to the
  // answer; the other three are the index AS IT IS NOW, deliberately (a thread
  // read today is searched today). Joined with the same `·` they read as four
  // facts about an August answer — "Answered against the update of 23 Aug · 4
  // monthly readings · 3,129 of 3,129 findings searchable" — and a reader has
  // no seam to notice. A full stop and one word give them one. The unasked
  // form needs none: everything in it is now.
  return opts.asked
    ? `${lead}. Today: ${[months, searchable, embedded].join(' · ')}`
    : [lead, months, searchable, embedded].join(' · ')
}

/** True when a question asked now cannot reach a single finding — the state
 *  `answerQuestion` throws on, said before the reader spends a turn finding
 *  out.
 *
 *  Read by /dashboard/agent and by the thread page, which disable the box and
 *  name the state in it. That call site is the whole point of the predicate and
 *  it was missing: the comment promised the reader was told first while nothing
 *  imported it, and a question asked into an unembedded corpus takes one of the
 *  month's forty slots on its way to throwing. Total of zero is NOT this state
 *  — a workspace with no findings at all has its own sentence.
 *
 *  BOTH COUNTS MUST HAVE BEEN READ. A failed read is null, and a null answers
 *  false here: this predicate switches a paying reader's only control off, so
 *  it may fire on a measurement and never on the absence of one. */
export const nothingSearchable = (basis: AskBasis): boolean =>
  basis.total != null && basis.embedded != null && basis.total > 0 && basis.embedded === 0

/** One stored `month_denominators` row, as this count needs it. */
export interface MonthRow {
  month: string
  audience: string
  videos: number | null
}

/**
 * Distinct months a claim about change can stand on.
 *
 * TWO REDUCTIONS, AND BOTH ARE ABOUT AGREEING WITH THE BLOCK UNDERNEATH. A
 * month under the reading layer's video floor is not a reading anybody may
 * compare on, and a RIVAL's month is not history behind an answer about this
 * client's customers — retrieval drops every rival's voice before an answer is
 * written, so the movement block reads `client` and `industry-other` and never
 * `competitor:<name>`. Counting them told a tenant whose tracked rivals carry
 * the volume that six months stood behind a claim for which none did.
 *
 * Pure, and exported, so the scoping rule is argued in a test rather than in a
 * loader.
 */
export function readableMonthCount(rows: readonly MonthRow[]): number {
  return new Set(
    rows
      .filter((m) => !isRivalAudience(m.audience))
      .filter((m) => (m.videos ?? 0) >= SHARE_BAND.minN)
      .map((m) => m.month),
  ).size
}

/**
 * The three facts about the INDEX, which do not depend on which update an
 * answer was given against — so a thread with four answers reads them once.
 *
 * Through the SESSION client wherever a page has one: `month_denominators` and
 * `audience_insights_current` are both tenant-readable (the view is
 * `security_invoker`), so none of this needs the service role.
 */
export async function loadIndexFacts(
  client: SupabaseClient,
  clientId: string,
): Promise<Omit<AskBasis, 'updateAt'>> {
  const [months, all, embedded, last] = await Promise.all([
    // DISTINCT READABLE MONTHS, not rows, and not a rival's — the three
    // reductions `readableMonthCount` makes and the note above it explains.
    // Össur: 119 rows, 63 months, FOUR readable (Jun–Sep 2026, all
    // `industry-other`). Sealand: 95, 66, two. Counted in code rather than in
    // SQL, because PostgREST has no count(distinct). The AUDIENCE column is
    // read for the scoping, not just for the page break.
    //
    // PAGED, on the primary key minus the tenant (AGENTS.md: a bare `.select()`
    // caps at 1,000 rows silently). This read is one row per month PER
    // AUDIENCE, and the audience list carries one entry per tracked rival —
    // Össur 119 rows and Sealand 95 today, but a dozen rivals over five years
    // crosses the cap and the count would then shrink with no error at all, on
    // a client-facing sentence. `selectAll` throws where a bare read reports,
    // so the throw is turned back into the shape the rest of this function
    // already reads.
    selectAll<MonthRow>(() =>
      client
        .from('month_denominators')
        .select('month, audience, videos')
        .eq('client_id', clientId)
        .order('month', { ascending: true })
        .order('audience', { ascending: true }),
    ).then(
      (data) => ({ data, error: null as unknown }),
      (error: unknown) => ({ data: null, error }),
    ),
    client.from('audience_insights_current').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    client.from('audience_insights_current').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).not('embedding', 'is', null),
    client.from('audience_insights_current').select('embedded_at')
      .eq('client_id', clientId).not('embedded_at', 'is', null)
      .order('embedded_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // A FAILED READ IS NOT A ZERO. Every count here is a claim about the reader's
  // own corpus, and "0 of 0 searchable" over three thousand live findings is
  // the confident falsehood this whole line exists to prevent — so a failure
  // reads as "not recorded" and the sentence says so.
  const monthRows = months.error ? null : ((months.data ?? []) as MonthRow[])
  const columnNotThere = isMissingColumnError(last.error, 'embedded_at')

  return {
    monthlyReadings: monthRows ? readableMonthCount(monthRows) : null,
    // TWO ROUND TRIPS, TWO ANSWERS. Either can fail on its own — they are
    // separate requests inside one `Promise.all` — so neither may borrow the
    // other's success. Null is "we did not get to read this", and the sentence
    // and the composer both know the difference.
    embedded: embedded.error ? null : embedded.count ?? 0,
    total: all.error ? null : all.count ?? 0,
    lastEmbeddedAt: columnNotThere || last.error ? null : ((last.data?.embedded_at as string | undefined) ?? null),
  }
}

/** When the update named by `runId` started, or — with no id — the newest
 *  delivered one, which is what the next question will be answered against. */
export async function loadUpdateAt(
  client: SupabaseClient,
  clientId: string,
  runId?: string | null,
): Promise<string | null> {
  const q = runId
    ? client.from('pipeline_runs').select('started_at').eq('id', runId).eq('client_id', clientId).maybeSingle()
    : client
        .from('pipeline_runs')
        .select('started_at')
        .eq('client_id', clientId)
        .in('status', ['completed', 'partial'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
  const { data } = await q
  return (data?.started_at as string | undefined) ?? null
}

/**
 * All four facts for one workspace.
 *
 * `runId` names the update an ALREADY-GIVEN answer was given against; without
 * it the newest delivered update answers, which is what the next question will
 * use. The other three are as they are NOW, deliberately: a thread read today
 * is searched today, and pretending the index is what it was in August would be
 * the more confident lie.
 */
export async function loadAskBasis(
  client: SupabaseClient,
  clientId: string,
  runId?: string | null,
): Promise<AskBasis> {
  const [updateAt, facts] = await Promise.all([
    loadUpdateAt(client, clientId, runId),
    loadIndexFacts(client, clientId),
  ])
  return { updateAt, ...facts }
}
