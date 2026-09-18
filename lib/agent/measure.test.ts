import { describe, expect, it, vi } from 'vitest'

import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import type { MonthPoint, MonthSeries } from '../reading/series'
import {
  DECLINED_WHY,
  FALLBACK_NOTE,
  INTERPRETATION_CAVEAT,
  NOT_ANSWERED_HREF,
  POINT_REMOVED_NOTE,
  POINT_REPLACED_NOTE,
  TOO_FEW,
  answerFallback,
  loadNotAnswered,
  magnitudeWords,
  measureAnswer,
  askAllowList,
  groundedFallback,
  notAnsweredFrom,
  scrubAnswer,
  scrubThreadAnswer,
} from './measure'

const MONTH = '2026-09-01'

function point(month: string, k: number | null, videos: number | null, over: Partial<MonthPoint> = {}): MonthPoint {
  return {
    month,
    state: 'frozen',
    videos,
    comments: videos == null ? null : videos * 8,
    k,
    kComments: k == null ? null : k * 8,
    pct: k != null && videos ? Math.round((k / videos) * 1000) / 10 : null,
    audience: INDUSTRY_AUDIENCE,
    status: 'frozen',
    origin: 'live',
    readAt: '2026-09-18T00:00:00.000Z',
    runId: 'run-1',
    frozenAt: null,
    clusteringKey: 'cl-1',
    labels: [],
    ...over,
  }
}

/** A three-month category axis that climbs: 15% → 19% → 23% of ~1,400 videos,
 *  one clustering, no thin month — the shape `directionWord` was written for. */
function climbing(over: Partial<MonthSeries> = {}): MonthSeries {
  return {
    audience: INDUSTRY_AUDIENCE,
    names: [INDUSTRY_AUDIENCE],
    objectId: 'reg-1',
    objectLabel: 'Will it survive a wet commute',
    points: [
      point('2026-07-01', 210, 1400),
      point('2026-08-01', 276, 1455),
      point(MONTH, 320, 1388),
    ],
    notes: [],
    firstReadable: '2026-07-01',
    substrate: 'seeded',
    ...over,
  }
}

/** The client's own side of the same theme: real, and far under the floor. */
function ownSide(): MonthSeries {
  const at = (month: string, k: number, n: number): MonthPoint =>
    point(month, k, n, { audience: CLIENT_AUDIENCE })
  return {
    audience: CLIENT_AUDIENCE,
    names: [CLIENT_AUDIENCE],
    objectId: 'reg-1',
    objectLabel: 'Will it survive a wet commute',
    points: [at('2026-07-01', 21, 79), at('2026-08-01', 25, 91), at(MONTH, 26, 84)],
    notes: [],
    firstReadable: null,
    substrate: 'seeded',
  }
}

const findings = [{ findingId: 'G1', registryIds: ['reg-1'] }]

