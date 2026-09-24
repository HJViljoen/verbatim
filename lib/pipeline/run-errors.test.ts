import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { summariseRunErrors, partialRunAlert, passADegradation, runCloseStatus, closingErrors, missingRunRows, RUN_ERROR_CAP, ALERT_ERROR_LIST_CAP } from './run-errors'

describe('summariseRunErrors', () => {
  it('returns null for a clean run so error_message stays NULL', () => {
    expect(summariseRunErrors(0, [])).toBeNull()
  })

  it('names the failing step — the thing the 2026-08-16 partial run could not tell us', () => {
    expect(summariseRunErrors(1, ['owned-posts:tiktok: upsert failed'])).toBe(
      '1 step error: owned-posts:tiktok',
    )
  })

  it('groups repeats of the same step with a count', () => {
    expect(
      summariseRunErrors(3, [
        'comments:tiktok:4: timeout',
        'comments:tiktok:4: timeout',
        'owned-posts:tiktok: boom',
      ]),
    ).toBe('3 step errors: comments:tiktok:4 ×2, owned-posts:tiktok')
  })

  it('orders by frequency, then alphabetically for a stable read', () => {
    expect(summariseRunErrors(3, ['b: x', 'a: x', 'a: x'])).toBe('3 step errors: a ×2, b')
  })

  it('stays honest when the cap truncates the recorded list', () => {
    const recorded = Array.from({ length: RUN_ERROR_CAP }, () => 'comments:instagram:1: 429')
    expect(summariseRunErrors(120, recorded)).toBe(
      `120 step errors (first ${RUN_ERROR_CAP} recorded): comments:instagram:1 ×${RUN_ERROR_CAP}`,
    )
  })

  it('still reports a count when nothing was recorded', () => {
    expect(summariseRunErrors(2, [])).toBe('2 step errors')
  })

  it('handles entries with no detail suffix', () => {
    expect(summariseRunErrors(1, ['owned-posts:tiktok'])).toBe('1 step error: owned-posts:tiktok')
  })
})

describe('partialRunAlert', () => {
  const base = {
    runId: '147899d3-0000-0000-0000-000000000000',
    clientName: 'Össur',
    total: 2,
    recorded: ['owned-posts:tiktok: 22P02 invalid input syntax', 'owned-posts:instagram: profile returned 0 posts'],
    reportSent: true,
  }

  it('names the client in the subject so the inbox scan reads it', () => {
    expect(partialRunAlert(base).subject).toBe('Verbatim run PARTIAL — Össur')
  })

  it('carries the run id, the step summary and every recorded error', () => {
    const { text } = partialRunAlert(base)
    expect(text).toContain(base.runId)
    expect(text).toContain('2 step errors: owned-posts:instagram, owned-posts:tiktok')
    expect(text).toContain('- owned-posts:tiktok: 22P02 invalid input syntax')
    expect(text).toContain('- owned-posts:instagram: profile returned 0 posts')
  })

  it('says whether the client report still went out', () => {
    expect(partialRunAlert(base).text).toContain('The client report was still sent')
    expect(partialRunAlert({ ...base, reportSent: false }).text).toContain('No client report was requested')
  })

  it('caps the listed errors and points at pipeline_runs.errors for the rest', () => {
    const recorded = Array.from({ length: 40 }, (_, i) => `comments:instagram:${i + 1}: 429`)
    const { text } = partialRunAlert({ ...base, total: 40, recorded })
    expect(text).toContain(`- comments:instagram:${ALERT_ERROR_LIST_CAP}: 429`)
    expect(text).not.toContain(`- comments:instagram:${ALERT_ERROR_LIST_CAP + 1}: 429`)
    expect(text).toContain(`…and ${40 - ALERT_ERROR_LIST_CAP} more in pipeline_runs.errors`)
  })
})

