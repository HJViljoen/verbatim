import type { GlossaryKey } from '../calibration'
import { surface, type NavKey } from '../nav'

/**
 * How to read (Phase 1 WP16, design ST9) — one card per surface, plus the
 * thirteen words and a reading path.
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
 * is the one table that owns them.
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
    // YOUR MARKET (market-first WP1.6, decision K). The front page reads the
    // market in full: its size, what it talked about biggest first, what
    // people did in the comments, what they asked, its subjects, and what
    // changed and which changes were ours. Levels with the month before beside
    // them; no direction word (none can be earned before late January).
    tells: 'Your market in the month the page reads: how big it was, what it talked about biggest first, what people did and asked for in the comments, how it read on each of your subjects, and what changed, including the changes that were ours.',
    read: ['market', 'month', 'video', 'theme', 'kind', 'level', 'change', 'new'],
    cannot: [
      'It is a reading of a calendar month. The page bar names the month; its tooltip says whether it is still filling.',
      'Themes are grouped within the category, so a theme is a share of the category’s videos, never of the whole market. Makers’ videos stay in every count and are marked.',
      'Under With this update, “heard for the first time” names a theme no earlier month holds, the rule Conversation’s “New” follows. A theme an update only named again is not listed.',
      'Two months sit side by side as levels. They are compared only when both were read the same way; until then the page says why not.',
      // BRANDS IN YOUR MARKET (WP2.6; the lead's ruling of 27 Sep): the rule
      // counts a brand's name, its handles and its phrases (lib/brands/
      // aliases.ts), never in its own posts, so "none found" is a zero by that
      // rule; "not counted yet" waits for the hand check (lib/brands/precision.ts).
      'Under Brands in your market, a brand is counted in a video when the video, or a comment on it written in the month, names it: the rule counts the brand’s name, its handles and its phrases, and never counts a brand in its own posts. “None found” means the rule found no such video that month; “not counted yet” means we have not yet checked its matches by hand.',
      'It cannot tell you why anything moved. A number and a reason are different claims, and only one of them is counted.',
    ],
  },
  {
    key: 'subjects',
    // SUBJECTS ON THE MARKET (WP2.2, deploy 3). The method sentences the page
    // no longer prints under its blocks (25 Sep rulings) are said here once.
    tells: 'How big each of the subjects picked for you is in your market, month by month: in how many of the market’s videos people talked about it, what they said about it, the questions they asked on it and their own words.',
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
    tells: 'Who else is in this conversation and how each named rival reads against you, on the same subjects and the same months.',
    read: ['rival', 'audience', 'level', 'change'],
    cannot: [
      'Share here is share of the conversation we read, never market share.',
      'A video that names both you and a rival is counted in your audience only, so it is in no rival\'s share.',
    ],
  },
  {
    key: 'market',
    tells: 'What to do about it, and whether what you already did worked: the moves you declared, dated by you, read against the audiences you did not touch.',
    read: ['move', 'change', 'level', 'new'],
    cannot: [
      'A move is your statement, not ours. We report what the conversation did after it, and we never claim your move caused it.',
      'A move is read from the month after it was dated, so its first comparison lands one reading later, and it is read beside the audiences you did not touch, never against them.',
      'What the conversation did after you acted on advice is compared only once two months have been read in your audience since you decided. The month you decided in is on neither side.',
      'Advice here is grounded in what people said, not in your sales figures.',
    ],
  },
  {
    key: 'week',
    tells: 'What needs attention this week: anything unusual against the last three ended months, what came in, what is worth a reply, and what worked.',
    read: ['week', 'update'],
    cannot: [
      'A week is seven days inside a month and is never a period of its own. Every number on it is the month so far, against the three months before it; the week is how much of that arrived since the last update.',
      'Themes are re-grouped over everything we have read for you at every update, so most names first heard in an update are the same conversation under a different label. They are named only once they carry enough videos in the month.',
      'Most weeks nothing is unusual, and the page says so rather than finding something.',
    ],
  },
  {
    key: 'ask',
    tells: 'Your own question, answered from what your customers actually said, with the quotes attached.',
    read: ['video', 'month'],
    cannot: [
      'It cannot invent evidence. "We do not have this" is a real answer and you will get it.',
      'It answers against the update named on the answer, not against this minute.',
    ],
  },
  {
    key: 'reports',
    tells: 'The documents: the weekly report, the monthly reading, the quarterly review and the briefs, each as it was sent, and each linked back into the pages it came from.',
    read: ['update', 'month'],
    cannot: [
      'A sent document keeps the figures it was sent with. Where a still-filling month has moved since, the page prints both numbers rather than quietly correcting one.',
    ],
  },
  {
    key: 'settings',
    tells: 'What we track for you, what we read your market against, how ready each part of the product is for this workspace, the record of everything we did and changed, and who receives what.',
    read: [],
    cannot: [
      'Platforms and how deeply we read each video drive cost and quality, so they are set with you and changed on request. Your search terms are yours: owners and admins edit them here.',
      // WEEKLY, ON SUNDAY, AND NOT A SETTING (27 Sep, Heinrich: "remove cadence
      // from settings, and always have it weekly on sunday"). The Cadence
      // section left Tracking; lib/update-rhythm.ts holds the rule.
      'How often you are updated, and on which day, is not a setting: every workspace is updated weekly, on Sunday.',
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
      'Once Sunday’s update has landed, open This week. Most weeks it says nothing is unusual, and that is the answer.',
      'Answer what is worth a reply while the comments are still warm.',
    ],
  },
  {
    when: 'Each month, once the month is done',
    what: [
      'Read the monthly report: your market in the month just ended, what it talked about and asked for, your subjects in it, the brands it named, and what changed and what was ours.',
      `Declare what you are going to do about it on ${surface('market').label}, so next month can be read against it.`,
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
 * Definitions (copy de-clutter, 2026-09-24, ruling M). The explanations that
 * used to be printed beside figures on every visit live here once, each under
 * a stable id so a legend or a tooltip can link straight to it. Plain words,
 * one paragraph each; every threshold is the one the code applies.
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
    id: 'frozen-live',
    title: 'Frozen and live',
    body: 'A month keeps filling for thirty days after it ends and is marked still filling until then; after that it is frozen and never rewritten. A sent or exported document keeps the figures it was built with. The quoted voices in it are read live, so a comment that is withdrawn never travels.',
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
    body: 'Every workspace is updated once a week, on Sunday. The update starts at 06:00 South African time, and the pages move to it once it has finished. The day and the hour are the same for everyone, and neither is a setting. The bar on each page names the update it reads.',
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