describe('measureAnswer', () => {
  it('earns a direction over three clean readings when agent.movement is on', () => {
    const m = measureAnswer({ findings, series: [climbing()], month: MONTH, directionWords: true })
    expect(m.findings).toHaveLength(1)
    const f = m.findings[0]
    expect(f.direction).toBe('growing')
    // The word is ON the verdict, not only beside it — that is what licenses a
    // sentence through dropUnverdictedDirection.
    expect(f.verdict?.direction).toBe('growing')
    expect(f.value).toEqual({ k: 320, n: 1388 })
    expect(f.audience).toBe(INDUSTRY_AUDIENCE)
    expect(f.series.map((p) => p.month)).toEqual(['2026-07-01', '2026-08-01', MONTH])
    expect(f.series[2]).toEqual({ month: MONTH, k: 320, n: 1388, pct: 23.1 })
  })

  it('earns none from the same series with the flag off, and keeps the verdict', () => {
    const m = measureAnswer({ findings, series: [climbing()], month: MONTH, directionWords: false })
    const f = m.findings[0]
    expect(f.direction).toBeNull()
    expect(f.verdict?.direction).toBeNull()
    // The banded comparison survives the gate: a verdict is not a direction.
    expect(f.verdict?.state).toBe('moved')
    expect(f.verdict?.changePts).not.toBeNull()
    expect(f.verdict?.bandPts).not.toBeNull()
  })

  it('withholds the word where the current month is thin, and says so on the verdict', () => {
    const thin = climbing()
    thin.points[2] = point(MONTH, 320, 1388, { labels: [{ kind: 'thin', text: 'thin' } as never] })
    const m = measureAnswer({ findings, series: [thin], month: MONTH, directionWords: true })
    expect(m.findings[0].direction).toBeNull()
    expect(m.findings[0].verdict?.flags).toContain('thin')
  })

  it('draws the side with the n and makes the client’s own side the caveat', () => {
    const m = measureAnswer({
      findings,
      series: [climbing(), ownSide()],
      month: MONTH,
      directionWords: true,
      ownAudience: CLIENT_AUDIENCE,
      hasJudgement: true,
    })
    expect(m.findings[0].audience).toBe(INDUSTRY_AUDIENCE)
    expect(m.caveats[0]).toBe(INTERPRETATION_CAVEAT)
    expect(m.caveats[1]).toBe(
      `Your own side of Will it survive a wet commute is 26 of 84 videos in September — ${TOO_FEW}.`,
    )
  })

  it('publishes every figure by token, with its unit, and nothing else', () => {
    const m = measureAnswer({ findings, series: [climbing()], month: MONTH, directionWords: true })
    expect(Object.keys(m.figures).sort()).toEqual([
      'f1_band', 'f1_change', 'f1_k', 'f1_n', 'f1_pct', 'f1_prev_k', 'f1_prev_n', 'f1_prev_pct',
    ])
    expect(m.figures.f1_k).toEqual({ value: 320, unit: 'videos', label: 'videos naming Will it survive a wet commute in September' })
    expect(m.figures.f1_pct.unit).toBe('pct')
    expect(m.figures.f1_band.unit).toBe('pts')
  })

  it('keeps an unreadable month on the axis as a gap, never drops it', () => {
    // August below the floor. Dropping it joins July to September and misdates
    // everything after the gap — `monthAxis`' own warning.
    const gapped = climbing({
      points: [
        point('2026-07-01', 210, 1400),
        point('2026-08-01', null, null, { state: 'below_floor', status: null }),
        point(MONTH, 320, 1388),
      ],
    })
    const f = measureAnswer({ findings, series: [gapped], month: MONTH, directionWords: true }).findings[0]
    expect(f.series.map((p) => p.month)).toEqual(['2026-07-01', '2026-08-01', MONTH])
    expect(f.series[1]).toEqual({ month: '2026-08-01', k: null, n: null, pct: null })
    // And a month after the one measured is not on this chart at all.
    const ahead = climbing({ points: [...climbing().points, point('2026-10-01', 400, 1500)] })
    expect(
      measureAnswer({ findings, series: [ahead], month: MONTH, directionWords: true }).findings[0].series.at(-1)!.month,
    ).toBe(MONTH)
  })

  it('earns the word from the months up to the one being measured, never after it', () => {
    // Four months: the last three climb, the three ending in August do not.
    const withAugust = climbing({
      points: [
        point('2026-06-01', 300, 1400),
        point('2026-07-01', 210, 1400),
        point('2026-08-01', 276, 1455),
        point(MONTH, 320, 1388),
      ],
    })
    expect(measureAnswer({ findings, series: [withAugust], month: MONTH, directionWords: true }).findings[0].direction)
      .toBe('growing')
    // Measured AT August, the run is June–August and it does not climb.
    const atAugust = measureAnswer({ findings, series: [withAugust], month: '2026-08-01', directionWords: true })
    expect(atAugust.findings[0].value).toEqual({ k: 276, n: 1455 })
    expect(atAugust.findings[0].direction).not.toBe('growing')
  })

  it('picks the theme deliberately when a finding rests on several, not by read order', () => {
    // Same audience, same denominator: `videos` and the audience string tie, so
    // before this the winner was whatever order the loader returned.
    const other = (k: number): MonthSeries => ({
      ...climbing(),
      objectId: 'reg-2',
      objectLabel: 'The zip',
      points: [point('2026-07-01', k, 1400), point('2026-08-01', k, 1455), point(MONTH, k, 1388)],
    })
    const both = [{ findingId: 'G1', registryIds: ['reg-1', 'reg-2'] }]
    // The bigger numerator wins: the month says more about it.
    const bigger = measureAnswer({ findings: both, series: [climbing(), other(400)], month: MONTH, directionWords: true })
    expect(bigger.findings[0].label).toBe('The zip')
    // Reversed read order, same answer.
    const reversed = measureAnswer({ findings: both, series: [other(400), climbing()], month: MONTH, directionWords: true })
    expect(reversed.findings[0].label).toBe('The zip')
    // Numerators equal too: the order the ANSWER cited them in decides, and
    // reversing the citation order reverses the choice.
    const tied = [{ findingId: 'G1', registryIds: ['reg-2', 'reg-1'] }]
    expect(
      measureAnswer({ findings: tied, series: [climbing(), other(320)], month: MONTH, directionWords: true })
        .findings[0].label,
    ).toBe('The zip')
    expect(
      measureAnswer({ findings: both, series: [climbing(), other(320)], month: MONTH, directionWords: true })
        .findings[0].label,
    ).toBe('Will it survive a wet commute')
  })

  it('names the month every figure on it is a figure of', () => {
    expect(measureAnswer({ findings, series: [climbing()], month: MONTH, directionWords: true }).month).toBe(MONTH)
    expect(measureAnswer({ findings, series: [climbing()], month: '2026-08-14', directionWords: true }).month)
      .toBe('2026-08-01')
  })

  it('measures nothing when the month carries no row for the topic', () => {
    const empty = climbing({ points: [point('2026-07-01', 210, 1400)] })
    const m = measureAnswer({ findings, series: [empty], month: MONTH, directionWords: true })
    expect(m.findings).toEqual([])
    expect(m.verdicts).toEqual([])
    expect(m.figures).toEqual({})
  })
})

