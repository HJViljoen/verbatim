import { describe, expect, it } from 'vitest'

import { briefFixture } from '../../../components/briefs/fixture'
import { collectQuoteRefs } from '../../renderables/quotes-freeze'
import { printedLines, printedPages, summarySentences } from './inshort'
import { checkSavedSet, savedSetOf, type SavedFile } from './saved'
import { briefLedgerRow, briefSnapshotRow } from './store'
import { BRIEF_ROLES, type BriefRole, type MonthlyBriefData } from './types'

// A dry build saved and stored as it is (`--write --from`): what the dry
// build saves, every check `--from` makes before it stores, and the rows it
// stores. Pure: no database, no browser, no model.

const CLIENT = '00000000-0000-0000-0000-00000000000b'
const RUN = '11111111-2222-3333-4444-555555555555'
const SEP = '2026-09-01'
const EXPECT = { clientId: CLIENT, month: SEP, runId: RUN, company: 'Acme' }

/** A fixture brief as a dry build composes it: quotes as refs (`text: ''`,
 *  its language kept), the words beside it. */
function composed(role: BriefRole): { data: MonthlyBriefData; texts: SavedFile['texts'] } {
  const texts: SavedFile['texts'] = {}
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk)
    if (!x || typeof x !== 'object') return x
    const o = x as Record<string, unknown>
    if (typeof o.ref === 'string' && typeof o.text === 'string' && 'ownPost' in o) {
      texts[o.ref] = { text: o.text, english: (o.english as string | undefined) ?? null, lang: (o.lang as string | null | undefined) ?? null }
      const { english: _e, ...rest } = o
      return { ...rest, text: '' }
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)]))
  }
  return { data: walk(briefFixture(role)) as MonthlyBriefData, texts }
}

/** The four fixture briefs as one set: each finding its own idea, and each
 *  brief's "Also this month" the other briefs' findings. */
function fixtureSet(edit: (b: Record<BriefRole, { data: MonthlyBriefData; texts: SavedFile['texts'] }>) => void = () => {}) {
  const b = Object.fromEntries(BRIEF_ROLES.map((r) => [r, composed(r)])) as Record<BriefRole, { data: MonthlyBriefData; texts: SavedFile['texts'] }>
  for (const r of BRIEF_ROLES) b[r].data.findings = b[r].data.findings.map((f, k) => ({ ...f, ideaId: `${r}-${k + 1}` }))
  edit(b)
  const ideas = BRIEF_ROLES.flatMap((r) => b[r].data.findings.map((f) => ({ id: f.ideaId, headline: f.headline, home: r })))
  for (const r of BRIEF_ROLES) b[r].data.inShort.also = ideas.filter((x) => x.home !== r).map((x) => ({ headline: x.headline, brief: x.home }))
  const words = (ref: string) => {
    for (const r of BRIEF_ROLES) {
      const w = b[r].texts[ref]
      if (w) return { text: w.text, english: w.english ?? null, lang: w.lang ?? null }
    }
    return null
  }
  const saved = savedSetOf({
    clientId: CLIENT, company: 'Acme', month: SEP, runId: RUN, asOf: '2026-10-12T08:00:00.000Z', costUsd: 2.41,
    costByRole: { sales: 0.6025, marketing: 0.6025, content: 0.6025, leadership: 0.6025 },
    ideas,
    briefs: BRIEF_ROLES.map((r) => ({ data: b[r].data, texts: b[r].texts, printed: { read: printedLines(printedPages(b[r].data, words)), kept: summarySentences(b[r].data.inShort.summary) } })),
  })
  // Through JSON, as the files are written and read back.
  return JSON.parse(JSON.stringify({ manifest: saved.manifest, files: saved.files })) as { manifest: ReturnType<typeof savedSetOf>['manifest']; files: Record<BriefRole, SavedFile> }
}

const problems = (x: { manifest: unknown; files: Partial<Record<BriefRole, unknown>> }, expect = EXPECT) => checkSavedSet(x, expect).problems

