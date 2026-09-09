import { describe, it, expect } from 'vitest'
import {
  isTerminalStatus,
  terminalStatusError,
  shapeRunMeta,
  waitForFinishSecs,
  isActorRunFailedError,
} from './apify'

describe('isTerminalStatus', () => {
  it('accepts only the four statuses that never change again', () => {
    for (const s of ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']) expect(isTerminalStatus(s)).toBe(true)
  })

  it('keeps polling through the transitional statuses', () => {
    // SUCCEEDING/FAILING/ABORTING/TIMING-OUT are mid-flight: the dataset is not
    // final yet, and usageTotalUsd certainly isn't.
    for (const s of ['READY', 'RUNNING', 'SUCCEEDING', 'FAILING', 'ABORTING', 'TIMING-OUT']) {
      expect(isTerminalStatus(s)).toBe(false)
    }
    expect(isTerminalStatus(undefined)).toBe(false)
    expect(isTerminalStatus(null)).toBe(false)
  })
})

describe('terminalStatusError — the run-sync error shapes, preserved', () => {
  // The message shape is a contract: isActorRunFailedError reads it to decide
  // whether a failure is a verdict about the input or about us.
  it('a crashed actor stays a per-input verdict', () => {
    const e = terminalStatusError({ status: 'FAILED', statusMessage: 'actor exited with code 1' })!
    expect(e.message).toMatch(/^Apify 400\b/)
    expect(isActorRunFailedError(e)).toBe(true)
  })

  it('an aborted run stays a per-input verdict', () => {
    expect(isActorRunFailedError(terminalStatusError({ status: 'ABORTED' })!)).toBe(true)
  })

  it('a timed-out run is NOT a verdict — it must propagate and retry', () => {
    const e = terminalStatusError({ status: 'TIMED-OUT', statusMessage: 'over the limit' })!
    expect(e.message).toMatch(/^Apify 408\b/)
    expect(isActorRunFailedError(e)).toBe(false)
  })

  it('a success is not an error', () => {
    expect(terminalStatusError({ status: 'SUCCEEDED' })).toBeNull()
    expect(terminalStatusError({})).toBeNull()
  })

  it('quotes the status message so a quote or newline cannot break the shape', () => {
    const e = terminalStatusError({ status: 'FAILED', statusMessage: 'said "no"\nand died' })!
    expect(() => JSON.parse(e.message.replace(/^Apify 400: /, ''))).not.toThrow()
    expect(isActorRunFailedError(e)).toBe(true)
  })
})

describe('shapeRunMeta', () => {
  const run = {
    id: 'RUN123',
    actId: 'shu8hvrXbJbY3Eb9W',
    status: 'SUCCEEDED',
    usageTotalUsd: 0.0552,
    startedAt: '2026-09-09T10:00:00.000Z',
    finishedAt: '2026-09-09T10:01:00.000Z',
  }

  it('carries the run identity and its cost', () => {
    expect(shapeRunMeta(run, 'slug~form')).toEqual({
      apifyRunId: 'RUN123',
      actorId: 'shu8hvrXbJbY3Eb9W',
      status: 'SUCCEEDED',
      usageUsd: 0.0552,
      startedAt: '2026-09-09T10:00:00.000Z',
      finishedAt: '2026-09-09T10:01:00.000Z',
    })
  })

  it("falls back to the caller's actor id when Apify sends none", () => {
    expect(shapeRunMeta({ id: 'R', status: 'SUCCEEDED' }, 'clockworks~tiktok-scraper').actorId)
      .toBe('clockworks~tiktok-scraper')
  })

  it('distinguishes "no usage figure" from zero', () => {
    // null means "Apify did not tell us", which the settle pass must re-read;
    // 0 would be a claim that the run was free.
    expect(shapeRunMeta({ id: 'R', status: 'SUCCEEDED' }, 'a').usageUsd).toBeNull()
    expect(shapeRunMeta({ id: 'R', usageTotalUsd: null }, 'a').usageUsd).toBeNull()
    expect(shapeRunMeta({ id: 'R', usageTotalUsd: 0 }, 'a').usageUsd).toBe(0)
  })
})

describe('waitForFinishSecs — the long-poll deadline', () => {
  it('caps at the API maximum however much time is left', () => {
    expect(waitForFinishSecs(300_000)).toBe(60)
  })

  it('asks for exactly what is left when that is under the cap', () => {
    expect(waitForFinishSecs(12_400)).toBe(12)
  })

  it('never asks for 0 while time remains — that would busy-loop', () => {
    expect(waitForFinishSecs(500)).toBe(1)
  })

  it('is 0 once the deadline has passed', () => {
    expect(waitForFinishSecs(0)).toBe(0)
    expect(waitForFinishSecs(-5000)).toBe(0)
    expect(waitForFinishSecs(NaN)).toBe(0)
  })
})
