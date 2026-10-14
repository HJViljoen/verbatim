import { describe, expect, it } from 'vitest'

import { OSSUR_SUBJECTS } from '../../scripts/seeds/ossur-subjects'
import { OSSUR_SUBJECTS_2 } from '../../scripts/seeds/ossur-subjects-2'
import { scriptActor } from '../config-log'
import {
  DESCRIPTION_MAX,
  descriptionProblem,
  planRedescribe,
  redescribeChange,
  redescribeLogged,
  redescribeNote,
  retiredBy,
  strandedMoves,
  successorRow,
  type RedescribeSubject,
  type Redescription,
} from './redescribe'
import { subjectEmbedInput, subjectPositiveGloss } from './types'

const OLD_WORDS = 'Comments about how prosthetics look: design, covers and finishes, excluding how it works or fits.'
const NEW_WORDS = 'Comments about how a prosthetic is decorated and shown: colours and covers, excluding how it works.'

const subject = (over: Partial<RedescribeSubject> = {}): RedescribeSubject => ({
  id: 'old', client_id: 'c1', name: 'Look & style', description: OLD_WORDS,
  origin: 'category_theme', source_ref: 'theme-1', status: 'active', superseded_by: null, ...over,
})
const entry = (over: Partial<Redescription> = {}): Redescription => ({
  id: 'old', name: 'Look & style', from: OLD_WORDS, description: NEW_WORDS, ...over,
})
const successor = (over: Partial<RedescribeSubject> = {}) => subject({ id: 'new', description: NEW_WORDS, ...over })
const logRow = { after: { id: 'new', supersedes: 'old' } }
// What `subjects_status_audit` writes when the service role (this script)
// retires the old subject.
const stoppedByScript = { after: { id: 'old', name: 'Look & style', status: 'retired', superseded_by: null }, actor_kind: 'script', changed_at: '2026-10-14T10:00:00Z' }

describe('planRedescribe', () => {
  it('re-describes an active subject the seed was written against: retire, insert, point, log', () => {
    expect(planRedescribe([subject()], [], [entry()]))
      .toEqual([{ id: 'old', name: 'Look & style', writes: ['retire', 'insert', 'point', 'log'], successorId: null }])
  })

  it('refuses a subject whose words or name moved since the seed was written, and one it cannot find', () => {
    expect(planRedescribe([subject({ description: 'Something else.' })], [], [entry()])[0])
      .toMatchObject({ refused: 'its description today is not the one the seed was written against' })
    expect(planRedescribe([subject({ name: 'Looks' })], [], [entry()])[0])
      .toMatchObject({ refused: 'it is called "Looks" today, and the seed says "Look & style"' })
    expect(planRedescribe([], [], [entry()])[0]).toMatchObject({ refused: 'not a subject of this workspace' })
  })

  it('refuses a proposed subject: nothing counts it, and the successor would be born counted', () => {
    expect(planRedescribe([subject({ status: 'proposed' })], [], [entry()])[0]).toMatchObject({ refused: expect.stringMatching(/proposed/) })
  })

  it('refuses words that cannot be stored or change nothing', () => {
    expect(descriptionProblem('  ', OLD_WORDS)).toBe('the new description is empty')
    expect(descriptionProblem('x'.repeat(DESCRIPTION_MAX + 1), OLD_WORDS)).toMatch(/limit is 400/)
    expect(descriptionProblem(` ${OLD_WORDS} `, OLD_WORDS)).toBe('the new description is the one it has today')
    expect(planRedescribe([subject()], [], [entry({ description: OLD_WORDS })])[0]).toMatchObject({ refused: expect.any(String) })
  })

  it('refuses a seed that names one subject twice', () => {
    const plans = planRedescribe([subject()], [], [entry(), entry()])
    expect(plans[1]).toMatchObject({ refused: 'named twice in the seed' })
  })

  it('finishes a run that stopped after the retirement: insert, point, log', () => {
    expect(planRedescribe([subject({ status: 'retired' })], [stoppedByScript], [entry()])[0])
      .toMatchObject({ writes: ['insert', 'point', 'log'], successorId: null })
  })

  it('never brings back a subject a member stopped, or one the record cannot say who stopped', () => {
    const byUser = { ...stoppedByScript, actor_kind: 'user', changed_at: '2026-10-15T09:00:00Z' }
    expect(planRedescribe([subject({ status: 'retired' })], [byUser], [entry()])[0])
      .toMatchObject({ refused: expect.stringMatching(/logged as "user", not by this script/) })
    expect(planRedescribe([subject({ status: 'retired' })], [], [entry()])[0])
      .toMatchObject({ refused: expect.stringMatching(/does not show who stopped it/) })
    // The newest retirement row decides.
    expect(retiredBy([byUser, stoppedByScript], 'old')).toBe('user')
    expect(retiredBy([stoppedByScript, logRow, { after: { id: 'old', status: 'active' }, actor_kind: 'user' }], 'old')).toBe('script')
  })

  it('finishes a run that stopped after the insert: point, and the log only if it is missing', () => {
    const stopped = [subject({ status: 'retired' }), successor()]
    expect(planRedescribe(stopped, [], [entry()])[0]).toMatchObject({ writes: ['point', 'log'], successorId: 'new' })
    expect(planRedescribe(stopped, [logRow], [entry()])[0]).toMatchObject({ writes: ['point'], successorId: 'new' })
  })

  it('plans nothing for a finished subject, and only the log where that is all that is missing', () => {
    const done = [subject({ status: 'retired', superseded_by: 'new' }), successor()]
    expect(planRedescribe(done, [logRow], [entry()])[0]).toMatchObject({ writes: [], successorId: 'new' })
    expect(planRedescribe(done, [], [entry()])[0]).toMatchObject({ writes: ['log'], successorId: 'new' })
  })

  it('refuses a stopped subject replaced by other words, or by a stopped subject', () => {
    expect(planRedescribe([subject({ status: 'retired', superseded_by: 'new' }), successor({ description: 'Other.' })], [], [entry()])[0])
      .toMatchObject({ refused: 'it was replaced by a subject with other words' })
    expect(planRedescribe([subject({ status: 'retired', superseded_by: 'new' }), successor({ status: 'retired' })], [], [entry()])[0])
      .toMatchObject({ refused: expect.stringMatching(/stopped too/) })
    expect(planRedescribe([subject({ status: 'retired' }), successor({ description: 'Other.' })], [], [entry()])[0])
      .toMatchObject({ refused: expect.stringMatching(/other words/) })
  })
})

