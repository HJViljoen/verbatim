import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { IN_PROGRESS_STATUSES } from '../ops/health'
import { runCloseStatus } from './run-errors'
import { DISPATCH_WAIT_CAP_MS } from './schedule-due'
import {
  DISPATCH_MAX_CHECKS, DISPATCH_POLL_MS, dispatchOrder, normaliseDue, waitVerdict, type DueClient,
} from './sequential-dispatch'

// Sequential dispatch (12 Oct 2026): the dispatcher runs due clients one at a
// time, oldest first, and waits for each run to settle before the next. The
// I/O is the scheduler's; these are its decisions.

const OSSUR = '0b0e0000-0000-4000-8000-000000000001'
const SEALAND = '5ea1a000-0000-4000-8000-000000000002'
const due = (clientId: string, approvedAt: string | null): DueClient => ({ clientId, scheduledFor: '2026-10-18T04:00:00.000Z', approvedAt })

describe('normaliseDue: every shape find-due-clients has memoised', () => {
  it('reads a bare id (before 15 Sep), the shape without approvedAt (before 12 Oct) and the current one', () => {
    expect(normaliseDue([
      SEALAND,
      { clientId: OSSUR, scheduledFor: '2026-10-11T04:00:00.000Z' },
      { clientId: 'c3', scheduledFor: null, approvedAt: '2026-05-01T00:00:00Z' },
    ])).toEqual([
      { clientId: SEALAND, scheduledFor: null, approvedAt: null },
      { clientId: OSSUR, scheduledFor: '2026-10-11T04:00:00.000Z', approvedAt: null },
      { clientId: 'c3', scheduledFor: null, approvedAt: '2026-05-01T00:00:00Z' },
    ])
  })
})

describe('dispatchOrder: oldest client first', () => {
  it('puts Össur (approved 24 Mar) before Sealand (23 Apr), whichever order the rows came in', () => {
    const ossur = due(OSSUR, '2026-03-24T09:12:00Z')
    const sealand = due(SEALAND, '2026-04-23T14:30:00Z')
    expect(dispatchOrder([sealand, ossur]).map((d) => d.clientId)).toEqual([OSSUR, SEALAND])
    expect(dispatchOrder([ossur, sealand]).map((d) => d.clientId)).toEqual([OSSUR, SEALAND])
  })

  it('puts a client with no approved_at, or one that does not parse, last, and breaks every tie by id', () => {
    const order = dispatchOrder([
      due('z-none', null),
      due('b-same', '2026-04-01T00:00:00Z'),
      due('a-bad', 'not a date'),
      due('a-same', '2026-04-01T00:00:00Z'),
      due('m-old', '2026-01-01T00:00:00Z'),
    ]).map((d) => d.clientId)
    expect(order).toEqual(['m-old', 'a-same', 'b-same', 'a-bad', 'z-none'])
  })

  it('orders a memoised result from before approvedAt existed by id alone, the same on every replay', () => {
    const replay = normaliseDue([SEALAND, OSSUR])
    expect(dispatchOrder(replay).map((d) => d.clientId)).toEqual([OSSUR, SEALAND])
    expect(dispatchOrder(normaliseDue([OSSUR, SEALAND]))).toEqual(dispatchOrder(replay))
  })

  it('leaves its input alone', () => {
    const input = [due(SEALAND, '2026-04-23T00:00:00Z'), due(OSSUR, '2026-03-24T00:00:00Z')]
    dispatchOrder(input)
    expect(input.map((d) => d.clientId)).toEqual([SEALAND, OSSUR])
  })
})

