import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { FAILURE_HANDLER_ATTEMPTS, handleRunFailure, runFailedAlert, type RunFailureIO } from './run-failure'
import { RUN_STALE_AFTER_HOURS } from './run-guard'

// run-pipeline's onFailure (15 Nov: Sealand's d8a15862 died with the database,
// the handler's update got a 520 it never read, the row stayed 'running' and
// the alert said "Client: ?").

const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'
const E520 = { message: 'Web server is returning an unknown error (520)' }

function io(o: { mark?: Array<{ message: string } | null | 'throw'>; name?: string | null; nameError?: { message: string } | null; nameThrows?: boolean } = {}) {
  const calls = { mark: 0, name: 0, alerts: [] as { subject: string; body: string }[] }
  const marks = o.mark ?? [null]
  const fake: RunFailureIO = {
    markFailed: async () => {
      const r = marks[Math.min(calls.mark++, marks.length - 1)]
      if (r === 'throw') throw new TypeError('fetch failed')
      return { error: r }
    },
    companyName: async () => {
      calls.name++
      if (o.nameThrows) throw new Error('socket hang up')
      return { name: o.name === undefined ? 'Sealand' : o.name, error: o.nameError ?? null }
    },
    alert: async (subject, body) => { calls.alerts.push({ subject, body }) },
  }
  return { fake, calls }
}

const args = (attempt: number, maxAttempts?: number) => ({ clientId: SEALAND, message: 'step gather failed', scheduled: false, attempt, maxAttempts })

describe('handleRunFailure: the row first, then one alert', () => {
  it('marks the row failed and alerts once, naming the client', async () => {
    const { fake, calls } = io()
    await expect(handleRunFailure(fake, args(0, 2))).resolves.toEqual({ marked: true })
    expect(calls.mark).toBe(1)
    expect(calls.alerts).toHaveLength(1)
    expect(calls.alerts[0].subject).toBe('Verbatim run FAILED — Sealand')
    expect(calls.alerts[0].body).toContain(`Client: Sealand (${SEALAND})\nError: step gather failed`)
    expect(calls.alerts[0].body).not.toContain('still reads')
  })

  it('an update that fails before the last attempt THROWS, so Inngest runs the handler again, and alerts nobody yet', async () => {
    const { fake, calls } = io({ mark: [E520] })
    await expect(handleRunFailure(fake, args(0, 2))).rejects.toThrow(/could not be marked failed \(Web server is returning an unknown error \(520\)\)/)
    expect(calls.alerts).toHaveLength(0)
    expect(calls.name).toBe(0)
  })

  it('a thrown update (a dropped connection) is the same failure', async () => {
    const { fake, calls } = io({ mark: ['throw'] })
    await expect(handleRunFailure(fake, args(0, 2))).rejects.toThrow(/fetch failed/)
    expect(calls.alerts).toHaveLength(0)
  })

  it('on the last attempt it never throws: it alerts that the row still reads running, and how it is closed', async () => {
    const { fake, calls } = io({ mark: [E520] })
    await expect(handleRunFailure(fake, args(1, 2))).resolves.toEqual({ marked: false })
    expect(calls.alerts).toHaveLength(1)
    const body = calls.alerts[0].body
    expect(body).toContain("THE RUN ROW STILL READS 'running'")
    expect(body).toContain('(Web server is returning an unknown error (520))')
    expect(body).toContain(`once it is ${RUN_STALE_AFTER_HOURS} hours old`)
    expect(body).toContain('scripts/close-stranded-run.ts --run <id> --apply')
  })

  it('a retried handler, its first update refused and its second through, sends one alert in all', async () => {
    const { fake, calls } = io({ mark: [E520, null] })
    await expect(handleRunFailure(fake, args(0, 2))).rejects.toThrow()
    await expect(handleRunFailure(fake, args(1, 2))).resolves.toEqual({ marked: true })
    expect(calls.mark).toBe(2)
    expect(calls.alerts).toHaveLength(1)
    expect(calls.alerts[0].body).not.toContain('still reads')
  })

  it('bounded: two attempts when Inngest does not say (the SDK registers a failure handler with one retry), else its own count', async () => {
    expect(FAILURE_HANDLER_ATTEMPTS).toBe(2)
    await expect(handleRunFailure(io({ mark: [E520] }).fake, args(0))).rejects.toThrow()
    await expect(handleRunFailure(io({ mark: [E520] }).fake, args(1))).resolves.toEqual({ marked: false })
    await expect(handleRunFailure(io({ mark: [E520] }).fake, args(1, 4))).rejects.toThrow()
    await expect(handleRunFailure(io({ mark: [E520] }).fake, args(3, 4))).resolves.toEqual({ marked: false })
  })
})

describe('the alert names the client by its id where its name cannot be read, never "?"', () => {
  it('a read that fails', async () => {
    const { fake, calls } = io({ name: null, nameError: E520 })
    await handleRunFailure(fake, args(0, 2))
    expect(calls.alerts[0].subject).toBe(`Verbatim run FAILED — ${SEALAND}`)
    expect(calls.alerts[0].body).toContain(`Client: ${SEALAND} (its name could not be read: Web server is returning an unknown error (520))`)
    expect(calls.alerts[0].body).not.toContain('?')
  })

  it('a read that throws, and a read that finds no name', async () => {
    const threw = io({ nameThrows: true })
    await handleRunFailure(threw.fake, args(0, 2))
    expect(threw.calls.alerts[0].body).toContain(`Client: ${SEALAND} (its name could not be read: socket hang up)`)
    const none = io({ name: '  ' })
    await handleRunFailure(none.fake, args(0, 2))
    expect(none.calls.alerts[0].body).toContain(`Client: ${SEALAND} (its name could not be read)\n`)
    expect(none.calls.alerts[0].subject).toBe(`Verbatim run FAILED — ${SEALAND}`)
  })

  it('a scheduled run still says how to resume it as one', () => {
    const a = runFailedAlert({ clientId: SEALAND, message: 'x', scheduled: true, name: 'Sealand', nameError: null, markError: null })
    expect(a.body).toContain('This was a SCHEDULED run: add "sendReport": true')
    expect(runFailedAlert({ clientId: SEALAND, message: 'x', scheduled: false, name: 'Sealand', nameError: null, markError: null }).body).not.toContain('SCHEDULED')
  })
})

describe('the pipeline wires it', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'inngest', 'functions', 'pipeline.ts'), 'utf8')
  it('onFailure hands the handler its attempt and its count, and marks only the client\'s running row', () => {
    const body = src.slice(src.indexOf('onFailure: async'), src.indexOf('async ({ event, step: inngestStep'))
    expect(body).toContain('onFailure: async ({ event, attempt, maxAttempts })')
    expect(body).toContain('await handleRunFailure({')
    expect(body).toContain(".eq('client_id', clientId).eq('status', 'running')")
    expect(body).toContain('attempt, maxAttempts })')
    expect(body).not.toContain("'?'")
  })
})
