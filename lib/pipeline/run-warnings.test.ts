import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { closingErrors, partialRunAlert, runCloseStatus, summariseRunErrors } from './run-errors'
import {
  alertDue, closeRunWrite, createWarningLog, isMissingWarningsColumn, parseRunWarnings, runWarning, warningCause, warningSentence,
  WARNING_STEPS, RUN_WARNING_CAP, type RunWarning, type WarningStep,
} from './run-warnings'
import { isMissingBookkeepingColumn } from './run-bookkeeping'
import { previousUpdateEnd } from './owned-events'
import { decidingGathers, gatherHealth, gathersOf } from '../provenance/searches'
import { updateStatus } from '../reading/run-status'
import { chartCadenceBroken, gatherCompleted, weekCadence, type ChartRun } from '../reading/week-line'
import { thinWeek } from '../reports/documents/compose'

const ROOT = join(__dirname, '..', '..')
const PIPELINE = readFileSync(join(ROOT, 'inngest', 'functions', 'pipeline.ts'), 'utf8')

/** The error Össur's October product step died on, as a product write wraps it. */
const pg23505 = () => Object.assign(new Error('month_lens_readings upsert: duplicate key value violates unique constraint "month_lens_readings_pkey" (code 23505)'), { code: '23505' })

// ---- a failing step produces a warning -------------------------------------------

describe('a step out of retries produces a warning', () => {
  it('through the .catch the pipeline gives it: the step, the month, the code and what is stale', async () => {
    const log = createWarningLog()
    const noteWarning = log.note
    const month = '2026-10-01T00:00:00.000Z'
    // The pipeline's own shape: `step.run(...).catch((e) => { console.error(...); noteWarning(...); return null })`.
    const result = await Promise.reject(pg23505()).catch((e) => {
      noteWarning('lens-readings', e, { month })
      return null
    })
    expect(result).toBeNull()
    expect(log.recorded).toEqual([{
      step: 'lens-readings',
      kind: 'stale-data',
      month: '2026-10',
      cause: 'Postgres 23505: month_lens_readings upsert: duplicate key value violates unique constraint "month_lens_readings_pkey"',
      stale: 'The lens figures for October 2026 keep the previous update’s numbers.',
    }])
    expect(log.total).toBe(1)
    expect(log.staleData).toBe(1)
  })

  it('names the week, the subject, a comparability pair, and counts past the cap without storing past it', () => {
    expect(runWarning('anomaly-check', new Error('timeout'), { week: '2026-11-01T04:00:00Z' })).toMatchObject({ kind: 'housekeeping', week: '2026-11-01' })
    expect(runWarning('subject-membership', new Error('x'), { subject: 'Fit & comfort' })).toMatchObject({ subject: 'Fit & comfort', kind: 'stale-data' })
    expect(runWarning('comparability', new Error('x'), { month: '2026-10-01', prevMonth: '2026-09-01' }).stale).toBe('Whether September 2026 and October 2026 compare keeps the previous update’s answer.')
    expect(runWarning('comparability', new Error('x')).stale).toBe('The same-age line keeps no new week from this update.')
    const log = createWarningLog(2)
    for (let n = 0; n < 5; n++) log.note('embed-insights', new Error('boom'))
    log.note('brand-readings', new Error('boom'), { month: '2026-09' })
    expect(log.recorded).toHaveLength(2)
    expect(log.total).toBe(6)
    expect(log.staleData).toBe(1)
    expect(RUN_WARNING_CAP).toBe(50)
  })

  it('every step in the table has a class, a name and a stale sentence', () => {
    for (const [step, rule] of Object.entries(WARNING_STEPS)) {
      expect(['stale-data', 'housekeeping'], step).toContain(rule.kind)
      expect(rule.name.length, step).toBeGreaterThan(3)
      expect(runWarning(step as WarningStep, new Error('x')).stale, step).toMatch(/^[A-Z“].*\.$/)
    }
  })
})

