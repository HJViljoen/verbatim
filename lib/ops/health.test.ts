import { describe, it, expect } from 'vitest'
import { assessPipelineHealth, formatOpsEmail, type Finding, type HealthInputs } from './health'

// Wednesday 2026-09-16, 12:00 SAST.
const NOW = new Date('2026-09-16T10:00:00Z')
const agoMin = (m: number, from: Date = NOW) => new Date(from.getTime() - m * 60_000).toISOString()
const agoH = (h: number, from: Date = NOW) => agoMin(h * 60, from)
const agoDays = (d: number, from: Date = NOW) => agoH(d * 24, from)

const comped = { is_active: true, is_comped: true, approved_at: '2026-01-01T00:00:00Z' }

function inputs(over: Partial<HealthInputs> = {}): HealthInputs {
  // Heartbeats default to fresh relative to whatever `now` the case uses, so a
  // case about run cadence never trips the liveness checks by accident. A beat
  // three minutes old is always after the most recent 06:00 SAST slot, whatever
  // `now` is, so the dispatcher rule stays quiet too.
  const now = over.now ?? NOW
  return {
    now,
    heartbeats: [
      { name: 'inngest', lastSeenAt: agoMin(3, now) },
      { name: 'dispatcher', lastSeenAt: agoMin(3, now) },
    ],
    clients: [],
    runs: [],
    reportSends: [],
    ...over,
  }
}

const kinds = (f: Finding[]) => f.map((x) => x.kind)

describe('assessPipelineHealth — Inngest liveness', () => {
  it('says nothing while both heartbeats are fresh', () => {
    expect(assessPipelineHealth(inputs())).toEqual([])
  })

  it('flags the keep-warm heartbeat once it is older than 30 minutes', () => {
    const f = assessPipelineHealth(inputs({
      heartbeats: [{ name: 'inngest', lastSeenAt: agoMin(45) }, { name: 'dispatcher', lastSeenAt: agoMin(3) }],
    }))
    expect(kinds(f)).toEqual(['inngest_silent'])
    expect(f[0].detail).toContain('45')
  })

  it('does not flag the keep-warm heartbeat at 29 minutes', () => {
    const f = assessPipelineHealth(inputs({
      heartbeats: [{ name: 'inngest', lastSeenAt: agoMin(29) }, { name: 'dispatcher', lastSeenAt: agoMin(3) }],
    }))
    expect(f).toEqual([])
  })

  it('flags a heartbeat that has never been written, rather than throwing', () => {
    // The table exists but is empty (first deploy), or the table is not there
    // yet and the loader passed []. Either way this is the dead-man's switch
    // doing its job, not an error.
    const f = assessPipelineHealth(inputs({ heartbeats: [] }))
    expect(kinds(f)).toEqual(['inngest_silent', 'dispatcher_silent'])
    expect(f[0].detail).toBe('no heartbeat recorded yet')
    expect(f[1].detail).toBe('no heartbeat recorded yet')
  })

  // The dispatcher is measured against its 06:00 SAST slot (04:00 UTC), never
  // by age: a plain 26-h threshold is exactly the slot-to-check gap, so the
  // cases below — all within seconds of that gap — are the ones that decide
  // whether a missed morning is reported at all.
  const dispatcherAt = (beat: string, at: string) => assessPipelineHealth(inputs({
    now: new Date(at),
    heartbeats: [{ name: 'inngest', lastSeenAt: agoMin(3, new Date(at)) }, { name: 'dispatcher', lastSeenAt: beat }],
  }))

  it("flags the dispatcher when the newest beat is yesterday's slot", () => {
    // The 26-hour case: checked at 06:00 UTC, the beat landed 5 s after
    // 04:00:00 UTC YESTERDAY — an age of 25h59m55s, which a 26-h threshold
    // waves through and this rule does not.
    const f = dispatcherAt('2026-09-15T04:00:05Z', '2026-09-16T06:00:00Z')
    expect(kinds(f)).toEqual(['dispatcher_silent'])
    expect(f[0].detail).toContain('2026-09-16T04:00:00.000Z')
  })

  it("says nothing when the beat landed at today's slot", () => {
    expect(dispatcherAt('2026-09-16T04:00:05Z', '2026-09-16T06:00:00Z')).toEqual([])
  })

  it('allows a beat a few minutes early without calling it yesterday', () => {
    // Cron jitter can fire the dispatcher just before 06:00:00 SAST.
    expect(dispatcherAt('2026-09-16T03:52:00Z', '2026-09-16T06:00:00Z')).toEqual([])
  })

  it('waits 90 minutes after the slot before expecting the beat', () => {
    // 05:00 UTC — only an hour past the slot; a slow morning is not a finding.
    expect(dispatcherAt('2026-09-15T04:00:05Z', '2026-09-16T05:00:00Z')).toEqual([])
    // 05:31 UTC — past the grace, and yesterday's beat is now the newest.
    expect(kinds(dispatcherAt('2026-09-15T04:00:05Z', '2026-09-16T05:31:00Z'))).toEqual(['dispatcher_silent'])
  })

  it('is judged against yesterday\'s slot before 06:00 SAST', () => {
    // 02:00 UTC on the 16th: the slot that has actually passed is the 15th's.
    expect(dispatcherAt('2026-09-15T04:00:05Z', '2026-09-16T02:00:00Z')).toEqual([])
    expect(kinds(dispatcherAt('2026-09-14T04:00:05Z', '2026-09-16T02:00:00Z'))).toEqual(['dispatcher_silent'])
  })
})

