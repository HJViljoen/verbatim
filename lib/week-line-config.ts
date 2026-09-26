import { SEALAND_CLIENT_ID } from './config'

// WEEK_LINE: which tenants keep the same-age weekly line, and how (market-first
// decision M, part 2; plan §4.2 "lib/config.ts: WEEK_LINE", WP3.13).
//
// HELD HERE, NOT IN lib/config.ts, UNTIL THE 4 OCT RUN. lib/config.ts is on the
// freeze-months path (lib/reading/monthly.ts imports it; scripts/pipeline-
// closure.sh flags it "!"), and plan §7.11 makes any change there before the
// 4 Oct run a stop. So the constant and its type wait in this file, which
// nothing on the pipeline's import closure imports, and lib/week-line-config.test.ts
// pins it until it moves.
//
// AFTER THE 4 OCT RUN: move `WeekLineConfig`, `WEEK_LINE` and `weekLineConfigFor`
// into lib/config.ts (beside SEALAND_CLIENT_ID), move the pin into
// lib/config.test.ts, point the importers (lib/reading/week-line.ts,
// scripts/week-points.ts) at '../config', and delete this file and its test.
//
// SEALAND ONLY. `print` stays false until Heinrich's word after the Mon 26 Oct
// check (decision M: "print or wait by Mon 26 Oct, 18:00"). A tenant with no
// entry (Össur) gets no same-age row at all, not a pending one.

/** One tenant's same-age line.
 *  `firstWeek`     the first week read on one search set, one relevance check
 *                  and one update a week ('YYYY-MM-DD', a Monday).
 *  `ageDays`       14, or 21 if the check says so: every date moves a week.
 *  `print`         Heinrich's word; until then the line is kept, not shown.
 *  `methodVersion` the kept rows' method; a corrected method is a new version,
 *                  read only once this names it (the old rows stay).
 *  `mix`           the reference depth mix (1-4, 5-19, 20+ dated comments a
 *                  video), fixed when the line first prints: the pooled mix of
 *                  the weeks of 28 Sep and 5 Oct. Null until then. */
export interface WeekLineConfig {
  firstWeek: string
  ageDays: 14 | 21
  print: boolean
  methodVersion: string
  mix: readonly [number, number, number] | null
}

/** The method the first capture keeps its rows under. */
export const WEEK_LINE_METHOD_V1 = 'week_line_v1'

export const WEEK_LINE: Readonly<Record<string, WeekLineConfig>> = {
  [SEALAND_CLIENT_ID]: {
    firstWeek: '2026-09-28',
    ageDays: 14,
    print: false,
    methodVersion: WEEK_LINE_METHOD_V1,
    mix: null,
  },
}

/** A tenant's entry, or null when it keeps no same-age line. */
export function weekLineConfigFor(clientId: string): WeekLineConfig | null {
  return Object.prototype.hasOwnProperty.call(WEEK_LINE, clientId) ? WEEK_LINE[clientId] : null
}
