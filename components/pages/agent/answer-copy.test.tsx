import { describe, expect, it } from 'vitest'
import { AnswerTile, AboutReadings } from './answer'
import { agentPage } from './index'
import { NotAnsweredTile, ReadsTile } from './rail'
import { AskShell } from './surface'
import { agentFixture, followUpFixture, refusedFixture, sealandLongTermFixture, thinRefusedAskFixture } from './fixture'
import { markupText, render } from '@/lib/test/render'
import { copyViolations } from '@/lib/test/copy-contract'
import { bannedHits } from '@/lib/written/scrub'
import { inHouseStyle, type AgentThreadData } from '@/lib/pages/agent-thread'
import { OUT_OF_CORPUS_NOTICE } from '@/lib/agent/types'
import { SILENCE_SENTENCE, SILENCE_SENTENCE_V1 } from '@/lib/agent/enforce'

// THE GUARD ON THE AGENT'S ANSWER VIEW (§0a, 1 Oct).
//
// Heinrich, on Sealand's live answer ("what's something long term we should
// work on the next year"): "what's this 796 number". The page said "The
// sentence here named a figure we did not measure, so this is the reading
// instead", "in the category" over a base the Dashboard calls 834, "Sep only /
// Two readings: months named, not drawn.", "no month reads / No month on this
// axis carries a reading.", "measured on …" and "Answered against the update
// of 27 Sep". All of it is our machinery, and §0a says the client sees their
// market and not how we build or run it.
//
// So this renders everything the answer view prints, on the live thread
// (`sealandLongTermFixture`, which goes through the real measurement, judge
// and scrub) and on every other state the fixtures hold: the answer tile, the
// rail beside it, every sheet of the PDF and the PNG card. Two checks:
//   1. the PRODUCT's words (everything but the model's prose, a theme's label
//      and a commenter's words, which are not ours to word) carry none of the
//      process phrases below, and none of the shared `BANNED_PHRASES`;
//   2. the whole text of the live thread, model prose included, carries no em
//      dash and none of the phrases either.

/** Process words as the answer view used them. Each is a phrase or a word
 *  this view has no ordinary use for. */
const PROCESS: readonly { name: string; re: RegExp }[] = [
  { name: 'confession', re: /did not measure|so this is the reading|reading instead|\binstead\b|was removed/i },
  { name: 'readings', re: /\breadings?\b|\bno month reads\b|\bmonth reading\b|\bnot read yet\b|\bno reading yet\b/i },
  { name: 'axis', re: /\baxis\b/i },
  { name: 'measured', re: /\bmeasured?\b|\bnot counted\b/i },
  { name: 'drawn', re: /\bdrawn\b|\bnot drawn\b|months named/i },
  { name: 'refused', re: /\brefus(?:ed|al|es)\b/i },
  { name: 'gate', re: /\bgate[sd]?\b/i },
  { name: 'update', re: /\bupdate of\b|\banswered against\b|\bnext update\b|\bas at the\b|\bupdates paused\b/i },
  { name: 'base as the category', re: /\bin the category\b|where themes are grouped/i },
  { name: 'what we read', re: /\bwe (?:read|analys\w*|have analysed|do not read|cannot see)\b|conversation (?:we read|analysed)|what we read/i },
  { name: 'on file', re: /\bon file\b/i },
  { name: 'searchable', re: /\bsearchable\b|\bindexed\b/i },
  { name: 'sep only', re: /\b[A-Z][a-z]{2} only\b/ },
]

const processHits = (text: string): string[] => PROCESS.filter(({ re }) => re.test(text)).map(({ name }) => name)

/** The markup with the words that are not the product's taken out: the
 *  model's prose, a theme label or thread title (model prose written
 *  elsewhere), a commenter's or the reader's own words. */
const productOnly = (markup: string): string =>
  markup.replace(/<(\w+)[^>]*data-copy="(?:prose|subject|quote)"[^>]*>[\s\S]*?<\/\1>/g, ' ')

/** Everything the answer view prints for one thread: the answer tiles, the
 *  rail beside them, every sheet of the PDF and every PNG card. */
function viewMarkup(d: AgentThreadData): string {
  const tiles = d.turns.map((t, i) => render(<AnswerTile turn={t} turnIndex={i} measure={d.measure} about={i === 0 ? d.about : undefined} />))
  const rail = [render(<ReadsTile reads={d.reads} />), render(<NotAnsweredTile notAnswered={d.notAnswered} />)]
  const sheets = agentPage.slides(d, 'default').flatMap((s) => [s.title, ...s.keys.map((k) => render(<>{agentPage.renderables[k]?.render(d, 'print')}</>))])
  const cards = d.turns.map((_, i) => render(<>{agentPage.renderables[`agent.answer:${i}`]?.render(d, 'print')}</>))
  return [...tiles, ...rail, ...sheets, ...cards].join('\n')
}

const STATES: [string, () => AgentThreadData][] = [
  ['the live thread (Sealand, 1 Oct)', sealandLongTermFixture],
  ['a measured thread', agentFixture],
  ['nothing measured', refusedFixture],
  ['a follow-up', followUpFixture],
  ['a refused month pair', thinRefusedAskFixture],
]