describe('a dry build saved for --from', () => {
  it('saves what --from stores by, and round-trips: every check passes on what it saved', () => {
    const x = fixtureSet()
    expect(x.manifest).toMatchObject({ kind: 'monthly_brief_set', clientId: CLIENT, runId: RUN, month: SEP, costUsd: 2.41 })
    for (const r of BRIEF_ROLES) {
      expect(x.manifest.roles[r]).toMatchObject({ status: 'ready', file: `${r}.json`, costUsd: 0.6025 })
      expect(x.manifest.roles[r].evidenceIds.sort()).toEqual(collectQuoteRefs(x.files[r].data).sort())
      expect(x.manifest.roles[r].pages[0]).toBe('Cover')
    }
    const out = checkSavedSet(x, EXPECT)
    expect(out.problems).toEqual([])
    expect(out.set?.briefs.map((d) => d.role)).toEqual([...BRIEF_ROLES])
    expect(out.set?.costUsd).toEqual({ sales: 0.6025, marketing: 0.6025, content: 0.6025, leadership: 0.6025 })
  })

  it('saves a thin role too, with what it held, and never draws it', () => {
    const x = fixtureSet((b) => { b.content.data.findings = []; b.content.data.sections = []; b.content.data.held = [{ what: 'content.questions: one', reason: 'thin' }] })
    expect(x.manifest.roles.content).toMatchObject({ status: 'thin', evidenceIds: [], pages: [] })
    expect(x.files.content.texts).toEqual({})
    const out = checkSavedSet(x, EXPECT)
    expect(out.problems).toEqual([])
    expect(out.set?.briefs.find((d) => d.role === 'content')?.held).toEqual([{ what: 'content.questions: one', reason: 'thin' }])
  })
})

