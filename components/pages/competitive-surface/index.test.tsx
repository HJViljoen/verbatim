import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, directionRe } from '@/lib/test/copy-contract'
import { markupText as markupOf, render, renderText } from '@/lib/test/render'
import { COMPETITIVE_BLOCKS, COMPETITIVE_TILES, GRID_ROWS, STACKED } from './index'
import { PageGrid } from '@/components/shell/page-grid'
import { Tile } from '@/components/shell/tile'
import { H2H_NO_RIVAL, competitiveHeadToHead } from './head-to-head'
import { OWN_CLAIMS_OWNER, competitiveOwnClaims, trackedLine } from './own-claims'
import { competitiveSaidAbout } from './said-about'
import { PLAYBOOK_NO_READING, competitivePlaybook } from './playbook'
import { competitiveRivals } from './rivals'
import { competitiveStandings } from './standings'
import { competitiveQuestions } from './questions'
import { buildSaidAbout, competitiveUnlockRows } from '@/lib/pages/competitive-surface'
import { competitiveUnlocks } from './unlocks'
import { claimsReadFixture, competitiveFixture, oneMonthFixture, quietRivalFixture, unreadMonthsFixture, unreadRivalFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [competitiveFixture(), unreadRivalFixture(), quietRivalFixture(), unreadMonthsFixture(), oneMonthFixture(), claimsReadFixture()]

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

  it('runs one order for the whole tile, and it is the charts’', () => {
    // The chart pair is attention then content (the brief's "attention
    // FIRST"); the table ran content then attention and both change columns
    // followed IT, so a reader who took the left chart and dropped to the first
    // share column compared the wrong pair.
    const markup = render(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    const chart = markup.indexOf('Attention share')
    const comments = markup.indexOf('Share of comments')
    const videos = markup.indexOf('Share of videos')
    expect(chart).toBeLessThan(comments)
    expect(comments).toBeLessThan(videos)
    expect(markup.indexOf('Comments, on last month')).toBeLessThan(markup.indexOf('Videos, on last month'))
  })

  it('draws each bar against its own column, and says so', () => {
    // A track filled to the ABSOLUTE percentage drew 2.7px for 4.2% and floored
    // 1.3% to the same 2% several other rows got, because on a real tenant the
    // shares are 1–9% beside one remainder at 93%. The figure beside the bar
    // is the absolute one and carries its own "k of N".
    const markup = render(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    const rows = competitiveFixture().standings.rows
    const top = Math.max(...rows.map((r) => r.content?.pct ?? 0))
    const you = rows.find((r) => r.role === 'client')!.content!.pct!
    expect(markup).toContain(`width:${(you / top) * 100}%`)
    expect(renderText(markup)).toContain('drawn against the largest share in its own column')
  })

  it('counts a brand’s months read by ONE rule, in both cells that print it', () => {
    // The legend counted `content != null || attention != null`; the table's
    // own column counted `content != null` alone, so a month with videos read
    // and no comments kept made one tile print "2 of 3 months" beside "3 of 3".
    const base = competitiveFixture()
    const data = {
      ...base,
      standings: {
        ...base.standings,
        series: base.standings.series.map((x) =>
          x.audience === 'competitor:Ottobock'
            ? { ...x, points: x.points.map((p, i) => (i === 0 ? { ...p, content: null } : p)) }
            : x),
      },
    }
    const text = renderText(competitiveStandings.render(data, 'app', ctx))
    // Ottobock was read in all three; one of them kept no video count.
    expect(text).not.toContain('2 of 3 months')
    expect(text.match(/3 of 3/g)?.length).toBe(3)
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
  // WAVE 2 MOUNTED CO3 AND CO7, SO THEIR ROWS CAME OUT IN THE SAME COMMIT.
  // The rule is wave 1's and it runs both ways: a readiness row is printed
  // while its tile is missing and removed the moment the tile draws, because
  // a page saying "Head to head — not built yet" underneath a head-to-head
  // table is the page contradicting itself. CO4's row stays because the CLAIMS
  // half is still withheld (M8's policy is `entity = 'client'`), and CO6's
  // stays because nothing loads a finding identity for `recurrenceOf` to key
  // on.
  it('names the two sections still missing, and no longer the two that landed', () => {
    const text = renderText(competitiveUnlocks.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('What they say about themselves')
    expect(text).toContain('Findings, with recurrence')
    expect(text).not.toContain('Head to head, then and now')
    expect(text).not.toContain('How the category makes content')
    expect(text).toContain('Verbatim engineering')
  })

  it('never says a rival is not tracked on a page that has just counted their posts', () => {
    // ST1's "— not tracked" is for a section whose INPUTS are not configured.
    // Head-to-head, findings and category content read the same inputs CO2 and
    // CO5 have just drawn above, so telling a client their rivals are not
    // tracked there contradicts the page itself — and since CO4 started
    // drawing a census per rival, that is true of CO4 too wherever the
    // accounts ARE configured, which is every tracked rival on both tenants.
    const rows = competitiveFixture().unlocks.rows
    expect(rows.filter((r) => r.state === 'not tracked')).toEqual([])
    expect(rows.map((r) => r.section)).toEqual(['CO4', 'CO6'])
    const text = renderText(competitiveUnlocks.render(competitiveFixture(), 'app', ctx))
    expect(text).not.toContain('— not tracked')
    expect(text).toContain('— not built yet')
  })

  it('keeps the untracked row, and its owner, for a workspace watching nobody', () => {
    const data = competitiveFixture({ unlocks: { rows: competitiveUnlockRows([]) } })
    const text = renderText(competitiveUnlocks.render(data, 'app', ctx))
    expect(text).toContain('— not tracked · Your digital director')
  })

  it('drops CO4 entirely on the arm where the claims DO print', () => {
    // The row was keyed on whether accounts are CONFIGURED, which is a
    // different fact from whether claims were read. In `claimsReadFixture` the
    // second tile prints six of Ottobock's own claims verbatim and the fifth
    // said, on the same screen, that they are "not printed here".
    const data = claimsReadFixture()
    expect(data.unlocks.rows.map((r) => r.section)).toEqual(['CO6'])
    const page = renderText(competitiveUnlocks.render(data, 'app', ctx))
    expect(page).not.toContain('is not printed here')
    expect(page).not.toContain('What they say about themselves')
    // And the tile it would have contradicted really does print them.
    expect(renderText(competitiveOwnClaims.render(data, 'app', ctx))).toContain('Fitting takes one appointment')
  })
})

describe('CO3 and CO7 · the data the tiles bind (Block D, D6)', () => {
  // WAVE 1 IS THE DATA, WAVE 2 IS THE TILE. These assertions are the FIXTURE's
  // — the shape the two tiles bind, in the states they are reviewed in — and
  // the render assertions for the tiles themselves are below.

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

// ---- the four tiles wave 2 mounted -------------------------------------------

describe('CO3 · head to head, then and now', () => {
  it('carries an "of N" on last month\u2019s figure too, not just this month\u2019s', () => {
    // `prev.text` was rendered alone inside a `figure` marker, so "8.1%" and
    // "76%" reached the page as bare scores two columns from a header arguing
    // for per-side denominators. Rule (b) reads LEVEL nodes and could not see
    // it; `prev.value` was in hand the whole time.
    const h = competitiveFixture().headToHead!
    const share = h.measures.find((m) => m.key === 'videos')!
    const prev = share.you!.prev!
    const text = renderText(competitiveHeadToHead.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain(`${prev.text} of `)
    for (const mode of MODES) {
      const markup = render(competitiveHeadToHead.render(competitiveFixture(), mode, ctx))
      // Every "then" that is a share carries its denominator inside a level.
      expect(markup).toContain('data-copy="level"')
    }
  })

  it('carries an "of N" on every level, per side, never one shared', () => {
    // The artboard prints one `n 84 · 142` beside the measure and then two bare
    // percentages under it — but 84 is YOUR denominator and 142 is theirs, and
    // a level without its own denominator is the score this product does not
    // show (D10). Both sides' September videos-about figures are shares of the
    // same 449 read this month, so both cells say so.
    const text = renderText(competitiveHeadToHead.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('4.2%')
    expect(text).toContain('9.4%')
    expect(text.match(/of 449/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('names the clock on every row, because two of the five are not the month', () => {
    const text = renderText(competitiveHeadToHead.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('videos and comments dated in September')
    expect(text).toContain('videos published in September')
  })

  it('prints no magnitude on a rate, a median or a count — and says why (D2, D3)', () => {
    const text = renderText(competitiveHeadToHead.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('Comments per video is a rate')
    expect(text).toContain('Engagement is a median of per-video rates')
    expect(text).toContain('Posts published is a count with no denominator')
    // The mock prints "+2", "+0.2 pt" and "▼ 2" on exactly those three rows.
    expect(text).not.toMatch(/[▲▼]\s*(2|0\.2)\b/)
  })

  it('declines a banded row for the reason it actually has, not the floor by default', () => {
    // Össur's September positive share is 5 of 5 judged, under the floor of 10,
    // so THIS row's refusal is the floor — and the sentence says so rather than
    // saying "no previous month" about a month that was read.
    const text = renderText(competitiveHeadToHead.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('Under 10 videos on a side, so no comparison is drawn.')
  })

  it('gives an empty column a sentence, never five blank cells', () => {
    // `FaceOffMeasure.why` was computed on all five measures and rendered
    // nowhere: a tracked rival nothing of whose content was read got an empty
    // column and no reason anywhere in the block, which reads as a measured
    // nothing. Deduplicated, because five measures share one absence.
    const text = renderText(competitiveHeadToHead.render(unreadRivalFixture(), 'app', ctx))
    expect(text).toContain('Nothing was read for Rareform in Sep 2026')
    expect(text.match(/Nothing was read for Rareform/g)?.length).toBe(1)
    // And a state where both sides ARE read prints no such sentence.
    expect(renderText(competitiveHeadToHead.render(competitiveFixture(), 'app', ctx))).not.toContain('Nothing was read for')
  })

  it('says there is nothing to put beside you when no rival is selected', () => {
    const data = competitiveFixture({ headToHead: null })
    expect(competitiveHeadToHead.emptyState(data)).toBe(H2H_NO_RIVAL)
    expect(renderText(competitiveHeadToHead.render(data, 'app', ctx))).toContain('No rival is selected')
  })

  it('puts the Reddit exclusion in the footer note and its reason in the open', () => {
    const text = renderText(competitiveHeadToHead.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('Reddit excluded from the engagement rows')
    expect(text).toContain('capped at 40 a thread')
  })
})

describe('CO4 · what they say about themselves', () => {
  it('draws three distinct absences and not one of them is a zero', () => {
    const text = renderText(competitiveOwnClaims.render(competitiveFixture(), 'app', ctx))
    // configured and silent …
    expect(text).toContain('No post was published in this period')
    // … no account configured at all, with the owner and NO date (D14) …
    expect(text).toContain('No account is configured for this rival')
    expect(text).toContain(OWN_CLAIMS_OWNER)
    expect(text).not.toMatch(/by \d+ Oct/)
    // … and a census that WAS read, whose claims half is withheld by policy.
    expect(text).toContain('5 posts')
    expect(text).toContain('What they claim in them is read from their own transcripts')
  })

  it('marks a replayed claim as stored, naming the call that wrote it', () => {
    const markup = render(competitiveOwnClaims.render(claimsReadFixture(), 'app', ctx))
    expect(markup).toContain('data-slot="pass_a_brand_claim"')
    // A brand's own figure inside its own claim — the case `pass_a_brand_claim`
    // exists to exempt at render and to hand `allowTokens` at write time.
    expect(markupOf(markup)).toContain('for over 30 years')
  })

  it('counts the echo with its own denominator, and says why when there is none', () => {
    const text = renderText(competitiveOwnClaims.render(claimsReadFixture(), 'app', ctx))
    expect(text).toContain('Echoed 31 of 42 videos')
    expect(text).toContain('Pushed back 9 of 42 videos')
    // A counted zero is a reading and reads as one — never as "not tracked".
    expect(text).toContain('Not talked about 0 of 42 videos')
  })

  it('counts the watched rivals off the censuses beside it, never a second read', () => {
    expect(trackedLine(competitiveFixture().ownClaims)).toBe('2 of 3 tracked')
  })
})

describe('CO5 · said about them, by others', () => {
  it('says which silence it is \u2014 and on the app page nothing was read', () => {
    // THE SENTENCE THIS TEST USED TO PIN WAS FALSE. It asserted "Nothing was
    // said about Ottobock in what we read this month." on the surface reading,
    // where no claim reader is passed at all: `video_claims` is closed to a
    // tenant session, so the block was reporting a measured silence nobody
    // measured. The withheld sentence is the honest one, and the measured one
    // is only reachable where a reader WAS passed and came back empty.
    const text = renderText(competitiveSaidAbout.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('which are not open to this page')
    expect(text).not.toContain('Nothing was said about Ottobock')
    // Rareform in the claims-read arm: a reader ran and found nothing.
    const read = renderText(competitiveSaidAbout.render(claimsReadFixture(), 'app', ctx))
    expect(read).toContain('Nothing was said about Rareform in what we read this month.')
  })

  it('refuses a share of a month it has no denominator for', () => {
    const rows = buildSaidAbout(
      [{ name: 'Ottobock' }],
      () => 0,
      () => [{ claim: 'The knee is quiet', quote: 'You cannot hear it.', videoId: 'v1' }],
    )
    expect(rows[0].rows).toHaveLength(0)
    expect(rows[0].empty).toContain('nothing to be a share of')
  })

  it('keeps each numerator over its own audience’s denominator (D5)', () => {
    // The artboard puts "71 of 1,388" on a Freitag row — a Freitag-specific
    // count over the whole category — two blocks below giving Freitag its own
    // denominator of 142. Ottobock's rows are of Ottobock's 42.
    const text = renderText(competitiveSaidAbout.render(claimsReadFixture(), 'app', ctx))
    expect(text).toContain('of 42')
    expect(text).toContain('of each brand’s own videos')
  })

  it('carries every quote as a ref and never as stored words', () => {
    const refs = competitiveSaidAbout.quotes!(claimsReadFixture())
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(ref.startsWith('k:')).toBe(true)
  })
})

describe('CO7 · how the category makes content', () => {
  it('prints the classified n beside the published one, per column (D6)', () => {
    const text = renderText(competitivePlaybook.render(competitiveFixture(), 'app', ctx))
    // The format legend, per side …
    expect(text).toContain('687 of 757')
    expect(text).toContain('84 of 109')
    expect(text).toContain('124 of 145')
    // … and the coverage line under the tables, naming both again in words.
    expect(text).toContain('687 of The category’s 757')
    // Never the mock's "read from all 1,388 category videos".
    expect(text).not.toContain('read from all')
  })

  it('gives the hook table its own legend and its own coverage, never the format’s', () => {
    // `FormatReading.of` counts the videos carrying a value for THIS key: the
    // hook reading is 647 · 81 · 118 where the format reading is 687 · 84 ·
    // 124. ONE legend drawn off `formats.sides` over both tables, and one
    // coverage line computed from the format readings, claimed 40 more
    // category videos than the hook table measured.
    const p = competitiveFixture().playbook!
    expect(p.formats.sides.map((s) => s.of)).not.toEqual(p.hooks.sides.map((s) => s.of))
    const text = renderText(competitivePlaybook.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('647 of 757')
    expect(text).toContain('647 of The category’s 757')
    expect(text).toContain('for their format.')
    expect(text).toContain('for their hook.')
  })

  it('says 0 of N where a side was read and had none, and a sentence where it was not', () => {
    const read = renderText(competitivePlaybook.render(competitiveFixture(), 'app', ctx))
    expect(read).toMatch(/0 of 84|0 of 124/)
    expect(read).not.toContain('none of')
    const unread = renderText(competitivePlaybook.render(unreadRivalFixture(), 'app', ctx))
    expect(unread).toContain('published nothing we read in September')
  })

  it('orders the median column by the median, never by the count', () => {
    const p = competitiveFixture().playbook!
    const medians = p.engagement.map((r) => r.engagement.median ?? 0)
    expect([...medians].sort((a, b) => b - a)).toEqual(medians)
    // The column header names the exclusion; the reason (the 40-comment cap)
    // is the sentence under the tables.
    const text = renderText(competitivePlaybook.render(competitiveFixture(), 'app', ctx))
    expect(text).toContain('The category · no Reddit')
    expect(text).toContain('capped at 40 a thread')
  })

  it('keeps the email matrix inline — no block inside a sentence', () => {
    // The email row is a sentence and each side sits in a <span>;
    // `FigureCell`'s email arm is a <div>, and Outlook lays out with Word.
    const markup = render(competitivePlaybook.render(competitiveFixture(), 'email', ctx))
    const from = markup.indexOf('Story')
    const row = markup.slice(from, markup.indexOf('</div>', from))
    expect(row).not.toContain('<div')
    // The markers survive the change of box.
    expect(markup).toContain('data-copy="level"')
    expect(markup).toContain('data-copy="figure"')
  })

  it('states the published clock in its meta, not the page’s month', () => {
    expect(render(competitivePlaybook.render(competitiveFixture(), 'app', ctx))).toContain('videos published in September')
  })

  it('refuses rather than drawing an empty matrix', () => {
    expect(competitivePlaybook.emptyState(unreadMonthsFixture())).toBe(PLAYBOOK_NO_READING)
  })
})

describe('the page, as the artboard composes it', () => {
  it('draws the rival selection inline, not as a card with an eyebrow', () => {
    const markup = render(competitiveRivals.render(competitiveFixture(), 'app', ctx))
    expect(markup).toContain('Rival')
    // No block frame: no uppercase eyebrow heading, no block question.
    expect(markup).not.toContain('<h2')
    expect(markup).not.toContain('Which rival is this page about?')
    // Print keeps the frame, because it has no page bar to sit under.
    expect(render(competitiveRivals.render(competitiveFixture(), 'print', ctx))).toContain('<h2')
  })

  it('gives the standings a meta that says what the shares are of, and a real footer', () => {
    const text = renderText(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    // The axis this block was GIVEN, not the four months the artboard happens
    // to draw — `last_3` at 18 Sep is Jul, Aug, Sep.
    expect(text).toContain('share of the tracked set · Jul 2026 to Sep 2026 · both denominators printed')
    expect(text).toContain('Open the record →')
    expect(text).toContain('no rank is printed')
  })

  it('draws the charts on a one-month horizon too, with the attention share first', () => {
    const markup = render(competitiveStandings.render(oneMonthFixture(), 'app', ctx))
    expect(markup).toContain('<svg')
    const attention = markup.indexOf('Attention share')
    const content = markup.indexOf('Content share')
    expect(attention).toBeGreaterThan(-1)
    expect(attention).toBeLessThan(content)
    expect(markupOf(markup)).toContain('A line needs more than one month')
  })

  it('leaves the remainder out of the lines, and says so', () => {
    // "The rest of the category" runs at 86–93% of the corpus, so drawn beside
    // the two brands the block is about it put a series at the ceiling and left
    // both brands on the baseline three pixels apart. It is the REMAINDER of
    // the month, not a brand. No row is dropped and no denominator changes —
    // it is out of the lines and still in the table, with the omission named.
    const markup = render(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    const text = renderText(markup)
    expect(text).toContain('The rest of the category is not drawn')
    // Not in the legend under the charts …
    const chips = markup.slice(markup.lastIndexOf('</svg>'), markup.indexOf('Each chart is scaled'))
    expect(chips).toContain('Ottobock')
    expect(chips).not.toContain('category')
    // and nowhere in the drawing itself
    expect(markup.slice(0, markup.lastIndexOf('</svg>'))).not.toContain('86.4%')
    // … and still a row of the table, with its share and its denominator.
    expect(text).toContain('The rest of the category')
    expect(text).toContain('86.4%')
    const category = competitiveFixture().standings.rows.find((r) => r.role === 'category')!
    expect(text).toContain(`of ${category.content!.n.toLocaleString('en-US')}`)
  })

  it('draws ONE legend under both charts, and says the scale is not shared', () => {
    const text = renderText(competitiveStandings.render(competitiveFixture(), 'app', ctx))
    // ONE legend: the note under it is printed once, and each chart's own
    // title appears once — two legends would have duplicated both.
    expect(text.match(/Each chart is scaled to its own highest month/g)?.length).toBe(1)
    expect(text.match(/Attention share/g)?.length).toBe(1)
    expect(text.match(/Content share/g)?.length).toBe(1)
  })

  it('annotates a series read in fewer months than the axis, and only that one', () => {
    // The artboard's "Poler · Sep only": the build had the data (a series whose
    // earlier points are hollow) and printed it nowhere.
    const base = competitiveFixture()
    const thin = {
      ...base,
      standings: {
        ...base.standings,
        series: base.standings.series.map((x) =>
          x.audience === 'competitor:Ottobock'
            ? { ...x, points: x.points.map((p, i) => (i === 0 ? { ...p, content: null, attention: null } : p)) }
            : x,
        ),
      },
    }
    const text = renderText(competitiveStandings.render(thin, 'app', ctx))
    expect(text).toContain('2 of 3 months')
    expect(text.match(/of 3 months/g)?.length).toBe(1)
  })

  it('renders the host video a question was asked under', () => {
    const markup = render(competitiveQuestions.render(competitiveFixture(), 'app', ctx))
    expect(markup).toContain('https://www.tiktok.com/@x/video/1')
    expect(markupOf(markup)).toContain('under the video →')
  })

  it('lets a tile grow rather than cutting its own footer off', () => {
    // THE TIER CANNOT MEASURE PIXELS, SO IT PINS THE DECISION. `PageGrid` is
    // `xl:auto-rows-[116px]` and a `Tile` is `overflow-hidden`, so an integer
    // row span was a hard ceiling: measured at the previous head, the
    // head-to-head overflowed its four rows by 94px at 1440 and 128px at 1280
    // and lost its footer and two verdict reasons, and own-claims lost its
    // footer in the claims arm. The artboard's own grid declares no
    // `grid-auto-rows`; this page asks for the same through the className
    // `PageGrid` already takes.
    // The page itself cannot render here (its bar uses `useSearchParams`), so
    // this is the grid the page composes, with the same two overrides — and
    // the thing worth pinning is that `cn`'s tailwind-merge lets them WIN over
    // the primitive's own classes rather than being dropped as duplicates.
    const markup = render(
      <PageGrid className={GRID_ROWS}>
        <Tile col={7} row={4} className={STACKED}>x</Tile>
      </PageGrid>,
    )
    expect(markup).toContain('xl:auto-rows-[minmax(116px,auto)]')
    expect(markup).not.toContain('xl:auto-rows-[116px]')
    // Below xl the grid is one column, so a tile takes its own height instead
    // of a min-height derived from a span it no longer shares.
    expect(markup).toContain('min-h-0')
    expect(markup).not.toContain('min-h-[512px]')
    // `distribute="between"` is gone from the page: a tile has ONE child, so
    // `justify-between` had nothing to spread. What puts a footer on the floor
    // is the block filling the tile.
    expect(markup).not.toContain('justify-between')
  })

  it('makes every block fill its tile, so its footer lands on the floor', () => {
    for (const block of COMPETITIVE_TILES) {
      const markup = render(block.render(competitiveFixture(), 'app', ctx))
      expect(markup.slice(0, 200)).toContain('h-full')
    }
    // Paper and email are not tiles and do not ask for it.
    expect(render(competitiveStandings.render(competitiveFixture(), 'print', ctx)).slice(0, 200)).not.toContain('h-full')
  })

  it('spans the artboard’s grid, and every tile is exportable', () => {
    // 12 · 7+5 · 3+4+5 · 12 — read off the artboard's own `grid-column: span N`.
    expect(COMPETITIVE_TILES.map((b) => b.key)).toEqual([
      'competitive.months', 'competitive.h2h', 'competitive.ownclaims',
      'competitive.saidabout', 'competitive.questions', 'competitive.unlocks',
      'competitive.playbook',
    ])
  })
})
