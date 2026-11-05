import { dbSafeJson, dbSafeText } from '../db-text'
import { MARKET_DEFINITION_FIELD } from '../reading/comparability'
import { monthStartOf, nextMonth } from '../reading/month-key'
import { marketDefinitionOf, relevancePromptVersion } from './relevance'

// A TENANT'S MARKET DEFINITION, AS THE OPERATOR SETS IT (5 Nov). The pure
// half of scripts/set-market-description.ts: the words checked, what a write
// would change, and the one change-log row it leaves.
//
// The definition is CLIENT DATA (`tracking_configs.market_description`, MF3,
// operator-only), never code: the relevance gate judges by it
// (lib/gather/relevance.ts) whole, and the written reads and the briefs print
// its FIRST PARAGRAPH, by convention the definition's summary, as the market
// the company sells into (`marketSummaryOf`, lib/written/company.ts): never
// its lists or its borderline rule, which are a classifier's instructions. So
// the first paragraph is one paragraph of prose saying what the market is,
// and the whole text has no digit and no em dash (plan §4.0's rule for the
// operator's words, as scripts/operator-config.ts holds its noun phrase to).
//
// THE ROW IS THE COMPARISON BREAK. Surface `gate_rule`, field
// `market_description` (`isMarketDefinitionChange`), `affects_months` the
// months read under the new definition: from the first month still filling
// to the end of this month. The operator's regate then removes what the two
// raters' plan calls off-market under the definition (not a re-run of the
// gate, which judges only what later gathers find) and those months are
// refreshed. The frozen months before keep the old rule's figures, so every
// month pair that crosses the band's first month is refused and no other
// (`changeBearsOn`, lib/reading/comparability.ts); the weekly bars, read live
// from the regated corpus, are not cut. No note:
// our own changes carry none (Heinrich, 27 Sep); Settings titles it "How we
// check relevance".

/** Long enough for a definition with its in, out and borderline parts. */
export const MARKET_DEFINITION_MAX = 4000
/** The first paragraph, the writers' summary, at most. */
export const MARKET_SUMMARY_MAX = 700

/** The file's words, checked and normalised as the gate reads them
 *  (`marketDefinitionOf`: line endings `\n`, trimmed). Throws a sentence on
 *  an empty or overlong text, an em dash, a digit, or a control character
 *  other than a newline or a tab. Pure. */
export function checkMarketDefinition(raw: string): string {
  const text = marketDefinitionOf({ market_description: raw })
  if (!text) throw new Error('the market definition is empty')
  if (text.length > MARKET_DEFINITION_MAX) throw new Error(`the market definition is ${text.length} characters, over ${MARKET_DEFINITION_MAX}`)
  if (/—/.test(text)) throw new Error('the market definition carries an em dash (plan §4.0)')
  if (/\p{Nd}/u.test(text)) throw new Error('the market definition carries a digit: the written reads print it, and a figure there is a claim nothing measured')
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) throw new Error('the market definition carries a control character')
  // The first paragraph is what the writers read: prose, not a list, short.
  const summary = text.split(/\n[ \t]*\n/)[0]
  if (/^\s*[-*•]/m.test(summary)) throw new Error('the market definition\'s first paragraph is a list: it is the writers\' summary (lib/written/company.ts marketSummaryOf), so make it one paragraph of prose')
  if (summary.length > MARKET_SUMMARY_MAX) throw new Error(`the market definition's first paragraph is ${summary.length} characters, over ${MARKET_SUMMARY_MAX}: it is the writers' summary, so keep it short`)
  return text
}

/** The months a definition written now is read under, as a daterange: from
 *  the month after the newest frozen month (every later month is filling and
 *  is refreshed after the regate) to the month after `now`'s. With no frozen
 *  month at all, from `now`'s month. Pure. */
export function rejudgedBand(latestFrozen: string | null, now: string): string {
  const current = monthStartOf(now)
  const from = latestFrozen ? nextMonth(monthStartOf(latestFrozen)) : current
  const to = nextMonth(current)
  if (!(from < to)) throw new Error(`the newest frozen month (${latestFrozen}) is not before ${current}: nothing is filling to re-judge`)
  return `[${from},${to})`
}

/** One side of the row: the definition (null: none) and the prompt version
 *  the gate's calls carry under it (`relevancePromptVersion`), so a run's
 *  `ai_call_log` row is matched to the definition that judged it. */
export interface DefinitionSide {
  market_description: string | null
  prompt_version: string
}

export const definitionSide = (definition: string | null): DefinitionSide => ({
  market_description: definition,
  prompt_version: relevancePromptVersion('gpt', { market_description: definition }),
})

export interface MarketDefinitionPlan {
  before: DefinitionSide
  after: DefinitionSide
  /** False where the stored words are the ones given: nothing to write. */
  moves: boolean
  /** `affects_months` for the row. */
  band: string
  /** The first re-judged month, `YYYY-MM-01`: every month pair from a month
   *  before it to one at or after it is refused. */
  rejudgedFrom: string
}

/** What a write would do. `wanted` null clears the definition (the gate goes
 *  back to its broad-category prompt, byte for byte). Pure. */
export function planMarketDefinition(stored: unknown, wanted: string | null, latestFrozen: string | null, now: string): MarketDefinitionPlan {
  const before = definitionSide(typeof stored === 'string' ? marketDefinitionOf({ market_description: stored }) : null)
  const after = definitionSide(wanted == null ? null : checkMarketDefinition(wanted))
  const band = rejudgedBand(latestFrozen, now)
  return { before, after, moves: before.market_description !== after.market_description, band, rejudgedFrom: band.slice(1, 11) }
}

/** The change-log row, field for field. Built by hand, as
 *  `operatorKeepChange` builds its row (lib/gather/rejudge.ts): `gate_rule`
 *  is in the database's surface CHECK but not in `ConfigSurface`, so
 *  `changeRow` cannot build it. Pure. */
export function marketDefinitionChange(args: {
  clientId: string
  plan: MarketDefinitionPlan
  actorLabel: string
  at: string
}): Record<string, unknown> {
  return {
    client_id: args.clientId,
    changed_at: args.at,
    surface: 'gate_rule',
    field: MARKET_DEFINITION_FIELD,
    before: dbSafeJson(args.plan.before),
    after: dbSafeJson(args.plan.after),
    actor_kind: 'script',
    actor_user_id: null,
    actor_label: dbSafeText(args.actorLabel),
    run_id: null,
    source: 'logged',
    rows_affected: null,
    note: null,
    affects_months: args.plan.band,
  }
}