describe('scrubAnswer', () => {
  const measure = measureAnswer({
    findings,
    series: [climbing()],
    month: MONTH,
    directionWords: true,
  })

  it('drops the sentence the model typed a digit into and keeps the rest', () => {
    const raw = 'Durability is the question underneath the category. It came up in 305 of 1,388 videos this month. No tracked brand answers it on camera.'
    const out = scrubAnswer(raw, measure)
    expect(out.text).toBe('Durability is the question underneath the category. No tracked brand answers it on camera.')
    expect(out.droppedDigits).toBe(1)
    expect(out.leaked).toBe(true)
  })

  it('keeps a figure the caller’s table holds, as its token', () => {
    const out = scrubAnswer('Durability reached [[f1_k]] videos.', measure)
    expect(out.text).toBe('Durability reached [[f1_k]] videos.')
    expect(out.dropped).toBe(0)
  })

  it('drops a token the table does not hold', () => {
    const out = scrubAnswer('Durability reached [[f9_k]] videos.', measure)
    expect(out.text).toBe('')
    expect(out.dropped).toBe(1)
  })

  it('licenses a direction word only for the object a verdict earned one for', () => {
    const raw = 'Will it survive a wet commute is growing. Price talk is growing.'
    const out = scrubAnswer(raw, measure)
    expect(out.text).toBe('Will it survive a wet commute is growing.')
    expect(out.droppedDirection).toBe(1)
  })

  it('licenses nothing when the flag is off', () => {
    const off = measureAnswer({ findings, series: [climbing()], month: MONTH, directionWords: false })
    const out = scrubAnswer('Will it survive a wet commute is growing.', off)
    expect(out.text).toBe('')
    expect(out.droppedDirection).toBe(1)
  })

  it('refuses a number inside the model’s own quotation marks', () => {
    const out = scrubAnswer('People say “it lasted 3 winters” about the seams.', measure)
    expect(out.text).toBe('')
    expect(out.droppedDigits).toBe(1)
  })
})