describe('warningCause: the code or the message, never comment text', () => {
  it('reads the code off the error, its cause or the wrapped message', () => {
    expect(warningCause(pg23505())).toMatch(/^Postgres 23505: /)
    expect(warningCause(new Error('insert failed (code 23514)'))).toBe('Postgres 23514: insert failed')
    expect(warningCause(Object.assign(new Error('wrapped'), { cause: { code: 'PGRST116' } }))).toBe('PostgREST PGRST116: wrapped')
    expect(warningCause(Object.assign(new Error('Rate limit reached'), { status: 429 }))).toBe('HTTP 429: Rate limit reached')
    expect(warningCause('a plain string')).toBe('a plain string')
    expect(warningCause(undefined)).toBe('no message')
  })

  it('keeps identifiers and elides every other quoted part, cuts row and key details, the first line only, held to 200', () => {
    // A JSON parse error quotes the model's output, which may quote a comment.
    expect(warningCause(new SyntaxError('Unexpected token \'T\', "The bag fe"... is not valid JSON'))).toBe('Unexpected token \'T\', "…"... is not valid JSON')
    expect(warningCause(new Error('invalid input syntax for type uuid: "I love this backpack so much"'))).toBe('invalid input syntax for type uuid: "…"')
    expect(warningCause(new Error('new row for relation "comments" violates check constraint "x_check" Failing row contains (1, I hate it)'))).toBe('new row for relation "comments" violates check constraint "x_check"')
    expect(warningCause(new Error('duplicate key value violates unique constraint "p_key" Key (id)=(abc) already exists.'))).toBe('duplicate key value violates unique constraint "p_key"')
    expect(warningCause(new Error('model said “this zip broke on day two”'))).toBe('model said “…”')
    expect(warningCause(new Error('first line\nsecond line with a comment in it'))).toBe('first line')
    expect(warningCause(new Error('a · b'))).toBe('a, b')
    expect(warningCause(new Error('x'.repeat(400))).length).toBe(200)
  })
})

// ---- the status and every counting rule are unchanged ----------------------------

/** A run as close-run writes it when the only thing that went wrong was
 *  warnings: its status and errors from the counted errors alone (none), its
 *  warnings beside them. */
function warningOnlyClose(): { status: string; errors: string[]; error_message: string | null; warnings: RunWarning[] } {
  const log = createWarningLog()
  log.note('lens-readings', pg23505(), { month: '2026-10-01' })
  log.note('brand-readings', pg23505(), { month: '2026-10-01' })
  log.note('freeze-months', new Error('statement timeout'))
  log.note('embed-insights', new Error('timeout'))
  const totalErrors = 0
  return {
    status: runCloseStatus(totalErrors),
    errors: closingErrors(totalErrors, [], ['pass-a: 1 video re-asked on half its comments']),
    error_message: summariseRunErrors(totalErrors, []),
    warnings: log.recorded,
  }
}

