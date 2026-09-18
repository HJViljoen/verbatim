import type { SupabaseClient } from '@supabase/supabase-js'

import { selectAll } from '../supabase-admin'
import { CONFIG_CHANGES_TABLE, isMissingConfigLog, type ConfigChange } from '../config-log'
import { isMissingAffects, readChangeLog, showingLine, type ClientChange } from './change-log'
import { termYieldByMonth, TERM_YIELD_BASIS, type KeywordRunRow, type TermYield } from './terms'

// What the quarterly deck may print about the search plan and the change log
// (block D, D9 — `qr.p8.searchplan`, `qr.p8.changelog`).
//
// BOTH ALREADY EXIST ON SETTINGS AND NEITHER REACHES THE DECK. The per-term
// keep rate is rendered on Settings › The record (`termYieldByMonth`); the
// dated change log is rendered there too (`readChangeLog`). The deck's page 7
// prints a COUNT — "1 change to what we track was made inside this window" —
// and page 8 has no search plan at all. A client reading the quarterly is
// exactly the reader who needs to know which of the terms behind these numbers
// are bringing anything back, and which change moved the basis under them.
//
// BOUNDED BY THE QUARTER, NOT BY THE WHOLE RECORD. Settings shows the tenant's
// whole history; a quarterly artefact states what happened inside the quarter
// it is about, and a log that reached back further would put changes from
// before the window under a heading that names it.
//
// AND THE SEARCH PLAN IS ON THE OTHER CLOCK. `keyword_performance` is dated by
// the GATHER — a term that ran on 13 September found what it found that day,
// and the comments behind those videos belong to whatever months they belong
// to. `TERM_YIELD_BASIS` is the sentence that has to travel with it, and it is
// carried here rather than left to the surface (AGENTS.md: run_date is never a
// period key outside a run's own bookkeeping, and a gather IS a run's own
// bookkeeping).

/** How many terms the deck lists. The page names what it hides. */
export const SEARCH_PLAN_ROWS = 12

/** How many changes the deck lists, newest first. */
export const DECK_CHANGES_ROWS = 10

export interface SearchPlan {
  rows: TermYield[]
  /** "Showing the 12 busiest of 21." Null when the table IS the list. */
  showing: string | null
  /** The clock this table is on. Printed, never implied. */
  basis: string
  /** Terms that found something and kept nothing — the row worth reading. */
  noYield: number
}

/** The deck's cut of the term yield. Pure. */
export function searchPlanView(rows: readonly TermYield[], limit: number = SEARCH_PLAN_ROWS): SearchPlan {
  const ordered = [...rows]
  return {
    rows: ordered.slice(0, limit),
    showing: ordered.length > limit ? showingLine(limit, ordered.length)?.replace('most recent', 'busiest') ?? null : null,
    basis: TERM_YIELD_BASIS,
    // FOUND SOMETHING AND KEPT NOTHING, which is not the same as a term that
    // found nothing at all: the first is a term pulling in the wrong videos
    // and costing money to gather, the second is a term nobody is using.
    noYield: ordered.filter((t) => t.found > 0 && t.kept === 0).length,
  }
}

export interface DeckChangeLog {
  rows: ClientChange[]
  showing: string | null
  /** True where `config_changes.affects_*` could be read, so the "what it
   *  broke" column means something. */
  affectsRecorded: boolean
}

/** The deck's cut of the change log. Pure. */
export function deckChangeLogView(
  rows: readonly ConfigChange[],
  args: { affectsRecorded: boolean; limit?: number; viewerUserId?: string | null },
): DeckChangeLog {
  const limit = args.limit ?? DECK_CHANGES_ROWS
  // RECORDED ROWS ONLY. A reconstructed row is a label worked out afterwards,
  // not a record of an act, and `changeLogBoundary` insists the two are never
  // summed. A quarterly artefact that listed inference beside record would be
  // the worse of the two claims, printed as the better.
  const view = readChangeLog({ rows, viewerUserId: args.viewerUserId ?? null })
  return {
    rows: view.recorded.slice(0, limit),
    showing: showingLine(limit, view.recorded.length),
    affectsRecorded: args.affectsRecorded,
  }
}

/**
 * The gathers inside a window, per term. Null — never [] — where the table
 * cannot be read, so the deck can say "not recorded" rather than "no term
 * found anything".
 */
export async function loadSearchPlan(
  client: SupabaseClient,
  clientId: string,
  window: { from: string; to: string },
): Promise<SearchPlan | null> {
  try {
    const rows = await selectAll<KeywordRunRow>(() =>
      client
        .from('keyword_performance')
        .select('keyword, videos_found, gate_survived, created_at')
        .eq('client_id', clientId)
        .gte('created_at', `${window.from}T00:00:00.000Z`)
        .lte('created_at', `${window.to}T23:59:59.999Z`)
        .order('id', { ascending: false }),
    )
    if (rows.length === 0) return null
    return searchPlanView(termYieldByMonth(rows))
  } catch (error) {
    console.error(`[settings] deck search plan: ${(error as { message?: string })?.message ?? String(error)}`)
    return null
  }
}

/**
 * The changes logged inside a window. Null where the log itself is not applied
 * here — which is a different sentence from "nothing changed", and the reader
 * has to be able to tell them apart.
 *
 * Retries without M1's two columns, the `isMissingAffects` precedent: a change
 * log without its break clause is still a change log, and taking the page down
 * for a column that arrives in a later migration is the failure the readiness
 * guards exist to prevent.
 */
export async function loadDeckChangeLog(
  client: SupabaseClient,
  clientId: string,
  window: { from: string; to: string },
  viewerUserId: string | null = null,
): Promise<DeckChangeLog | null> {
  const probe = await client.from(CONFIG_CHANGES_TABLE).select('id').limit(1)
  if (isMissingConfigLog(probe.error)) return null
  if (probe.error) {
    console.error(`[settings] deck change log: ${probe.error.message}`)
    return null
  }

  // Both column lists written out: a variable in `.select()` types every row as
  // a parser error (the rule lib/readiness/load.ts states).
  try {
    const rows = await selectAll<ConfigChange>(() =>
      client.from(CONFIG_CHANGES_TABLE)
        .select('id, client_id, changed_at, surface, field, before, after, actor_kind, actor_user_id, actor_label, run_id, source, rows_affected, note, affects_audiences, affects_months')
        .eq('client_id', clientId)
        .gte('changed_at', `${window.from}T00:00:00.000Z`)
        .lte('changed_at', `${window.to}T23:59:59.999Z`)
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false }),
    )
    return deckChangeLogView(rows, { affectsRecorded: true, viewerUserId })
  } catch (error) {
    if (!isMissingAffects(error)) {
      console.error(`[settings] deck change log: ${(error as { message?: string })?.message ?? String(error)}`)
      return null
    }
    const rows = await selectAll<Omit<ConfigChange, 'affects_audiences' | 'affects_months'>>(() =>
      client.from(CONFIG_CHANGES_TABLE)
        .select('id, client_id, changed_at, surface, field, before, after, actor_kind, actor_user_id, actor_label, run_id, source, rows_affected, note')
        .eq('client_id', clientId)
        .gte('changed_at', `${window.from}T00:00:00.000Z`)
        .lte('changed_at', `${window.to}T23:59:59.999Z`)
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false }),
    )
    return deckChangeLogView(
      rows.map((r) => ({ ...r, affects_audiences: null, affects_months: null })),
      { affectsRecorded: false, viewerUserId },
    )
  }
}
