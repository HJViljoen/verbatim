import { RUN_STALE_AFTER_HOURS } from './run-guard'

// WHAT HAPPENS WHEN THE RUN FUNCTION GIVES UP (`run-pipeline`'s onFailure).
//
// The client's 'running' row is marked 'failed' and the operator is alerted.
// Until 17 Nov the update's error was never read: on 15 Nov Sealand's run
// d8a15862 died when the production database crashed, the update came back
// 520, the row stayed 'running' and the alert said "Client: ?".
//
// NOW: an update that fails THROWS on any attempt but the handler's last, so
// Inngest runs the handler again (the SDK registers a failure handler with one
// retry, so this is bounded at two attempts), before any alert is sent, so a
// retried handler emails once. On the last attempt it never throws: the alert
// goes out and says the row still reads 'running' (open-run closes it as
// abandoned after RUN_STALE_AFTER_HOURS; scripts/close-stranded-run.ts closes
// it now). The week read's contract (lib/written/step.ts): transient before
// the last attempt throws, the last attempt alerts and returns.
//
// The client's name is read for the alert only, and a read that fails or finds
// nothing names the client by the id the event carries, never "?".

/** The failure handler's reads and writes, injected (the pipeline passes the
 *  admin client's; the tests pass their own). */
export interface RunFailureIO {
  /** Marks the client's 'running' row 'failed'; returns the update's error. */
  markFailed: () => PromiseLike<{ error: { message: string } | null }>
  /** The client's company name, for the alert. */
  companyName: () => PromiseLike<{ name: string | null; error: { message: string } | null }>
  alert: (subject: string, body: string) => PromiseLike<unknown>
}

export interface RunFailureArgs {
  clientId: string
  /** The error the function gave up on. */
  message: string
  /** The original event's options asked for the report (a scheduled run). */
  scheduled: boolean
  /** The handler's own attempt, zero-indexed, and how many it has. */
  attempt: number
  maxAttempts?: number
}

/** A failure handler has one retry (the SDK's own registration), so two
 *  attempts unless Inngest says otherwise. */
export const FAILURE_HANDLER_ATTEMPTS = 2

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e))

/** Mark the run failed, then alert; throws only for a failed update before the
 *  last attempt (see the header). */
export async function handleRunFailure(io: RunFailureIO, a: RunFailureArgs): Promise<{ marked: boolean }> {
  const lastAttempt = a.attempt >= (a.maxAttempts ?? FAILURE_HANDLER_ATTEMPTS) - 1
  let markError: string | null
  try {
    markError = (await io.markFailed()).error?.message ?? null
  } catch (e) {
    markError = messageOf(e)
  }
  if (markError && !lastAttempt) throw new Error(`run-pipeline onFailure: the run row could not be marked failed (${markError}); retrying`)

  let name: string | null = null
  let nameError: string | null = null
  try {
    const read = await io.companyName()
    name = read.name?.trim() || null
    nameError = read.error?.message ?? null
  } catch (e) {
    nameError = messageOf(e)
  }
  const { subject, body } = runFailedAlert({ ...a, name, nameError, markError })
  await io.alert(subject, body)
  return { marked: !markError }
}

/** The FAILED alert. PURE. */
export function runFailedAlert(a: Pick<RunFailureArgs, 'clientId' | 'message' | 'scheduled'> & { name: string | null; nameError: string | null; markError: string | null }): { subject: string; body: string } {
  const client = a.name
    ? `${a.name} (${a.clientId})`
    : `${a.clientId} (its name could not be read${a.nameError ? `: ${a.nameError}` : ''})`
  const row = a.markError
    ? `\n\nTHE RUN ROW STILL READS 'running': marking it failed failed on every attempt (${a.markError}). The client's next run closes it as abandoned once it is ${RUN_STALE_AFTER_HOURS} hours old and is blocked until then; scripts/close-stranded-run.ts --run <id> --apply closes it now.`
    : ''
  return {
    subject: `Verbatim run FAILED — ${a.name ?? a.clientId}`,
    body: `Pipeline run failed after retries.\n\nClient: ${client}\nError: ${a.message}${row}\n\nResume lever: POST /api/admin/trigger-run with options {runId, skipGather:true}.` +
      // A resume without sendReport is a MANUAL run (5 Oct): its weekly
      // read goes in the past issues and nobody, the reviewer included,
      // is emailed. A scheduled run's resume must say it is one.
      (a.scheduled
        ? ` This was a SCHEDULED run: add "sendReport": true to those options, so its report runs as scheduled and the review email still goes out.`
        : ''),
  }
}
