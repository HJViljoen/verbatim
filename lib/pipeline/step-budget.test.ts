import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  BACKFILL_PARALLEL, GATHER_MAX_SEARCHES_PER_RUN, OCR_BACKFILL_CAP, OCR_BATCH, OCR_CAP, OCR_PARALLEL,
  TRANSCRIBE_PARALLEL, TRANSLATE_BATCH, TRANSLATE_CAP, TRANSLATE_PARALLEL, TRANSLATE_QUOTES_BATCH,
  TRANSLATE_QUOTES_CALLS_PER_STEP, TRANSLATE_QUOTES_CAP, BACKFILL_CAP, BACKFILL_BATCH_YOUTUBE,
} from '../config'
import { runWarning, WARNING_STEPS, warningSentence } from './run-warnings'
import {
  CLASSIFY_PARALLEL, COMMENT_PARALLEL, countSteps, INNGEST_STEP_LIMIT, pipelineSteps, settleMembers, STEP_BUDGET_WARN_AT,
  STEP_FAMILIES, stepBudgetCause, STEPS_AFTER_CLOSE, waveCount, type RunWidths,
} from './step-budget'

// THE STEP BUDGET (9 Nov). Sealand's 8 Nov update `c5690bb0` failed on
// Inngest's 1,000 steps a run, inside Pass A. These tests hold the step count
// to the source, reproduce the three runs it was read from, and say how far
// the pipeline is from the limit now. Widths are production's, read 9 Nov
// (apify_runs.step, ai_call_log.call_index, videos.run_id), counts only.

const ROOT = join(__dirname, '..', '..')
const PIPELINE = readFileSync(join(ROOT, 'inngest', 'functions', 'pipeline.ts'), 'utf8')

/** Sealand's 8 Nov update: 1,440 videos kept (Instagram 410, Reddit 187,
 *  TikTok 297, YouTube 546). YouTube's refs are every kept video (no comment
 *  threshold) plus up to RECHECK_CAP growth re-checks, so 546 to 646. */
const sealand8Nov = (youtubeRefs: number): RunWidths => ({
  platforms: [
    { searches: 44, commentRefs: 34, ownedAccounts: 8, ownedCommentSteps: 15, transcribeBatches: 51, ocrBatches: 51 },
    { searches: 25, commentRefs: 106, ownedAccounts: 0, ownedCommentSteps: 0, transcribeBatches: 24, ocrBatches: 0 },
    { searches: 22, commentRefs: 109, ownedAccounts: 8, ownedCommentSteps: 3, transcribeBatches: 38, ocrBatches: 38 },
    { searches: 22, commentRefs: youtubeRefs, ownedAccounts: 5, ownedCommentSteps: 3, transcribeBatches: 68, ocrBatches: 63 },
  ],
  classifyBatches: 55, transcriptBackfillBatches: 10, translateBatches: 67, ocrBackfillBatches: 24,
  // Pass A died on its 34th batch or so (404 calls); 40 is the whole plan by
  // the 11 Oct update's ratio of selected videos.
  passABatches: 40,
  quoteBatches: 15, subjects: 5, themeBuckets: 6, passBChunks: 26, segmentBatches: 3, comparabilityTasks: 4,
  lensMonths: 3, brandMonths: 3, productMonths: 3, briefWaves: null,
})

/** Sealand's 11 Oct update `78a6eb3c`, 1,076 videos: the last of its updates
 *  to go from start to end in one function run. */
const sealand11Oct = (youtubeRefs: number): RunWidths => ({
  platforms: [
    { searches: 44, commentRefs: 25, ownedAccounts: 8, ownedCommentSteps: 10, transcribeBatches: 39, ocrBatches: 39 },
    { searches: 25, commentRefs: 75, ownedAccounts: 0, ownedCommentSteps: 0, transcribeBatches: 14, ocrBatches: 0 },
    { searches: 22, commentRefs: 74, ownedAccounts: 8, ownedCommentSteps: 5, transcribeBatches: 24, ocrBatches: 24 },
    { searches: 22, commentRefs: youtubeRefs, ownedAccounts: 5, ownedCommentSteps: 3, transcribeBatches: 58, ocrBatches: 58 },
  ],
  classifyBatches: 41, transcriptBackfillBatches: 8, translateBatches: 42, ocrBackfillBatches: 0, passABatches: 28,
  quoteBatches: 13, subjects: 5, themeBuckets: 6, passBChunks: 22, segmentBatches: 3, comparabilityTasks: 4,
  lensMonths: 3, brandMonths: 3, productMonths: 0, briefWaves: null,
})

