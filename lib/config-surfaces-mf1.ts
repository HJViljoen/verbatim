import type { ConfigChangeInput, ConfigSurface } from './config-log'

// The three config_changes surfaces MF1 adds to its CHECK
// (supabase/migrations/20260928090000_market_first_s1.sql, market-first WP1.4):
//   segment      a segment rule version or label run (scripts/label-segments.ts)
//   gate_rule    the relevance-gate fix (scripts/log-tracking-eras.ts)
//   attribution  attribution v3 (scripts/log-tracking-eras.ts)
//
// HELD HERE, NOT IN lib/config-log.ts CONFIG_SURFACES, UNTIL THE 4 OCT RUN.
// lib/config-log.ts is on the freeze-months path (lib/reading/monthly.ts
// imports it; scripts/pipeline-closure.sh flags it "!"), and plan §7.11 makes
// any change there before the 4 Oct run a stop. Three more union members would
// change nothing the pipeline executes (CONFIG_SURFACES is read only by tests,
// ConfigSurface only as a type), but they wait all the same, and the few
// places that name the three read this file instead.
//
// AFTER THE 4 OCT RUN: append the three to CONFIG_SURFACES, replace
// `LoggedSurface` with `ConfigSurface` and drop `asChangeInput` at their users,
// and delete this file. lib/config-log.test.ts then pins CONFIG_SURFACES to
// MF1's CHECK alone.

export const MF1_SURFACES = ['segment', 'gate_rule', 'attribution'] as const
export type Mf1Surface = (typeof MF1_SURFACES)[number]

/** Every surface the change log holds once MF1 is applied. */
export type LoggedSurface = ConfigSurface | Mf1Surface

/** A change-log input that may name one of the three. */
export type LoggedChangeInput = Omit<ConfigChangeInput, 'surface'> & { surface: LoggedSurface }

/** `recordConfigChange(s)` checks no surface: the database's CHECK does, and
 *  MF1's takes these three. So the input crosses into `ConfigChangeInput`
 *  here, once, and nowhere else. */
export const asChangeInput = (input: LoggedChangeInput): ConfigChangeInput => input as ConfigChangeInput
