import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ERROR_TEXT_MAX, errorText, FAILURE_HANDLER_ATTEMPTS, handleRunFailure, runFailedAlert, type RunFailureIO } from './run-failure'
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

describe('an error that is a whole HTML page goes in as one short line', () => {
  // postgrest-js puts a body that is not JSON whole into error.message: a
  // Cloudflare 520 is its error page (abridged; the real one is ~7 kB).
  const PAGE = `<!DOCTYPE html>
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
<!--[if gt IE 8]><!--> <html class="no-js" lang="en-US"> <!--<![endif]-->
<head>
<title>xyzcompany.supabase.co | 520: Web server is returning an unknown error</title>
<meta charset="UTF-8" />
<link rel="stylesheet" id="cf_styles-css" href="/cdn-cgi/styles/cf.errors.css" />
<style>body{margin:0;padding:0}</style>
<script>if (!navigator.cookieEnabled) { window.addEventListener('DOMContentLoaded', function () { document.getElementById('cookie-alert').style.display = 'block' }) }</script>
</head>
<body>
  <div id="cf-wrapper">
    <div id="cf-error-details" class="p-0">
      <h1 class="inline-block md:block mr-2 md:mb-2 font-light text-60 md:text-3xl text-black-dark leading-tight">
        <span data-translate="error">Error</span>
        <span>520</span>
      </h1>
      <h2 class="text-gray-600 leading-1.3 text-3xl font-light">Web server is returning an unknown error</h2>
      ${'<div class="cf-section cf-wrapper"><p>There is an unknown connection issue between Cloudflare and the origin web server. As a result, the web page can not be displayed.</p></div>\n'.repeat(12)}
    </div>
  </div>
</body>
</html>`

  it('drops the tags, comments, scripts and styles, collapses the whitespace, and stops at the cap', () => {
    const t = errorText(PAGE)
    expect(t.startsWith('xyzcompany.supabase.co | 520: Web server is returning an unknown error Error 520 Web server is returning an unknown error There is an unknown connection issue')).toBe(true)
    expect(t).not.toMatch(/[<>]|\s{2}|navigator|margin:0|endif/)
    expect(t.length).toBeLessThanOrEqual(ERROR_TEXT_MAX)
    expect(t.endsWith('…')).toBe(true)
  })

  it('leaves a short error as it was, and a "<" that opens no tag', () => {
    expect(errorText(E520.message)).toBe(E520.message)
    expect(errorText('operator does not exist: integer < text')).toBe('operator does not exist: integer < text')
  })

  it('in the thrown error, and in the alert on the last attempt, for the update and the name read alike', async () => {
    const first = io({ mark: [{ message: PAGE }] })
    const thrown = await handleRunFailure(first.fake, args(0, 2)).catch((e: Error) => e)
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain('(xyzcompany.supabase.co | 520: Web server is returning an unknown error Error 520')
    expect((thrown as Error).message).not.toContain('<')
    expect((thrown as Error).message.length).toBeLessThan(ERROR_TEXT_MAX + 120)

    const last = io({ mark: [{ message: PAGE }], name: null, nameError: { message: PAGE } })
    await expect(handleRunFailure(last.fake, args(1, 2))).resolves.toEqual({ marked: false })
    const { subject, body } = last.calls.alerts[0]
    expect(subject).toBe(`Verbatim run FAILED — ${SEALAND}`)
    expect(body).toContain(`Client: ${SEALAND} (its name could not be read: xyzcompany.supabase.co | 520:`)
    expect(body).toContain("THE RUN ROW STILL READS 'running': marking it failed failed on every attempt (xyzcompany.supabase.co | 520:")
    expect(body).not.toMatch(/<\/?(html|head|body|title|meta|link|style|script|div|span|h1|h2|p)\b|<!|cf-wrapper|navigator/)
    expect(body.length).toBeLessThan(2 * ERROR_TEXT_MAX + 800)
  })

  it('a page with no text in it is still a failed update', async () => {
    const { fake, calls } = io({ mark: [{ message: '<html><body></body></html>' }] })
    await expect(handleRunFailure(fake, args(1, 2))).resolves.toEqual({ marked: false })
    expect(calls.alerts[0].body).toContain('failed on every attempt ((no text))')
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