describe('strandedMoves', () => {
  const move = (subject_id: string | null, id = 'm1', status = 'active') => ({ id, subject_id, status })

  it('names every move, of any status, on a subject this run would stop', () => {
    const plans = planRedescribe([subject()], [], [entry()])
    expect(strandedMoves(plans, [move('old'), move('old', 'm2', 'done'), move('other', 'm3'), move(null, 'm4')]).map((m) => m.id))
      .toEqual(['m1', 'm2'])
  })

  it('never blocks finishing a subject an earlier run already stopped, nor a refused one', () => {
    const stopped = planRedescribe([subject({ status: 'retired' })], [stoppedByScript], [entry()])
    expect(stopped[0]).toMatchObject({ writes: ['insert', 'point', 'log'] })
    expect(strandedMoves(stopped, [move('old')])).toEqual([])
    const refused = planRedescribe([subject({ description: 'Something else.' })], [], [entry()])
    expect(strandedMoves(refused, [move('old')])).toEqual([])
  })
})

describe('the successor and its record', () => {
  it('keeps the name, origin and source, is born counted, and names no person', () => {
    const row = successorRow(subject(), { description: ` ${NEW_WORDS} ` })
    expect(row).toEqual({
      client_id: 'c1', name: 'Look & style', description: NEW_WORDS,
      origin: 'category_theme', source_ref: 'theme-1', status: 'active',
    })
    expect(row).not.toHaveProperty('created_by')
  })

  it('logs both descriptions under the command, on the subjects surface, in nameSubject\'s shape', () => {
    const actor = scriptActor('scripts/subject-redescribe.ts --client c1 --seed <file> --apply')
    const change = redescribeChange(subject(), 'new', entry(), actor)
    expect(change).toMatchObject({
      clientId: 'c1', surface: 'subjects', field: 'subjects', actor,
      before: { id: 'old', name: 'Look & style', description: OLD_WORDS },
      after: { id: 'new', name: 'Look & style', description: NEW_WORDS, origin: 'category_theme', supersedes: 'old' },
    })
    expect(redescribeLogged([{ after: change.after }], 'new', 'old')).toBe(true)
    expect(redescribeLogged([{ after: { id: 'new' } }, { after: null }], 'new', 'old')).toBe(false)
  })

  it('says it in the record with no figure, no dash and no "comments"', () => {
    const note = redescribeNote('Look & style')
    expect(note).not.toMatch(/\d|—|–|comments/i)
    // The step itself closes the old line's open months: never "months
    // already closed stay with the old ones".
    expect(note).not.toMatch(/already closed|months/i)
    expect(note).toBe('Reworded "Look & style" to say more exactly what belongs in it, and started a new count under the new words. What it counted under the old words, up to today, is kept unchanged and is no longer shown.')
  })
})