describe('a warning-only run counts exactly as a clean run', () => {
  const closed = warningOnlyClose()

  it('closes completed, with no counted error and nothing in errors', () => {
    expect(closed.status).toBe('completed')
    expect(closed.errors).toEqual([])
    expect(closed.error_message).toBeNull()
    expect(closed.warnings).toHaveLength(4)
    expect(updateStatus(closed)).toBe('completed')
  })

  it('thinWeek: not thin, as without its warnings', () => {
    const base = { runStatus: closed.status, runErrorMessage: closed.error_message, run: { conversations: 900 } } as Parameters<typeof thinWeek>[0]
    expect(thinWeek(base)).toBe(false)
    expect(thinWeek({ ...base, warnings: closed.warnings } as typeof base)).toBe(false)
    // and a run partial only for Your products, with warnings beside it, as before
    expect(thinWeek({ ...base, runStatus: 'partial', runErrorMessage: '1 step error: product-readings', warnings: closed.warnings } as typeof base)).toBe(false)
  })

  it('the gathers: completed, no gather flag (rule 6), and it decides what ran unchanged', () => {
    const kp = [
      { run_id: 'prev0001', platform: 'tiktok', keyword: 'backpack', created_at: '2026-10-04T04:10:00Z' },
      { run_id: 'warn0001', platform: 'tiktok', keyword: 'backpack', created_at: '2026-10-11T04:10:00Z' },
    ]
    const runs = [
      { id: 'prev0001', status: 'completed', error_message: null },
      { id: 'warn0001', ...closed },
    ]
    const gathers = gathersOf(kp, runs)
    expect(gathers.find((g) => g.runId === 'warn0001')?.status).toBe('completed')
    expect(gatherHealth(gathers, '2026-10-01').partial).toBe(0)
    expect(decidingGathers(gathers, '2026-10-01T00:00:00Z', 'warn0001')).toMatchObject({ left: [] })
    expect(decidingGathers(gathers, '2026-10-01T00:00:00Z', 'warn0001').deciding.map((g) => g.runId)).toEqual(['prev0001', 'warn0001'])
  })

  it('the chart weeks: a completed gather, and the week is drawn exactly as without its warnings', () => {
    const sunday = (day: string): ChartRun => ({ id: `run-${day}`, status: 'completed', startedAt: `${day}T04:03:00Z`, finishedAt: `${day}T07:30:00Z`, errors: [] })
    const clean = [sunday('2026-10-04'), sunday('2026-10-11'), sunday('2026-10-18')]
    const warned = clean.map((r, i) => (i === 0 ? { ...r, status: closed.status, errors: closed.errors, warnings: closed.warnings } as ChartRun : r))
    const now = '2026-10-26T00:00:00Z'
    expect(gatherCompleted(warned[0])).toBe(true)
    expect(chartCadenceBroken('2026-09-28', warned, now)).toBe(chartCadenceBroken('2026-09-28', clean, now))
    expect(chartCadenceBroken('2026-09-28', warned, now)).toBeNull()
    // the same-age line's cadence
    const asWeek = (rs: ChartRun[]) => rs.map((r) => ({ id: r.id, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt, errorMessage: closed.error_message }))
    expect(weekCadence('2026-09-28', asWeek(warned))).toEqual(weekCadence('2026-09-28', asWeek(clean)))
    expect(weekCadence('2026-09-28', asWeek(warned)).offCadence).toBe(0)
  })

  it('the owned-events window starts at its end, as a clean run’s', () => {
    expect(previousUpdateEnd([{ ...closed, completed_at: '2026-11-08T05:13:49Z' }, { status: 'completed', completed_at: '2026-11-01T05:32:25Z', error_message: null }])).toBe('2026-11-08T05:13:49Z')
  })

  it('in the pipeline, a warning cannot reach totalErrors, runErrors, the status or error_message', () => {
    // totalErrors moves in noteError alone; the status and error_message are written from it.
    expect(PIPELINE.match(/totalErrors\+\+/g)).toHaveLength(1)
    const noteErrorBody = PIPELINE.slice(PIPELINE.indexOf('const noteError = '), PIPELINE.indexOf('const runFindings'))
    expect(noteErrorBody).toContain('totalErrors++')
    expect(PIPELINE).toContain('status: runCloseStatus(totalErrors),')
    expect(PIPELINE).toContain('errors: closingErrors(totalErrors, runErrors, runFindings),')
    expect(PIPELINE).toContain('error_message: summariseRunErrors(totalErrors, runErrors),')
    expect(PIPELINE).toContain("return { runId, status: runCloseStatus(totalErrors),")
    // The warnings travel only to close-run's own column and to the alert.
    const uses = [...PIPELINE.matchAll(/runWarnings\.(\w+)/g)].map((m) => m[1])
    expect([...new Set(uses)].sort()).toEqual(['note', 'recorded', 'total'])
  })
})

// ---- the pipeline's catches ------------------------------------------------------

