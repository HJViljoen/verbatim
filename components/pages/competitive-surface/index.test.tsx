import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, directionRe } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { COMPETITIVE_BLOCKS } from './index'
import { competitiveRivals } from './rivals'
import { competitiveStandings } from './standings'
import { competitiveQuestions } from './questions'
import { competitiveUnlocks } from './unlocks'
import { competitiveFixture, oneMonthFixture, quietRivalFixture, unreadMonthsFixture, unreadRivalFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [competitiveFixture(), unreadRivalFixture(), quietRivalFixture(), unreadMonthsFixture(), oneMonthFixture()]

describe('Competitive · every block, every mode, every state', () => {
  it('keeps the copy contract', () => {
    for (const block of COMPETITIVE_BLOCKS) {
      for (const data of STATES) {
        for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
      }
    }
  })

  it('renders a question in the analysis\u2019s own words, naming the call that wrote them', () => {
    // A production string: the model numbers are names, not figures, and the
    // slot they are marked under is the one Pass A never had.
    const markup = render(competitiveQuestions.render(competitiveFixture(), 'app', ctx))
    expect(markup).toContain('3r85 or 3r80')
    expect(markup).toContain('data-slot="pass_a_audience_insight"')
  })

  it('is email-safe: tables, no classes, no CSS variables', () => {
    for (const block of COMPETITIVE_BLOCKS) {
      const markup = render(block.render(competitiveFixture(), 'email', ctx))
      expect(markup).toContain('<table')
      expect(markup).not.toContain('class=')
      expect(markup).not.toContain('var(--')
    }
  })
})

describe('CO1 · the rival selection', () => {
  it('lists every tracked rival, with which of four things is true of it', () => {
    const text = renderText(competitiveRivals.render(unreadRivalFixture(), 'app', ctx))
    expect(text).toContain('Ottobock')
    expect(text).toContain('Rareform')
    expect(text).toContain('nothing of theirs has been read yet')
    // … and the row says nothing has been read, so it cannot also count what
    // was read. The fixture used to pair 'configured' with `analysed: 1`, a
    // state the loader cannot produce, and this assertion passed beside
    // "· 1 of their videos read" in the same sentence.
    expect(text).not.toMatch(/has been read yet\s*·\s*\d+ of their videos read/)
  })

  it('says a tracked rival went quiet, with the videos of theirs we did read', () => {
    // Rareform's actual state on Sealand: one analysed video, none of it in
    // this window. `rivalState` returns 'quiet' the moment analysed is above
    // zero, and that is a different sentence from "never read".
    const text = renderText(competitiveRivals.render(quietRivalFixture(), 'app', ctx))
    expect(text).toContain('nothing of theirs was read this window')
    expect(text).toContain('1 of their videos read')
  })

  it('says a rival you stopped tracking cannot be listed yet', () => {
    const text = renderText(competitiveRivals.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('Rivals you have stopped tracking are not recorded')
  })

  it('drops that line once the register is there', () => {
    const data = competitiveFixture()
    const text = renderText(competitiveRivals.render({ ...data, rivals: { ...data.rivals, identityRecorded: true } }, 'app', ctx))
    expect(text).not.toContain('Rivals you have stopped tracking')
  })

  it('dates a retired rival rather than dropping it', () => {
    const data = competitiveFixture()
    const options = data.rivals.options.map((o) => ({ ...o, state: 'retired' as const, retiredAt: '2026-09-09' }))
    const text = renderText(competitiveRivals.render({ ...data, rivals: { ...data.rivals, options } }, 'app', ctx))
    expect(text).toContain('its months keep its name')
    expect(text).toContain('until 9 Sep')
  })
})

describe('CO2 · the standings', () => {
  it('prints both shares with their own denominators, and no rank', () => {
    const text = renderText(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('4.2% 19 of 449')
    expect(text).toContain('9.4% 42 of 449')
    expect(text).toContain('no rank is printed')
    expect(text).not.toMatch(/\b(1st|2nd|3rd|ranked|league)\b/i)
  })

  it('names what the shares are shares of, with the month’s platform mix', () => {
    const text = renderText(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('of what our search plan found and we read this month')
    expect(text).toContain('449 videos (TikTok')
  })

  it('carries the precedence rule and the dual-mention count under the table', () => {
    const text = renderText(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('counts in your audience only')
    expect(text).toContain('6 did this month')
  })

  it('says a line needs more than one month, on the horizon that gives it one', () => {
    // DEFAULT_HORIZON is 'this_month' and the charts are gated on months > 1,
    // so the view every reader opens first is a one-row-per-brand table
    // reading "1 of 1" under a title promising months. The approved artboard
    // (mock-sealand, Competitive) is "two small line charts side by side …
    // Jun to Sep".
    const one = oneMonthFixture()
    expect(one.standings.months).toHaveLength(1)
    const markup = render(competitiveStandings.render(one, 'app', ctx))
    expect(renderText(markup)).toContain('A line needs more than one month')
    expect(markup).toContain('/dashboard/competitive?horizon=last_3')
    // And it says nothing of the sort once the horizon can draw one.
    expect(renderText(competitiveStandings.render(competitiveFixture(), 'app', ctx)))
      .not.toContain('A line needs more than one month')
  })

  it('prints both changes, and never a blank cell on anybody’s row', () => {
    // Rendered live for Sealand, the CLIENT'S OWN row printed 0.6% (3 of 475),
    // 0.3% (27 of 9,704), "1 of 1" and then nothing under "Change on last
    // month" — while Cotopaxi said "no clear change". And the column did not
    // say which of the two shares it was, while attentionVerdict was computed,
    // declared in verdicts() and never shown.
    const data = competitiveFixture()
    const text = renderText(competitiveStandings.render(data, 'app', ctx))
    expect(text).toContain('Videos, on last month')
    expect(text).toContain('Comments, on last month')
    const quiet = {
      ...data,
      standings: {
        ...data.standings,
        rows: data.standings.rows.map((r) =>
          r.role === 'client' ? { ...r, contentVerdict: null, attentionVerdict: null } : r),
      },
    }
    expect(renderText(competitiveStandings.render(quiet, 'app', ctx))).toContain('no row in Aug 2026')
  })

  it('draws a rule at the month a tracking change landed in', () => {
    const text = renderText(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('One change to what we track landed in Sep 2026')
  })

  it('names the attention index it does not have rather than implying it has one', () => {
    const text = renderText(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('what the platforms themselves report on a frozen panel')
  })

  it('refuses in words when no month has been read', () => {
    expect(competitiveStandings.emptyState(unreadMonthsFixture())).toContain('no standings to draw')
    const text = renderText(competitiveStandings.render(unreadMonthsFixture(), 'app', ctx))
    expect(text).not.toMatch(/\d+% \d+ of \d+/)
  })

  it('declares one content share per observed brand, plus the two denominators', () => {
    const { figures } = blockAnswers(competitiveStandings, competitiveFixture())
    expect(Object.keys(figures).sort()).toEqual([
      'dual_mention_videos',
      'standing_client_content',
      'standing_competitor_ottobock_content',
      'standing_industry_other_content',
      'standings_comments',
      'standings_videos',
    ])
  })

  it('declares a verdict for every comparison it drew', () => {
    const { verdicts } = blockAnswers(competitiveStandings, competitiveFixture())
    expect(verdicts.length).toBeGreaterThan(0)
    for (const v of verdicts) expect(v.window.kind).toBe('month')
  })
})

describe('CO5 · what the category asks', () => {
  it('counts the questions, the videos under them and the comments behind them', () => {
    const text = renderText(competitiveQuestions.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('37 questions under 33 of Ottobock’s videos')
    expect(text).toContain('71 comments behind them')
  })

  it('shows a quote under a question, original above English', () => {
    const text = renderText(competitiveQuestions.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('Hoeveel kos die battery om te vervang?')
    expect(text).toContain('How much does the battery cost to replace?')
  })

  it('lists the watched communities with the block', () => {
    const text = renderText(competitiveQuestions.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('r/amputee · r/prosthetics · r/bionics')
    expect(text).toContain('different thing from a question typed under a video')
  })

  it('says why the questions are not grouped into themes', () => {
    const text = renderText(competitiveQuestions.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('listed as they were asked')
  })

  it('has a real sentence for a rival nobody asked anything under', () => {
    const text = renderText(competitiveQuestions.render(unreadRivalFixture(), 'app', ctx))
    expect(text).toContain('Nothing was asked under Rareform’s content')
    expect(text).not.toMatch(/\b0 questions\b/)
  })

  it('declares its quote refs so a snapshot can freeze ids and resolve words', () => {
    const { quotes } = blockAnswers(competitiveQuestions, competitiveFixture())
    expect(quotes).toEqual(['e:1', 'e:2'])
  })

  it('declares the comments as comments, and declares the questions as nothing', () => {
    // A figure table is what a model may name. `question_insights` declared a
    // count of question INSIGHTS with unit 'comments', which licensed a model
    // to write "37 comments" about 37 questions. The unit vocabulary is closed
    // and a question is not in it, so the block prints the count and declares
    // only what it can name honestly.
    const { figures } = blockAnswers(competitiveQuestions, competitiveFixture())
    expect(Object.keys(figures).sort()).toEqual(['question_comments', 'question_videos'])
    expect(figures.question_comments).toEqual({
      value: 71, unit: 'comments', label: 'comments behind those questions, in this window',
    })
  })

  it('declares no figures when nothing was asked', () => {
    expect(blockAnswers(competitiveQuestions, unreadRivalFixture()).figures).toEqual({})
  })
})

describe('the sections that are not built', () => {
  it('names CO3, CO4, CO6 and CO7 with their owners', () => {
    const text = renderText(competitiveUnlocks.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('Head to head, then and now')
    expect(text).toContain('What they say about themselves')
    expect(text).toContain('Findings, with recurrence')
    expect(text).toContain('How the category makes content')
    expect(text).toContain('Your digital director')
  })

  it('says "not tracked" only where the inputs really are not tracked', () => {
    // ST1's "— not tracked" is for a section whose INPUTS are not configured.
    // That is CO4 alone: head-to-head, findings and category content read the
    // same inputs CO2 and CO5 have just drawn on the page above, so telling a
    // client their rivals are not tracked there contradicts the page itself.
    const rows = competitiveFixture().unlocks.rows
    expect(rows.filter((r) => r.state === 'not tracked').map((r) => r.section)).toEqual(['CO4'])
    expect(rows.filter((r) => r.state === 'not built yet').map((r) => r.section)).toEqual(['CO3', 'CO6', 'CO7'])
    const text = renderText(competitiveUnlocks.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('— not tracked · Your digital director')
    expect(text).toContain('— not built yet')
  })
})

describe('CO3 and CO7 · the data wave 2 binds (Block D, D6)', () => {
  // WAVE 1 IS THE DATA, WAVE 2 IS THE TILE. Nothing on this page renders the
  // head-to-head or the playbook yet, which is why the CO3 and CO7 unlock rows
  // are still printed above — so what is asserted here is the FIXTURE: the
  // shape a port binds, in the two states it will be reviewed in.

  it('carries a head-to-head and both playbook matrices on the surface reading', () => {
    const data = competitiveFixture()
    expect(data.headToHead).not.toBeNull()
    expect(data.playbook).not.toBeNull()
    expect(data.headToHead!.measures.map((m) => m.key)).toEqual([
      'videos', 'comments_per_video', 'engagement', 'sentiment', 'posts',
    ])
    expect(data.playbook!.formats.sides.map((s) => s.label)).toEqual(['The category', 'Össur', 'Ottobock'])
    expect(data.playbook!.hooks.sides.map((s) => s.label)).toEqual(['The category', 'Össur', 'Ottobock'])
  })

  it('refuses both where no month has been read, rather than drawing empty tables', () => {
    const data = unreadMonthsFixture()
    expect(data.headToHead).toBeNull()
    expect(data.playbook).toBeNull()
  })

  it('gives a tracked-but-unread rival a column that says so, never a zero', () => {
    const data = unreadRivalFixture()
    const side = data.playbook!.formats.sides.find((s) => s.label === 'Rareform')!
    expect(side.of).toBe(0)
    expect(side.unread).toContain('published nothing we read in September')
    for (const cell of Object.values(side.byKey)) expect(cell).toBeNull()
    const share = data.headToHead!.measures.find((m) => m.key === 'videos')!
    expect(share.them).toBeNull()
    expect(share.why).toContain('Rareform')
  })

  it('carries an "of N" on every cell a port would print, and a basis beside it', () => {
    const data = competitiveFixture()
    for (const side of [...data.playbook!.formats.sides, ...data.playbook!.hooks.sides]) {
      for (const cell of Object.values(side.byKey)) {
        if (cell) expect(cell.value.n).toBe(side.of)
      }
    }
    expect(data.playbook!.basisLine).toBe('videos published in September')
    expect(data.playbook!.coverageLine).toContain('687 of The category’s 757')
    for (const m of data.headToHead!.measures) expect(m.basisLine).toContain('September')
  })

  it('states a reason wherever it declines to band a measure', () => {
    for (const m of competitiveFixture().headToHead!.measures) {
      if (m.verdict === null && m.you !== null) expect(m.verdictWhy).not.toBeNull()
      if (m.verdict !== null) expect(m.verdict.bandPts).not.toBeNull()
    }
  })

  it('prints no direction word in any sentence the two blocks compose', () => {
    const data = competitiveFixture()
    const words = [
      data.playbook!.basisLine,
      data.playbook!.coverageLine,
      data.playbook!.excludedNote,
      data.playbook!.formats.conclusion ?? '',
      ...data.playbook!.formats.keys.map((k) => k.label),
      ...data.playbook!.hooks.keys.map((k) => k.label),
      data.headToHead!.footerLine,
      ...data.headToHead!.measures.flatMap((m) => [m.label, m.basisLine, m.verdictWhy ?? '', m.why ?? '']),
    ].join(' ')
    expect(directionRe().test(words)).toBe(false)
  })
})