describe('the Össur seed', () => {
  const seed = OSSUR_SUBJECTS

  it('re-words five subjects and leaves Cost & access as it is', () => {
    expect(seed.subjects.map((s) => s.name)).toEqual([
      'Choosing the right device', 'Community & encouragement', 'Fit & comfort', 'Function & movement', 'Look & style',
    ])
    expect(new Set(seed.subjects.map((s) => s.id)).size).toBe(5)
  })

  it('stores: every description fits, changes something, and carries no dash a client would see', () => {
    for (const s of seed.subjects) {
      expect(descriptionProblem(s.description, s.from), s.name).toBeNull()
      expect(s.description, s.name).not.toMatch(/[—–]/)
      expect(s.description, s.name).toMatch(/^Comments about /)
    }
  })

  // The phrase vector is the name and the part before "excluding" (the judge
  // reads all of it). Pinned byte for byte, as types.test.ts pins Sealand's,
  // because these are the inputs the 14 Oct offline measure embedded: a change
  // to the gloss rule that moved one would move what was measured.
  it('keeps what does not belong out of the phrase vector', () => {
    expect(seed.subjects.map((s) => subjectEmbedInput(s))).toEqual([
      'Choosing the right device. Weighing one prosthetic against another before choosing: one knee, foot or hand against another, microprocessor against mechanical, a blade against an everyday foot, and picking or changing prosthetist or clinic.',
      'Community & encouragement. People encouraging and supporting someone: praise for their courage, strength or positive attitude, messages of support and blessings, and people sharing their own story to lift others.',
      'Fit & comfort. How a prosthetic fits and feels on the body: socket and liner fit, fit changing over time, length, pressure, pain, sores and skin irritation, and whether it is comfortable to wear all day.',
      'Function & movement. How people move and what they can do with a prosthetic: walking, running, sport and dance, stairs, slopes and rough ground, balance, how natural the movement feels, and what powered and bionic parts can and cannot do.',
      'Look & style. How a prosthetic is decorated and shown: colours, covers, paint and finishes, patterns, tattoos, realistic skin tones, and showing it off or hiding it.',
    ])
    for (const s of seed.subjects) expect(subjectPositiveGloss(s.description), s.name).not.toMatch(/excluding|amputee|limb loss|wanting/i)
  })
})

