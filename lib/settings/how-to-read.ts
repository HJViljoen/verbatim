import type { GlossaryKey } from '../calibration'
import { surface, type NavKey } from '../nav'
import { BRANDS_HEAD_ORGANIC, NINETY_DAY_NOTE } from '../pages/overview-market/brands'

/**
 * How to read (Phase 1 WP16, design ST9; market-first WP3.10, plan §2.10 D5
 * and decision K): one card per surface, plus the reading words and a path
 * through the product.
 *
 * MARKET-FIRST (WP3.10). Every card reads the market first: the product's
 * pages are about "everything we read except your own posts" (decision E),
 * and your own posts, claims and moves are set against it. The cards are
 * written against the pages as deploy 5 draws them (plan §2.1 to §2.8), in
 * the words the pages print, and each claim is one the code keeps (GS
 * constraint 8): a rule is stated here only where a constant or a reader in
 * the code applies it, and `how-to-read.test.ts` pins every threshold named
 * below to the constant that applies it.
 *
 * THE METHOD LIVES HERE (the 25 Sep rulings, plan §1 B ruling 3). A block
 * header carries its title alone, a footer carries links alone, and no
 * explanatory or method paragraph sits under a block: "where a method needs
 * saying, that is Settings › How to read's job". So each method sentence the
 * pages stopped printing under their blocks is said here once, on the card of
 * the page that uses it or, where several pages use it, as a definition under
 * a stable anchor a page can link to.
 *
 * THE GUIDE'S REPLACEMENT, AND ITS CORRECTION. The old Guide had four sections
 * per page (what it tells you · how to read it · what to do with it each week ·
 * what it can't tell you) and its Settings card carried a false claim: "search
 * terms … are changed by us on request, not from this page", while the same
 * rail rendered a term editor the client had been able to save since
 * 2026-09-11. That sentence is not carried forward. The Guide's own header
 * comment forbade it — "every behavioural claim here must match the code" — and
 * so does AGENTS.md.
 *
 * DESIGN V2 (integration, 13 Oct). The cards describe the routed pages, one
 * each: the Dashboard, Market, Voices, Your products, Content and Your moves,
 * then the Agent, the Studio and Settings. Your market, This week, Subjects,
 * Conversation and Competitive are no longer routed (their addresses
 * redirect, `redirectFor` in lib/nav.ts), so their method sits on the card of
 * the page that took their content, said as that page prints it, and no card
 * describes a page a reader cannot open. The Dashboard has a card now: it
 * reads nothing of its own, but every tile is a claim a reader asks about.
 *
 * ONE CARD PER SURFACE, KEYED BY `NavKey`, so a page cannot be described here
 * and be missing from the shell, or be in the shell and undescribed. The
 * TITLE and the QUESTION are not repeated: they come from `lib/nav.ts`, which
 * is the one table that owns them, so a page renamed by the deploy that
 * rebuilds it (Competitive becomes Brands with deploy 5) is renamed here too.
 *
 * `read` names GLOSSARY keys rather than spelling definitions out, so a word
 * means the same thing here as it does in the "How to read this page" legend
 * and on the tile it sits under.
 *
 * Pure data. A test asserts one card per surface and that every key is real.
 */

export interface ReadingCard {
  key: NavKey
  /** What the surface tells you, in one sentence. */
  tells: string
  /** How to read it: the words it prints, defined once in the glossary. */
  read: GlossaryKey[]
  /** What it cannot tell you. The half a reader needs most and asks for least. */
  cannot: string[]
}