/** Össur's 8 Nov update `0c28ac74`, 591 videos, which finished. */
const ossur8Nov = (youtubeRefs: number): RunWidths => ({
  platforms: [
    { searches: 7, commentRefs: 71, ownedAccounts: 2, ownedCommentSteps: 1, transcribeBatches: 15, ocrBatches: 15 },
    { searches: 14, commentRefs: 24, ownedAccounts: 2, ownedCommentSteps: 3, transcribeBatches: 22, ocrBatches: 22 },
    { searches: 11, commentRefs: 43, ownedAccounts: 0, ownedCommentSteps: 0, transcribeBatches: 6, ocrBatches: 0 },
    { searches: 7, commentRefs: youtubeRefs, ownedAccounts: 2, ownedCommentSteps: 2, transcribeBatches: 33, ocrBatches: 33 },
  ],
  classifyBatches: 24, transcriptBackfillBatches: 3, translateBatches: 24, ocrBackfillBatches: 0, passABatches: 17,
  quoteBatches: 5, subjects: 6, themeBuckets: 4, passBChunks: 12, segmentBatches: 2, comparabilityTasks: 4,
  lensMonths: 3, brandMonths: 3, productMonths: 3, briefWaves: null,
})

/** Sealand's 8 Nov week grown `f` times: every per-video width scales, every
 *  capped one stops at its cap, the searches and the accounts stay. */
const grown = (f: number): RunWidths => {
  const base = sealand8Nov(646)
  const ocrSteps = Math.ceil(OCR_CAP / OCR_BATCH) + base.platforms.length
  const ocrNow = base.platforms.reduce((n, p) => n + p.ocrBatches, 0)
  const ocrScale = Math.min(f * ocrNow, ocrSteps) / ocrNow
  return {
    ...base,
    platforms: base.platforms.map((p, i) => ({
      ...p,
      commentRefs: i === 3 ? Math.round(546 * f) + 100 : Math.round(p.commentRefs * f),
      transcribeBatches: Math.round(p.transcribeBatches * f),
      ocrBatches: Math.round(p.ocrBatches * ocrScale),
    })),
    classifyBatches: Math.round(base.classifyBatches * f),
    transcriptBackfillBatches: Math.min(Math.round(base.transcriptBackfillBatches * f), BACKFILL_CAP / BACKFILL_BATCH_YOUTUBE),
    translateBatches: Math.min(Math.round(base.translateBatches * f), TRANSLATE_CAP / TRANSLATE_BATCH),
    ocrBackfillBatches: Math.min(Math.round(base.ocrBackfillBatches * f), Math.ceil(OCR_BACKFILL_CAP / OCR_BATCH)),
    passABatches: Math.round(base.passABatches * f),
    segmentBatches: Math.ceil((1440 * f) / 500),
  }
}

const beforePassA = (w: RunWidths, shape: 'waves' | 'batches') => {
  const { stages } = pipelineSteps(w, shape)
  return stages.slice(0, stages.findIndex((s) => s.stage === 'pass-a')).reduce((n, s) => n + s.steps, 0)
}

describe('the count reproduces the runs it was read from (one step a batch, the 8 Nov pipeline)', () => {
  it('Sealand 8 Nov: about 1,000 steps by its 34th Pass A batch, where it failed, and 1,055 to 1,089 for the whole run', () => {
    // The limit falls inside the bracket of the YouTube re-checks (0 to 100).
    expect(beforePassA(sealand8Nov(546), 'batches') + 34).toBeLessThanOrEqual(INNGEST_STEP_LIMIT)
    expect(beforePassA(sealand8Nov(646), 'batches') + 34).toBeGreaterThanOrEqual(INNGEST_STEP_LIMIT)
    expect(pipelineSteps(sealand8Nov(546), 'batches').total).toBe(1055)
    expect(pipelineSteps(sealand8Nov(646), 'batches').total).toBe(1089)
  })

  it('Sealand 11 Oct, 1,076 videos, finished under the limit (838 to 871)', () => {
    expect(pipelineSteps(sealand11Oct(460), 'batches').total).toBe(838)
    expect(pipelineSteps(sealand11Oct(560), 'batches').total).toBe(871)
  })

  it('Össur 8 Nov, 591 videos, finished well under it (489 to 522)', () => {
    expect(pipelineSteps(ossur8Nov(262), 'batches').total).toBe(489)
    expect(pipelineSteps(ossur8Nov(362), 'batches').total).toBe(522)
  })

  it('the stages that grew from 11 Oct to 8 Nov are the per-video fan-outs', () => {
    const grew = (stage: string) => {
      const sum = (w: RunWidths) => pipelineSteps(w, 'batches').stages.filter((s) => s.stage === stage).reduce((n, s) => n + s.steps, 0)
      return sum(sealand8Nov(646)) - sum(sealand11Oct(560))
    }
    expect(grew('comments')).toBe(55)
    expect(grew('transcribe')).toBe(46)
    expect(grew('ocr')).toBe(31)
    expect(grew('classify') + grew('translate') + grew('ocr-backfill') + grew('transcript-backfill')).toBe(65)
    expect(grew('search')).toBe(0)
  })
})

