import { fullDate } from '../format'
import { summarise, type ReadinessSummary } from '../readiness/compute'
import type { ReadinessRow } from '../readiness/types'

/**
 * Readiness, in Settings, for the person whose workspace it is (Phase 1 WP16,
 * design ST1, decision V).
 *
 * `/dashboard/ops/readiness` keeps all thirteen rows and the operator dialect.
 * This is the same `computeReadiness` output, filtered and re-worded — ONE
 * computation, two readers, because two copies of thirteen rules is how the
 * two pages start disagreeing about the same workspace.
 *
 * THE FILTER IS A RULE, NOT A LIST OF IDS. A row is withheld when its status is
 * `missing` AND its owner is not the client: "the product cannot do this yet"
 * is our roadmap, and a roadmap line dressed as a measurement is a promise made
 * on a page whose whole premise is that every row is measured
 * (`lib/readiness/types.ts`). The moment such a row has something to measure it
 * appears on its own, which is what an id list could not do — four of the five
 * rows this hides today (months of history, the anomaly baseline, the change
 * record, the decision ledger) stop being missing as soon as their tables are
 * seeded, and the fifth (the subject set) appears the day subjects exist.
 *
 * Measured against production the rule yields EIGHT rows on both tenants — the
 * eight the research named — with no id written down anywhere.
 *
 * THE UNLOCK SENTENCE IS RE-WORDED, NOT THE MEASUREMENT. "Apply the change
 * log", "Run the one-off backfill" and "Seed it once per workspace" are our
 * words about our work. `notes` is client-safe on every row, and so is `detail`
 * on every row but one — so `unlocks` is replaced, and only where the owner is
 * not the client. A row the CLIENT owns keeps its sentence exactly, because
 * that sentence is the thing they can act on and rewriting it would blunt the
 * only two actionable rows on the page.
 *
 * THE ONE ROW `detail` IS NOT CLIENT-SAFE ON is retention, which read "768
 * comments fall due to be read again on 17 Sep 2026 — one night's re-read
 * budget is 5,000 comments, shared across every workspace." That is right on
 * /dashboard/ops/readiness and it tells a paying client their re-reads queue
 * behind other customers'. A row that has something only we may hear puts the
 * client's half in `clientDetail`, and this is where it is preferred.
 *
 * Pure.
 */

export const OWNER_WORDS = {
  client: 'Yours to change',
  ops: 'We do this',
  engineering: 'We are building this',
} as const

/** What we will do about a row we own, said as a commitment rather than as a
 *  task. Keyed by row id, because the sentence is about that specific input;
 *  an unlisted row keeps its own `unlocks`, which is the safe direction —
 *  worst case a client reads a sentence written for us, best case they read
 *  nothing false. */
const CLIENT_UNLOCKS: Readonly<Record<string, string>> = {
  'tracked-terms': 'Your terms are set and you can edit them here. We do not yet write down every change to them; that record starts shortly.',
  communities: 'We choose which communities to watch and check them each update. Tell us one to add or drop and we will.',
  'searchable-findings': 'We are working through the findings that cannot yet be searched by a question.',
  'read-depth': 'Nothing to configure: the shares rise as more of what we gather can be listened to and read.',
  'update-record': 'Nothing to do: this is the record of your updates as they ran.',
  retention: 'Nothing to do. Comments are read again on a schedule, and this is where that schedule stands.',
  'months-of-history': 'We write your months down as each update runs; this fills in on its own.',
  'anomaly-baseline': 'The weekly check needs three complete months behind it before it can say anything is unusual.',
  'change-record': 'We are starting to write down every change to your configuration, ours and yours.',
  decisions: 'Once you can mark a recommendation as taken or declined, this becomes the record of what you decided.',
}

export interface ClientReadinessRow extends ReadinessRow {
  /** The owner in the client's words. */
  ownerWords: string
  /** A date this row is expected to change, where one genuinely exists. Null
   *  everywhere else — a "by when" invented to fill a column is a promise
   *  nobody made. */
  by: string | null
}

export interface ClientReadinessView {
  rows: ClientReadinessRow[]
  /** Computed over the ROWS SHOWN, so the badge never counts a row nobody can
   *  see. The operator page's summary is over all thirteen and the two are
   *  different numbers about the same workspace — deliberately, and each is
   *  right about its own page. */
  summary: ReadinessSummary
  /** How many rows are held back, so the page can say so instead of implying
   *  the list is everything. */
  withheld: number
}

export function clientReadiness(
  rows: readonly ReadinessRow[],
  opts: { by?: Readonly<Record<string, string | null>> } = {},
): ClientReadinessView {
  const shown = rows.filter((r) => !(r.status === 'missing' && r.owner !== 'client'))
  const view = shown.map((r): ClientReadinessRow => {
    const by = opts.by?.[r.id] ?? null
    return {
      ...r,
      detail: r.clientDetail ?? r.detail,
      // The set-aside and read-before-the-flags history is the record's
      // (Settings › The record › Coverage says it word for word); Readiness is
      // about what is missing (copy de-clutter C9).
      notes: r.id === 'read-depth' ? [] : r.notes,
      unlocks: r.owner === 'client' ? r.unlocks : (CLIENT_UNLOCKS[r.id] ?? r.unlocks),
      ownerWords: OWNER_WORDS[r.owner],
      by: by ? fullDate(by) : null,
    }
  })
  return { rows: view, summary: summarise(view), withheld: rows.length - shown.length }
}

/**
 * What the reading pages do not do yet, in one list (copy de-clutter ruling G,
 * 2026-09-24). These used to be "not built yet" tiles on Market and
 * Competitive, printed on every visit; this is their one home. No dates: a
 * date nobody promised is not one to print.
 */
export const NOT_BUILT: readonly { page: string; what: string }[] = [
  { page: 'Market', what: 'Confirming this month’s card as a move in one press.' },
  { page: 'Market', what: 'Plans re-checked: an uploaded campaign brief re-read against every update.' },
  { page: 'Market', what: 'Registering a claim, and keeping a claim’s identity across updates.' },
  { page: 'Competitive', what: 'Rivals’ own claims beside what their audience says. This is a decision we have not taken yet, not a gap in your workspace.' },
  { page: 'Competitive', what: 'Cross-brand findings marked “seen in N of the last 6 months”, which needs a finding identity that survives an update.' },
  { page: 'Competitive', what: 'Grouping rivals’ questions, and matching them to your subjects.' },
]