export const READING_CARDS: readonly ReadingCard[] = [
  {
    key: 'home',
    // THE DASHBOARD (Design v2, depth plan T8; lib/pages/v2/home.ts): one
    // tile per page, each the top of the page it opens and read the same way
    // (`topMarket`, `topVoices`, `topProducts`, `topContent`, `topMoves`),
    // plus the week's tile: the published read's frozen figures beside the
    // month, the weekly chart (`homeWeeks`) and the subjects against last
    // month through their `Verdict` (`weekSubjectsOf`). It owned nothing on
    // 1 Oct and had no card; since Design v2 it has a tile of its own.
    tells: 'The week in your market at a glance, as the latest update read it: the conversation that leads Market, your market’s videos and comments this week beside its month and week by week, your biggest subject and the one that moved most against last month, who is talking and the brands named most, your products, the first post idea, and the advice waiting for a decision, each opening its own page.',
    read: ['market', 'week', 'month', 'video', 'subject', 'change'],
    cannot: [
      'It computes nothing its pages do not: each tile is the top of the page it opens, read the same way.',
      'A week is the week the latest update read, not the last seven days, and every week figure sits beside its month.',
      'Week by week draws only weeks read the same way: it starts after the latest change to our searches or to how we check relevance, and a week still filling is drawn faint.',
      'A subject moved only where its month so far differs from last month by more than its normal swing; where none did, the tile says so. A subject still being checked is not named.',
      'A tile that cannot be read says so on its own; the rest of the page still draws.',
    ],
  },
  {
    key: 'market',
    // MARKET (Design v2, depth plan T3; lib/pages/v2/market.ts): Your market,
    // This week and Subjects folded into one page (lib/nav.ts), on three
    // periods. Decision 1: no week figure alone and no weekly direction word;
    // the subjects and the kinds compare the month so far with last month
    // through a `Verdict`. Conversations are the category's (decision E);
    // the table's floor is MARKET_TABLE_FLOOR; the lead is `weekLead`, and a
    // flag needs the anomaly check (BASELINE_MONTHS read the same way). A
    // subject that is not ready prints no level (`unmeasuredOf`). This month
    // ends with the month's long-run read (`marketLongRunOf`, 13 Oct).
    tells: 'What your market is talking about, this week, this month or over time: the conversation that leads the week, the conversations first heard this week, each of your subjects this month so far against last month, what people did in the comments, your market’s videos week by week, where it is said, and every conversation, each opening in full with its own voices. A month ends with our read of what has held across the months behind it.',
    read: ['market', 'week', 'month', 'video', 'theme', 'subject', 'kind', 'level', 'change', 'new'],
    cannot: [
      'A week is the week the latest update read, never the last seven days, and every week figure sits beside its month. Three weeks of a conversation are three counts with no word: a week alone earns no direction.',
      'Conversations are grouped within the category, so a conversation’s figures are a share of the category’s videos, never of the whole market, and the page says which. Makers’ videos stay in every count; a conversation led by makers or by off-topic videos is listed and tagged, and leads the week only where the update’s check flagged it.',
      'The week is led by what the update’s check flagged as unusual. The check needs three months read the same way and most weeks flags nothing; the week is then led by the biggest conversation first heard that week, or else by the week’s biggest.',
      'A conversation is listed once 3 of the period’s videos in the category carry it.',
      'A subject is counted by the same rule a theme is, which means it counts what people SAID, not what they bought.',
      'A subject’s month so far is called a change against last month only where it clears the band, and reads “no clear change” where it does not; two months not read the same way are not compared.',
      'A subject still being checked prints no figure, only that it is counted and marked provisional; one whose check clearly failed prints no figure while it is re-described.',
      'The kinds of thing people did in the comments overlap: one video can carry several, so together they are more than its whole.',
      'It cannot tell you why anything moved. A number and a reason are different claims, and only one of them is counted.',
      'Our read of what has held across the months sits below a month’s figures. It is written when the month closes, says so where it was written earlier, and compares no month with another. A month with no such read shows none.',
    ],
  },
  {
    key: 'voices',
    // VOICES (Design v2, depth plan T4; lib/pages/v2/voices.ts):
    // Conversation's cast and Competitive's brands, on the reading month.
    // Groups are today's profile with the month's videos (decision 2: a
    // count, never a share, never compared); brands are named unprompted
    // (`k_organic` of `n_organic`, BRANDS_HEAD_ORGANIC) with a `Verdict`, and
    // their crosses (base `any`) carry none; creators at ACCOUNT_FLOOR,
    // Reddit left out. A rival's panel is Competitive's pane over ninety days.
    tells: 'Who in your market is saying it, in the month the page reads: the groups of people talking and the videos each is in, the brands named unprompted against last month and what people did in the videos naming each, and the creators who made the most of the market’s videos, each opening in full with its own voices.',
    read: ['market', 'month', 'video', 'brand', 'rival', 'kind', 'level', 'change'],
    cannot: [
      'Who is talking is today’s groups, rebuilt at every update over everything read to date, with the videos each is in this month. Each is a count of videos, never a share and never set against another month, and a video can carry more than one group, so the counts overlap and do not sum to a whole.',
      'A brand is counted in every video that names it, not every time it is said: in the caption, the hashtags, the account, what is said or shown on screen, or a comment written that month. It is counted only once a hand check of its matches has passed, because some names mean other things: until then it reads “not counted yet”, and a name that mostly means something else is not counted.',
      // BRANDS (WP2.6; the lead's ruling of 27 Sep): the rule counts a brand's
      // name, its handles and its phrases (lib/brands/aliases.ts), never in
      // its own posts, so "no video names it" is a zero by that rule; "not
      // counted yet" waits for the hand check (lib/brands/precision.ts).
      'Under Brands, a brand is counted in a video when the video, or a comment on it written in the month, names it: the rule counts the brand’s name, its handles and its phrases, and never counts a brand in its own posts. “No video names it” means the rule found no such video that month; “not counted yet” means we have not yet checked its matches by hand.',
      `The count, “${BRANDS_HEAD_ORGANIC}”, leaves out every video our own brand searches found, so our searching for a brand does not add to its count. It is set against last month only where both months were read the same way.`,
      'What people did in the videos naming a brand, and what those videos are about, is a level with no change: a brand’s month holds too few videos to band.',
      'A brand’s figures are counts of the videos our searches found, never market share.',
      'A rival’s panel reads the ninety days ending at the last update of the month the page reads.',
      NINETY_DAY_NOTE,
      'Creators are the accounts that made 3 or more of the market’s videos in the month, with their followers as of those videos. Reddit is left out: a Reddit post’s account is its community, not a person.',
    ],
  },
  {
    key: 'products',
    // YOUR PRODUCTS (Design v2, depth plan T5; lib/pages/v2/products.ts):
    // the catalogue (Settings › Your products) as the products step placed
    // its talk. The basis is every video of the month, every audience pooled,
    // the client's own posts included (`marketProductMonth`); the client's
    // own words never place (`contentFields`). Standouts need STANDOUT_MIN
    // videos; every comparison is a `Verdict`, refused across a catalogue
    // change. The kinds name where they were found (`productKindLabel`).
    tells: 'What your market says about what you sell, by the products and categories in Settings › Your products: the products and categories that stand out this month, every category with its products shaded by their videos, and, opened, a category’s or a product’s videos, what they are about, what people did in their comments, its share of the market month by month, and the talk about your products we could not place under one.',
    read: ['market', 'month', 'video', 'subject', 'kind', 'level', 'change', 'new'],
    cannot: [
      'Every video of the month counts, every audience together and your own posts included, because talk about your products lives in creators’ videos and in the comments under your posts. What your own posts say never places a product; the comments under them do.',
      'A product is placed where a video or a comment names it, by its name or another name in your catalogue. A comment about one of your products that does not say which is counted as such, never guessed, and an owner or an admin can tag it.',
      'What people did is found anywhere in the comments of the videos naming a product: praise in the comments may be about something else in the video.',
      'A standout needs 3 or more videos. A product is set against its category only where the difference clears the band, and with a product’s tens of videos it rarely does. A category’s share is set against last month the same way, and two months read on different product lists are not compared.',
      'A product with no reading in a month reads “not read yet”, never quiet.',
      'Until your catalogue is loaded and its reading is switched on, the page says which is missing rather than printing a count.',
    ],
  },
  {
    key: 'content',
    // CONTENT (Design v2, depth plan T6; lib/pages/v2/content.ts): five
    // blocks, each on its own clock. The week is a run's frozen window
    // (`anchorOf`); post ideas are T13's (`post_ideas`, written every week
    // over the POST_IDEAS_READ_DAYS (28) to the update, `ideasReadWindow`:
    // POST_IDEA_MIN_COMMENTS asking comments on POST_IDEA_MIN_VIDEOS videos,
    // untouched by the client's posts over POST_IDEA_OWNED_MONTHS, hidden past
    // IDEAS_STALE_DAYS); the format and opening need POST_IDEA_MIN_RATED
    // rated videos; What works is `buildPlaybook` on the published clock;
    // a post touches a question on TOUCH_MIN_WORDS words (`questionTouch`).
    tells: 'What to post next and what works in your market: the post ideas, written each week from the questions your market asked over the four weeks to the latest update, each one your posts have not touched on, the market’s formats and openings against your own posts, the comments worth a reply, your own posts this month, and the other questions asked.',
    read: ['market', 'week', 'month', 'video', 'update'],
    cannot: [
      'A week is the week the latest update read, not the last seven days. Every week figure sits beside its month, and a run of weeks is bare counts with no word: three for a question asked, four for a post idea.',
      'A post idea is written for a question your market asked at least 3 times on 2 or more videos in the four weeks to an update, and only where none of your posts from that month and the two before touched on it. The ideas print the days they read, and stop printing once they are four weeks older than the page’s week.',
      'A post touches a question when what it is about shares two or more of the question’s words, leaving out the common ones.',
      'Who asks names the groups, never a count of them.',
      'The format and opening on an idea are what worked in your market, chosen by counting, and only where 10 or more rated videos stand behind them.',
      'What works is dated by the day each video was published, not by its comments, and Reddit is left out of response, because a Reddit post has no views.',
      'Worth a reply is a list: nothing here can see whether you replied.',
      'Your own posts are counted by the day you posted them.',
      'In a medical market, every idea carries a line to check it with your medical team.',
    ],
  },
  {
    key: 'moves',
    // YOUR MOVES (Design v2, depth plan T7; lib/pages/v2/moves.ts;
    // /dashboard/moves): what you do as a business, set against the market.
    // A move is read from MOVE_MONTHS_BEFORE months before it, its one
    // comparison through `pairedVerdict` under the month-pair judge; the
    // writes are `mayDecideMoves`'; statements are held from tenants
    // (STATEMENTS_TENANT_VISIBLE). The questions left for Content.
    tells: 'What you do as a business, set against your market: the advice waiting for a decision, the moves you dated and what your market did after each, what you say and what your market says back, your plan checked against the market, what we concluded, and the record of every piece of advice and what you decided.',
    read: ['market', 'move', 'month', 'update', 'level', 'change'],
    cannot: [
      'A move is your statement, not ours. It is read in your market from two months before the month you dated it to the month the page reads, and we never claim your move caused anything.',
      'Each move earns one comparison: the month before it against the latest month read since. It is called a change only where the two were read the same way and it clears the band; otherwise the latest level prints alone.',
      'The videos a piece of advice rests on, how many updates in a row raised it and what we concluded are read over everything to date and dated by the update, so they can reach past the month on the page.',
      'Advice here is grounded in what people said, not in your sales figures.',
      'Only an owner or an admin can accept advice, set it aside, date a move or change a move’s status.',
      'What you say, and what comes back, is not shown to the workspace yet.',
    ],
  },
  {
    key: 'ask',
    // ASK (plan §2.8): answers from what the market said, with the evidence;
    // a movement is held to the pages' comparability rule (WP1.3), and the
    // monthly cap is ASK_MONTHLY_CAP.
    tells: 'Your own question, answered from what your market actually said, with the quotes attached.',
    read: ['market', 'video', 'month'],
    cannot: [
      'It cannot invent evidence. "We do not have this" is a real answer and you will get it.',
      'It answers against the update named on the answer, not against this minute.',
      'Where an answer says something moved, it is held to the pages’ rule: two months read the same way, or it says why not.',
      'A workspace can ask 40 questions a month.',
    ],
  },
  {
    // The Studio's card since 1 Oct: Reports folded into it (lib/nav.ts).
    key: 'studio',
    // REPORTS (plan §2.9): the monthly reads the month that has just ended,
    // one update past its end (MONTHLY_UPDATES_PAST_END, the fast track's
    // rule of 27 Sep), and every document keeps the figures it was sent with.
    // DESIGN V2: This week is no longer a page, so the full weekly read is a
    // past issue here (and its share link); its email is level 1 (T11b).
    tells: 'What we send you: the weekly read of each update, the monthly report on your market in the month that has just ended, the quarterly review and the briefs, each as it was sent and each linked back into the pages it came from.',
    read: ['update', 'week', 'month', 'market'],
    cannot: [
      'A sent document keeps the figures it was sent with. Where a still-filling month has moved since, the page prints both numbers rather than quietly correcting one.',
      'The monthly report reads the month that has just ended, one update past its end. A page read after the report reads that month with later updates, so its counts can differ from the report’s; each says which update it was read with.',
      'The weekly read’s email carries the week in short; the read in full opens from its past issue.',
    ],
  },
  {
    key: 'settings',
    // SETTINGS (plan §2.10; the tabs are lib/settings/rail.ts). Decision I:
    // while a workspace's searches are held still, a term, rival or handle
    // edit waits in a queue and lands on the 1st of a month, no earlier than
    // QUEUE_FLOOR (lib/settings/queue.ts). DESIGN V2 (T10b, T10c): Your
    // products and Your subjects are client tabs; recipients left for the
    // Studio; Readiness, The record and this page are the operator's.
    tells: 'What we read for you and how: your market and the searches that find it, your products, your subjects, your team and billing, and, for us, how ready each part of the product is for this workspace and the record of everything we did and changed.',
    read: ['market', 'subject', 'update'],
    cannot: [
      'Platforms and how deeply we read each video drive cost and quality, so they are set with you and changed on request. Your search terms are yours: owners and admins edit them here.',
      // WEEKLY, ON SUNDAY, AND NOT A SETTING (27 Sep, Heinrich: "remove cadence
      // from settings, and always have it weekly on sunday"). The Cadence
      // section left Tracking; lib/update-rhythm.ts holds the rule.
      'How often you are updated, and on which day, is not a setting: every workspace is updated weekly, on Sunday.',
      'While your searches are held still, a change to a search term, a brand you track or its accounts is queued for the 1st of a month, no earlier than 1 January 2027, and nothing queued is applied before then.',
      // TERM_YIELD_BASIS (lib/settings/terms.ts), the one run-dated figure on
      // the page: its column head says "by update", and this is the sentence
      // that was a footnote under the table (25 Sep rulings, WP3.10).
      'What a search term found is dated by the update that searched, not by when the comments were written.',
      'Nothing in your products is deleted: a product or one of its names is retired, and a name is retired and added again rather than edited.',
      'A workspace follows at most ten subjects. A subject is read in the months still filling when it is added; a month already final is not read for it.',
    ],
  },
]