describe('one step a wave: the margin now', () => {
  it('Sealand 8 Nov takes about 500 steps (492 to 500), Össur about 250', () => {
    expect(pipelineSteps(sealand8Nov(546)).total).toBe(492)
    expect(pipelineSteps(sealand8Nov(646)).total).toBe(500)
    expect(pipelineSteps(ossur8Nov(362)).total).toBe(253)
  })

  it('a week three times Sealand\'s 8 Nov (4,320 videos) stays under the warning', () => {
    for (const f of [1, 1.5, 2, 2.5, 3]) {
      expect(pipelineSteps(grown(f)).total, `${f}x`).toBeLessThan(STEP_BUDGET_WARN_AT)
    }
    // and the old shape was over the limit from Sealand's own week
    expect(pipelineSteps(grown(1), 'batches').total).toBeGreaterThan(INNGEST_STEP_LIMIT)
  })

  it('every capped fan-out at its cap, on Sealand\'s other widths, stays under the warning', () => {
    const base = sealand8Nov(646)
    const capped: RunWidths = {
      ...base,
      platforms: base.platforms.map((p, i) => ({
        ...p,
        // the searches at the run's cap, shared out
        searches: Math.ceil(GATHER_MAX_SEARCHES_PER_RUN / base.platforms.length),
        // OCR's cap is shared by the platforms (H2)
        ocrBatches: i === 1 ? 0 : Math.ceil(OCR_CAP / OCR_BATCH / 3) + 1,
      })),
      transcriptBackfillBatches: BACKFILL_CAP / BACKFILL_BATCH_YOUTUBE,
      translateBatches: TRANSLATE_CAP / TRANSLATE_BATCH,
      ocrBackfillBatches: Math.ceil(OCR_BACKFILL_CAP / OCR_BATCH),
      quoteBatches: Math.ceil(TRANSLATE_QUOTES_CAP / (TRANSLATE_QUOTES_BATCH * TRANSLATE_QUOTES_CALLS_PER_STEP)),
      briefWaves: 4,
    }
    expect(pipelineSteps(capped).total).toBeLessThan(STEP_BUDGET_WARN_AT)
  })
})

// ---- held to the source ---------------------------------------------------------

/** Every step id of the pipeline, as written: the first argument of each
 *  step.run / step.sendEvent, and each fan-out's waveId and memberId. */