describe('passADegradation — Pass A errors are errors (T0-4)', () => {
  it('clean pass → null', () => {
    expect(passADegradation({ attempted: 100, errored: 0, rateLimited: false }, 0.05)).toBeNull()
  })
  it('a stray failure under the ratio does not demote the run (the video is re-read next run)', () => {
    expect(passADegradation({ attempted: 100, errored: 3, rateLimited: false }, 0.05)).toBeNull()
  })
  it('over the ratio → degraded, with the share and first message', () => {
    const r = passADegradation({ attempted: 40, errored: 4, rateLimited: false, firstError: 'boom' }, 0.05)
    expect(r).toBe('4 of 40 video calls failed (10%) — first: boom')
  })
  it('any 429 → degraded even at 1 of 400 (the 2026-08-09 shape: credits ran dry, run closed completed)', () => {
    const r = passADegradation({ attempted: 400, errored: 1, rateLimited: true, firstError: '429 You have no credits remaining' }, 0.05)
    expect(r).toContain('incl. a 429')
    expect(r).toContain('1 of 400')
  })
  it('errors with zero attempts recorded still count as fully failed', () => {
    expect(passADegradation({ attempted: 0, errored: 2, rateLimited: false }, 0.05)).toContain('100%')
  })
})

describe('runCloseStatus — a recorded error means partial (run d346b0f7, 2026-09-13)', () => {
  it('a clean run closes completed', () => {
    expect(runCloseStatus(0)).toBe('completed')
  })

  it('ONE recorded step error is enough to close partial', () => {
    // The whole point of the 2026-09-13 fixes: the gate-verdict write, the
    // run-failed caption batches and the themes timeout now each reach
    // noteError, and one of them is enough to stop the run claiming 'completed'.
    expect(runCloseStatus(1)).toBe('partial')
  })

  it('stays partial however many errors pile up, cap or no cap', () => {
    for (const n of [2, RUN_ERROR_CAP, RUN_ERROR_CAP + 1, 269]) expect(runCloseStatus(n)).toBe('partial')
  })

  it('pairs with a non-null error_message, so status and reason never disagree', () => {
    // run d346b0f7 wrote status 'completed', errors [] and error_message null
    // while six writes failed. The two helpers must flip together.
    const recorded = ['gate:tiktok: gate verdicts not recorded: invalid input syntax for type json']
    expect(runCloseStatus(recorded.length)).toBe('partial')
    expect(summariseRunErrors(recorded.length, recorded)).toContain('gate:tiktok')
    expect(runCloseStatus(0)).toBe('completed')
    expect(summariseRunErrors(0, [])).toBeNull()
  })
})

describe('closingErrors — a partial run carries the real list (run b67b56de)', () => {
  const recorded = ['owned-posts:instagram:rareform: instagram census read returned 0 posts']
  const findings = ['transcribe:youtube: 9 of 72 caption batches run-failed and were recovered id-by-id, under the 25% ratio']

  it('a clean run stays silent — a finding is not an error', () => {
    expect(closingErrors(0, [], findings)).toEqual([])
  })

  it('a run already partial carries the findings beside the errors', () => {
    expect(closingErrors(1, recorded, findings)).toEqual([...recorded, ...findings])
  })

  it('nothing to add leaves the recorded list identical', () => {
    expect(closingErrors(1, recorded, [])).toBe(recorded)
  })

  it('stays under the stored cap', () => {
    const many = Array.from({ length: RUN_ERROR_CAP }, (_, i) => `e${i}`)
    expect(closingErrors(RUN_ERROR_CAP, many, findings)).toHaveLength(RUN_ERROR_CAP)
  })
})

describe('missingRunRows — what a run left behind', () => {
  const full = { observations: 12, recommendations: 5, costs: 1 }

  it('a complete run is missing nothing', () => {
    expect(missingRunRows(full, { themeRegistry: true })).toEqual([])
  })

  it('names the three empty records', () => {
    const r = missingRunRows({ observations: 0, recommendations: 0, costs: 0 }, { themeRegistry: true })
    expect(r).toHaveLength(3)
    expect(r[0]).toContain('no theme observations')
    expect(r[1]).toBe('no recommendations')
    expect(r[2]).toContain('no run_costs row')
  })

  it('does not blame a run for observations the registry flag never asked for', () => {
    expect(missingRunRows({ ...full, observations: 0 }, { themeRegistry: false })).toEqual([])
    expect(missingRunRows({ ...full, observations: 0 }, {})).toEqual([])
  })

  it('all-dangling recommendations are as bad as none', () => {
    const r = missingRunRows({ ...full, ungroundedRecommendations: 5 }, { themeRegistry: true })
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('cite no insight this run has')
  })

  it('one dangling recommendation is an ordinary bad day, not an incomplete run', () => {
    expect(missingRunRows({ ...full, ungroundedRecommendations: 1 }, { themeRegistry: true })).toEqual([])
  })
})