/** A path through the product on the three clocks it actually keeps. The
 *  Guide's "what to do with it each week" was one list per page and answered a
 *  question nobody asked in that order; a reader arrives on a cadence. */
export const READING_PATH: readonly { when: string; what: string[] }[] = [
  {
    when: 'Each week',
    what: [
      `Once Sunday’s update has landed, open the ${surface('home').label}: the week in your market at a glance, each tile opening its page. Most weeks nothing is unusual, and that is the answer.`,
      `On ${surface('content').label}, pick the week’s post idea and answer what is worth a reply while the comments are still warm.`,
    ],
  },
  {
    when: 'Each month, once the month is done',
    what: [
      'Read the monthly report: your market in the month just ended, what it talked about and asked for, your subjects in it, the brands it named, and what changed and what was ours.',
      `Date what you are going to do about it on ${surface('moves').label}, so the months after it can be read beside it.`,
    ],
  },
  {
    when: 'Each quarter',
    what: [
      'Read the quarterly review: three months together, what we flagged and what each turned out to be, and what we could not settle.',
      'Check Readiness and the record: that is where the limits of everything above are written down.',
    ],
  },
]

/**
 * Definitions (copy de-clutter, 2026-09-24, ruling M; market-first WP3.10).
 * The explanations that used to be printed beside figures on every visit live
 * here once, each under a stable id so a legend or a tooltip can link straight
 * to it. Plain words, one paragraph each; every threshold is the one the code
 * applies, and `how-to-read.test.ts` holds each to its constant.
 */