// A SUCCESSOR OF A SUCCESSOR (14 Oct, the second Össur seed). The first seed
// retired `old` and made `new`; the second re-describes `new`. The plan reads
// only what the database holds, so the chain needs no special case: `old` is
// retired, so it is neither "another live subject of its name" nor touched,
// and each guard (the words, the moves, who stopped it) is asked of `new`.
describe('a successor re-described again', () => {
  const LIMB_WORDS = 'Comments about how a prosthetic limb is decorated and shown: colours and covers, excluding how it works.'
  const first = subject({ status: 'retired', superseded_by: 'new' })
  const second = (over: Partial<RedescribeSubject> = {}) => successor(over)
  const third = (over: Partial<RedescribeSubject> = {}) => subject({ id: 'newer', description: LIMB_WORDS, ...over })
  const again = (over: Partial<Redescription> = {}): Redescription => ({ id: 'new', name: 'Look & style', from: NEW_WORDS, description: LIMB_WORDS, ...over })
  const stoppedNew = { after: { id: 'new', name: 'Look & style', status: 'retired', superseded_by: null }, actor_kind: 'script', changed_at: '2026-10-14T16:00:00Z' }
  const firstLog = { after: { id: 'new', supersedes: 'old' } }
  const secondLog = { after: { id: 'newer', supersedes: 'new' } }

  it('plans the full step on the successor, with the first one stopped and pointed', () => {
    expect(planRedescribe([first, second()], [stoppedByScript, firstLog], [again()]))
      .toEqual([{ id: 'new', name: 'Look & style', writes: ['retire', 'insert', 'point', 'log'], successorId: null }])
  })

  it('holds the from guard against the successor\'s words, not the first subject\'s', () => {
    expect(planRedescribe([first, second()], [], [again({ from: OLD_WORDS })])[0])
      .toMatchObject({ refused: 'its description today is not the one the seed was written against' })
  })

  it('finishes a stopped run at each step, and never reads the first line\'s rows as its own', () => {
    // Stopped after the retirement: the first seed's log row and the old
    // subject's own retirement do not count as this one's.
    expect(planRedescribe([first, second({ status: 'retired' })], [stoppedByScript, firstLog, stoppedNew], [again()])[0])
      .toMatchObject({ writes: ['insert', 'point', 'log'], successorId: null })
    // Stopped after the insert.
    expect(planRedescribe([first, second({ status: 'retired' }), third()], [firstLog], [again()])[0])
      .toMatchObject({ writes: ['point', 'log'], successorId: 'newer' })
    // Pointed: only the missing log, then nothing.
    const done = [first, second({ status: 'retired', superseded_by: 'newer' }), third()]
    expect(planRedescribe(done, [firstLog], [again()])[0]).toMatchObject({ writes: ['log'], successorId: 'newer' })
    expect(planRedescribe(done, [firstLog, secondLog], [again()])[0]).toMatchObject({ writes: [], successorId: 'newer' })
    expect(redescribeLogged([firstLog], 'newer', 'new')).toBe(false)
  })

  it('needs the record to show this script stopped the successor, not the first subject', () => {
    expect(planRedescribe([first, second({ status: 'retired' })], [stoppedByScript, firstLog], [again()])[0])
      .toMatchObject({ refused: expect.stringMatching(/does not show who stopped it/) })
  })

  it('names the moves on the successor it would stop, not the first subject\'s', () => {
    const plans = planRedescribe([first, second()], [], [again()])
    const moves = [{ id: 'm-old', subject_id: 'old', status: 'active' }, { id: 'm-new', subject_id: 'new', status: 'active' }]
    expect(strandedMoves(plans, moves).map((m) => m.id)).toEqual(['m-new'])
  })
})

describe('the second Össur seed (limb)', () => {
  const seed = OSSUR_SUBJECTS_2
  const firstWords = new Map(OSSUR_SUBJECTS.subjects.map((s) => [s.name, s.description]))

  it('re-words the five successors from the words the first seed gave them, and leaves Cost & access alone', () => {
    expect(seed.clientId).toBe(OSSUR_SUBJECTS.clientId)
    expect(seed.subjects.map((s) => s.name)).toEqual(OSSUR_SUBJECTS.subjects.map((s) => s.name))
    expect(new Set(seed.subjects.map((s) => s.id)).size).toBe(5)
    for (const s of seed.subjects) expect(s.from, s.name).toBe(firstWords.get(s.name))
    // None of the first seed's ids: those subjects are retired.
    for (const s of seed.subjects) expect(OSSUR_SUBJECTS.subjects.map((x) => x.id)).not.toContain(s.id)
  })

  it('adds "limb" and changes nothing else', () => {
    // What each one inserts: taking it out gives the first seed's words back.
    const inserted: Record<string, string> = {
      'Choosing the right device': ' limb',
      'Community & encouragement': ' with limb loss',
      'Fit & comfort': ' limb',
      'Function & movement': ' limb',
      'Look & style': ' limb',
    }
    for (const s of seed.subjects) {
      expect(descriptionProblem(s.description, s.from), s.name).toBeNull()
      expect(s.description, s.name).not.toMatch(/[—–]/)
      const add = inserted[s.name]
      const at = s.description.indexOf(add)
      expect(at, s.name).toBeGreaterThan(0)
      expect(s.description.slice(0, at) + s.description.slice(at + add.length), s.name).toBe(s.from)
    }
  })
})