describe('partialRunAlert carries the row counts (2026-09-20)', () => {
  const base = {
    runId: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4',
    clientName: 'Sealand',
    total: 1,
    recorded: ['owned-posts:instagram:rareform: instagram census read returned 0 posts'],
    reportSent: true,
  }

  it('states the empty records, which is what a quietly thin partial run looks like', () => {
    const { text } = partialRunAlert({
      ...base,
      rows: { observations: 0, recommendations: 0, costs: 0 },
      themeRegistry: true,
    })
    expect(text).toContain('What the run left behind:')
    expect(text).toContain('- no recommendations')
    expect(text).toContain('- no run_costs row')
    expect(text).toContain('- no theme observations')
  })

  it('says so unconditionally — a complete record is stated, not implied by silence', () => {
    const { text } = partialRunAlert({
      ...base,
      rows: { observations: 1384, recommendations: 6, costs: 1 },
      themeRegistry: true,
    })
    expect(text).toContain('- nothing missing (1384 theme observations, 6 recommendations, 1 run_costs row)')
  })

  it('tells "we did not look" apart from "there is nothing there"', () => {
    expect(partialRunAlert({ ...base, rows: null }).text).toContain('(not counted')
    expect(partialRunAlert(base).text).toContain('(not counted')
  })

  it('lists sub-threshold findings under their own heading, out of the step count', () => {
    const { text } = partialRunAlert({
      ...base,
      findings: ['transcribe:youtube: 9 of 72 caption batches run-failed and were recovered id-by-id, under the 25% ratio'],
      rows: { observations: 1384, recommendations: 6, costs: 1 },
    })
    expect(text).toContain('Also seen, under their ratio and not counted:')
    expect(text).toContain('- transcribe:youtube: 9 of 72 caption batches run-failed')
    // The count still counts STEPS THAT FAILED.
    expect(text).toContain('1 step error: owned-posts:instagram:rareform')
  })
})

// ---- B1: the counts the alert prints have to be readable at all -------------
//
// `runRowCounts` (inngest/functions/pipeline.ts) fed `missingRunRows` above,
// and it counted with `.select('id', { count: 'exact', head: true })`.
// `run_costs` is keyed by `run_id` and has NO `id` column, so PostgREST
// answered 42703, `head()` returned null, runRowCounts returned null for every
// run, and the alert printed "(not counted — reading them failed)" on EVERY
// partial run — the one arm of `rowLines` that says nothing. The three tests
// above all pass with that bug in place, because they hand the counts in.
//
// Pinned by reading the source, the way `lib/subjects/moves.test.ts` pins the
// two halves of the subject-audit dedupe: the function is not exported and
// importing the pipeline module would drag Inngest in behind it.
describe('runRowCounts counts a column all three tables have (B1)', () => {
  const pipeline = readFileSync(new URL('../../inngest/functions/pipeline.ts', import.meta.url), 'utf8')
  const body = pipeline.slice(pipeline.indexOf('async function runRowCounts('))

  it('counts on run_id, never on id', () => {
    expect(body).toContain(".select('run_id', { count: 'exact', head: true }).eq('run_id', runId)")
    expect(body.slice(0, body.indexOf('\n}\n'))).not.toContain(".select('id'")
  })

  it('still counts the three tables the alert names', () => {
    for (const t of ['theme_observations', 'recommendations', 'run_costs']) {
      expect(body).toContain(`head('${t}')`)
    }
  })
})