describe('scrubThreadAnswer', () => {
  const measure = measureAnswer({ findings, series: [climbing()], month: MONTH, directionWords: true })

  it('scrubs the prose nodes and leaves a quote’s own node whole, digits and all', () => {
    const answer = {
      answer: 'Durability leads. It ran at 22% this month.',
      grounded: [
        {
          text: 'The wet-commute question is the one nobody answers. It is in 130 of 1,388 videos.',
          quotes: [{ text: 'Three winters on the bike and the seams are still perfect. The zip, less so — 2 of them.' }],
        },
      ],
    }
    const out = scrubThreadAnswer(answer, measure)
    expect(out.answer).toBe('Durability leads.')
    expect(out.grounded[0].text).toBe('The wet-commute question is the one nobody answers.')
    // The commenter's own words are a sibling node and are never handed to the
    // scrubber: the digit in them survives.
    expect(out.grounded[0].quotes[0].text).toContain('2 of them')
    expect(out.scrub).toEqual({ dropped: 2, droppedDigits: 2, droppedDirection: 0, magnitude: 0, leaked: true })
  })

  it('never leaves an evidence card blank: an emptied point gets the reading', () => {
    // "3D printing" is the production case — FIGURE_RE matches the 3, the
    // allow-list's ordinal rule drops that shape, and the sentence goes.
    const answer = {
      answer: 'Durability leads.',
      grounded: [{ text: 'There is clear openness to innovation through 3D printing.', quotes: [] }],
    }
    const out = scrubThreadAnswer(answer, measure, { keyOf: () => 'G1' })
    expect(out.grounded[0].text).not.toBe('')
    expect(out.grounded[0].text.startsWith(POINT_REPLACED_NOTE)).toBe(true)
    // The reading itself, with its own denominator.
    expect(out.grounded[0].text).toContain('320 of 1,388 videos')
    expect(out.grounded[0].replaced).toBe(true)
    // A point that survived is not marked.
    expect(scrubThreadAnswer({ answer: 'x', grounded: [{ text: 'Nothing numeric here.' }] }, measure).grounded[0].replaced)
      .toBeUndefined()
  })

  it('says the sentence went where there is no reading to put in its place', () => {
    const nothing = measureAnswer({ findings: [], series: [], month: MONTH, directionWords: true })
    const out = scrubThreadAnswer(
      { answer: 'x', grounded: [{ text: 'It came up in 305 of 1,388 videos.' }] },
      nothing,
      { keyOf: () => '0:G1' },
    )
    expect(out.grounded[0].text).toBe(POINT_REMOVED_NOTE)
    expect(groundedFallback(null, '0:G1')).toBe(POINT_REMOVED_NOTE)
  })

  it('keeps a sentence naming a product whose name carries a digit', () => {
    // Ossur's own catalogue is the case the allow-list was written for.
    const raw = 'The 3R78 knee is what people compare against.'
    expect(scrubAnswer(raw, measure).text).toBe('')
    const allow = askAllowList(['Which knee do people compare the 3R78 against?'])
    expect(allow).toContain('3R78')
    expect(scrubAnswer(raw, measure, allow).text).toBe(raw)
    // A figure is still a figure beside an allowed name.
    expect(scrubAnswer('The 3R78 came up in 305 videos.', measure, allow).text).toBe('')
    // WHY THE ANSWER'S OWN PROSE IS NOT A SOURCE: "22pts" is shaped like a
    // name and would be mined as one, so a model allowed to seed its own
    // allow-list could launder a figure it typed. The loader mines the
    // client's questions and the theme labels only.
    expect(askAllowList(['22pts of change'])).toContain('22pts')
  })

  it('keeps a magnitude word and counts it, rather than word-deleting it', () => {
    // A word-delete would print "The of commenters mention fit." — broken
    // English with the leak buried in ai_call_log.
    const out = scrubThreadAnswer(
      { answer: 'The majority of commenters mention fit.', grounded: [] },
      measure,
    )
    expect(out.answer).toBe('The majority of commenters mention fit.')
    expect(out.scrub.magnitude).toBe(1)
    // And never a word inside somebody else's sentence.
    expect(magnitudeWords('They said \u201cthe vast majority of it held up\u201d.')).toBe(0)
  })
})

describe('answerFallback', () => {
  it('writes the reading itself, and says that it did', () => {
    const m = measureAnswer({ findings, series: [climbing()], month: MONTH, directionWords: true })
    const text = answerFallback(m) as string
    expect(text.startsWith(FALLBACK_NOTE)).toBe(true)
    expect(text).toContain('320 of 1,388 videos in the category')
    expect(text).toContain('moved (')
  })

  it('writes nothing when nothing was measured', () => {
    expect(answerFallback({ month: MONTH, findings: [], verdicts: [], figures: {}, caveats: [] })).toBeNull()
  })
})

