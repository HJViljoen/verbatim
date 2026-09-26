import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { gapBasisLine, gapLine, type Gap } from '@/lib/reading/gap'
import { DirectionWord, leadGap, overviewSubjects, sparkDomain, subjectsMeta } from './subjects'
import { monthlyLineLabel } from '@/lib/pages/overview'
import { calibrationOverviewFixture, overviewFixture, refusedFixture, renamedRivalFixture } from './fixture'
import { monthlySubjectsEmail } from '@/components/blocks/monthly/subjects'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV2 · your subjects', () => {

  // D5 / D11 (Block D wave 3, M4). `directionWord` answers `flat` when three
  // readings exist and do not agree — the ABSENCE of a direction — and "flat"
  // is not a word this product has (MOVEMENT_WORDS carries none). The guard was
  // `if (!direction)`, so a subject with three readable months whose change sat
  // inside its band printed the pill "flat, 3 months" beside a badge reading
  // "no clear change": two non-answers, one dressed as a finding. This node is
  // the shared one — the monthly and weekly emails, Voice and the leadership
  // sheet all print through it.
  it('prints nothing for `flat`, on every mode', () => {
    for (const mode of MODES) {
      expect(render(<DirectionWord direction="flat" mode={mode} />)).toBe('')
      expect(render(<DirectionWord direction="growing" mode={mode} />)).toContain('growing')
    }
  })
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewSubjects.render(data, mode, ctx)))
      }
    }
  })

  it('prints every side as a level with its count', () => {
    const text = renderText(overviewSubjects.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('31.0% 26 of 84')
    expect(text).toContain('44.0% 62 of 142')
    expect(text).toContain('22.0% 305 of 1,388')
  })

  it('bands the category and refuses your own side, without hiding it', () => {
    const text = renderText(overviewSubjects.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('too few to compare') // P0 item 6 / §6 D11 — the badge's one word
    expect(text).toContain('the category column carries the month')
  })

  it('prints a direction word only inside a verdict node', () => {
    const markup = render(overviewSubjects.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('growing, 3rd month')
    // The contract's rule (c) is what proves it: no direction word survives
    // outside a verdict node.
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('says "— not tracked" for a side nothing was read for, never 0%', () => {
    const data = overviewFixture()
    const rows = data.subjects.rows.map((r) => ({ ...r, rival: null }))
    const text = renderText(overviewSubjects.render({ ...data, subjects: { ...data.subjects, rows } }, 'app', ctx))
    expect(text).toContain('not tracked')
  })

  it('offers the proposer’s candidates rather than a blank form', () => {
    const data = overviewFixture()
    const withCandidates = {
      ...data,
      subjects: {
        ...data.subjects,
        state: 'candidates' as const,
        rows: [],
        candidates: [{ name: 'Durability', origin: 'category_theme', because: 'the category raised it in the videos we read' }],
      },
    }
    const text = renderText(overviewSubjects.render(withCandidates, 'app', ctx))
    expect(text).toContain('We have proposed 1 subject')
    expect(text).toContain('the category raised it in the videos we read')
  })

  it('says subjects are not recorded when M4 is not applied', () => {
    expect(overviewSubjects.emptyState(refusedFixture())).toBe('Your subjects are not recorded for this workspace yet.')
    const text = renderText(overviewSubjects.render(refusedFixture(), 'app', ctx))
    expect(text).toContain('not recorded for this workspace yet')
  })

  it('declares one figure per subject — the side that carries the month', () => {
    const { figures, verdicts } = blockAnswers(overviewSubjects, overviewFixture())
    expect(Object.keys(figures)).toEqual(['subject_s1_share', 'subject_s2_share'])
    expect(verdicts.length).toBeGreaterThan(0)
  })

  it('is email-safe', () => {
    const markup = render(overviewSubjects.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
    expect(markup).not.toContain('<svg')
  })

  it('refuses to draw two readings as a trend line', () => {
    const data = overviewFixture()
    const rows = data.subjects.rows.map((r) => ({ ...r, spark: [null, null, null, null, 19, 19.2] }))
    const markup = render(overviewSubjects.render({ ...data, subjects: { ...data.subjects, rows } }, 'app', ctx))
    expect(markup).toContain('Aug \u2192 Sep only')
    expect(markup).not.toContain('<svg')
  })

  it('prints the same point last month on the category side, named once, in both drawn modes', () => {
    for (const mode of ['app', 'email'] as const) {
      const text = renderText(overviewSubjects.render(overviewFixture(), mode, ctx))
      // The two figures are separated (design review Medium 18): they ran
      // together with no separator, which reads as one number gone wrong.
      // AND THE FIGURE IS THE VERDICT'S OWN BASELINE (Block D wave 3, M13):
      // 22 − 18.8 = 3.2, which is what the change column beside it prints. At
      // 20.5% a reader who subtracted the row's own two levels got 1.5 pts
      // against a band of ±2.1 — the verdict refuted by the sheet built to be
      // checked.
      expect(text, mode).toContain('18.8% · 243 of 1,290')
      // L4: named once as a legend, never per row.
      expect(text.split('at this point last month').length - 1, mode).toBe(1)
    }
  })
})

// ---- D1 · the gap beside the row ----------------------------------------------

describe('the two-audience gap OV2 carries', () => {
  it('reads the two levels the ROW prints, so the difference can never disagree with them', () => {
    const s = overviewFixture().subjects
    expect(Object.keys(s.gaps).length).toBeGreaterThan(0)
    for (const row of s.rows) {
      const gap = s.gaps[row.id]
      if (!gap) continue
      expect(gap.a.pct, row.id).toBe(row.you.pct)
      expect(gap.a.value, row.id).toEqual({ k: row.you.k, n: row.you.n })
      expect(gap.b.pct, row.id).toBe(row.rival?.pct ?? null)
      expect(gap.b.value, row.id).toEqual({ k: row.rival?.k, n: row.rival?.n })
    }
  })

  it('refuses the difference across a rename, and keeps both levels', () => {
    const s = renamedRivalFixture().subjects
    const gap = s.gaps.s1 as Gap
    expect(gap.state).toBe('refused')
    expect(gap.refusedReason).toBe('rename')
    expect(gap.gapPts).toBeNull()
    const line = gapLine(gap)
    expect(line).toBe('you 31.0% of 84 · Freitag 44.0% of 142 · comparison refused')
    // And the refusal travels to the earlier month rather than printing beside it.
    expect(gapBasisLine(gap)).toBe('comparison refused in August')
  })

  it('renders the refused state in all three modes and keeps the copy contract', () => {
    for (const mode of MODES) {
      assertCopyContract(render(overviewSubjects.render(renamedRivalFixture(), mode, ctx)))
    }
  })

  it('prints the same figures in the gapline as the row prints in the table', () => {
    const data = overviewFixture()
    const text = renderText(overviewSubjects.render(data, 'app', ctx))
    const line = gapLine(data.subjects.gaps.s1 as Gap)
    // The row prints "44% 62 of 142"; the gapline prints "Freitag 44% of 142".
    expect(text).toContain('44.0% 62 of 142')
    expect(line).toContain('Freitag 44.0% of 142')
    expect(line).toContain('you 31.0% of 84')
  })
})

// ---- Block D wave 2 · the artboard's §2 ------------------------------------

describe('OV2, ported to the artboard', () => {
  it('heads the block with the gap, both sides and the earlier month under it', () => {
    // `main.subjects.gapline` / `.gapline.base` — D1. The mock's headline is
    // "gap to Freitag narrowed to 13 points … from 19 in June"; what prints is
    // both levels with their counts, the banded difference, and the earlier
    // month as its own dated reading. "narrowed" is not built.
    const data = overviewFixture()
    const text = renderText(overviewSubjects.render(data, 'app', ctx))
    expect(text).toContain('Durability: you 31.0% of 84 · Freitag 44.0% of 142 · too few to compare')
    expect(text).not.toContain('narrowed')
  })

  // A SECOND REFUSAL IS NOT PRINTED BESIDE THE FIRST (wave 3b, `decks`;
  // subjects finding 11). The earlier month is a reading in its own right
  // wherever it CONCLUDED something, and the headline prints it there; where
  // it too was refused, saying so again tells a reader nothing about August
  // that the words in front of them have not said about September.
  it('prints the earlier month where it concluded something, and not where it refused too', () => {
    const data = overviewFixture()
    const gap = leadGap(data.subjects)!
    const concluded = {
      ...data,
      subjects: {
        ...data.subjects,
        gaps: { ...data.subjects.gaps, [data.subjects.rows[0].id]: { ...gap, basis: { window: { kind: 'month' as const, from: '2026-08-01', to: '2026-09-01' }, gapPts: -19, bandPts: 11.2, state: 'apart' as const } } },
      },
    }
    expect(renderText(overviewSubjects.render(concluded, 'app', ctx))).toContain('19 points apart in August')

    const refused = {
      ...data,
      subjects: {
        ...data.subjects,
        gaps: { ...data.subjects.gaps, [data.subjects.rows[0].id]: { ...gap, basis: { window: { kind: 'month' as const, from: '2026-08-01', to: '2026-09-01' }, gapPts: null, bandPts: null, state: 'too_little_data' as const } } },
      },
    }
    expect(renderText(overviewSubjects.render(refused, 'app', ctx))).not.toContain('in August')
  })

  it('takes the headline gap off the row the table leads with, never a second ranking', () => {
    const s = overviewFixture().subjects
    expect(leadGap(s)).toBe(s.gaps[s.rows[0].id])
    expect(leadGap({ ...s, gaps: {} })).toBeNull()
  })

  it('dates the named set in the header instead of printing a bare digit', () => {
    const s = overviewFixture().subjects
    expect(subjectsMeta(s)).toBe('2 named 19 Aug · share of videos where the subject came up')
    // No date recorded is a shorter meta, never an invented one.
    expect(subjectsMeta({ ...s, namedAt: null })).toBe('2 named · share of videos where the subject came up')
    expect(subjectsMeta({ ...s, rows: [] })).toBeUndefined()
  })

  it('stacks each level over its "of N" through P0’s cell', () => {
    const markup = render(overviewSubjects.render(overviewFixture(), 'app', ctx))
    // FigureCell stamps the markers itself: the figure on top, the pair as the
    // level. A hand-rolled cell loses the copy contract by construction.
    expect(markup).toContain('data-copy="level"')
    // MERGE, BLOCK D WAVE 2: E-monthly's additive `size` prop re-ordered the
    // classes `FigureCell` emits at the default size (the `md` arm is now the
    // false branch of a `cn`), so this asserted a byte string that no longer
    // exists while the cell it names is unchanged. The figure's own face and
    // size are what this test is about, and they are asserted as classes.
    const figure = markup.slice(markup.indexOf('data-copy="figure"'))
    expect(figure).toContain('font-mono')
    expect(figure).toContain('text-[13px]')
    expect(figure).toContain('tabular-nums')
  })

  it('puts the caveat in the footer note, not in the body', () => {
    const markup = render(overviewSubjects.render(overviewFixture(), 'app', ctx))
    // `shrink-0` came off the slot in Block D wave 3 (SH5) — it was a clip
    // with no signal inside an overflow-hidden Tile — so the assertion is on
    // the slot's remaining signature rather than on the whole class string.
    expect(markup).toContain('font-mono text-[11px] font-normal text-muted-foreground">Your side carried')
  })

  it('prints the refusal in the headline where the rival was renamed, once', () => {
    const text = renderText(overviewSubjects.render(renamedRivalFixture(), 'app', ctx))
    expect(text).toContain('comparison refused')
    // …and ONCE (wave 3b, `decks`): the earlier month was refused for the same
    // reason, so printing "comparison refused in August" beside it is the
    // product stating its own bookkeeping twice about one rename.
    expect(text).not.toContain('comparison refused in August')
    expect(text.match(/comparison refused/g)?.length).toBe(1)
  })
})

// SH22's COLUMN SCALE, WIRED (wave-3 merge). `Sparkline` normalises to the min
// and max of what IT is handed, so each row filled its own box and +3.2pts and
// −3.1pts drew at the same amplitude — the one thing a column of lines beside a
// column of names is for. SH22 built `domain` for this caller by name and
// shipped with it unwired.
describe('the monthly-line column shares one scale', () => {
  it('spans zero to the highest reading any drawn row carries', () => {
    const rows = overviewFixture().subjects.rows
    const d = sparkDomain(rows)
    expect(d?.[0]).toBe(0)
    const drawn = rows.filter((r) => !monthlyLineLabel(r.spark, r.sparkMonths))
    const highest = Math.max(...drawn.flatMap((r) => r.spark).filter((v): v is number => v != null))
    expect(d?.[1]).toBe(highest)
  })

  it('shares nothing when there is no column to be comparable within', () => {
    const rows = overviewFixture().subjects.rows
    expect(sparkDomain([])).toBeUndefined()
    expect(sparkDomain(rows.slice(0, 1))).toBeUndefined()
  })

  // And the drawn line takes the floor and the hairline that says where it is,
  // so a row that barely moved does not read as one that climbed.
  it('draws the zero floor and its rule on the row line', () => {
    const markup = render(overviewSubjects.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('stroke="var(--border)"')
  })
})

// ONE REFUSAL, SAID ONCE (deploy 1 review): on 2 Oct seven subject rows each
// printed "Not read as a change: we changed our searches in September." in
// both change columns. The fixture's rows are refused as the loader refuses
// them (WP1.3), counts kept.
describe('OV2 · a refusal every row shares prints once, as a chip', () => {
  const pair = { mode: 'refuse' as const, cause: 'searches' as const, changeMonth: '2026-09-01', checkWith: null }
  const refuse = (v: import('@/lib/reading/verdicts').Verdict | null) =>
    v ? { ...v, state: 'refused' as const, refusedReason: 'tracking_change' as const, changePts: null, bandPts: null, pair } : v
  const refused = () => {
    const data = overviewFixture()
    return {
      ...data,
      subjects: {
        ...data.subjects,
        rows: data.subjects.rows.map((r) => ({
          ...r,
          you: { ...r.you, verdict: refuse(r.you.verdict) },
          category: { ...r.category, verdict: refuse(r.category.verdict) },
        })),
      },
    }
  }

  it('says "not compared" in the cells and the reason once, in every mode', () => {
    for (const mode of MODES) {
      const text = renderText(overviewSubjects.render(refused(), mode, ctx))
      expect(text.split('not read as a change: we changed our searches in September').length - 1).toBe(1)
      expect(text).not.toContain('Not read as a change')
      expect(text).toContain('not compared')
      assertCopyContract(render(overviewSubjects.render(refused(), mode, ctx)))
    }
  })

  it('prints no chip where nothing is refused', () => {
    expect(renderText(overviewSubjects.render(overviewFixture(), 'app', ctx))).not.toContain('not read as a change')
  })
})

// ---- decision C, WP1.1: the three calibration states -------------------------

describe('OV2 under the three calibration states (staging, Sealand, read on 2 Oct)', () => {
  const data = calibrationOverviewFixture()
  const byId = (id: string) => data.subjects.rows.find((r) => r.id === id)!

  it('the loader marks each row: two ready, one failed, one provisional', () => {
    expect(data.subjects.rows.map((r) => [r.label, r.calibration])).toEqual([
      ['Looks & style', 'ready'],
      ['Repair & warranty', 'failed'],
      ['Community & purpose', 'provisional'],
      ['Waterproofing', 'ready'],
    ])
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const mode of MODES) assertCopyContract(render(overviewSubjects.render(data, mode, ctx)))
    assertCopyContract(render(monthlySubjectsEmail(data, ctx)))
  })

  it('a failed subject prints its name and "being re-described", and none of its figures', () => {
    for (const mode of MODES) {
      const text = renderText(overviewSubjects.render(data, mode, ctx))
      expect(text).toContain('Repair & warranty')
      expect(text.match(/being re-described/g)?.length).toBe(1)
      // Its 33 of 625 category videos never print.
      expect(text).not.toContain('33 of 625')
    }
    expect(byId('repair').category).toEqual({ k: null, n: null, pct: null, verdict: null, observed: false })
  })

  // Waterproofing read as never checked (production's state before Friday's
  // check), on the same staging rows: a provisional subject with figures.
  const unchecked = calibrationOverviewFixture({ unchecked: ['water'] })

  it('a provisional subject prints its market levels, marked, and no "you" side or change', () => {
    for (const mode of MODES) {
      const text = renderText(overviewSubjects.render(unchecked, mode, ctx))
      expect(text.match(/provisional/g)?.length).toBe(1)
      expect(text).toContain('28 of 625')
    }
    const row = unchecked.subjects.rows.find((r) => r.id === 'water')!
    expect(row.calibration).toBe('provisional')
    expect(row.you.observed).toBe(false)
    expect(row.category.verdict).toBeNull()
    expect(row.direction).toBeNull()
    expect(unchecked.subjects.gaps.water).toBeNull()
  })

  // WP1.1 review, finding 1: Community & purpose was named 24 Sep, after the
  // 24 Sep update wrote September, and has no row in any month. The 0 a month
  // series fills there is no reading: "0 of 625" was invented.
  it('a subject named after the month was written says "no reading yet" (default M-a), and no figure, never 0', () => {
    for (const mode of MODES) {
      const text = renderText(overviewSubjects.render(data, mode, ctx))
      expect(text).toContain('no reading yet')
      expect(text).not.toContain('0 of 625')
      // Said once: the row's words are the whole row.
      expect(text.match(/no reading yet/g)?.length).toBe(1)
    }
    const row = byId('community')
    expect(row.unread).toBe('no reading yet')
    expect(row.category).toEqual({ k: null, n: null, pct: null, verdict: null, observed: false })
    expect(row.spark.every((v) => v == null)).toBe(true)
    expect(row.categoryAtLastMonth).toBeNull()
    expect(data.subjects.gaps.community).toBeNull()
    const answers = blockAnswers(overviewSubjects, data)
    expect(Object.keys(answers.figures).some((k) => k.includes('community'))).toBe(false)
    // A subject that was read keeps its zeros where it came up on no video.
    expect(byId('water').rival?.k).toBe(0)
  })

  it('marks a provisional subject\'s figure "(provisional)" in the table a document cites (WP1.1 review, finding 10)', () => {
    const figures = blockAnswers(overviewSubjects, unchecked).figures
    expect(figures.subject_water_share.label).toBe('Waterproofing, share of the category this month (provisional)')
    expect(figures.subject_looks_share.label).toBe('Looks & style, share of the category this month')
  })

  it('an unread row is its linked name and its words, one cell across', () => {
    const row = rowOf(render(overviewSubjects.render(data, 'app', ctx)), 'Community &amp; purpose')
    expect(row).toContain('no reading yet')
    expect(row).toContain('item=community')
    expect(row).toMatch(/colspan="6"/i)
    expect(row).not.toContain('provisional')
  })

  it('never says "not tracked" of a side it only withholds', () => {
    // Staging holds no own-audience month row, so each READY row's "you" cell
    // is truly not tracked; the provisional and failed rows' cells are
    // withheld, and say nothing about tracking.
    for (const mode of MODES) {
      const text = renderText(overviewSubjects.render(data, mode, ctx))
      const failedRow = text.slice(text.lastIndexOf('Repair & warranty'), text.lastIndexOf('Community & purpose'))
      const provisionalRow = text.slice(text.lastIndexOf('Community & purpose'), text.lastIndexOf('Waterproofing'))
      for (const row of [failedRow, provisionalRow]) {
        expect(row).not.toContain('not tracked')
        expect(row).not.toContain('no change is read for your side')
      }
    }
  })

  it('declares no verdict and no figure for a subject that is not ready', () => {
    const answers = blockAnswers(overviewSubjects, data)
    for (const v of answers.verdicts) expect(['looks', 'water']).toContain(v.objectId)
    expect(Object.keys(answers.figures).some((k) => k.includes('repair'))).toBe(false)
  })

  it('the monthly email prints the same states', () => {
    const text = renderText(monthlySubjectsEmail(data, ctx))
    expect(text).toContain('being re-described')
    expect(text).toContain('no reading yet')
    expect(text).not.toContain('33 of 625')
    expect(text).not.toContain('0 of 625')
    expect(renderText(monthlySubjectsEmail(unchecked, ctx))).toContain('provisional')
  })

  it('a row stored before WP1.1 carries no state and renders as sent, with no word', () => {
    const text = renderText(overviewSubjects.render(overviewFixture(), 'app', ctx))
    expect(text).not.toContain('provisional')
    expect(text).not.toContain('being re-described')
  })

  // The design pass: what the rows LOOK like, not only what they say.
  const rowOf = (markup: string, label: string) => {
    const at = markup.indexOf(label)
    return markup.slice(markup.lastIndexOf('<tr', at), markup.indexOf('</tr>', at))
  }

  it('a failed row is its name and its word: no link to a pane that does not exist, no dash in each column', () => {
    for (const mode of ['app', 'print'] as const) {
      const row = rowOf(render(overviewSubjects.render(data, mode, ctx)), 'Repair &amp; warranty')
      expect(row).toContain('being re-described')
      expect(row).not.toContain('<a ')
      expect(row).not.toContain('—')
      // One cell across the six; the row's header says why, once, and never
      // "not shown until … checked": it was checked, and failed.
      expect(row).toMatch(/colspan="6"/i)
      expect(row.match(/being re-described/g)?.length).toBe(1)
      expect(row).not.toContain('not shown until')
    }
  })

  it('a provisional row carries the withheld mark in its change cell as in its "you" cells', () => {
    const row = rowOf(render(overviewSubjects.render(unchecked, 'app', ctx)), 'Waterproofing')
    expect(row.match(/not shown until its check clears/g)?.length).toBe(3)
  })
})
