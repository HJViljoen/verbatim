import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import type { ConfigChange } from '../config-log'
import { changesFromLog, PRE_GATHER_ACTOR_LABELS, preGatherRunOf } from './comparability'

// The lead's ruling of 5 Oct, part 2: a pipeline change made inside a run,
// before that run's gather, starts at that run (`preGatherRunId` here,
// `preGatherCutBefore` in lib/reading/weeks.ts, tested in weeks.test.ts).

let seq = 0
function row(over: Partial<ConfigChange> & Pick<ConfigChange, 'changed_at' | 'surface'>): ConfigChange {
  seq += 1
  return {
    id: over.id ?? `row-${String(seq).padStart(3, '0')}`,
    client_id: 'ossur',
    field: 'subreddits',
    before: null,
    after: null,
    actor_kind: 'pipeline',
    actor_user_id: null,
    actor_label: 'subreddit discovery · probe',
    run_id: '555af400-4f5a-49bd-883f-4af7799ddc1f',
    source: 'trigger',
    rows_affected: null,
    note: null,
    affects_audiences: null,
    affects_months: null,
    ...over,
  }
}

// Össur's community list, as the trigger logs it: the whole array of entries.
const entry = (name: string, status: string) => ({ name, status })
const BEFORE = [entry('amputee', 'active'), entry('bionics', 'active'), entry('prosthetics', 'active'), entry('limbdifference', 'candidate')]
const PROMOTED = [entry('amputee', 'active'), entry('bionics', 'active'), entry('prosthetics', 'active'), entry('limbdifference', 'active')]

describe('changesFromLog: a change made inside a run, before its gather', () => {
  it('names the run where every row is subreddit discovery\'s write stamped with it (Össur, 4 Oct 11:46:25, run 555af400)', () => {
    const [c] = changesFromLog([row({ changed_at: '2026-10-04T11:46:25.869Z', surface: 'subreddits', before: BEFORE, after: PROMOTED })])
    expect(c).toMatchObject({ surface: 'subreddits', preGatherRunId: '555af400-4f5a-49bd-883f-4af7799ddc1f' })
    const [s] = changesFromLog([row({ changed_at: '2026-09-27T04:03:51Z', surface: 'subreddits', actor_label: 'subreddit discovery · strikes', run_id: 'f3646446', before: PROMOTED, after: BEFORE })])
    expect(s.preGatherRunId).toBe('f3646446')
  })

  it('production\'s 4 Oct probe row moved no active community (amputee, bionics, prosthetics before and after), so it is no change at all', () => {
    const probeOnly = [entry('amputee', 'active'), entry('bionics', 'active'), entry('prosthetics', 'active'), entry('limbdifference', 'rejected')]
    expect(changesFromLog([row({ changed_at: '2026-10-04T11:46:25.869Z', surface: 'subreddits', before: BEFORE, after: probeOnly })])).toEqual([])
  })

  it('keeps the change\'s own week for anything else: a person, a script, no run, another pipeline write, or a group mixing them', () => {
    const at = '2026-10-04T11:46:25Z'
    const moved = { surface: 'subreddits' as const, before: BEFORE, after: PROMOTED }
    expect(changesFromLog([row({ changed_at: at, ...moved, actor_kind: 'user', actor_label: 'someone@client', run_id: null })])[0].preGatherRunId).toBeUndefined()
    expect(changesFromLog([row({ changed_at: at, ...moved, actor_kind: 'script', actor_label: 'scripts/x.ts --apply', run_id: null })])[0].preGatherRunId).toBeUndefined()
    expect(changesFromLog([row({ changed_at: at, ...moved, run_id: null })])[0].preGatherRunId).toBeUndefined()
    expect(changesFromLog([row({ changed_at: at, surface: 'other', field: 'attention_panel', actor_label: 'freeze-months' })])[0].preGatherRunId).toBeUndefined()
    // Two rows of one change (within a minute): discovery's and an operator's.
    const mixed = changesFromLog([
      row({ changed_at: at, ...moved }),
      row({ changed_at: '2026-10-04T11:46:40Z', ...moved, actor_kind: 'operator', actor_label: 'heinrich', run_id: null }),
    ])
    expect(mixed).toHaveLength(1)
    expect(mixed[0].preGatherRunId).toBeUndefined()
    // Two discovery rows of two different runs in one group: no one run.
    const twoRuns = changesFromLog([row({ changed_at: at, ...moved }), row({ changed_at: '2026-10-04T11:46:40Z', ...moved, run_id: 'other-run' })])
    expect(twoRuns[0].preGatherRunId).toBeUndefined()
    expect(preGatherRunOf({ actor_kind: 'pipeline', actor_label: 'segment-videos', run_id: 'r' })).toBeNull()
  })
})

describe('the pre-gather writes are what the pipeline does (pinned to the source)', () => {
  const pipeline = readFileSync(new URL('../../inngest/functions/pipeline.ts', import.meta.url), 'utf8')
  const discovery = readFileSync(new URL('../gather/subreddit-discovery.ts', import.meta.url), 'utf8')

  it('discover-subreddits runs before plan-gather, the step that plans the run\'s searches', () => {
    const at = pipeline.indexOf(".run('discover-subreddits'")
    expect(at).toBeGreaterThan(0)
    expect(pipeline.indexOf("step.run('plan-gather'")).toBeGreaterThan(at)
    expect(pipeline.indexOf('searchOne(')).toBeGreaterThan(at)
  })

  it('discovery stamps its writes with the run and exactly these labels', () => {
    const labels = [...discovery.matchAll(/pipelineActor\(opts\.runId, '([^']+)'\)/g)].map((m) => m[1])
    expect([...labels].sort()).toEqual([...PRE_GATHER_ACTOR_LABELS].sort())
  })

  it('no other code writes one of these labels', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url))
    const others: string[] = []
    for (const dir of ['lib', 'inngest', 'scripts', 'app']) {
      for (const f of readdirSync(`${root}${dir}`, { recursive: true }) as string[]) {
        if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f)) continue
        const path = `${dir}/${f}`
        if (path === 'lib/gather/subreddit-discovery.ts' || path === 'lib/reading/comparability.ts') continue
        const src = readFileSync(`${root}${path}`, 'utf8')
        if (PRE_GATHER_ACTOR_LABELS.some((label) => src.includes(label))) others.push(path)
      }
    }
    expect(others).toEqual([])
  })
})