function stepIdsOf(src: string): string[] {
  const out: string[] = []
  const firstArg = (from: number): string => {
    let depth = 0
    let q: string | null = null
    let arg = ''
    for (let i = from; i < src.length; i++) {
      const c = src[i]
      if (q) {
        arg += c
        if (q === '`' && c === '$' && src[i + 1] === '{') { depth++; arg += src[++i]; continue }
        if (c === q && depth === 0) q = null
        else if (q === '`' && c === '}' && depth > 0) depth--
        continue
      }
      if (c === '\'' || c === '"' || c === '`') { q = c; arg += c; continue }
      if (c === '(') depth++
      if (c === ')') { if (depth === 0) break; depth-- }
      if (c === ',' && depth === 0) break
      arg += c
    }
    return arg.trim()
  }
  for (const m of src.matchAll(/\bstep\s*\.\s*(?:run|sendEvent)\s*\(/g)) out.push(firstArg(m.index! + m[0].length))
  for (const m of src.matchAll(/\b(?:waveId|memberId): \([^)]*\) => (`[^`]*`)/g)) out.push(m[1])
  return out
}

/** An id as a family: `${…}` read as `*`, quotes off. */
const familyOf = (id: string): string =>
  id === 'searchStepId(task)' ? 'search' : id.replace(/\$\{[^}]*\}/g, '*').replace(/^['"`]|['"`]$/g, '')

describe('every step id is counted', () => {
  const ids = stepIdsOf(PIPELINE)
  // fanOut's own two calls take the ids its callers give it.
  const own = ids.filter((id) => id !== 'id' && id !== 'f.memberId(i)')

  it('finds fanOut\'s two calls and nothing else unnamed', () => {
    expect(ids.filter((id) => id === 'id' || id === 'f.memberId(i)')).toEqual(['id', 'f.memberId(i)'])
    for (const id of own) expect(id, id).toMatch(/^['`]|^searchStepId\(task\)$/)
  })

  it('names exactly the families the count counts: a new id fails here until pipelineSteps counts it', () => {
    expect([...new Set(own.map(familyOf))].sort()).toEqual([...STEP_FAMILIES].sort())
  })
})

describe('the seven per-video fan-outs are one step a wave', () => {
  const FANOUTS: { wave: string; member: string; parallel: string }[] = [
    { wave: '`comments-wave:${platform}:${w}-of-${n}`', member: '`comments:${platform}:${i + 1}`', parallel: 'COMMENT_PARALLEL' },
    { wave: '`transcribe-wave:${platform}:${w}-of-${n}`', member: '`transcribe:${platform}:${i + 1}-of-${txBatches.length}`', parallel: 'TRANSCRIBE_PARALLEL' },
    { wave: '`ocr-wave:${platform}:${w}-of-${n}`', member: '`ocr:${platform}:${i + 1}-of-${ocrBatches.length}`', parallel: 'OCR_PARALLEL' },
    { wave: '`classify-wave:${w}-of-${n}`', member: '`classify:${i + 1}-of-${classifyBatches.length}`', parallel: 'CLASSIFY_PARALLEL' },
    { wave: '`transcript-backfill-wave:${w}-of-${n}`', member: '`transcript-backfill:${i + 1}-of-${plan.batches.length}`', parallel: 'BACKFILL_PARALLEL' },
    { wave: '`translate-wave:${w}-of-${n}`', member: '`translate:${i + 1}-of-${plan.batches.length}`', parallel: 'TRANSLATE_PARALLEL' },
    { wave: '`ocr-backfill-wave:${w}-of-${n}`', member: '`ocr-backfill:${i + 1}-of-${plan.batches.length}`', parallel: 'OCR_PARALLEL' },
  ]

  it('each passes its wave id, its batches\' old ids and its *_PARALLEL to fanOut, in source order', () => {
    let last = -1
    for (const f of FANOUTS) {
      const at = PIPELINE.indexOf(`waveId: (w, n) => ${f.wave}`)
      expect(at, f.wave).toBeGreaterThan(last)
      // The call, from its own `await fanOut({` to its fallback.
      const open = PIPELINE.lastIndexOf('await fanOut({', at)
      expect(open, f.wave).toBeGreaterThan(last)
      const call = PIPELINE.slice(open, PIPELINE.indexOf('fallback: (', at))
      expect(call, f.wave).toContain(`memberId: (i) => ${f.member}`)
      expect(call, f.wave).toContain(`parallel: ${f.parallel},`)
      expect(call.match(/await fanOut\(\{/g), f.wave).toHaveLength(1)
      last = at
    }
  })

  it('a batch\'s old id is a step only through fanOut (its recovery), never a step.run of its own', () => {
    const direct = stepIdsOf(PIPELINE.replace(/\b(?:waveId|memberId): \([^)]*\) => `[^`]*`/g, '')).map(familyOf)
    for (const f of FANOUTS) expect(direct, f.member).not.toContain(familyOf(f.member))
  })

  it('the parallel widths are the ones the count divides by', () => {
    expect([COMMENT_PARALLEL, TRANSCRIBE_PARALLEL, OCR_PARALLEL, CLASSIFY_PARALLEL, BACKFILL_PARALLEL, TRANSLATE_PARALLEL]).toEqual([4, 4, 4, 4, 4, 4])
  })

  it('fanOut: the wave settles its batches, a failed wave or batch runs as its own step with the old fallback', () => {
    const body = PIPELINE.slice(PIPELINE.indexOf('const fanOut = async'), PIPELINE.indexOf('// 1. Open the run row'))
    expect(body).toContain('.run(id, () => settleMembers(slice, (item, j) => f.run(item, first + j)))')
    // a wave out of retries: every batch of it on its own
    expect(body).toMatch(/\.catch\(\(e: unknown\) => \{[\s\S]*?return null\s*\}\)/)
    expect(body).toContain('if (outcome?.ok) return Promise.resolve(outcome.value)')
    expect(body).toContain('step.run(f.memberId(i), () => f.run(item, i))')
    expect(body).toContain('.catch((e: unknown) => f.fallback(item, i, e))')
  })
})

describe('the run counts its own steps and warns before about 900', () => {
  it('counts the handler\'s step tools, and uses no other', () => {
    expect(PIPELINE).toContain('async ({ event, step: inngestStep, attempt, maxAttempts }) => {')
    expect(PIPELINE).toContain('const stepCounter = countSteps(inngestStep)')
    expect(PIPELINE.match(/\binngestStep\b/g)).toHaveLength(2)
  })

  it('notes the step-budget warning before close-run, the step that writes it', () => {
    const note = PIPELINE.indexOf("if (stepBudget) noteWarning('step-budget', stepBudget)")
    expect(note).toBeGreaterThan(PIPELINE.indexOf("const stepBudget = stepBudgetCause(stepsBeforeClose)"))
    expect(note).toBeLessThan(PIPELINE.indexOf("await step.run('close-run'"))
    // after every step but close-run's and the five after it
    const after = stepIdsOf(PIPELINE.slice(note)).map(familyOf).filter((id) => id !== 'close-run')
    expect(after).toEqual(['settle-apify-usage', 'write-run-costs', 'prune-stale-analysis', 'request-report', 'alert-partial'])
    expect(STEPS_AFTER_CLOSE).toBe(after.length)
  })

  it('the warning is housekeeping, says nothing failed, and comes at 900 steps with close-run\'s and the five after it', () => {
    expect(WARNING_STEPS['step-budget'].kind).toBe('housekeeping')
    expect(stepBudgetCause(STEP_BUDGET_WARN_AT - 1 - STEPS_AFTER_CLOSE - 1)).toBeNull()
    const cause = stepBudgetCause(STEP_BUDGET_WARN_AT - 1 - STEPS_AFTER_CLOSE)!
    expect(cause).toBe('900 of the 1000 steps a run may take, the warning at 900')
    expect(warningSentence(runWarning('step-budget', cause))).toBe(
      'Housekeeping: the update’s steps came near Inngest’s limit of steps a run (900 of the 1000 steps a run may take, the warning at 900). '
      + 'Nothing is stale: this update finished, but a bigger one can be stopped before its themes, its read and its email.',
    )
  })
})

// ---- the parts ------------------------------------------------------------------

describe('settleMembers', () => {
  it('runs every batch at once, returns each one\'s value or message in order, and never throws', async () => {
    const started: number[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const run = settleMembers([1, 2, 3], async (n, j) => {
      started.push(j)
      await gate
      if (n === 2) throw new Error('Apify 408')
      if (n === 3) throw 'plain'
      return n * 10
    })
    await Promise.resolve()
    expect(started).toEqual([0, 1, 2])
    release()
    expect(await run).toEqual([{ ok: true, value: 10 }, { ok: false, error: 'Apify 408' }, { ok: false, error: 'plain' }])
  })

  it('a wave of nothing is nothing', async () => {
    expect(await settleMembers([], async () => 1)).toEqual([])
    expect(waveCount(0, 4)).toBe(0)
    expect(waveCount(212, 4)).toBe(53)
  })
})

describe('countSteps', () => {
  it('counts each step call, passes it through untouched, and leaves the rest of the tools alone', async () => {
    const calls: unknown[][] = []
    const tools = {
      run: function (this: unknown, ...a: unknown[]) { calls.push([this === tools, ...a]); return Promise.resolve('ran') },
      sendEvent: (...a: unknown[]) => { calls.push(a); return Promise.resolve({ ids: [] }) },
      sleep: () => Promise.resolve(),
      fetch: () => 'not a step',
      label: 'x',
    }
    const { step, count } = countSteps(tools)
    expect(await step.run('a', () => 1)).toBe('ran')
    await step.sendEvent('b', { name: 'n' })
    await step.sleep()
    expect(step.fetch()).toBe('not a step')
    expect(step.label).toBe('x')
    expect(count()).toBe(3)
    expect(calls[0][0]).toBe(true)
    expect(calls[0][1]).toBe('a')
  })
})
