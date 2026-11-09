import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { ERASED_WORDS, POST_IDEA_TITLE_MAX, scrubPlanCheckRow, scrubPostIdeaRow, scrubStoredPlanChecks, scrubStoredPostIdeas } from './stored-prose'

// An erasure request reaches a plan check's model prose (scripts/
// erase-commenter.ts, step 7b): each claim's `theySay`, and since 9 Nov the
// judgement too, on the upload's row and on every re-reading's. The judgement
// is written from those readings, so it can repeat a commenter's words; until
// this it was never scrubbed. Synthetic words: no comment from production.

const ERASED = 'my socket rubs raw after an hour every single day'
const OTHER = 'the clinic fitted it well and I walk all day'

const claimsSaying = (said: string) => [
  { ref: 'C1', claim: 'Fit decides it', verdict: 'contradicts', theySay: `People say "${said}".`, conversationCount: 6, themeRefs: [], insightIds: ['i1'] },
  { ref: 'C2', claim: 'Price matters', verdict: 'silent', theySay: null, conversationCount: 0, themeRefs: [], insightIds: [] },
]
const judgementSaying = (said: string) => [
  { text: `One commenter put it as "${said}", so lead with fit.`, basedOnRefs: ['C1'] },
  { text: 'Keep the athlete stories.', basedOnRefs: [] },
]

function tables() {
  return {
    plan_checks: [
      { id: 'pc1', client_id: 'c1', claims: claimsSaying(ERASED), judgement: judgementSaying(ERASED) },
      { id: 'pc2', client_id: 'c1', claims: claimsSaying(OTHER), judgement: judgementSaying(OTHER) },
      // Another workspace holding the same sentence is not this request's.
      { id: 'pc3', client_id: 'c2', claims: claimsSaying(ERASED), judgement: judgementSaying(ERASED) },
    ],
    plan_check_evaluations: [
      { id: 'ev1', client_id: 'c1', claims: claimsSaying(OTHER), judgement: judgementSaying(ERASED) },
      { id: 'ev2', client_id: 'c1', claims: claimsSaying(ERASED), judgement: null },
    ],
  }
}

describe('an erasure scrubs a plan check’s judgement as well as its readings', () => {
  it('replaces the erased words in the upload’s and every re-reading’s judgement and theySay, and nothing else', async () => {
    const t = tables()
    const db = fakeDb(t)
    const n = await scrubStoredPlanChecks(db.client as never, ['c1'], [ERASED], { apply: true })
    expect(n).toBe(3)
    const updates = db.calls.filter((c) => c.op === 'update')
    expect(updates.map((u) => `${u.table}:${u.filters.join(',')}`).sort()).toEqual([
      'plan_check_evaluations:id=ev1', 'plan_check_evaluations:id=ev2', 'plan_checks:id=pc1',
    ])
    const patchOf = (table: string, id: string) => updates.find((u) => u.table === table && u.filters.includes(`id=${id}`))!.values as Record<string, unknown>
    const all = JSON.stringify(updates.map((u) => u.values))
    expect(all).not.toContain(ERASED)
    expect(all).toContain(ERASED_WORDS)
    // The judgement: the sentence that quoted the words keeps the rest of itself;
    // the other point is untouched.
    expect(patchOf('plan_checks', 'pc1').judgement).toEqual([
      { text: `One commenter put it as "${ERASED_WORDS}", so lead with fit.`, basedOnRefs: ['C1'] },
      { text: 'Keep the athlete stories.', basedOnRefs: [] },
    ])
    expect((patchOf('plan_checks', 'pc1').claims as { theySay: string | null }[]).map((c) => c.theySay)).toEqual([`People say "${ERASED_WORDS}".`, null])
    // A re-reading's judgement alone (its readings did not carry the words).
    expect(Object.keys(patchOf('plan_check_evaluations', 'ev1'))).toEqual(['judgement'])
    expect(Object.keys(patchOf('plan_check_evaluations', 'ev2'))).toEqual(['claims'])
    // Never another workspace's row, never a row without the words.
    expect(updates.some((u) => u.filters.includes('id=pc3') || u.filters.includes('id=pc2'))).toBe(false)
  })

  it('counts and writes nothing on a dry run', async () => {
    const db = fakeDb(tables())
    expect(await scrubStoredPlanChecks(db.client as never, ['c1'], [ERASED], { apply: false })).toBe(3)
    expect(db.calls.filter((c) => c.op === 'update')).toEqual([])
  })

  it('still scrubs the re-readings’ theySay where their judgement column is not applied yet', async () => {
    const db = fakeDb(tables())
    // PostgREST's answer to a select naming a column that is not there.
    const client = new Proxy(db.client as object, {
      get(target, key) {
        const from = Reflect.get(target, key)
        if (key !== 'from') return from
        return (table: string) => {
          const b = (from as (t: string) => Record<string, unknown>)(table)
          if (table !== 'plan_check_evaluations') return b
          return new Proxy(b, {
            get(bt, k) {
              const sel = Reflect.get(bt, k)
              if (k !== 'select') return sel
              return (cols: string) => {
                if (!cols.includes('judgement')) return (sel as (c: string) => unknown)(cols)
                const failed = { data: null, error: { code: '42703', message: 'column plan_check_evaluations.judgement does not exist' } }
                const chain: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => Promise.resolve(failed).then(r) }
                for (const m of ['in', 'limit', 'order', 'range']) chain[m] = () => chain
                return chain
              }
            },
          })
        }
      },
    })
    await expect(scrubStoredPlanChecks(client as never, ['c1'], [ERASED], { apply: true })).resolves.toBeGreaterThan(0)
    // The re-readings are read for their claims alone (the fake hands back
    // whole rows whatever is selected, so the select is what is asserted), and
    // ev2's theySay is scrubbed.
    // (The probe's select is answered by the stand-in above, so the fake records no columns for it.)
    const reads = db.calls.filter((c) => c.op === 'select' && c.table === 'plan_check_evaluations' && c.columns).map((c) => c.columns)
    expect(reads).toEqual(['id, claims'])
    const ev2 = db.calls.find((c) => c.op === 'update' && c.table === 'plan_check_evaluations' && c.filters.includes('id=ev2'))
    expect(JSON.stringify(ev2?.values)).toContain(ERASED_WORDS)
  })

  it('leaves a row with none of the words alone', () => {
    expect(scrubPlanCheckRow({ claims: claimsSaying(OTHER), judgement: judgementSaying(OTHER) }, [ERASED])).toBeNull()
    expect(scrubPlanCheckRow({ claims: null, judgement: null }, [ERASED])).toBeNull()
  })
})

