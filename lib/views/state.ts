import { fmtInt, longMonth } from '../format'
import type { ViewsConfig } from './config'
import type { ViewRead } from './lens'
import { defaultView, PILL_LABEL, pillOf, viewChoices, type MarketView, type ViewChoice } from './view'

// What a page says about the view it reads (market-first decision F: "set
// aside from the default count, and the count says so"): the pill's options
// and the one note beside it, in the preview's slot (Conversation.dc.html: a
// quiet mono line after the pill).
//
// THE NOTE IS A COUNT, NOT A FOOTNOTE (25 Sep rulings): what the view leaves
// out, as a number of videos, or the one thing it keeps. Nothing about how the
// segments are decided: that is Settings › How to read's job.

export interface ViewNote {
  /** The count the words follow, printed as its own figure; null where the
   *  note carries none. */
  count: number | null
  words: string
}

export interface ViewState {
  /** The view the page's numbers are read on. */
  view: MarketView
  /** The view the page reads when the URL names none. */
  defaultView: MarketView
  /** A view the URL asked for that is not read for this month yet: the page
   *  reads `view` (the default) and the note says which month. */
  unread: MarketView | null
  /** The pill's three options, or none where Buyers and Makers are not live. */
  choices: ViewChoice[]
  /** The line beside the pill, or null. */
  note: ViewNote | null
}

const videos = (n: number): string => (n === 1 ? 'video' : 'videos')

/**
 * The note for a view read on its lens. `everything` is the market's pooled
 * videos in the reading month on the stored rows, `inView` the same on the
 * lens: the difference is what the view set aside. Null where nothing was set
 * aside, or a side is unknown.
 */
export function viewNote(view: MarketView, everything: number | null, inView: number | null): ViewNote | null {
  if (view === 'everything') return null
  if (view === 'makers') return { count: null, words: 'Makers’ own videos only' }
  if (everything == null || inView == null || !Number.isFinite(everything) || !Number.isFinite(inView)) return null
  const aside = everything - inView
  if (!(aside > 0)) return null
  return view === 'market'
    ? { count: aside, words: `off-topic ${videos(aside)} set aside` }
    : { count: aside, words: `makers’ and off-topic ${videos(aside)} set aside` }
}

/** "The Buyers view is not read for September yet"; for the default that sets
 *  off-topic videos aside, "Off-topic videos are not set aside for September
 *  yet". */
export function unreadNote(view: MarketView, month: string): ViewNote {
  const name = longMonth(month)
  if (view === 'market') return { count: null, words: `Off-topic videos are not set aside for ${name} yet` }
  return { count: null, words: `The ${PILL_LABEL[pillOf(view)]} view is not read for ${name} yet` }
}

/**
 * The page's view state, once its numbers are in: the view read, the pill
 * (pointing at `basePath` with the page's own params), and the note.
 * `everything` and `inView` are the market's pooled videos in the reading
 * month, on the stored rows and on the lens.
 */
export function viewState(input: {
  read: ViewRead
  cfg: ViewsConfig | null
  basePath: string
  params: Readonly<Record<string, string | undefined>>
  month: string
  everything: number | null
  inView: number | null
}): ViewState {
  const fallback = defaultView(input.cfg)
  if (input.read.state === 'not_read') {
    // THE PAGE READS THE STORED ROWS, AND SAYS WHICH VIEW IS NOT READ. One
    // lens is read a page, so a lens that is not there leaves every video in:
    // the pill presses Everything, and the note names the view and the month.
    const view: MarketView = 'everything'
    return {
      view,
      defaultView: fallback,
      unread: input.read.view,
      choices: viewChoices(input.basePath, input.params, view, input.cfg),
      note: unreadNote(input.read.view, input.month),
    }
  }
  const view = input.read.view
  return {
    view,
    defaultView: fallback,
    unread: null,
    choices: viewChoices(input.basePath, input.params, view, input.cfg),
    note: viewNote(view, input.everything, input.inView),
  }
}

/**
 * The view in one line, for a page printed or sent (no pill there): the
 * pressed option and the note, "Buyers · 243 makers’ and off-topic videos set
 * aside". Null where the page reads everything and says nothing more.
 */
export function viewLine(state: ViewState | null | undefined): { label: string; note: ViewNote | null } | null {
  if (!state) return null
  if (state.view === 'everything' && !state.note) return null
  return { label: PILL_LABEL[pillOf(state.view)], note: state.note }
}

/** The note as plain words, for a figure table or a test. */
export function noteText(note: ViewNote | null): string | null {
  if (!note) return null
  return note.count == null ? note.words : `${fmtInt(note.count)} ${note.words}`
}