export interface Definition {
  /** The anchor on Settings › How to read. Stable: links point at it. */
  id: string
  title: string
  body: string
}

// NO "HOW SOUND IS THIS" CARD (25 Sep rulings, market-first WP1.2). It
// explained the page bar's pill, and the pill left every page. The record it
// pointed at is Settings › The record.
export const DEFINITIONS: readonly Definition[] = [
  {
    // WHICH MONTH A PAGE READS (decision A, lib/reading/reading-month.ts:
    // READING_SWITCH_FRACTION, READING_SWITCH_UPDATES, MONTH_READABLE_VIDEOS,
    // monthWords and barLine). The bar's line and the selector's tooltip
    // replaced the bar's old "so far" and "still filling" words (25 Sep
    // rulings), so what those words meant is said here.
    id: 'reading-month',
    title: 'The month a page reads',
    body: 'Every reading page reads one month: the month that has just ended, until the next month is half over, has had two updates and holds enough videos to read, and then that month so far. The other month is one click away in the month selector, whose tooltip says where the month stands: so far, ended and still filling until a named update, final, read at setup, or too few to read, which is under 100 videos in your market. The line beside the selector names the update the page was read with and when the next one is due; it is never today’s date. Where no update has run since, a page reads the last month it has.',
  },
  {
    // DECISION E, said once (lib/reading/market.ts pooledDenominators; the
    // glossary's `market`). The front page names both bases once at the top;
    // here is why there are two.
    id: 'the-market',
    title: 'Your market, and the category inside it',
    body: 'Your market is the wider market you sell into: what people buying and talking about what you sell say on Instagram, TikTok, YouTube and Reddit, worldwide, not only your own customers. It is everything we read except your own posts: the category, plus the videos filed under a brand you track, counted once as one market. Its size, subjects, kinds of comment, mood and brands are read on the whole of it. Themes are grouped within the category, because themes are grouped per audience, so a theme is a share of the category’s videos, never of the whole market. Your own posts are read on your pages about you, never counted as your market.',
  },
  {
    // DECISION F (lib/pages/overview-market/board.ts: MAKER_GROUP_SHARE,
    // MAKER_NOTE_SHARE, LEAD_MAX_MAKER_SHARE; lib/segments/rules.ts). The
    // off-topic group is ThemeBoard's `setAside`, grouped the same way.
    id: 'makers',
    title: 'Makers and off-topic videos',
    body: 'A maker’s video is one where people make the thing themselves, such as sewing, crochet or DIY, marked by a word check on the caption, hashtags and topics where a maker rule is switched on for your workspace. Makers stay in every count of your market. A theme where half or more of the videos are makers’ is grouped into one makers line, a theme where a fifth or more are makers’ prints its maker share, and a theme the front page quotes must be a quarter makers or fewer. A theme led by off-topic videos, such as those a bare brand name found about something else, is grouped the same way, as set aside, and those videos stay in the count as well.',
  },
  {
    // DECISION C (lib/subjects/calibration-state.ts; SUBJECT_PRECISION_FLOOR).
    id: 'provisional',
    title: 'Provisional, and being re-described',
    body: 'Each subject is checked against rows read by hand. A subject whose check measured 0.85 or better prints as it is. One not checked yet, or under 0.85 without being clearly under, is marked provisional: where a page prints its figure it carries no change and never leads, and Market lists it without one. One clearly under, where even the top of its likely range is below 0.85, prints no figure and reads “being re-described” until it is fixed.',
  },
  {
    // DECISION D (lib/reading/comparability.ts; the four rules are
    // lib/pages/overview-market/change.ts COMPARE_RULES, which The record
    // prints with how each stands). Not repeated here: named, and where.
    id: 'not-read-as-a-change',
    title: 'Not read as a change',
    body: 'Two months are compared only when both were read the same way: the newer month has ended and been read past its end, the searches ran unchanged through both, no change of ours to how we check or file videos touched a tenth or more of either, and the newer month’s threads have filled to four fifths of the older month’s depth. Where any of that fails, the two months sit side by side as levels, marked “not read as a change”, with the reason. Where a change of ours touched from 1% to 9% of a month, the comparison prints with a note. The four rules, and how each stands for the month the pages read, are on The record under “When two months are compared”.',
  },
  {
    // WP2.3 (lib/reading/recheck.ts: CHECK_MIN_VIDEOS, DENSE_MIN_DATED,
    // mayPrintMoved). "What changed, and what is ours" prints the outcome;
    // how it is read is said here.
    id: 're-check',
    title: 'The re-check',
    body: 'Beside two months not read as a change, the re-check reads them again three ways: on only the searches both months ran, without makers and off-topic videos; on well-read videos, those with 20 or more comments written in the month; and on everything but the off-topic videos. It can say something moved only on the searches both months ran, where each month holds 100 videos, and it is always marked provisional.',
  },
  {
    // WP1.8 and WP2.4's provenance (video_provenance; the board's
    // `provenance.fromNewSearches`).
    id: 'from-added-searches',
    title: 'From searches we added',
    body: 'Where a page counts the videos that came from searches we added, it counts the videos found only by searches we first ran in the month the page reads. A figure found mostly by them may be ours as much as your market’s, which is why a month in which searches we added found a tenth or more of the videos is not compared with the month before it.',
  },
  {
    // DECISION E's brand rule and S17's ninety-day note
    // (lib/pages/overview-market/brands.ts NINETY_DAY_NOTE; the test holds the
    // sentence to it). Said once here, never under a block.
    id: 'brands',
    title: 'How a brand is counted',
    body: `A brand is counted in every video it comes up in, not every time it is said: in the caption, the hashtags, the account, what is said or shown on screen, or a comment written that month. Wherever a page counts a brand, it is counted only once a hand check of its matches has passed, because some names mean other things: Freitag is German for Friday, Cotopaxi is a volcano and Patagonia a region. Until its check passes a brand reads “not counted yet”, never a count. A brand’s own posts are its posts, never your market naming it. The count, “${BRANDS_HEAD_ORGANIC}”, leaves out every video our own brand searches found. Ninety-day counts read today’s tags; frozen months keep the tags they froze with.`,
  },
  {
    // WP2.7 (update_arrivals, MF2 part C): counts that add up to months.
    id: 'with-this-update',
    title: 'What came in with an update',
    body: 'What came in with an update counts the videos read in your market for the first time and the comments that came in, each placed in the month its comments were written. They are counts that add up to months: nothing is computed over an update or a week alone.',
  },
  {
    id: 'all-time',
    title: 'Counted over everything we have read for you',
    body: 'Some figures are not about one month. The videos behind a conclusion or a piece of advice, and how deeply we read each video, are counted over everything we have read for you up to the month on the page, so they can be larger than that month.',
  },
  {
    id: 'floor',
    title: 'The floor',
    body: 'A change is banded only when each side carries at least 100 videos and at least 10 carry the thing measured; below that it reads too few to compare. A month under 100 videos is below the floor: it has not filled up, which is not a failure. A group of commenters is named only where at least 3 videos carry it, a head-to-head row or a rival’s questions need 10 videos, and a theme first heard in an update is named only once it carries 10 videos in the month.',
  },
  {
    // MARKET-FIRST: the state words moved from the bar to the month
    // selector's tooltip (25 Sep rulings; monthWords), so "marked still
    // filling" says where.
    id: 'frozen-live',
    title: 'Frozen and live',
    body: 'A month keeps filling for thirty days after it ends: every update reads the comments written in it until then, and the month selector says which update it is still filling until. After that it is final: frozen and never rewritten. A sent or exported document keeps the figures it was built with. The quoted voices in it are read live, so a comment that is withdrawn never travels.',
  },
  {
    id: 'read-at-setup',
    title: 'Read at setup',
    body: 'Months that had already closed when we started were read back at setup. They are a reading of what we hold today, not what we would have reported at the time, and a chart marks them.',
  },
  {
    // The rhythm, said once (27 Sep): the Cadence section that used to carry
    // it left Settings › Tracking. SLOT_HOUR in lib/pipeline/schedule-due.ts
    // is the 06:00; the dispatcher fires then and, since 12 Oct, starts the
    // workspaces one after another (inngest/functions/scheduler.ts), so only
    // the first update starts at 06:00 and the copy says so.
    id: 'updates',
    title: 'When updates land',
    // NOW, NOT ALWAYS (finish-list item 19): the rule is from 27 Sep, and
    // earlier updates ran on other days, some by hand; The record lists each
    // on the day it ran.
    body: 'Every workspace is now updated once a week, on Sunday. The updates start at 06:00 South African time, one workspace after another, and the pages move to each once it has finished. The day and the starting hour are the same for everyone, and neither is a setting. Earlier updates ran on other days as well, and The record lists each one on the day it ran. The bar on each page names the update it reads.',
  },
  {
    id: 'reddit',
    title: 'The Reddit cap',
    body: 'Reddit comments are read to 40 per thread and no deeper. A Reddit post has no views, so it carries no engagement rate and is in no engagement row.',
  },
  {
    // WEEK BY WEEK (market-first decision M, part 1; WP2.9): the method the
    // bars do not carry under themselves (25 Sep rulings). Linked from Your
    // market's "With this update" and This week's "Week by week".
    id: 'week-by-week',
    title: 'Week by week',
    body: 'Week by week counts your market’s videos and comments for each week, Monday to Sunday, by the day each comment was written. Your own posts are not counted. The counts follow our searches as much as the market: a week in which we added a search holds the videos it found, so the chart marks the days we changed our searches or how we check relevance. A video with comments in two weeks counts in both, so the weeks’ videos do not add up to a month. A week still being read says so: so far, or filling until two updates have read it. A weekly reading is read once a week is two updates old, and compared only with weeks read the same way; until a check on real data passes it is pending.',
  },
  {
    id: 'new',
    title: 'New',
    body: 'New means there is no earlier month in our record in which the theme behind it was mentioned, in your audience or in the category. It is a fact about the record, not a direction.',
  },
]