// The week's post ideas are written from comments sent to the model. A title
// or label that copies one is held at write time; what the post should cover
// is not checked, so it can carry a commenter's words (step 7e).
describe('an erasure scrubs the post ideas written from the commenter’s words', () => {
  const idea = (id: string, client: string, said: string) => ({
    id, client_id: client, title: 'What to wear under a liner in summer',
    cover: { text: `Answer the people who say "${said}" first.`, length: { fromSeconds: 30, toSeconds: 60, videos: 4, basis: 'format' } },
    subquestions: [{ label: `Why "${said}"`, commentIds: ['k1'], videoIds: ['v1'] }, { label: 'Which fabric', commentIds: [], videoIds: [] }],
  })

  it('replaces the words in what to cover and the labels, keeping everything else', async () => {
    const db = fakeDb({ post_ideas: [idea('p1', 'c1', ERASED), idea('p2', 'c1', OTHER), idea('p3', 'c2', ERASED)] })
    expect(await scrubStoredPostIdeas(db.client as never, ['c1'], [ERASED], { apply: true })).toBe(1)
    const updates = db.calls.filter((c) => c.op === 'update')
    expect(updates.map((u) => u.filters)).toEqual([['id=p1']])
    const patch = updates[0].values as { cover: { text: string; length: unknown }; subquestions: { label: string }[]; title?: string }
    expect(patch.cover.text).toBe(`Answer the people who say "${ERASED_WORDS}" first.`)
    expect(patch.cover.length).toEqual(idea('p1', 'c1', ERASED).cover.length)
    expect(patch.subquestions.map((q) => q.label)).toEqual([`Why "${ERASED_WORDS}"`, 'Which fabric'])
    expect(patch.title).toBeUndefined()
    expect(scrubPostIdeaRow(idea('p2', 'c1', OTHER), [ERASED])).toBeNull()
  })

  it('reads nothing where the table is not in this database', async () => {
    const db = fakeDb({})
    expect(await scrubStoredPostIdeas(db.client as never, ['c1'], [ERASED], { apply: true })).toBe(0)
  })
})

// Review, 9 Nov: the marker is longer than the shortest text it replaces, so a
// title near `post_ideas_title_check`'s 200 characters could pass it and the
// write would fail. A scrubbed title always fits.
describe('a scrubbed post-idea title stays inside its check', () => {
  const erased = 'rubs raw!'  // 9 characters: the shortest the script sends is 8
  it('uses the short marker, then cuts at a space, never past 200 and never empty', () => {
    const near = `${'Why liners slip '.repeat(11)}${erased} ${erased}`.slice(0, 199)
    expect(near.length).toBeLessThanOrEqual(POST_IDEA_TITLE_MAX)
    const out = scrubPostIdeaRow({ title: near }, [erased])!.title!
    expect(out.length).toBeLessThanOrEqual(POST_IDEA_TITLE_MAX)
    expect(out).not.toContain(erased)
    // Eight characters, one shorter than the short marker: five of them grow
    // a 200-character title by five, so it is cut at its last space.
    const eight = 'rubsraw!'
    const long = `${'a'.repeat(150)} ${eight.repeat(6)}`.slice(0, 200)
    expect(long.length).toBe(199)
    const cut = scrubPostIdeaRow({ title: long }, [eight])!.title!
    expect(cut).toBe('a'.repeat(150))
    expect(cut.length).toBeLessThanOrEqual(POST_IDEA_TITLE_MAX)
  })

  it('keeps the long marker where the title has room', () => {
    expect(scrubPostIdeaRow({ title: `Why ${erased}` }, [erased])!.title).toBe(`Why ${ERASED_WORDS}`)
  })
})

