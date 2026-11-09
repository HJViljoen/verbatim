import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { runErasure, unfinishedMessage, type EraseStep } from './erase-run'
import { scrubStoredPlanChecks, scrubStoredPostIdeas } from './stored-prose'

// Review, 9 Nov: a scrub that threw after the comments were deleted skipped
// the suppression after it, and a re-run found no comments and never scrubbed.
// Suppression now runs first, each scrub on its own, and the delete last, only
// where every scrub succeeded.

const ERASED = 'my socket rubs raw after an hour every single day'

const recorder = () => {
  const ran: string[] = []
  const step = (name: string, fail = false): EraseStep => ({
    name,
    run: async () => { ran.push(name); if (fail) throw new Error(`${name} broke`) },
  })
  return { ran, step }
}

describe('runErasure', () => {
  it('records suppression first, runs every other scrub when one throws, and keeps the comments for a re-run', async () => {
    const { ran, step } = recorder()
    const logged: string[] = []
    const out = await runErasure({
      suppress: step('suppression'),
      scrubs: [step('ai_call_log bodies'), step('stored Ask answers', true), step('stored agent answers'), step('stored post ideas')],
      erase: step('delete the comments'),
    }, (l) => { logged.push(l) })
    expect(ran).toEqual(['suppression', 'ai_call_log bodies', 'stored Ask answers', 'stored agent answers', 'stored post ideas'])
    expect(out).toEqual({ failed: ['stored Ask answers'], erased: false })
    expect(logged.join('\n')).toContain('FAILED: stored Ask answers: stored Ask answers broke')
    expect(logged.join('\n')).toContain('not deleted')
  })

  it('deletes the comments last, once every scrub has succeeded', async () => {
    const { ran, step } = recorder()
    const out = await runErasure({ suppress: step('suppression'), scrubs: [step('a'), step('b')], erase: step('delete the comments') }, () => {})
    expect(ran).toEqual(['suppression', 'a', 'b', 'delete the comments'])
    expect(out).toEqual({ failed: [], erased: true })
  })

  it('still scrubs and deletes where suppression itself failed (a re-run records it from the handle alone)', async () => {
    const { ran, step } = recorder()
    const out = await runErasure({ suppress: step('suppression', true), scrubs: [step('a')], erase: step('delete the comments') }, () => {})
    expect(ran).toEqual(['suppression', 'a', 'delete the comments'])
    expect(out).toEqual({ failed: ['suppression'], erased: true })
  })

  it('over the real scrubs: a post-ideas read that fails leaves suppression recorded and the plan checks scrubbed', async () => {
    const db = fakeDb({
      suppressed_commenters: [],
      plan_checks: [{ id: 'pc1', client_id: 'c1', claims: [{ ref: 'C1', theySay: `People say "${ERASED}".` }], judgement: [{ text: `Quote: "${ERASED}".`, basedOnRefs: [] }] }],
      plan_check_evaluations: [],
      // post_ideas present but its read fails as a transient error would.
    })
    const client = db.client as { from: (t: string) => unknown }
    const failingIdeas = {
      from(table: string) {
        if (table !== 'post_ideas') return client.from(table)
        const failed = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
        const chain: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => Promise.resolve(failed).then(r) }
        for (const m of ['select', 'in', 'limit', 'order', 'range']) chain[m] = () => chain
        return chain
      },
    }
    let suppressed = false
    const out = await runErasure({
      suppress: {
        name: 'suppression',
        run: async () => {
          const { error } = await (db.client as { from: (t: string) => { insert: (r: unknown) => PromiseLike<{ error: unknown }> } })
            .from('suppressed_commenters').insert({ platform: 'youtube', author_key: 'someone' })
          if (error) throw new Error('suppress')
          suppressed = true
        },
      },
      scrubs: [
        { name: 'stored post ideas', run: async () => { await scrubStoredPostIdeas(failingIdeas as never, ['c1'], [ERASED], { apply: true }) } },
        { name: 'stored Ask answers', run: async () => { await scrubStoredPlanChecks(db.client as never, ['c1'], [ERASED], { apply: true }) } },
      ],
      erase: { name: 'delete the comments', run: async () => {} },
    }, () => {})
    expect(suppressed).toBe(true)
    expect(out).toEqual({ failed: ['stored post ideas'], erased: false })
    const scrubbedPlan = db.calls.find((c) => c.op === 'update' && c.table === 'plan_checks')
    expect(JSON.stringify(scrubbedPlan?.values)).not.toContain(ERASED)
  })
})

// A failed erasure must never look like a finished one: the script exits 1,
// names what failed, says the comments are not deleted yet, says to re-run,
// and prints no reply.
describe('an erasure that did not finish says so', () => {
  it('names the failed scrubs, says the comments are not deleted yet, and to re-run', () => {
    const msg = unfinishedMessage({ failed: ['stored Ask answers', 'stored post ideas'], erased: false })!
    expect(msg).toContain('ERASURE NOT FINISHED')
    expect(msg).toContain('Failed: stored Ask answers, stored post ideas.')
    expect(msg).toContain('The comments were NOT deleted yet')
    expect(msg).toContain('re-run this script with the same arguments')
    expect(msg).toContain('Send no reply')
  })

  it('says the comments are deleted where only suppression failed, and still to re-run', () => {
    const msg = unfinishedMessage({ failed: ['suppression'], erased: true })!
    expect(msg).toContain('Failed: suppression.')
    expect(msg).toContain('The comments are deleted.')
    expect(msg).toContain('re-run')
  })

  it('says nothing where every step succeeded', () => {
    expect(unfinishedMessage({ failed: [], erased: true })).toBeNull()
  })

  it('is what the script prints, to stderr, exiting 1 before any reply', () => {
    const src = readFileSync(resolve(__dirname, '../../scripts/erase-commenter.ts'), 'utf8')
    const at = src.indexOf('const unfinished = unfinishedMessage(outcome)')
    const reply = src.indexOf('--- reply template ---')
    expect(at).toBeGreaterThan(0)
    expect(reply).toBeGreaterThan(at)
    const branch = src.slice(at, reply)
    expect(branch).toMatch(/console\.error\(`\\n\$\{unfinished\}`\)/)
    expect(branch).toContain('process.exitCode = 1')
    expect(branch).toMatch(/return\n\s*\}/)
    // The delete runs last and only through the runner.
    expect(src.indexOf('runErasure({')).toBeLessThan(at)
  })
})