describe('notAnsweredFrom', () => {
  const at = (n: number): string => `2026-09-0${n}T09:00:00.000Z`
  const rows = [
    { role: 'user', content: 'What do people complain about with Freitag?', outcome: null, result: null, created_at: at(1) },
    { role: 'agent', content: '…', outcome: 'answered', result: {}, created_at: at(1) },
    { role: 'user', content: 'Did our August ad spend move anything?', outcome: null, result: null, created_at: at(2) },
    { role: 'agent', content: '…', outcome: 'partial', result: { notice: 'This asks about your own numbers' }, created_at: at(2) },
    { role: 'user', content: 'Anything compared against Poler?', outcome: null, result: null, created_at: at(3) },
    { role: 'agent', content: '…', outcome: 'silent', result: {}, created_at: at(3) },
  ]

  it('counts the wall-clock month’s questions and names every refusal', () => {
    const n = notAnsweredFrom(rows, '2026-09-01T00:00:00.000Z', 40)
    expect(n.month).toBe('2026-09-01')
    expect(n.asked).toBe(3)
    expect(n.cap).toBe(40)
    expect(n.declined).toEqual([
      { question: 'Did our August ad spend move anything?', why: DECLINED_WHY.out_of_corpus },
      { question: 'Anything compared against Poler?', why: DECLINED_WHY.silent },
    ])
    expect(n.line).toBe('3 of 40 questions asked this month. 2 of them could not be answered from the conversation.')
    expect(n.href).toBe(NOT_ANSWERED_HREF)
  })

  it('says so when every question was answered', () => {
    const n = notAnsweredFrom(rows.slice(0, 2), '2026-09-01T00:00:00.000Z', 40)
    expect(n.declined).toEqual([])
    expect(n.line).toBe('1 of 40 questions asked this month. Every one was answered from the conversation.')
  })

  it('reads at the cap without inventing room', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      role: 'user', content: `q${i}`, outcome: null, result: null, created_at: at(1),
    }))
    const n = notAnsweredFrom(many, '2026-09-01T00:00:00.000Z', 40)
    expect(n.asked).toBe(40)
    expect(n.line.startsWith('40 of 40 questions asked this month.')).toBe(true)
  })

  it('counts an unanswered question as asked — it was, and it was paid for', () => {
    const n = notAnsweredFrom(
      [{ role: 'user', content: 'in flight', outcome: null, result: null, created_at: at(4) }],
      '2026-09-01T00:00:00.000Z',
      40,
    )
    expect(n.asked).toBe(1)
    expect(n.declined).toEqual([])
  })
})

describe('loadNotAnswered', () => {
  /** The chain `loadNotAnswered` walks, ending in the result it is handed. */
  const scopeOf = (res: { data: unknown; error: { message: string } | null }) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.gte = () => q
    q.order = () => Promise.resolve(res)
    return { supabase: { from: () => q }, clientId: 'c1' } as unknown as Parameters<typeof loadNotAnswered>[0]
  }

  it('counts the month it read', async () => {
    const at = '2026-09-02T09:00:00.000Z'
    const n = await loadNotAnswered(
      scopeOf({
        data: [
          { role: 'user', content: 'q', outcome: null, result: null, created_at: at },
          { role: 'agent', content: 'a', outcome: 'silent', result: {}, created_at: at },
        ],
        error: null,
      }),
      new Date('2026-09-18T00:00:00.000Z'),
    )
    expect(n?.asked).toBe(1)
    expect(n?.declined).toHaveLength(1)
  })

  it('is null when the read failed — a count that did not read is not a zero', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => {})
    const n = await loadNotAnswered(
      scopeOf({ data: null, error: { message: 'schema cache' } }),
      new Date('2026-09-18T00:00:00.000Z'),
    )
    expect(n).toBeNull()
    // And it says so where a failure can surface at all.
    expect(said).toHaveBeenCalled()
    said.mockRestore()
  })
})
