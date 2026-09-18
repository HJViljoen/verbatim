import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import { FIRST_SCREEN_BUDGET, LATER_LINE, RIVAL_POSTS_CONSIDERED, RIVAL_POSTS_SHOWN, type WeekData } from '@/lib/pages/week'
import { FIRST_SCREEN, WEEK_BLOCKS, WeekPage, weekContext, weekFigureCount } from '.'
import { weekSubjects } from './subjects'
import { weekRising } from './rising'
import { weekCameIn } from './came-in'
import { weekRivalPosts } from './rival-posts'
import { weekReply } from './reply'
import { weekFlagged } from './flagged'
import { weekSales } from './sales'
import { weekWorked } from './worked'
import { weekCoverage } from './coverage'
import { absentReadingFixture, thinFixture, weekFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
// THREE, and the third is what production renders today: M3 is not applied on
// either tenant, so every figure off the windowed read is absent. A port
// designed against the first two alone builds columns that render nothing on
// both paying accounts.
const FIXTURES: (() => WeekData)[] = [weekFixture, thinFixture, absentReadingFixture]

describe('every block on This week', () => {
  it('renders in all three modes on both tenants and keeps the copy contract', () => {
    for (const fixture of FIXTURES) {
      for (const block of WEEK_BLOCKS) {
        for (const mode of MODES) {
          assertCopyContract(render(block.render(fixture(), mode, ctx)))
        }
      }
    }
  })

  it('is email-safe: tables, no classes, no CSS variables', () => {
    for (const block of WEEK_BLOCKS) {
      const markup = render(block.render(weekFixture(), 'email', ctx))
      expect(markup, block.key).toContain('<table')
      expect(markup, block.key).not.toContain('class=')
      expect(markup, block.key).not.toContain('var(--')
    }
  })

  it('answers with a sentence wherever it has nothing, and never with a hole', () => {
    // Every empty state is a STRING computed without rendering, so a page, a
    // slide and an email word one emptiness one way.
    for (const block of WEEK_BLOCKS) {
      for (const fixture of FIXTURES) {
        const empty = block.emptyState(fixture())
        expect(empty === null || (typeof empty === 'string' && empty.length > 20), `${block.key}`).toBe(true)
      }
    }
  })

  it('never says one number two different ways', () => {
    for (const fixture of FIXTURES) {
      const data = fixture()
      expect(figureConflicts(WEEK_BLOCKS.map((b) => b.figures?.(data) ?? {}))).toEqual([])
    }
  })

  it('prints the reading layer’s caveats once for the page, never once per bar', () => {
    // Sealand's three baseline months carry no recorded clustering key, and §1
    // and §3 both pool three months. `mergeSeriesNotes` collapses the stretch
    // into one sentence; the page prints that, at the foot, as Overview does.
    const text = renderText(<WeekPage data={thinFixture()} />)
    expect(text).toContain('We did not record how themes were grouped for June to August 2026')
    expect(text.match(/We did not record how themes were grouped/g)).toHaveLength(1)
    // And says nothing where the months carry one.
    expect(renderText(<WeekPage data={weekFixture()} />)).not.toContain('We did not record how themes were grouped')
  })

  it('keeps the first screen inside its twelve-number budget', () => {
    // The mock's first 900px is the page bar and §1. Counted over figure
    // tables, not rendered digits: the same figure named twice is one number to
    // a reader, and a table is countable before anything is drawn.
    for (const fixture of FIXTURES) {
      expect(weekFigureCount(fixture(), FIRST_SCREEN)).toBeLessThanOrEqual(FIRST_SCREEN_BUDGET)
    }
    // Nine on the flagged fixture: a flag's six numbers, the two shares its
    // interpretation cites, and the update's own n.
    expect(weekFigureCount(weekFixture(), FIRST_SCREEN)).toBe(9)
  })
})

describe('WK §2 · this week in your subjects', () => {
  it('prints a level with its denominator and this update’s own contribution', () => {
    const text = renderText(weekSubjects.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Comfort')
    expect(text).toContain('31 of 96 videos')
    expect(text).toContain('+8 this update')
    expect(text).toContain('September so far')
  })

  it('leads with how many subjects ran above typical, k of n, with the basis', () => {
    for (const mode of MODES) {
      const text = renderText(weekSubjects.render(weekFixture(), mode, ctx))
      // The mock says "Three of the six ran above a typical week". "A typical
      // week" is refused — there is no weekly series to be typical of — and
      // what survives is the count, its denominator, the names and the basis.
      expect(text, mode).toContain('2 of your 3 subjects ran above typical in this update')
      expect(text, mode).toContain('Comfort and Price and cover')
      expect(text, mode).toContain('a larger share of it than they hold of September so far')
      expect(text, mode).not.toContain('typical week')
    }
  })

  it('leads with nothing where no subject could be compared', () => {
    // "0 of 0 ran above typical" would be a sentence counting comparisons
    // nobody drew.
    const text = renderText(weekSubjects.render(thinFixture(), 'app', ctx))
    expect(text).not.toContain('ran above typical')
    expect(text).toContain('No subjects are recorded for this workspace yet')
  })

  it('draws the mock’s strip with the typical bar it can actually measure', () => {
    // The artboard's column is `31 this week` over a bar pair against "typical
    // week 22". D6 refuses the leading week figure and there is no per-week
    // history to be typical of, so the column leads with the MONTH and its
    // "of N", and the pair beneath is this update's contribution against
    // `typicalContribution` — both sides counted, neither modelled.
    const text = renderText(weekSubjects.render(weekFixture(), 'app', ctx))
    expect(text).toContain('31 this month')
    expect(text).toContain('31 of 96 videos')
    expect(text).toContain('+8 this update · usually 5')
    expect(text).toContain('above typical')
    expect(text).not.toContain('typical week')
    // And the legend says what the second bar IS, rather than naming a week.
    expect(text).toContain('what an update of its size usually adds')
  })

  it('names when the subjects were named, and calls it naming', () => {
    // D14: `named_at` is the day somebody typed the subject into Settings —
    // not the day the conversation about it began, which is what "tracking
    // since" would claim.
    const text = renderText(weekSubjects.render(weekFixture(), 'app', ctx))
    expect(text).toContain('3 subjects named 19 Aug')
    expect(text).not.toContain('since 19 Aug')
  })

  it('says subjects are not recorded rather than drawing an empty table', () => {
    const text = renderText(weekSubjects.render(thinFixture(), 'app', ctx))
    expect(text).toContain('No subjects are recorded for this workspace yet')
    expect(text).not.toContain('0 of 0')
  })
})

describe('WK §3 · moving now', () => {
  it('prints the month-to-date level with the trailing baseline beside it', () => {
    const text = renderText(weekRising.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Socket comfort after a long day · of 398 category videos in September')
    expect(text).toContain('against 5% across the three months behind it')
    expect(text).toContain('18 of them arrived with this update')
  })

  it('carries the quotes that make it a make-this prompt', () => {
    const text = renderText(weekRising.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Third socket this year and the first one I can wear all day')
    expect(blockAnswers(weekRising, weekFixture()).quotes).toHaveLength(1)
  })

  it('every direction word it prints comes from a verdict', () => {
    // The verdicts a block declares are the only place rule (c) allows one, and
    // this block declares exactly the comparisons it drew.
    const verdicts = blockAnswers(weekRising, weekFixture()).verdicts
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0].state).toBe('moved')
    assertCopyContract(render(weekRising.render(weekFixture(), 'app', ctx)))
  })

  it('claims nothing about a theme it never banded', () => {
    // The note is a statement about the themes NOT printed, so it names how
    // many were compared. With more movers than rows it says how many cleared.
    const text = renderText(weekRising.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Nothing else of the 30 themes read against their band this month moved clearly.')

    const d = weekFixture()
    const many = { ...d, rising: { ...d.rising, moved: 7 } }
    expect(renderText(weekRising.render(many, 'app', ctx)))
      // "with a larger share", because `moved` counts only the risers: a theme
      // that cleared its band downward did clear it and is not in this number.
      .toContain('7 themes cleared their band with a larger share in this month’s reading; the 1 largest are printed.')
  })

  it('says the pooled baseline counts a video once per month', () => {
    // One month against three summed: the baseline is video-months, not
    // distinct videos, and this is the shape anomaly.ts's own note says moves
    // the balance. Sealand's category reads 449 video-months against 446
    // distinct videos on production today.
    const text = renderText(weekRising.render(weekFixture(), 'app', ctx))
    expect(text).toContain('added together, so a video that was talked about in two of them is counted in both')

    // AND NOT PRINTED WHEN THE BASELINE IS A WINDOW. `QuarterChangeInput`
    // forbids summing month rows for a banded n; §3 does it only while M3's
    // window functions are unapplied, and the note is the disclosure of that.
    // Once the window read answers, the sentence is false of the reading.
    const windowed = weekFixture()
    windowed.rising.pooledBaseline = false
    expect(renderText(weekRising.render(windowed, 'app', ctx)))
      .not.toContain('added together')
  })

  it('refuses rather than printing "of 0 category videos"', () => {
    const d = weekFixture()
    const data = { ...d, rising: { ...d.rising, rows: [], monthOf: 0, moved: 0, pooled: 0, unread: 'This month’s category conversation has not been counted for this workspace yet, so there is nothing for a theme to be a share of.' } }
    const text = renderText(weekRising.render(data, 'app', ctx))
    expect(text).toContain('has not been counted for this workspace yet')
    expect(text).not.toContain('Nothing moved clearly')
  })

  it('says "nothing moved clearly", which is a reading and not a refusal', () => {
    const text = renderText(weekRising.render(thinFixture(), 'app', ctx))
    expect(text).toContain('Nothing moved clearly in September’s reading so far')
    expect(text).toContain('a theme that has not cleared its band has not moved')
  })
})

describe('WK §4 · what came in', () => {
  it('keeps analysed and newly found apart, and never says one is "of" the other', () => {
    const text = renderText(weekCameIn.render(weekFixture(), 'app', ctx))
    expect(text).toContain('508')
    expect(text).toContain('618 newly found')
    expect(text).toContain('5,134 comments written in these days')
    // They are two sets. Production reads "Ottobock — 96 analysed · 137 newly
    // found" on one row and "52 analysed · 52 newly found" on another; an "of"
    // between them is arithmetic that does not hold.
    expect(text).not.toMatch(/analysed of \d/)
  })

  it('says when the rows do not account for every comment in the total', () => {
    // The rows come from the videos THIS update fetched; the total comes from
    // the windowed read, which counts videos of any update carrying a comment
    // dated in these days. An audience with comments in the window and no video
    // in this update is in the total and not in the column — and a column a
    // reader can sum has to say so.
    const d = weekFixture()
    const data = { ...d, cameIn: { ...d.cameIn, windowComments: 6000 } }
    const text = renderText(weekCameIn.render(data, 'app', ctx))
    expect(text).toContain('6,000 comments written in these days')
    expect(text).toContain('The rows below account for 5,134 of those comments')
    // And says nothing where the column does add up, which both fixtures do.
    expect(renderText(weekCameIn.render(d, 'app', ctx))).not.toContain('The rows below account for')
    expect(renderText(weekCameIn.render(thinFixture(), 'app', ctx))).not.toContain('The rows below account for')
  })

  it('hands the window’s count back to the month it fell in', () => {
    expect(renderText(weekCameIn.render(weekFixture(), 'app', ctx)))
      .toContain('this update’s contribution to September so far: 205 of 449')
    expect(renderText(weekCameIn.render(thinFixture(), 'app', ctx)))
      .toContain('this update’s contribution to September so far: 394 of 475')
  })

  it('hands it back per audience too, which is what the plan asks for', () => {
    // Each row's own window against that audience's own month — the windowed
    // RPC already answers per audience, so this costs no extra read.
    const text = renderText(weekCameIn.render(weekFixture(), 'app', ctx))
    expect(text).toContain('this update’s contribution to September so far: 14 of 96')
    expect(text).toContain('this update’s contribution to September so far: 47 of 118')
    // And says nothing per row where the windowed read is not available —
    // which is production on both tenants today, not a hypothetical.
    const absent = renderText(weekCameIn.render(absentReadingFixture(), 'app', ctx))
    expect(absent).not.toContain('this update’s contribution to September so far')
    expect(absent).toContain('The month’s own reading is not available here')
  })

  it('renders the arm production is actually in: every windowed figure absent', () => {
    // M3 is unapplied on both tenants, so the comments column, the total above
    // it and every contribution go silent TOGETHER. Each absence is a sentence.
    const text = renderText(weekCameIn.render(absentReadingFixture(), 'app', ctx))
    expect(text).toContain('comments in these days are not recorded for this workspace yet')
    expect(text).not.toContain('comments written in these days')
    expect(text).not.toContain('The rows below account for')
    // The shares are NOT windowed and still print with both sides.
    expect(text).toContain('150 of 253 videos this update analysed')
  })

  it('does not point at a contribution it did not print', () => {
    // Sealand's window crosses from August. `crossingLine` qualifies a
    // contribution; with none printed, the crossing is said alone.
    const absent = renderText(weekCameIn.render(absentReadingFixture(), 'app', ctx))
    expect(absent).toContain('This update also covered days of August.')
    expect(absent).not.toContain('counts only its September days')
    // And where the contribution IS printed, it is still qualified.
    expect(renderText(weekCameIn.render(thinFixture(), 'app', ctx)))
      .toContain('counts only its September days')
  })

  it('says when the window reached back into an earlier month', () => {
    const text = renderText(weekCameIn.render(thinFixture(), 'app', ctx))
    expect(text).toContain('also covered days of August')
    // And Össur's seven-day window sits inside September, so it says nothing.
    expect(renderText(weekCameIn.render(weekFixture(), 'app', ctx))).not.toContain('also covered days of')
  })

  it('prints only the new themes that clear the floor, and names the rest', () => {
    const text = renderText(weekCameIn.render(weekFixture(), 'app', ctx))
    expect(text).toContain('2 of the 303 themes first heard in this update carried 10 videos or more')
    expect(text).toContain('Liner cost after the first year')
    const thin = renderText(weekCameIn.render(thinFixture(), 'app', ctx))
    expect(thin).toContain('592 themes were heard for the first time')
    expect(thin).toContain('the same conversation under a new label')
  })

  it('prints each audience’s share with both sides and its own comments', () => {
    for (const mode of MODES) {
      const text = renderText(weekCameIn.render(weekFixture(), mode, ctx))
      // BOTH SIDES, NEVER A BARE PERCENTAGE — and the denominator named is the
      // update's analysed total, the one thing every row is a part of.
      expect(text, mode).toContain('360 of 508 videos this update analysed')
      expect(text, mode).toContain('96 of 508 videos this update analysed')
      // The per-audience comments the loader used to sum away into one stat.
      expect(text, mode).toContain('3,600 comments written in these days')
      expect(text, mode).toContain('434 comments written in these days')
    }
  })

  it('says the comments are not recorded rather than printing a zero', () => {
    const d = weekFixture()
    const data = { ...d, cameIn: { ...d.cameIn, rows: d.cameIn.rows.map((r) => ({ ...r, comments: null })) } }
    const text = renderText(weekCameIn.render(data, 'app', ctx))
    expect(text).toContain('comments in these days are not recorded for this workspace yet')
    expect(text).not.toContain('0 comments written in these days')
  })

  it('restates every audience’s count as a contribution to the month', () => {
    // The rule the whole block exists for, on EVERY row: a window is not a
    // period, whoever's conversation it was.
    const text = renderText(weekCameIn.render(weekFixture(), 'app', ctx))
    for (const row of weekFixture().cameIn.rows) {
      expect(row.contribution).not.toBeNull()
      expect(text).toContain(`this update’s contribution to September so far: ${row.contribution!.videos} of ${row.contribution!.of}`)
    }
  })

  it('words its own no-window sentence, not the sales section’s', () => {
    // It used to print "there is nothing to read a week of objections out of"
    // under the heading "New on your subjects" — one string, wrong noun.
    const d = thinFixture()
    const data = { ...d, cameIn: { ...d.cameIn, quotesUnread: 'This update covered no window, so there are no days for a new comment on your subjects to have been written in.' } }
    const text = renderText(weekCameIn.render(data, 'app', ctx))
    expect(text).toContain('no days for a new comment on your subjects to have been written in')
    expect(text).not.toContain('a week of objections')
  })

  it('says why there are no subject quotes, rather than showing none', () => {
    const text = renderText(weekCameIn.render(thinFixture(), 'app', ctx))
    expect(text).toContain('Quotes are counted against your subjects once subjects are recorded')
  })
})

describe('WK §2 · worth a reply', () => {
  it('dates every row by the day the comment was written, never by an age', () => {
    // D6/D9: Content prints "3d", measured from the clock at page load. Every
    // other figure on this page is dated by the days the update covered, and a
    // relative age beside "6 Sep – 13 Sep" is a second clock on one page.
    const text = renderText(weekReply.render(weekFixture(), 'app', ctx))
    expect(text).toContain('11 Sep')
    // `ageLabel`'s own forms: "3d", "2w", "4mo". None of them may reach a row.
    expect(text).not.toMatch(/\b\d+(d|w|mo)\b/)
  })

  it('states the pick as a cap, never as a level over the update’s videos', () => {
    // D10/D8: the mock's "12 of 312 videos this week" divides comments by
    // videos. The digest takes at most three of a category and twelve in all,
    // so the number is a cap and the meta says which rule produced it.
    const text = renderText(weekReply.render(weekFixture(), 'app', ctx))
    expect(text).toContain('6 picked, at most three of a kind')
    expect(text).toContain('picked from the comments written in the days this update covered')
    expect(text).not.toContain('of 205 videos')
  })

  it('prints why each row surfaced on the row itself', () => {
    // The reason was a link into a drawer on the Content page, so the tile
    // showed a quote with no account of why this quote.
    const markup = render(weekReply.render(weekFixture(), 'app', ctx))
    expect(markupText(markup)).toContain('Ready to buy')
    // The words are a model's, written at Pass A and read back here, so the
    // node names the call that wrote them.
    expect(markup).toContain('data-slot="pass_a_audience_insight"')
  })

  it('never prints a reply history, because nothing records one', () => {
    // D14: "8 answered last week · 4 ignored" has no field anywhere in this
    // product.
    for (const fixture of FIXTURES) {
      const text = renderText(weekReply.render(fixture(), 'app', ctx))
      expect(text).not.toContain('answered')
      expect(text).not.toContain('ignored')
    }
  })

  it('carries a queue the loader could actually have produced', () => {
    // `buildReplies` sets `total` off the rows it kept and `counts` off the
    // same rows, so a fixture that inflated either would draw a proportion bar
    // over a queue that does not exist.
    for (const fixture of FIXTURES) {
      const r = fixture().replies
      expect(r.total).toBe(r.rows.length)
      expect(r.counts.reduce((t, c) => t + c.count, 0)).toBe(r.rows.length)
      for (const row of r.flagged) expect(row.intent).toBe('misinformation')
    }
  })

  it('says the queue is empty rather than drawing an empty table', () => {
    const text = renderText(weekReply.render(thinFixture(), 'app', ctx))
    expect(text).toContain('nothing here to answer')
    expect(weekReply.emptyState(thinFixture())).toContain('nothing here to answer')
  })

  it('keeps the copy contract with a commenter’s own words in every mode', () => {
    for (const fixture of FIXTURES) {
      for (const mode of MODES) assertCopyContract(render(weekReply.render(fixture(), mode, ctx)))
    }
  })
})

describe('WK §8 · flagged for awareness', () => {
  it('carries no reply link, by construction rather than by rendering', () => {
    const d = weekFixture()
    for (const row of d.replies.flagged) expect(row.href).toBeNull()
    const markup = render(weekFlagged.render(d, 'app', ctx))
    expect(markupText(markup)).toContain('no reply link')
    expect(markup).not.toContain('Reply →')
  })

  it('never claims a claim has persisted, and never mixes comments with videos', () => {
    // D14: nothing records when a flagged claim was first heard. D10: one
    // comment over a count of videos is two units on one line.
    const text = renderText(weekFlagged.render(weekFixture(), 'app', ctx))
    expect(text).not.toContain('persisted')
    expect(text).not.toContain('of 205 videos')
    expect(text).toContain('1 claim · no reply link')
  })

  it('says nothing was flagged rather than drawing a hole', () => {
    expect(weekFlagged.emptyState(thinFixture())).toContain('flagged as a claim about this space')
  })
})

describe('WK §5 · notable rival posts', () => {
  // THE TILE THE ROWS MOVED INTO (Block D wave 2, the mock's §5). Every
  // assertion below was written against §4, which built these rows inside
  // itself; the reading is the same `CameInBlock.rivals` and only the tile
  // changed, so the strings are kept verbatim — a port that quietly reworded
  // the readiness sentence or the two-stage rule would pass a rewritten test
  // and print something else.
  it('shows a rival who posted nothing as a zero, not as silence', () => {
    // Sealand's Rareform: their posts ARE read and none came in. Dropping the
    // row let "Rareform went quiet" reach the reader as nothing at all.
    const text = renderText(weekRivalPosts.render(thinFixture(), 'app', ctx))
    expect(text).toContain('Rareform')
  })

  it('states the by/about distinction, and why a zero is a zero', () => {
    // Össur has never captured a post of Ottobock's in six months of
    // gathering, handle configured or not: "0 posts of their own" would read
    // as "Ottobock went quiet this week".
    const text = renderText(weekRivalPosts.render(weekFixture(), 'app', ctx))
    expect(text).toContain('92 posts about them')
    expect(text).toContain('their own posts are not read yet — Verbatim engineering')
    // Sealand does capture rival-owned posts, so both counts are real.
    const thin = renderText(weekRivalPosts.render(thinFixture(), 'app', ctx))
    expect(thin).toContain('94 posts about them, 44 posts of their own')
    // And one is a post, not "1 posts" — production has a rival with exactly
    // one (Sealand's Rareform).
    const one = thinFixture()
    one.cameIn.rivals = [{ audience: 'competitor:Rareform', label: 'Rareform', byThem: 1, aboutThem: 1, comments: 0, postsTotal: 2, postsConsidered: 0, posts: [], ownPostsUnread: false }]
    expect(renderText(weekRivalPosts.render(one, 'app', ctx))).toContain('1 post about them, 1 post of their own')
  })

  it('names the rival posts themselves, and says how many of how many', () => {
    for (const mode of MODES) {
      const text = renderText(weekRivalPosts.render(weekFixture(), mode, ctx))
      // A post has no title column, so identity is platform · account · date ·
      // caption · link.
      expect(text, mode).toContain('PhysioWithPriya')
      expect(text, mode).toContain('Testing the Ottobock C-Leg 4 on stairs')
      expect(text, mode).toContain('posted 8 Sep')
      // THE COLUMN IS A COLUMN ON THE PAGE AND A SENTENCE IN AN EMAIL. An
      // inbox has no table header to carry "Comments", so the email arm says
      // what the number is; the page's header row and meta say it once.
      expect(text, mode).toContain(mode === 'email' ? '610 comments under it in these days' : '610')
      // THE RULE, SAID OUT LOUD. The pick is two stages — the widest-reaching
      // few, then the most-commented of those — because on production the
      // widest-reaching posts carry no window comments at all (Freitag's two
      // 2.2M-view TikToks: zero). And the rival's comment figure is the sum
      // over the posts NAMED; a bare total would be a claim about their week
      // that nothing here counted.
      expect(text, mode).toContain('2 shown: the most commented on in these days of the 2 widest-reaching of 92')
      expect(text, mode).toContain('998 comments under them in these days')
    }
  })

  it('shows a count of weighed posts the loader could actually have produced', () => {
    // `buildCameIn` weighs at most `RIVAL_POSTS_CONSIDERED` and shows
    // `slice(0, RIVAL_POSTS_SHOWN)` of them, so what is shown is exactly
    // `min(weighed, 3)`. A fixture saying "2 shown of the 6 widest-reaching"
    // describes a pick no run makes, and a port would print that sentence.
    for (const fixture of FIXTURES) {
      for (const rival of fixture().cameIn.rivals) {
        expect(rival.posts.length, rival.label)
          .toBe(Math.min(rival.postsConsidered, RIVAL_POSTS_SHOWN))
        expect(rival.postsConsidered, rival.label).toBeLessThanOrEqual(RIVAL_POSTS_CONSIDERED)
        expect(rival.postsConsidered, rival.label).toBeLessThanOrEqual(rival.postsTotal)
      }
    }
  })

  it('does not make a direction claim out of a rival’s own caption', () => {
    // A CAPTION IS SOMEBODY ELSE'S WORDS. Production captions are marketing
    // copy in six languages — "Since 1993, it's been about two things",
    // "Hola biónicos!!" — and one of them will say "growing" the week it does.
    // Rule (c) may not police it, for the same reason it may not police a
    // commenter, so the caption and the account are marked as a quote.
    const d = weekFixture()
    const data = {
      ...d,
      cameIn: {
        ...d.cameIn,
        rivals: d.cameIn.rivals.map((r) => ({
          ...r,
          posts: r.posts.map((post) => ({ ...post, caption: 'Our waitlist is growing fast and prices are rising', account: 'up.and.rising' })),
        })),
      },
    }
    for (const mode of MODES) {
      const markup = render(weekRivalPosts.render(data, mode, ctx))
      // The words ARE on the page — the test would pass vacuously if the
      // caption were simply not rendered.
      expect(markupText(markup), mode).toContain('Our waitlist is growing fast and prices are rising')
      assertCopyContract(markup)
    }
  })

  it('draws no post table for a rival with no post this update', () => {
    // Rareform's posts ARE read and none came in: the row is a zero and there
    // is nothing under it, which is different from the row being dropped.
    const text = renderText(weekRivalPosts.render(thinFixture(), 'app', ctx))
    expect(text).toContain('Rareform')
    expect(text).not.toContain('0 of 0 shown')
  })

  it('prints the comment count with no denominator, and says where the days are', () => {
    // A COUNT UNDER ONE POST IS NOT A SHARE OF ANYTHING on this page — not of
    // the update's videos, which are a different unit. `FigureCell`'s contract
    // is that an omitted "of N" is a statement; the days the comments were
    // counted in are in the block's meta, once.
    const text = renderText(weekRivalPosts.render(weekFixture(), 'app', ctx))
    expect(text).toContain('comments counted under each post · 6 Sep – 13 Sep')
    expect(text).not.toContain('610 of')
  })

  it('sends the fourth column where that reading actually lives', () => {
    // The mock's "What the audience asked under it" has no per-post field;
    // Competitive reads the questions per RIVAL. The layout keeps the table
    // and the footer says so once, rather than a column repeating it.
    const text = renderText(weekRivalPosts.render(weekFixture(), 'app', ctx))
    expect(text).toContain('what the audience asked is read per rival, not per post')
    expect(text).toContain('Open Competitive →')
  })
})

describe('WK §5 · for sales', () => {
  it('counts objections in videos, with the n on the block', () => {
    const text = renderText(weekSales.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Price and cover')
    expect(text).toContain('96')
    expect(text).toContain('205 videos this update')
    expect(text).toContain('Grounded answers to these sit in the sales brief.')
  })

  it('puts the denominator on every ranked row, marked as the level it is', () => {
    const markup = render(weekSales.render(weekFixture(), 'app', ctx))
    expect(markup).toContain('<span data-copy="level">96 of 205 videos</span>')
    assertCopyContract(markup)
  })

  it('says so, rather than printing bare counts, when there is no n to count against', () => {
    // M3 unapplied → `windowVideos` null → `ForSalesData.videos` null. The page
    // read "Brand controversy 3 · Brand association controversy 2" on Össur
    // with no "of N" on any row and no n on the block.
    const d = weekFixture()
    const data = { ...d, sales: { ...d.sales, videos: null } }
    for (const mode of MODES) {
      const text = renderText(weekSales.render(data, mode, ctx))
      expect(text, mode).toContain('so these counts have nothing to be a share of')
      expect(text, mode).not.toContain('of 205 videos')
      assertCopyContract(render(weekSales.render(data, mode, ctx)))
    }
  })

  it('counts switching comments before it caps them', () => {
    // The array holds the two the page shows; the stat has to say seven, or a
    // display cap reaches a salesperson as a measurement.
    const text = renderText(weekSales.render(weekFixture(), 'app', ctx))
    expect(text).toContain('7')
    expect(text).toContain('someone said they were moving between brands — of 205 videos this update · 1 below')
  })

  it('draws no switching stat at all where the total was never counted', () => {
    const d = weekFixture()
    const data = { ...d, sales: { ...d.sales, switchingTotal: null } }
    const text = renderText(weekSales.render(data, 'app', ctx))
    expect(text).toContain('Switching signals')
    expect(text).not.toContain('someone said they were moving between brands')
  })

  it('says whose grouping the headings are', () => {
    expect(renderText(weekSales.render(weekFixture(), 'app', ctx)))
      .toContain('Grouped by the subjects you named.')
  })

  it('counts a rival’s complaints under that rival’s videos and says so', () => {
    const text = renderText(weekSales.render(weekFixture(), 'app', ctx))
    expect(text).toContain('What they complain about in a rival')
    expect(text).toContain('Counted under videos about that rival, never under yours.')
  })

  it('is honest when the week held nothing a salesperson can use', () => {
    const text = renderText(weekSales.render(thinFixture(), 'app', ctx))
    expect(text).toContain('Nothing this update read was an objection, a switch or a piece of praise')
  })

  it('shows no score anywhere', () => {
    for (const mode of MODES) {
      const text = renderText(weekSales.render(weekFixture(), mode, ctx))
      expect(text, mode).not.toMatch(/\b(pressure|score|index|rating)\b/i)
    }
  })
})

describe('WK §6 · what worked', () => {
  it('puts an n on every row, beside the multiple', () => {
    const text = renderText(weekWorked.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Promotional')
    expect(text).toContain('1.8× the median · 128 of 331 videos')
  })

  it('says whose videos it read', () => {
    // Össur's 609 rated videos are 52 of the client's and 557 of everybody
    // else's, and the block sits four inches under "Your own brand — 52
    // analysed" asking which formats earned attention.
    const text = renderText(weekWorked.render(weekFixture(), 'app', ctx))
    expect(text).toContain('yours, your rivals’ and the category’s together')
  })

  it('names a hook without claiming a direction', () => {
    // `hook_style = 'trend-riding'` is a real value a live tenant carries, and
    // "Trend riding" put a direction word outside a verdict node on Sealand's
    // production render. The label says what the hook opens ON.
    for (const mode of MODES) {
      const markup = render(weekWorked.render(weekFixture(), mode, ctx))
      expect(markupText(markup), mode).toContain('Riding what is current')
      assertCopyContract(markup)
    }
  })

  it('prints the engagement figure as the column stores it, a percentage', () => {
    // `engagement_rate` is already a percentage; a ×100 read "Promotional
    // 998%" against a 3.3× multiple on production.
    const text = renderText(weekWorked.render(weekFixture(), 'app', ctx))
    expect(text).toContain('3.8%')
    expect(text).not.toContain('380%')
  })

  it('names what it left out of the median', () => {
    expect(renderText(weekWorked.render(weekFixture(), 'app', ctx)))
      .toContain('Reddit carries no engagement figure this product can read')
  })

  it('refuses to read a format off too few rated videos', () => {
    expect(renderText(weekWorked.render(thinFixture(), 'app', ctx)))
      .toContain('Too few of this update’s videos carry an engagement figure')
  })
})

describe('the coverage line and the two sections Phase 1 does not build', () => {
  it('says who the reading is for, which update, and what it covered', () => {
    const text = renderText(weekCoverage.render(weekFixture(), 'app', ctx))
    expect(text).toContain('Prepared for Össur with Verbatim · update of 13 Sep · previous 6 Sep')
    expect(text).toContain('205 videos · 5,134 comments')
  })

  it('names the two sections that stay on Content, rather than leaving a silence', () => {
    for (const mode of MODES) {
      expect(renderText(weekCoverage.render(weekFixture(), mode, ctx)), mode).toContain(LATER_LINE)
    }
  })

  it('carries the privacy sentence', () => {
    expect(renderText(weekCoverage.render(weekFixture(), 'app', ctx)))
      .toContain('Commenters are never identified; quotes carry platform and date only.')
  })

  it('declares no figures — every number in it is already declared above', () => {
    expect(blockAnswers(weekCoverage, weekFixture()).figures).toEqual({})
  })
})

describe('the page', () => {
  it('draws the seven blocks, the two updates and the update’s own size', () => {
    const text = renderText(<WeekPage data={weekFixture()} />)
    expect(text).toContain('This week')
    expect(text).toContain('update of 13 Sep · previous 6 Sep')
    expect(text).toContain('Össur · 205 videos this update')
    for (const block of WEEK_BLOCKS) expect(text).toContain(block.title)
  })

  it('takes no horizon and no soundness band — it is dated by the update', () => {
    const markup = render(<WeekPage data={weekFixture()} />)
    expect(markup).not.toContain('How far back')
    expect(markup).not.toContain('How sound is this')
  })

  it('says what is missing when no update has ever been delivered', () => {
    const text = renderText(<WeekPage data={null} />)
    expect(text).toContain('No update has been delivered for this workspace yet')
  })

  it('keeps the whole page’s copy contract on both tenants', () => {
    for (const fixture of FIXTURES) {
      assertCopyContract(render(<WeekPage data={fixture()} />))
    }
  })

  it('binds its context to relative links, so the app navigates on the client', () => {
    expect(weekContext().appUrl).toBe('')
  })
})

describe('WK §6 · your own side, month to date (Block D, D6)', () => {
  // WAVE 1 IS THE DATA. `worked.sides` renders nowhere yet, so what is pinned
  // here is the FIXTURE: the two states wave 2 has to draw, which are not the
  // same state. A full column with a coverage gap, and a column that exists
  // and is nearly empty.

  it('gives the full arm a column with the month’s classified n beside its published one', () => {
    const sides = weekFixture().worked.sides!
    expect(sides.formats.sides.map((s) => s.audience)).toEqual(['client'])
    expect(sides.formats.sides[0].of).toBe(84)
    expect(sides.formats.sides[0].published).toBe(109)
    expect(sides.basisLine).toBe('videos published in September')
    expect(sides.coverageLine).toBe('Read from 84 of Össur’s 109 videos published in September.')
  })

  it('gives the degraded arm a thin column, not an absent one', () => {
    const sides = thinFixture().worked.sides!
    expect(sides.formats.sides[0].of).toBe(5)
    expect(sides.formats.sides[0].published).toBe(17)
    expect(sides.coverageLine).toBe('Read from 5 of Sealand’s 17 videos published in September.')
    // Five classified videos split 3 / 2 — one format exactly at
    // `ENGAGEMENT_MIN_VIDEOS` and one under it — so the column carries a median
    // in one cell and none in the other, both with their n. Wave 2 has to print
    // those two differently.
    expect(sides.formats.sides[0].byKey['story']!.engagement).toEqual({ median: 2.1, n: 3 })
    expect(sides.formats.sides[0].byKey['testimonial']!.engagement).toEqual({ median: null, n: 2 })
    // …and the column was READ, which is what makes a "0 of 5" cell honest.
    expect(sides.formats.sides[0].unread).toBeNull()
  })

  it('keeps every cell’s "of N" equal to its own column’s denominator', () => {
    for (const fixture of FIXTURES) {
      const sides = fixture().worked.sides
      if (!sides) continue
      for (const side of [...sides.formats.sides, ...sides.hooks.sides]) {
        for (const cell of Object.values(side.byKey)) {
          if (cell) expect(cell.value.n).toBe(side.of)
        }
      }
    }
  })
})