describe('assessPipelineHealth — a due run that never started', () => {
  const sundayClient = {
    id: 'c1', name: 'Össur', billing: comped,
    config: { report_period: 'weekly', report_day: 'sunday' },
  }

  it('flags a weekly client whose slot passed with no run', () => {
    const f = assessPipelineHealth(inputs({ clients: [sundayClient] }))
    expect(kinds(f)).toEqual(['run_not_started'])
    expect(f[0].clientId).toBe('c1')
    expect(f[0].clientName).toBe('Össur')
  })

  it('is satisfied by a run that started at the slot', () => {
    // Last Sunday 06:00 SAST = 2026-09-13T04:00:00Z.
    const f = assessPipelineHealth(inputs({
      clients: [sundayClient],
      runs: [{ id: 'r1', clientId: 'c1', status: 'completed', options: null, startedAt: '2026-09-13T04:01:00Z', completedAt: '2026-09-13T05:00:00Z' }],
    }))
    expect(f).toEqual([])
  })

  it('accepts a run that started up to an hour before the slot', () => {
    const f = assessPipelineHealth(inputs({
      clients: [sundayClient],
      runs: [{ id: 'r1', clientId: 'c1', status: 'completed', options: null, startedAt: '2026-09-13T03:30:00Z', completedAt: '2026-09-13T05:00:00Z' }],
    }))
    expect(f).toEqual([])
  })

  it('gives the run two hours to appear before complaining', () => {
    const wednesdayClient = { ...sundayClient, config: { report_period: 'weekly', report_day: 'wednesday' } }
    // 07:00 SAST, one hour after the slot.
    const early = assessPipelineHealth(inputs({ now: new Date('2026-09-16T05:00:00Z'), clients: [wednesdayClient] }))
    expect(early).toEqual([])
    // 08:30 SAST, two and a half hours after it.
    const late = assessPipelineHealth(inputs({ now: new Date('2026-09-16T06:30:00Z'), clients: [wednesdayClient] }))
    expect(kinds(late)).toEqual(['run_not_started'])
  })

  it('flags a monthly client on the 3rd whose 1st-of-month run never ran', () => {
    const f = assessPipelineHealth(inputs({
      now: new Date('2026-09-03T09:00:00Z'),
      clients: [{ id: 'c2', name: 'Monthly Co', billing: comped, config: { report_period: 'monthly', report_day: null } }],
    }))
    expect(kinds(f)).toEqual(['run_not_started'])
    expect(f[0].detail).toContain('2026-09-01')
  })

  it('stays quiet once the missed slot is older than the window we can see', () => {
    // A monthly client looked at on the 28th: the 1st is outside the 14-day
    // read, so "no run row" is not evidence of anything.
    const f = assessPipelineHealth(inputs({
      now: new Date('2026-09-28T09:00:00Z'),
      clients: [{ id: 'c2', name: 'Monthly Co', billing: comped, config: { report_period: 'monthly', report_day: null } }],
    }))
    expect(f).toEqual([])
  })

  it('expects nothing of a client the billing gate excludes', () => {
    const pending = {
      id: 'c3', name: 'Not approved yet',
      billing: { is_active: true, is_comped: false, approved_at: null },
      config: { report_period: 'weekly', report_day: 'sunday' },
    }
    expect(assessPipelineHealth(inputs({ clients: [pending] }))).toEqual([])
  })

  it('expects nothing of a paused client', () => {
    const paused = { ...sundayClient, config: { report_period: 'paused', report_day: 'sunday' } }
    expect(assessPipelineHealth(inputs({ clients: [paused] }))).toEqual([])
  })
})

