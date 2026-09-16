import { WEEKLY_STARTER_KEY, scheduleArtefact } from './artefact'
import type { ScheduleRow } from './types'

/**
 * The pure half of `scripts/migrate-schedule-keys.ts` (Phase 1 WP17).
 *
 * Here rather than in the script because a test in `scripts/` does not run:
 * the suite is `lib/**` and `components/**` (AGENTS.md, "tests are pure-logic
 * only"), and the flags and the write payload of an operator script that
 * changes who receives what are exactly the parts worth pinning.
 */

export interface MigrateArgs {
  clientId: string | null
  scheduleId: string | null
  /** Every schedule of the workspace, not just the default one. */
  all: boolean
  apply: boolean
}

export function parseArgs(argv: string[]): MigrateArgs {
  const a: MigrateArgs = { clientId: null, scheduleId: null, all: false, apply: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--client') a.clientId = next()
    else if (flag === '--schedule') a.scheduleId = next()
    else if (flag === '--all') a.all = true
    else if (flag === '--apply') a.apply = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  return a
}

/**
 * Which of a workspace's schedules this run touches.
 *
 * THE DEFAULT IS THE DEFAULT SCHEDULE, not all of them. The script's own header
 * says the change is made "ROW BY ROW, by an operator", and `--client` alone
 * used to convert EVERY row — including a document or brief schedule with its
 * own `report_id`, all of them rewritten to the weekly report. It is dry by
 * default and prints each row before `--apply`, but the safe reading of a flag
 * should not depend on the operator noticing a line.
 *
 * So: `--schedule <id>` names one, `--all` asks for every one on purpose, and
 * `--client` alone takes the workspace digest — the row this migration exists
 * for.
 */
export function chooseSchedules<T extends { id: string; is_default: boolean }>(
  all: readonly T[],
  args: Pick<MigrateArgs, 'scheduleId' | 'all'>,
): T[] {
  if (args.scheduleId) return all.filter((s) => s.id === args.scheduleId)
  if (args.all) return [...all]
  return all.filter((s) => s.is_default)
}

export function validate(a: MigrateArgs): string[] {
  const errors: string[] = []
  if (!a.clientId) errors.push('--client <uuid> is required: there is no safe default for a distribution change')
  return errors
}

/** What one schedule sends now, in one line an operator can read. */
export function describes(s: Pick<ScheduleRow, 'starter_key' | 'report_id'> & { artefact?: string | null; sections?: number }): string {
  const artefact = scheduleArtefact(s)
  if (artefact) return `artefact '${artefact}'`
  if (s.starter_key) return `starter '${s.starter_key}'`
  if (s.report_id) return `the stored report ${s.report_id.slice(0, 8)}${s.sections != null ? ` (${s.sections} sections)` : ''}`
  return 'nothing this build recognises'
}

/**
 * The fields to write.
 *
 * `artefact` only where the column exists — M8 is WP16's and is not applied,
 * and naming a column that is not there fails the WHOLE update rather than the
 * one field, which would leave the schedule sending the old artefact while the
 * operator read a success line.
 */
export function migration(hasArtefactColumn: boolean, now: Date = new Date()): Record<string, unknown> {
  return {
    starter_key: WEEKLY_STARTER_KEY,
    report_id: null,
    ...(hasArtefactColumn ? { artefact: 'weekly' } : {}),
    updated_at: now.toISOString(),
  }
}