describe('the wait: ten-minute looks, capped at five hours', () => {
  it('looks every ten minutes and gives up at the thirtieth look, five hours after the dispatch', () => {
    expect(DISPATCH_POLL_MS).toBe(10 * 60_000)
    expect(DISPATCH_WAIT_CAP_MS).toBe(5 * 3600_000)
    expect(DISPATCH_MAX_CHECKS).toBe(30)
    // Look k lands (k + 1) polls after the dispatch.
    expect(DISPATCH_MAX_CHECKS * DISPATCH_POLL_MS).toBe(DISPATCH_WAIT_CAP_MS)
  })

  it('waits while the run is running, and says capped on the last look rather than waiting again', () => {
    for (let k = 0; k < DISPATCH_MAX_CHECKS - 1; k++) {
      expect(waitVerdict({ status: 'running' }, k), `look ${k}`).toEqual({ state: 'waiting', status: 'running' })
    }
    expect(waitVerdict({ status: 'running' }, DISPATCH_MAX_CHECKS - 1)).toEqual({ state: 'capped', status: 'running' })
  })

  it('reads "still going" from the one list the ops check uses, which holds the status open-run writes', () => {
    expect(IN_PROGRESS_STATUSES.has('running')).toBe(true)
    for (const status of IN_PROGRESS_STATUSES) {
      expect(waitVerdict({ status }, 0).state, status).toBe('waiting')
    }
  })

  it('is settled by every status a run closes with: completed and partial (close-run), failed (onFailure)', () => {
    for (const status of [runCloseStatus(0), runCloseStatus(3), 'failed']) {
      expect(waitVerdict({ status }, 0), status).toEqual({ state: 'settled', status })
    }
    expect(waitVerdict({ status: 'completed' }, DISPATCH_MAX_CHECKS - 1)).toEqual({ state: 'settled', status: 'completed' })
  })

  it('moves on when there is no row: open-run skipped the run or it never opened', () => {
    expect(waitVerdict({ status: null }, 0)).toEqual({ state: 'absent' })
    expect(waitVerdict({ status: null }, 7)).toEqual({ state: 'absent' })
  })

  it('never reads a failed read as "no row": it waits, and the cap bounds it', () => {
    expect(waitVerdict({ status: null, error: 'fetch failed' }, 0)).toEqual({ state: 'waiting', status: null })
    expect(waitVerdict({ status: null, error: 'fetch failed' }, DISPATCH_MAX_CHECKS - 1))
      .toEqual({ state: 'capped', status: null, error: 'fetch failed' })
  })
})

describe('the scheduler, by its source (Inngest step ids are a stability contract)', () => {
  const src = readFileSync(new URL('../../inngest/functions/scheduler.ts', import.meta.url), 'utf8')
  // The first argument of every step call, in source order.
  const ids = [...src.matchAll(/step\.(?:run|sendEvent|sleep)\(\s*(['`])(.*?)\1/g)].map((m) => m[2])

  it('keeps heartbeat and find-due-clients, then dispatches, sleeps and checks per client', () => {
    expect(ids).toEqual([
      'heartbeat',
      'find-due-clients',
      'dispatch:${clientId}',
      'wait:${clientId}:${k}',
      'check:${clientId}:${k}',
    ])
    expect(src).not.toContain('dispatch-due-runs')
  })

  it('sends the event it always sent, and derives the run id the way the pipeline does', () => {
    expect(src).toContain("name: 'pipeline/run.requested'")
    expect(src).toContain('data: { clientId, options: { sendReport: true, scheduledFor } }')
    expect(src).toMatch(/runIdForEvent\(eventId\)/)
    const pipeline = readFileSync(new URL('../../inngest/functions/pipeline.ts', import.meta.url), 'utf8')
    expect(pipeline).toMatch(/const newRunId = eventId \? runIdForEvent\(eventId\) : randomUUID\(\)/)
    expect(pipeline).toMatch(/const eventId = \(event as \{ id\?: string \}\)\.id/)
  })

  it('reads one pipeline_runs row by primary key, id and status only', () => {
    expect(src).toContain(".from('pipeline_runs').select('id, status').eq('id', runId).maybeSingle()")
  })
})
