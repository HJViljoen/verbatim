import type { SupabaseClient } from '@supabase/supabase-js'

import { marketLabels, type MarketLabels } from '../brands/attribution'
import {
  TABLE_STATEMENTS,
  TABLE_STATEMENT_READINGS,
  isMissingStatements,
  type StatementReading,
  type StatementRow,
  type StatementsBlockData,
  type StatementView,
} from '../statements/types'

// Your moves · "Your statements": the page's read (pages build, package MOVES).
//
// TWO READS, ONE WAVE: the live statements and every reading of them. The
// readings are written by the service role (lib/statements/measure.ts); a
// member reads them through RLS.
//
// THE PAGE'S MONTH is the newest month any live statement has been measured
// for, and only that month's readings are drawn: one base for the whole block,
// stated once in its subtitle. A statement with no reading for that month
// (just added, or its measurement failed) shows its words and nothing else.
// There is no "measuring" state (the brief: show nothing until measured).

/** Pure: the block's data from the rows. Exported for the tests. */
export function statementsBlock(args: {
  statements: readonly Pick<StatementRow, 'id' | 'text' | 'created_at'>[]
  readings: readonly { statement_id: string; month: string; data: StatementReading; measured_at: string }[]
  canEdit: boolean
  brand: string
  market: MarketLabels
}): StatementsBlockData {
  const live = new Set(args.statements.map((s) => s.id))
  const readings = args.readings.filter((r) => live.has(r.statement_id) && r.data && typeof r.data === 'object')
  const month = readings.reduce<string | null>((m, r) => (m == null || r.month > m ? r.month : m), null)
  const ofMonth = readings.filter((r) => r.month === month)
  const byStatement = new Map(ofMonth.map((r) => [r.statement_id, r.data]))
  // The base the subtitle states: the newest measurement's, so a month still
  // under way states the latest count of it.
  const newest = [...ofMonth].sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0]?.data ?? null
  const statements: StatementView[] = [...args.statements]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((s) => ({ id: s.id, text: s.text, reading: byStatement.get(s.id) ?? null }))
  return {
    month,
    complete: newest?.complete ?? false,
    base: newest?.market.base ?? null,
    statements,
    canEdit: args.canEdit,
    brand: args.brand,
    market: args.market,
  }
}

/**
 * The block, or null where it has nothing to show: no table yet, or no
 * statement and nobody here who can add one (rule 2: a block with nothing to
 * say is omitted). A failed read loses the block and keeps the page.
 */
export async function loadStatements(
  supabase: SupabaseClient,
  clientId: string,
  opts: { canEdit: boolean; brand: string },
): Promise<StatementsBlockData | null> {
  try {
    const [st, rd] = await Promise.all([
      supabase.from(TABLE_STATEMENTS)
        .select('id, text, created_at')
        .eq('client_id', clientId).is('retired_at', null)
        .order('created_at', { ascending: true }).order('id', { ascending: true }),
      supabase.from(TABLE_STATEMENT_READINGS)
        .select('statement_id, month, data, measured_at')
        .eq('client_id', clientId)
        .order('month', { ascending: false }).limit(500),
    ])
    if (st.error) {
      if (!isMissingStatements(st.error)) console.error(`[pages] moves.statements: ${st.error.message}`)
      return null
    }
    if (rd.error && !isMissingStatements(rd.error)) console.error(`[pages] moves.statements.readings: ${rd.error.message}`)
    const statements = (st.data ?? []) as Pick<StatementRow, 'id' | 'text' | 'created_at'>[]
    if (statements.length === 0 && !opts.canEdit) return null
    return statementsBlock({
      statements,
      readings: ((rd.error ? [] : rd.data) ?? []) as { statement_id: string; month: string; data: StatementReading; measured_at: string }[],
      canEdit: opts.canEdit,
      brand: opts.brand,
      market: marketLabels(clientId),
    })
  } catch (e) {
    console.error(`[pages] moves.statements: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}