describe('the answer view says nothing about how it was made (§0a)', () => {
  for (const [name, make] of STATES) {
    it(`${name}: the product's words carry no process phrase`, () => {
      const text = markupText(productOnly(viewMarkup(make())))
      expect(processHits(text)).toEqual([])
      // One exemption from the shared list: the brand's own name. "Prepared
      // by … · with Verbatim" is the signature on paper, not a sentence about
      // the method. ("too few to compare" is no longer printed at all.)
      expect(bannedHits(text.replace(/\bVerbatim\b/g, ''))).toEqual([])
      expect(text).not.toContain('—')
    })
  }

  it('the live thread, model prose included, has no em dash and no process phrase', () => {
    const markup = viewMarkup(sealandLongTermFixture())
    expect(markup).not.toContain('—')
    expect(markup).not.toContain('&mdash;')
    expect(processHits(markupText(markup))).toEqual([])
  })
})

describe('the live thread, as Heinrich read it (1 Oct)', () => {
  const d = sealandLongTermFixture()
  const tile = markupText(render(<AnswerTile turn={d.turns[0]} turnIndex={0} measure={d.measure} />))

  it('states the emptied point as a plain finding, its base against the market', () => {
    // 796 in the category + 38 about a tracked brand = the Dashboard's 834.
    // (The label, the level and the base are nodes of their own, so the text
    // extraction puts a space before the colon and the stop that the page
    // does not draw; it is taken out here.)
    const read = tile.replace(/\s+([:.])/g, '$1').replace(/\s+/g, ' ')
    expect(read).toContain('Trust in long-lasting bag quality: 13 of 796 videos.')
    expect(read).toContain('Frustration with declining product quality: 8 of 796 videos.')
    expect(d.turns[0].answer!.grounded[0].text).toBe('Trust in long-lasting bag quality: 13 of 796 videos.')
  })

  it('says the base once, under "What people said", and each finding reads just its level (round 2)', () => {
    expect(tile).toContain('What people said Counted out of the 796 September videos about your category in general: your market\'s 834, less the 38 about brands you track.')
    expect(tile.split('Counted out of').length - 1).toBe(1)
    expect(tile).not.toContain('not counting the 38')
    expect(tile).toContain('5 of 796 videos Covers')
    expect(tile).toContain('22 of 796 videos Covers')
  })

  it('leaves out the own side where it says nothing (0 of 10, under the floor)', () => {
    expect(tile).not.toContain('In your own audience')
    expect(tile).not.toContain('too few to compare')
  })

  it('highlights no phrase anywhere on the page', () => {
    const markup = viewMarkup(d)
    expect(markup).not.toMatch(/data-copy="level"[^>]*class="[^"]*\bbg-/)
    expect(markup).not.toContain('bg-accent')
  })

  it('says what a point covers in one short line', () => {
    expect(tile).toContain('Covers: Products that hold up well · Loyalty to preferred bag brands · Trust in long-lasting bag quality · Willing to pay for quality')
  })

  it('draws nothing in the right column where there is no line, and says nothing about it', () => {
    const markup = render(<AnswerTile turn={d.turns[0]} turnIndex={0} measure={d.measure} />)
    expect(markup).not.toContain('<svg')
    expect(tile).not.toMatch(/Sep only|no month reads|Two readings/)
  })

  it('reads in Heinrich’s order: the answer, what I’d do, then what people said, and no quotes', () => {
    const answer = tile.indexOf('Over the next year')
    const doing = tile.indexOf('What I’d do')
    const said = tile.indexOf('What people said')
    expect(answer).toBeGreaterThan(-1)
    expect(doing).toBeGreaterThan(answer)
    expect(said).toBeGreaterThan(doing)
    expect(tile).not.toContain('In their words')
    expect(tile).not.toContain('Six years on this pack')
  })

  it('keeps the copy contract', () => {
    expect(copyViolations(<AnswerTile turn={d.turns[0]} turnIndex={0} measure={d.measure} />)).toEqual([])
    expect(copyViolations(<AboutReadings readings={d.about} />)).toEqual([])
  })
})

describe('a stored answer is shown in today’s words', () => {
  const stored = {
    answer: SILENCE_SENTENCE_V1,
    grounded: [{ text: 'People ask about fit — and about the zip.' }],
    judgement: [{ text: 'Lead with fit — the zip can wait.', basedOn: [] }],
    nearest: [],
    notice: 'This asks about your own numbers, which we cannot see. We only read public conversation.',
  }

  it('the old silence sentence and notice, and no dash in the model’s prose', () => {
    const out = inHouseStyle(stored as never) as unknown as typeof stored
    expect(out.answer).toBe(SILENCE_SENTENCE)
    expect(out.notice).toBe(OUT_OF_CORPUS_NOTICE)
    expect(out.grounded[0].text).toBe('People ask about fit, and about the zip.')
    expect(out.judgement[0].text).toBe('Lead with fit, the zip can wait.')
    expect(processHits(`${out.answer} ${out.notice}`)).toEqual([])
  })
})

describe('the page bar over a thread (round 2)', () => {
  it('is the brand and the month alone: no "as at the update", no "next update"', () => {
    const d = sealandLongTermFixture()
    const text = markupText(render(<AskShell bar={{ brand: d.brand, reading: d.bar.reading }}><span /></AskShell>))
    expect(text).toContain('Sealand')
    expect(text).toContain('September 2026')
    // (Export renders inside the page's ExportScope; the shots show it.)
    expect(processHits(text)).toEqual([])
  })
})
