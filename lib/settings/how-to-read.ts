import type { GlossaryKey } from '../calibration'
import { surface, type NavKey } from '../nav'

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
    key: 'overview',
    // YOUR MARKET (market-first WP1.6, deploy 2; blocks 3, 7 and 8 with
    // deploy 3). The front page reads the market in full, then what it means
    // for you, then the brands, then what changed and which changes were
    // ours. Levels with the month before beside them; no direction word (none
    // can be earned before late January, plan §2.11).
    tells: 'Your market in the month the page reads: how big it was, what it talked about biggest first, what came in with the latest update and week by week, what people did and asked for in the comments, how it read on each of your subjects, what it means for you and what you published, the brands it named, and what changed, including the changes that were ours.',
    read: ['market', 'month', 'video', 'theme', 'kind', 'level', 'change', 'new'],
    cannot: [
      'It is a reading of a calendar month. The page bar names the month and the update it was read with; the month selector’s tooltip says whether the month is still filling.',
      'Themes are grouped within the category, so a theme is a share of the category’s videos, never of the whole market. Makers’ videos stay in every count and are marked.',
      'Under With this update, “heard for the first time” names a theme no earlier month holds, the rule Conversation’s “New” follows. A theme an update only named again is not listed.',
      'Two months sit side by side as levels. They are compared only when both were read the same way; until then the page says why not.',
      // BRANDS IN YOUR MARKET (WP2.6; the lead's ruling of 27 Sep): the rule
      // counts a brand's name, its handles and its phrases (lib/brands/
      // aliases.ts), never in its own posts, so "none found" is a zero by that
      // rule; "not counted yet" waits for the hand check (lib/brands/precision.ts).
      'Under Brands in your market, a brand is counted in a video when the video, or a comment on it written in the month, names it: the rule counts the brand’s name, its handles and its phrases, and never counts a brand in its own posts. “No video names it” means the rule found no such video that month; “not counted yet” means we have not yet checked its matches by hand.',
      'It cannot tell you why anything moved. A number and a reason are different claims, and only one of them is counted.',
    ],
  },
  {
    key: 'subjects',
    // SUBJECTS ON THE MARKET (WP2.2, deploy 3). The method sentences the page
    // no longer prints under its blocks (25 Sep rulings) are said here once.
    // "Your subjects", not "the subjects picked for you" (decision G, WP3.1):
    // a subject is something your market talks about that you chose to
    // follow, and Settings › Subjects prints who chose each one.
    tells: 'How big each of your subjects is in your market, month by month: in how many of the market’s videos people talked about it, what they said about it, the questions they asked on it and their own words.',
    read: ['subject', 'market', 'level', 'month', 'video'],
    cannot: [
      'A subject is counted by the same rule a theme is, which means it counts what people SAID, not what they bought.',
      'A subject still being checked prints its figure marked provisional; one whose check clearly failed prints no figure while it is re-described.',
      'Makers’ videos stay in every count. A subject where a fifth or more of the videos are makers’ says so beside its figure.',
      'Two months sit side by side as levels. A line joins two months only where both were read the same way; until then each month stands alone.',
      'The questions asked on a subject are counted over the period you pick, each video placed by the day it was posted, and matched against what your own posts are about: two or more words in common count as a post touching a question. What your posts claim is not read for this yet.',
      'The kinds of thing said about a subject overlap: one video can carry several, so together they are more than its whole.',
      'Your own posts are counted by the day you posted them, while every other figure on the page is dated by the comment. Say vs hear reads the latest update.',
    ],
  },
  {
    key: 'voice',
    // CONVERSATION (market-first WP2.4, plan §2.4). Every theme the category
    // read on 10 videos or more in the month, biggest first and nothing
    // skipped; the month before beside each as a level; New and Now 10+ as
    // flags, never as change; one theme in full; who is talking.
    tells: 'Everything your market talked about in the month the page reads: every theme at 10 videos or more, biggest first, with the month before beside each, which ones were first heard or are newly at 10, how many of each theme’s videos came from searches we added that month, one theme in full with its own voices, and who is talking.',
    read: ['market', 'theme', 'kind', 'video', 'month', 'level', 'new'],
    cannot: [
      'Themes are grouped within the category, so a theme is a share of the category’s videos, never of the whole market. Makers’ videos stay in every count; a theme that is half or more makers’ own is listed with the other maker-led ones at the end.',
      '“New” means no earlier month holds the theme, and “Now 10+” that it had fewer than 10 videos the month before. Neither is a change: the month before had too few to call one.',
      'The grouping into themes is ours and it can change. When an update re-groups every theme, the names it gives are not marked “New”.',
      'Where a theme’s videos came from counts only the searches we first ran that month, so a theme found mostly by them may be ours as much as the market’s.',
      'Who is talking is grouped at an update over everything read to date, not over the month, and a video can carry more than one group, so those counts overlap and do not sum to a whole.',
    ],
  },
  {
    key: 'competitive',
    // BRANDS (plan §2.5; the page is rebuilt with deploy 5, WP3.5, and the
    // label follows lib/nav.ts). The counting rules are decision E's and the
    // code's (lib/brands/mentions.ts, lib/brands/owners.ts,
    // lib/pages/overview-market/brands.ts): every video a brand comes up in,
    // its other meanings checked first, its own posts never counted as the
    // market naming it, and the headline count without the videos our rival
    // searches found. S17's ninety-day note is said here, never under a block.
    tells: 'Which brands your market names and what is said around them: how many of the market’s videos named each brand you track, one brand in full over the last 90 days, what your market asks under their content, and what they post and say about themselves.',
    read: ['brand', 'rival', 'market', 'video', 'level'],
    cannot: [
      'A brand is counted in every video that names it, not every time it is said: in the caption, the hashtags, the account, what is said or shown on screen, or a comment written that month. Each name is checked for its other meanings first, and a name that mostly means something else is not counted.',
      'A brand’s own posts are its posts, never your market naming it, so they are counted apart.',
      'The first count leaves out every video our own rival searches found, so our searching for a brand does not add to its count; the count in all sits beside it.',
      'Ninety-day counts read today’s tags; frozen months keep the tags they froze with.',
      'Share here is share of the videos our searches found, never market share.',
      'A video that names both you and a rival is counted in your audience only, so it is in no rival\'s share.',
    ],
  },
  {
    key: 'market',
    // YOUR MOVES (plan §2.6, WP3.6): what you say and do, set against what
    // your market asks. The rules are the page's: a post touches a question
    // on two or more words that are not common ones (the words checked are
    // listed), a dated move is read in the market as levels, and a
    // conclusion is read over everything to date.
    tells: 'What you say and do, against what your market asks: the questions it asked and whether your posts touched them, the advice and what you decided, what you say and what your market says back, the moves you dated, what we concluded and the plans we re-checked.',
    read: ['market', 'move', 'level', 'change'],
    cannot: [
      'A post touches a question when it shares two or more of the question’s words, leaving out the common ones. Where none does, the page lists the words it checked.',
      'A move is your statement, not ours. It is read in your market as levels, the month you dated it and the months after, and we never claim your move caused anything.',
      'What the conversation did after you acted on advice is compared only once two months have been read in your audience since you decided. The month you decided in is on neither side.',
      'What we concluded is read over everything to date and dated by the update that concluded it, so it can reach past the month on the page.',
      'Advice here is grounded in what people said, not in your sales figures.',
    ],
  },
  {
    key: 'week',
    // THIS WEEK (plan §2.7): dated by the update, not by the month. Nothing is
    // computed over a week alone (§9.1 #5): what came in are counts that add
    // to months, and week by week counts videos and comments, never a share.
    tells: 'What came in with the latest update: the videos and comments it brought into your market’s month, the themes heard for the first time, your market’s subjects, week by week, what is worth a reply, what worked, and anything unusual against the months before.',
    read: ['update', 'week', 'market', 'month'],
    cannot: [
      'An update is not a period. Every figure on this page belongs to the month its comments were written in; the update is how much of that month arrived since the last one.',
      'Nothing here is computed over a week alone. Week by week counts videos and comments, never a share of them.',
      'Themes are re-grouped over everything we have read for you at every update, so most names first heard in an update are the same conversation under a different label. They are named only once they carry 10 videos in the month.',
      'Moving now sets the month against the months before only where they were read the same way; until then it says why not.',
      'Most weeks nothing is unusual, and the page says so rather than finding something. The unusual-week check needs three months read the same way, and says it is forming until then.',
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
    key: 'reports',
    // REPORTS (plan §2.9): the monthly reads the month that has just ended,
    // one update past its end (MONTHLY_UPDATES_PAST_END, the fast track's
    // rule of 27 Sep), and every document keeps the figures it was sent with.
    tells: 'What we send you: the monthly report on your market in the month that has just ended, the quarterly review and the briefs, each as it was sent and each linked back into the pages it came from.',
    read: ['update', 'month', 'market'],
    cannot: [
      'A sent document keeps the figures it was sent with. Where a still-filling month has moved since, the page prints both numbers rather than quietly correcting one.',
      'The monthly report reads the month that has just ended, one update past its end. A page read after the report reads that month with later updates, so its counts can differ from the report’s; each says which update it was read with.',
    ],
  },
  {
    key: 'settings',
    // SETTINGS (plan §2.10). Decision I: while a workspace's searches are held
    // still, a term, rival or handle edit waits in a queue and lands on the
    // 1st of a month, no earlier than QUEUE_FLOOR (lib/settings/queue.ts).
    tells: 'What we read for you and how: your market and the searches that find it, your subjects, how ready each part of the product is for this workspace, the record of everything we did and changed, and who receives what.',
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
      `Once Sunday’s update has landed, open ${surface('week').label}: what the latest update brought into your market’s month. Most weeks nothing is unusual, and that is the answer.`,
      'Answer what is worth a reply while the comments are still warm.',
    ],
  },
  {
    when: 'Each month, once the month is done',
    what: [
      'Read the monthly report: your market in the month just ended, what it talked about and asked for, your subjects in it, the brands it named, and what changed and what was ours.',
      `Date what you are going to do about it on ${surface('market').label}, so the months after it can be read beside it.`,
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
    body: 'Each subject is checked against rows read by hand. A subject whose check measured 0.85 or better prints as it is. One not checked yet, or under 0.85 without being clearly under, prints its figure marked provisional: it carries no change, and it is never the front page’s headline. One clearly under, where even the top of its likely range is below 0.85, prints no figure and reads “being re-described” until it is fixed.',
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
    body: 'A brand is counted in every video it comes up in, not every time it is said: in the caption, the hashtags, the account, what is said or shown on screen, or a comment written that month. On Brands and on Your market a brand is counted only once a hand check of its matches has passed, because some names mean other things: Freitag is German for Friday, Cotopaxi is a volcano and Patagonia a region. Until its check passes a brand reads “not counted yet”, never a count. A brand’s own posts are its posts, never your market naming it. The first count leaves out every video our own rival searches found, and the count in all sits beside it. Ninety-day counts read today’s tags; frozen months keep the tags they froze with.',
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
    // is the 06:00; the dispatcher fires then for every workspace.
    id: 'updates',
    title: 'When updates land',
    // NOW, NOT ALWAYS (finish-list item 19): the rule is from 27 Sep, and
    // earlier updates ran on other days, some by hand; The record lists each
    // on the day it ran.
    body: 'Every workspace is now updated once a week, on Sunday. The update starts at 06:00 South African time, and the pages move to it once it has finished. The day and the hour are the same for everyone, and neither is a setting. Earlier updates ran on other days as well, and The record lists each one on the day it ran. The bar on each page names the update it reads.',
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