describe('what --from refuses, storing nothing', () => {
  it('a set that is another client\'s, month\'s, run\'s or company\'s', () => {
    const x = fixtureSet()
    expect(problems(x, { ...EXPECT, clientId: '00000000-0000-0000-0000-00000000000c' })).toEqual([`the saved set is client ${CLIENT}, not 00000000-0000-0000-0000-00000000000c`])
    expect(problems(x, { ...EXPECT, month: '2026-10-01' }).join('\n')).toMatch(/the saved set is the 2026-09 briefs, not 2026-10/)
    expect(problems(x, { ...EXPECT, month: '2026-10-01' }).join('\n')).toMatch(/the Sales brief is about 2026-09, not 2026-10/)
    expect(problems(x, { ...EXPECT, runId: '99999999-2222-3333-4444-555555555555' })[0]).toMatch(/stored under run 11111111/)
    expect(problems(x, { ...EXPECT, company: 'Sealand' }).join('\n')).toMatch(/the Sales brief is written for Acme, not Sealand/)
  })

  it('a brief that does not parse against the stored-brief shape, or is missing, or holds a quote\'s words', () => {
    const extra = fixtureSet()
    ;(extra.files.sales.data as unknown as Record<string, unknown>).draft = true
    expect(problems(extra)[0]).toMatch(/^sales\.json \(the Sales brief\) does not parse against the stored-brief shape: .*draft/)
    const words = fixtureSet()
    ;(words.files.marketing.data.findings[0].quotes[0] as { text: string }).text = 'the words of a comment'
    expect(problems(words)[0]).toMatch(/^marketing\.json \(the Marketing brief\) does not parse.*findings\.0\.quotes\.0\.text/)
    const gone = fixtureSet()
    delete (gone.files as Partial<Record<BriefRole, SavedFile>>).content
    expect(problems(gone)).toEqual(['content.json (the Content brief) does not parse against the stored-brief shape: the file is missing'])
    expect(problems({ manifest: { kind: 'monthly_brief_set' }, files: {} })[0]).toMatch(/^set\.json does not parse/)
  })

  it('a brief whose status, evidence ids or pages are not what the dry build saved', () => {
    const thin = fixtureSet()
    thin.manifest.roles.sales.status = 'thin'
    expect(problems(thin)).toEqual(['the Sales brief was saved thin, and under the current deck it prints'])
    const ids = fixtureSet()
    ids.manifest.roles.leadership.evidenceIds = [...ids.manifest.roles.leadership.evidenceIds.slice(1), 'e:not-it']
    expect(problems(ids)).toEqual(['the Leadership brief\'s evidence ids are not the ones the dry build saved'])
    const pages = fixtureSet()
    pages.manifest.roles.content.pages = pages.manifest.roles.content.pages.slice(0, -1)
    expect(problems(pages)[0]).toMatch(/^the Content brief draws 8 pages under the current deck .*and the dry build drew 7/)
  })

  it('an In short with a sentence the check did not pass, or resting on a line that no longer prints', () => {
    const added = fixtureSet()
    added.files.sales.data.inShort.summary += ' Northpeak wins on price.'
    expect(problems(added)).toEqual(['the Sales brief: its In short has a sentence the In short check did not pass: "Northpeak wins on price."'])
    const read = fixtureSet()
    read.manifest.roles.marketing.inShort.read.push('A line on no page.')
    expect(problems(read)).toEqual(['the Marketing brief: a line the In short check read no longer prints under the current deck: "A line on no page."'])
  })

  it('"Also this month" naming an idea no brief of the set prints', () => {
    const x = fixtureSet()
    x.files.leadership.data.inShort.also.push({ headline: 'An idea nobody printed', brief: 'sales' })
    expect(problems(x).join('\n')).toMatch(/the Leadership brief's "Also this month" names an idea no brief of the set prints/)
  })
})

describe('the rows --from stores, as --write and the pipeline store them', () => {
  it('a snapshot of kind report holding the brief less what only the operator reads, quotes as refs, its refs as evidence ids', () => {
    const x = fixtureSet()
    const d = x.files.sales.data
    const row = briefSnapshotRow(d)
    expect(row.kind).toBe('report')
    expect(row.ref).toEqual({ artefact: 'brief:sales', params: { month: '2026-09', role: 'sales' } })
    expect(row.title).toBe('Sales brief · September 2026')
    expect(row.data.kind).toBe('monthly_brief')
    expect('held' in row.data || 'costUsd' in row.data).toBe(false)
    expect(row.evidenceIds.sort()).toEqual([...x.manifest.roles.sales.evidenceIds].sort())
    const stored = JSON.stringify(row.data)
    for (const w of Object.values(x.files.sales.texts)) expect(stored).not.toContain(w.text.slice(0, 30))
    const quoteTexts: unknown[] = []
    JSON.parse(stored, (_k, v) => { if (v && typeof v === 'object' && typeof v.ref === 'string' && 'ownPost' in v) quoteTexts.push(v.text); return v })
    expect(quoteTexts.length).toBeGreaterThan(0)
    expect(new Set(quoteTexts)).toEqual(new Set(['']))
  })

  it('a ledger row: ready with its snapshot, or thin with why; what it held and what it cost either way', () => {
    const x = fixtureSet((b) => { b.content.data.findings = []; b.content.data.sections = [] })
    const at = { clientId: CLIENT, month: SEP, runId: RUN }
    expect(briefLedgerRow(x.files.sales.data, { ...at, costUsd: 0.60254, snapshotId: 'snap-1' })).toEqual({
      client_id: CLIENT, month: SEP, role: 'sales', run_id: RUN, status: 'ready', snapshot_id: 'snap-1', cost_usd: 0.6025, error: null, held: [],
    })
    expect(briefLedgerRow(x.files.content.data, { ...at, costUsd: 0.6025, snapshotId: 'snap-2' })).toMatchObject({
      role: 'content', status: 'thin', snapshot_id: null, error: 'nothing in it stood: no finding and no section page',
    })
  })
})