describe('each classified step warns from its own .catch, and none of them is noteError’d', () => {
  /** The step's `.run(…)` call up to the end of its `.catch`. */
  const chainOf = (runId: string): string => {
    const at = PIPELINE.indexOf(`.run(${runId}`)
    expect(at, runId).toBeGreaterThan(0)
    const rest = PIPELINE.slice(at)
    const end = rest.search(/\n\s*\}\)\n/)
    // through the catch: the second `})` that closes at the step's own indent
    const catchAt = rest.indexOf('.catch(')
    const close = rest.indexOf('\n', rest.indexOf('})', rest.indexOf('return', catchAt)))
    return rest.slice(0, Math.max(end, close))
  }
  const STEPS: [string, WarningStep][] = [
    ["'plan-owned'", 'plan-owned'],
    ["'plan-translate-quotes'", 'plan-translate-quotes'],
    ['`translate-quotes:', 'translate-quotes'],
    ["'embed-insights'", 'embed-insights'],
    ["'plan-subject-membership'", 'plan-subject-membership'],
    ['`subject-membership:', 'subject-membership'],
    ["'trim-stale-memberships'", 'trim-stale-memberships'],
    ["'plan-segment-videos'", 'plan-segment-videos'],
    ['`segment-videos:', 'segment-videos'],
    ["'plan-comparability'", 'plan-comparability'],
    ['`comparability:', 'comparability'],
    ["'plan-lens-readings'", 'plan-lens-readings'],
    ['`lens-readings:', 'lens-readings'],
    ["'plan-brand-readings'", 'plan-brand-readings'],
    ['`brand-readings:', 'brand-readings'],
    ["'freeze-months'", 'freeze-months'],
    ["'anomaly-check'", 'anomaly-check'],
    ["'keyword-discovery'", 'keyword-discovery'],
  ]

  it('every step of the table but the evidence ids and the step budget is one of these, and each warns under its own label', () => {
    // Neither is a step's .catch: the evidence ids warn off the freeze's
    // return, the step budget off the run's own count (step-budget.test.ts).
    expect(STEPS.map(([, s]) => s).sort()).toEqual(Object.keys(WARNING_STEPS).filter((s) => s !== 'freeze-months:evidence-ids' && s !== 'step-budget').sort())
    for (const [id, label] of STEPS) {
      const chain = chainOf(id)
      expect(chain, id).toContain(`noteWarning('${label}', e`)
      expect(chain, id).not.toContain('noteError(')
    }
  })

  it('the freeze’s evidence ids warn off its memoised return', () => {
    expect(PIPELINE).toContain("const frozen = await step\n      .run('freeze-months'")
    expect(PIPELINE).toContain("if (frozen?.evidenceRefs?.failed) noteWarning('freeze-months:evidence-ids', frozen.evidenceRefs.failed)")
  })

  it('the month rides on the lens and brand warnings, the subject on its own, the run’s week on the plan and the check', () => {
    expect(chainOf('`lens-readings:')).toContain("noteWarning('lens-readings', e, { month })")
    expect(chainOf('`brand-readings:')).toContain("noteWarning('brand-readings', e, { month })")
    expect(chainOf('`subject-membership:')).toContain("noteWarning('subject-membership', e, { subject: subject.name })")
    expect(chainOf("'plan-owned'")).toContain("noteWarning('plan-owned', e, { week: runWindow?.start ?? null })")
    expect(chainOf("'anomaly-check'")).toContain("noteWarning('anomaly-check', e, { week: runWindow?.start ?? null })")
  })

  it('plan-owned now logs its failure (it said nothing at all)', () => {
    expect(chainOf("'plan-owned'")).toMatch(/console\.error\(`\[plan-owned\] out of retries/)
    expect(PIPELINE).not.toContain('.catch(() => EMPTY_OWNED_PLAN)')
  })

  it('noteWarning is declared before plan-owned, beside noteError (the TDZ reason)', () => {
    expect(PIPELINE.indexOf('const noteWarning = runWarnings.note')).toBeGreaterThan(PIPELINE.indexOf('const noteError = '))
    expect(PIPELINE.indexOf('const noteWarning = runWarnings.note')).toBeLessThan(PIPELINE.indexOf(".run('discover-subreddits'"))
  })
})

// ---- one alert a run --------------------------------------------------------------

describe('the alert: one a run, on a counted error or a stale-data warning, never on housekeeping alone', () => {
  const log = (...steps: WarningStep[]) => {
    const l = createWarningLog()
    for (const s of steps) l.note(s, new Error('boom'), s === 'lens-readings' || s === 'brand-readings' ? { month: '2026-10' } : {})
    return l
  }

  it('alertDue', () => {
    expect(alertDue(0, log())).toBe(false)
    expect(alertDue(0, log('embed-insights', 'keyword-discovery', 'translate-quotes', 'anomaly-check', 'plan-translate-quotes'))).toBe(false)
    expect(alertDue(0, log('lens-readings'))).toBe(true)
    expect(alertDue(0, log('embed-insights', 'brand-readings'))).toBe(true)
    expect(alertDue(1, log())).toBe(true)
    expect(alertDue(2, log('lens-readings'))).toBe(true)
  })

  it('the pipeline has one alert-partial step, gated on alertDue, handed every warning in one call', () => {
    expect(PIPELINE.match(/\.run\('alert-partial'/g)).toHaveLength(1)
    expect(PIPELINE).toContain('if (alertDue(totalErrors, runWarnings)) {')
    expect(PIPELINE).not.toContain('if (totalErrors > 0) {\n      await step\n        .run(\'alert-partial\'')
    const alert = PIPELINE.slice(PIPELINE.indexOf(".run('alert-partial'"))
    const body = alert.slice(0, alert.indexOf('.catch('))
    expect(body.match(/sendAlertEmail\(/g)).toHaveLength(1)
    expect(body).toContain('warnings: runWarnings.recorded,')
    // No warning path sends an email of its own.
    for (const m of PIPELINE.matchAll(/noteWarning\(/g)) {
      const around = PIPELINE.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 200)
      expect(around).not.toContain('sendAlertEmail(')
    }
  })

  const rows = { observations: 12, recommendations: 4, costs: 1 }

  it('a warning-only run: one email, the existing alert’s sections, every warning listed once', () => {
    const l = log('lens-readings', 'brand-readings', 'lens-readings', 'embed-insights')
    const { subject, text } = partialRunAlert({
      runId: 'run-1', clientName: 'Össur', total: 0, recorded: [], reportSent: true, rows, warnings: l.recorded, warningTotal: l.total,
    })
    expect(subject).toBe('Verbatim run WARNING — Össur')
    expect(text).toMatch(/^Run run-1 for Össur completed, with 3 stale-data warnings: /)
    expect(text).toContain('Summary: 4 warnings: lens-readings ×2, brand-readings, embed-insights')
    expect(text).toContain('Warnings:\n- lens-readings (2026-10): boom. Stale: The lens figures for October 2026 keep the previous update’s numbers.')
    expect(text).toContain('Housekeeping, shown on the ops page only:\n- embed-insights: boom.')
    expect(text).toContain('What the run left behind:\n- nothing missing')
    expect(text).toContain('Full list: pipeline_runs.warnings.')
    expect(text).not.toContain('PARTIAL')
    expect(text.match(/- lens-readings/g)).toHaveLength(2)
  })

  it('a partial run with warnings: the partial email, its summary still the counted errors, the warnings under their own heading', () => {
    const l = log('lens-readings', 'keyword-discovery')
    const { subject, text } = partialRunAlert({
      runId: 'run-2', clientName: 'Sealand', total: 1, recorded: ['gate:instagram: refused'], reportSent: true, rows, warnings: l.recorded, warningTotal: l.total,
    })
    expect(subject).toBe('Verbatim run PARTIAL — Sealand')
    expect(text).toContain('Summary: 1 step error: gate:instagram')
    expect(text).toContain('Warnings, not counted (2 warnings: keyword-discovery, lens-readings):')
    expect(text).toContain('- keyword-discovery: boom.')
  })

  it('a partial run without warnings: the email is byte for byte what it was', () => {
    const input = { runId: 'run-3', clientName: 'Sealand', total: 2, recorded: ['ocr: x', 'themes:industry-other: y'], reportSent: false, findings: ['pass-a: z'], rows }
    expect(partialRunAlert({ ...input, warnings: [], warningTotal: 0 })).toEqual(partialRunAlert(input))
    expect(partialRunAlert(input).text).not.toMatch(/warning/i)
  })
})

// ---- the column probe ---------------------------------------------------------------

describe('closeRunWrite: the column probe', () => {
  const warnings = [runWarning('lens-readings', pg23505(), { month: '2026-10' })]
  const missing = (column: string, code = '42703') => ({ code, message: code === '42703' ? `column "${column}" of relation "pipeline_runs" does not exist` : `Could not find the '${column}' column of 'pipeline_runs' in the schema cache` })

  it('with the column there: one write, the warnings in it', async () => {
    const close = vi.fn(async () => ({ error: null }))
    expect(await closeRunWrite(close, { stalled: false, warnings }, isMissingBookkeepingColumn)).toEqual({ error: null, wrote: 'all' })
    expect(close.mock.calls).toEqual([[{ stalled: false, warnings }]])
  })

  it('before the migration (42703 or PGRST204 for warnings): the same write again without it, the row every run wrote before', async () => {
    for (const code of ['42703', 'PGRST204']) {
      const close = vi.fn(async (extra: Record<string, unknown>) => ({ error: 'warnings' in extra ? missing('warnings', code) : null }))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await closeRunWrite(close, { stalled: true, warnings }, isMissingBookkeepingColumn)).toEqual({ error: null, wrote: 'without-warnings' })
      expect(close.mock.calls).toEqual([[{ stalled: true, warnings }], [{ stalled: true }]])
      expect(isMissingWarningsColumn(missing('warnings', code))).toBe(true)
    }
  })

  it('without the bookkeeping columns either: the bare write, as close-run always fell back to', async () => {
    const close = vi.fn(async (extra: Record<string, unknown>) => ({ error: 'warnings' in extra ? missing('warnings') : 'stalled' in extra ? missing('stalled') : null }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await closeRunWrite(close, { stalled: false, warnings }, isMissingBookkeepingColumn)).toEqual({ error: null, wrote: 'bare' })
    expect(close.mock.calls.map((c) => Object.keys(c[0]))).toEqual([['stalled', 'warnings'], ['stalled'], []])
  })

  it('any other error is returned, never retried', async () => {
    const other = { code: '57014', message: 'canceling statement due to statement timeout' }
    const close = vi.fn(async () => ({ error: other }))
    expect(await closeRunWrite(close, { stalled: false, warnings }, isMissingBookkeepingColumn)).toEqual({ error: other, wrote: 'all' })
    expect(close).toHaveBeenCalledTimes(1)
    expect(isMissingWarningsColumn(other)).toBe(false)
    expect(isMissingWarningsColumn(missing('stalled'))).toBe(false)
  })

  it('close-run calls it with the run’s warnings and the bookkeeping test', () => {
    const closeRun = PIPELINE.slice(PIPELINE.indexOf("step.run('close-run'"), PIPELINE.indexOf("// 7a-i."))
    expect(closeRun).toContain('await closeRunWrite(')
    expect(closeRun).toContain('warnings: runWarnings.recorded }')
    expect(closeRun).toContain('isMissingBookkeepingColumn,')
  })
})

// ---- read back, and said on the ops page ---------------------------------------------

describe('a stored warning read back and said', () => {
  it('parseRunWarnings keeps the entries with the shape and nothing else', () => {
    const w = runWarning('brand-readings', pg23505(), { month: '2026-10' })
    expect(parseRunWarnings([w, { step: 'x' }, 'ocr: x', null, { ...w, kind: 'error' }])).toEqual([w])
    expect(parseRunWarnings(null)).toEqual([])
    expect(parseRunWarnings('[]')).toEqual([])
  })

  it('warningSentence: a plain sentence, sentence case, no middle dot', () => {
    const lens = warningSentence(runWarning('lens-readings', pg23505(), { month: '2026-10-01' }))
    expect(lens).toBe('Stale data: lens readings for October 2026 did not finish (Postgres 23505: month_lens_readings upsert: duplicate key value violates unique constraint "month_lens_readings_pkey"). The lens figures for October 2026 keep the previous update’s numbers.')
    const embed = warningSentence(runWarning('embed-insights', new Error('timeout')))
    expect(embed).toBe('Housekeeping: the insight embeddings did not finish (timeout). The Agent cannot search this update’s new insights until the next update embeds them.')
    for (const step of Object.keys(WARNING_STEPS) as WarningStep[]) {
      const s = warningSentence(runWarning(step, new Error('x'), { week: '2026-11-01T04:00:00Z' }))
      expect(s, step).not.toContain('·')
      expect(s, step).toMatch(/^(Stale data|Housekeeping): /)
    }
  })
})