describe('assessPipelineHealth — stuck runs', () => {
  it('flags a run still running after six hours', () => {
    const f = assessPipelineHealth(inputs({
      runs: [{ id: 'r1', clientId: 'c1', status: 'running', options: null, startedAt: agoH(7), completedAt: null }],
    }))
    expect(kinds(f)).toEqual(['run_stuck'])
    expect(f[0].detail).toContain('r1')
  })

  it('leaves a long-but-plausible run alone', () => {
    const f = assessPipelineHealth(inputs({
      runs: [{ id: 'r1', clientId: 'c1', status: 'running', options: null, startedAt: agoH(5), completedAt: null }],
    }))
    expect(f).toEqual([])
  })

  it('ignores the ancient stranded run outside the 14-day window', () => {
    // 06706296… has sat at 'analyzing' since 2026-06-13. Without the window it
    // would alert every morning forever.
    const f = assessPipelineHealth(inputs({
      runs: [{ id: 'old', clientId: 'c1', status: 'running', options: null, startedAt: agoDays(90), completedAt: null }],
    }))
    expect(f).toEqual([])
  })
})

describe('assessPipelineHealth — an owed report that never went out', () => {
  const owed = (completedAt: string) => ({
    id: 'r1', clientId: 'c1', status: 'completed', options: { sendReport: true },
    startedAt: completedAt, completedAt,
  })
  const client = { id: 'c1', name: 'Össur', billing: comped, config: { report_period: 'paused', report_day: null } }

  it('flags a completed scheduled run with no send after three hours', () => {
    const f = assessPipelineHealth(inputs({ clients: [client], runs: [owed(agoH(4))] }))
    expect(kinds(f)).toEqual(['report_missed'])
    expect(f[0].clientName).toBe('Össur')
  })

  it('waits three hours before calling it missed', () => {
    expect(assessPipelineHealth(inputs({ clients: [client], runs: [owed(agoH(1))] }))).toEqual([])
  })

  it('is satisfied by a sent report_sends row', () => {
    const f = assessPipelineHealth(inputs({
      clients: [client],
      runs: [owed(agoH(4))],
      reportSends: [{ runId: 'r1', sentAt: agoH(3), status: 'sent' }],
    }))
    expect(f).toEqual([])
  })

  it('does not alert on a send held for review', () => {
    // report_schedules.review is a shipped toggle: the build stops at a 'ready'
    // send and waits for a member to press Send. Alerting on that would fire
    // every morning on correct behaviour.
    const f = assessPipelineHealth(inputs({
      clients: [client],
      runs: [owed(agoH(4))],
      reportSends: [{ runId: 'r1', sentAt: null, status: 'ready' }],
    }))
    expect(f).toEqual([])
  })

  it('does not alert on a schedule that had no recipients', () => {
    const f = assessPipelineHealth(inputs({
      clients: [client],
      runs: [owed(agoH(4))],
      reportSends: [{ runId: 'r1', sentAt: null, status: 'skipped' }],
    }))
    expect(f).toEqual([])
  })

  it('still alerts when the only row is a claimed or failed send', () => {
    for (const status of ['claimed', 'failed']) {
      const f = assessPipelineHealth(inputs({
        clients: [client],
        runs: [owed(agoH(4))],
        reportSends: [{ runId: 'r1', sentAt: null, status }],
      }))
      expect(kinds(f)).toEqual(['report_missed'])
    }
  })

  it('stops naming a miss once it is two days old', () => {
    // 14 days of daily nagging about one miss is how an alert stops being read.
    expect(assessPipelineHealth(inputs({ clients: [client], runs: [owed(agoH(49))] }))).toEqual([])
    expect(kinds(assessPipelineHealth(inputs({ clients: [client], runs: [owed(agoH(47))] })))).toEqual(['report_missed'])
  })

  it('does not blame a run that was never asked to report', () => {
    const f = assessPipelineHealth(inputs({
      clients: [client],
      runs: [{ ...owed(agoH(4)), options: null }],
    }))
    expect(f).toEqual([])
  })
})

describe('formatOpsEmail', () => {
  it('names every finding and leads with the two first moves', () => {
    const { subject, text } = formatOpsEmail(
      [
        { kind: 'inngest_silent', detail: 'no heartbeat recorded yet' },
        { kind: 'run_not_started', clientId: 'c1', clientName: 'Össur', detail: 'expected 2026-09-13T04:00:00.000Z' },
      ],
      NOW,
    )
    expect(subject.startsWith('Verbatim ops — ')).toBe(true)
    expect(subject).toContain('2 findings')
    expect(text).toContain('no heartbeat recorded yet')
    expect(text).toContain('Össur')
    expect(text).toContain('https://app.inngest.com')
    expect(text).toContain('curl -X PUT https://app.verbatimintel.com/api/inngest')
  })

  it('says one finding in the singular', () => {
    const { subject } = formatOpsEmail([{ kind: 'run_stuck', detail: 'run r1' }], NOW)
    expect(subject).toContain('1 finding')
    expect(subject).not.toContain('findings')
  })
})
