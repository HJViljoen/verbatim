
import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote, BlockQuotes } from '@/components/blocks/quote'
import { PlatformIcon } from '@/components/charts/platform-icon'
import type { ReactNode } from 'react'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { MakerMark } from '@/components/pages/overview/market'
import { allRedescribed, SUBJECTS_ALL_REDESCRIBED, voiceCite, voicesMeta, type SubjectsData, type SubjectVoice } from '@/lib/pages/subjects'

// SU2 · six voices on the subject (design §3 SU2, the mock's (c)).
//
// ORIGINAL FIRST, ENGLISH BENEATH, ALWAYS LABELLED. `QuoteBlock` owns that rule
// and this block does not restate it (components/quote-block.tsx, WP6). What
// this block owns is WHICH six: drawn round-robin across the audiences, so the
// category's volume cannot silence the two voices under your own posts.
//
// THE WORDS RESOLVE AT RENDER. A snapshot keeps the ref and empties the text
// (lib/renderables/quotes-freeze.ts), which is what makes an erasure reach a
// stored artefact — a quote whose words are gone says so rather than printing
// an empty pair of quotation marks.
//
// ---- what wave 2 changed ------------------------------------------------------
//
// THREE ACROSS, NOT SIX DOWN. Six quotes stacked in one column is a column of
// reading and the tile was the tallest thing on the page; the artboard lays
// them out three across, which is what makes a set of voices scannable as a
// SET. Two columns below `xl`, one on a phone.
//
// THE PLATFORM IS A GLYPH — IN THE APP, WHERE THERE IS ONE. The cite led with
// the platform lower-cased as stored ("tiktok · 14 Sep"), which is a column
// value printed at a reader; the glyph carries it and the words carry the date
// and the place. On PAPER it does not: a brief is read with no tooltip and
// nothing to hover, and a 10px mark is decoration rather than an attribution —
// the artboard prints "Instagram · 7 Sep · under your post". So the print and
// email arms drop the mark and take the whole attribution from `voiceCite`,
// which is the ONE composer of that string (lib/pages/subjects.ts) and the
// answer to three spellings of two platforms inside one monthly report.
//
// AND THREE KINDS OF EVIDENCE READ AS THREE (`QuoteRow.source`, carried through
// for the first time — the field has been scored since WP7 and only the picker
// read it). A creator SAYING something on camera is flagged "Said on camera",
// and where that same video also printed words on the frame the two are shown
// together, which is the mock's own pairing: what they said, and what the video
// said at the same time.

/** What a frame whose evidence row no longer resolves says. The speaker's own
 *  words have `BlockQuote`'s sentence; this is the frame's. */
const FRAME_GONE = 'counted, not quotable: this frame has since been removed'

const SOURCE_FLAG: Record<string, string | null> = {
  comment: null,
  video: 'Said on camera',
  video_text: 'On screen',
}

/** One voice: its flag, the words, the on-screen pairing, the cite. */
function Voice({ voice, mode }: { voice: SubjectVoice; mode: RenderMode }) {
  const flag = SOURCE_FLAG[voice.source] ?? null
  const cite = mode === 'print' ? (
    <span>{voiceCite(voice)}</span>
  ) : (
    <span className="flex items-center gap-1.5">
      {voice.platform ? <PlatformIcon platform={voice.platform} className="shrink-0" /> : null}
      <span>{voice.cite}</span>
    </span>
  )
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {flag ? (
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{flag}</span>
      ) : null}
      <BlockQuote
        quote={voice.quote}
        mode={mode}
        cite={voice.href ? <a href={voice.href} rel="noreferrer" target="_blank">{cite}</a> : cite}
      />
      {voice.onScreen ? (
        // A SIBLING NODE WITH ITS OWN MARKER, never a span inside the quote.
        // The frame's words are the video's, not the speaker's, and rule (c)
        // may not police either of them.
        //
        // AND IT IS A QUOTE WITH ITS OWN REF (fix pass), so `freezeQuotes`
        // empties it like every other quote on this page and the words come
        // back at render. Which is also why the unresolved arm exists: a frame
        // whose evidence row is gone says so, instead of printing an empty
        // pair of quotation marks.
        <span className="ml-3.5 rounded-[4px] bg-inner px-2.5 py-1.5 text-[12px] text-muted-foreground">
          On-screen text on the same video:{' '}
          {voice.onScreen.text.trim() ? (
            <span data-copy="quote" className="text-secondary-foreground">“{voice.onScreen.text}”</span>
          ) : (
            <span className="font-mono text-[10.5px]">{FRAME_GONE}</span>
          )}
        </span>
      ) : null}
    </div>
  )
}

export const subjectsVoices: Block<SubjectsData> = {
  key: 'subjects.voices',
  title: 'Voices on this subject',
  question: 'What are people actually saying?',

  render(data, mode = 'app', ctx) {
    const pane = data.selected
    // VOICES ON IT, FROM THE READING MONTH (WP2.2): a pane the loader builds;
    // one stored before WP2.2 prints as sent (below).
    if (data.list.base !== undefined && (!pane || pane.monthStates !== undefined)) {
      return <MarketVoices data={data} mode={mode} appUrl={ctx.appUrl} />
    }
    const empty = subjectsVoices.emptyState(data)
    // The page's CURRENT sidebar label (plan §4.0; Conversation from WP2.4).
    const conversation = surface('voice')
    const href = `${ctx.appUrl}${conversation.href}`
    const footer = openLink(mode, href, `Hear these voices in ${conversation.label} →`)
    // THE SUBJECT IS IN THE TITLE. "Voices on this subject" is a caption on a
    // tile whose subject is named two tiles away and, in an export, on another
    // slide entirely.
    const title = pane ? `Voices on ${pane.name.toLowerCase()}` : subjectsVoices.title

    if (!pane || empty) {
      return (
        <BlockFrame title={title} question={subjectsVoices.question} mode={mode} footer={footer}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    return (
      <BlockFrame
        title={title}
        question={subjectsVoices.question}
        mode={mode}
        meta={voicesMeta(pane.voices.length, pane.voicesFrom, pane.voicesSampled)}
        footer={footer}
        // No language share, on any surface (2026-09-24): the slot that
        // printed `methodLines.language` in print and email is gone.
      >
        {mode === 'email' ? (
          <BlockQuotes
            mode={mode}
            quotes={pane.voices.map((v) => {
              // NO GLYPH IN AN EMAIL — an inline SVG is the one thing Outlook
              // will not draw — so the platform is a WORD here, through the
              // one composer rather than assembled again in this file.
              const cite = voiceCite(v)
              return {
                quote: v.quote,
                cite: v.href
                  ? <a href={v.href} rel="noreferrer" target="_blank" style={{ color: EMAIL.muted, fontFamily: FONT.mono }}>{cite}</a>
                  : cite,
              }
            })}
          />
        ) : (
          // THREE ACROSS ON PAPER TOO, AND NOT ON A GRID (Block D wave 3b,
          // `decks`).
          //
          // `xl:` never fires in print media — app/globals.css says so where
          // `data-print-cols` is defined — so the sheet that is supposed to
          // scan as a SET drew TWO columns and three rows, and 143px of the
          // sales brief's fifth sheet went over the edge: one whole row of
          // voices and the footnote saying they were machine-translated, off
          // the bottom of a paid PDF.
          //
          // AND A GRID IS THE WRONG SHAPE FOR SIX CARDS OF DIFFERENT HEIGHTS.
          // Every cell in a grid row is as tall as the tallest, so one voice
          // carrying a machine translation and an on-screen pairing left two
          // white cells beside it and pushed the next row down by its own
          // height. Columns flow instead: each voice is kept whole
          // (`break-inside: avoid`) and the three columns balance, which is
          // what "three across" means on the artboard and is worth another 40
          // pixels of the same sheet. The app keeps the grid — its column is
          // wide, its cards are even, and a reading order that goes DOWN a
          // column is right on paper and wrong under a scroll.
          mode === 'print' ? (
            <div className="min-w-0 [column-count:3] [column-gap:20px]">
              {pane.voices.map((v) => (
                <div key={v.quote.ref ?? v.cite} className="mb-3 break-inside-avoid">
                  <Voice voice={v} mode={mode} />
                </div>
              ))}
            </div>
          ) : (
          <div className="grid min-w-0 grid-cols-1 items-start gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {pane.voices.map((v) => <Voice key={v.quote.ref ?? v.cite} voice={v} mode={mode} />)}
          </div>
          )
        )}
      </BlockFrame>
    )
  },

  // BOTH REFS PER VOICE. `quotes()` is what `report_snapshots.evidence_ids`
  // is built from — the column erase-commenter searches — so a paired frame
  // that is rendered here has to be declared here too, or the one thing the
  // ref spine exists for cannot reach it.
  quotes(data): QuoteRef[] {
    return (data.selected?.voices ?? [])
      .flatMap((v) => [v.quote.ref, v.onScreen?.ref ?? null])
      .filter((r): r is string => Boolean(r))
  },

  emptyState(data) {
    if (data.list.notRecorded) return data.list.notRecorded
    const pane = data.selected
    if (!pane) {
      if (allRedescribed(data)) return SUBJECTS_ALL_REDESCRIBED
      return data.list.proposed.length > 0
        ? 'Confirm a subject and this is where we quote what was said about it.'
        : 'Name a subject and this is where we quote what was said about it.'
    }
    if (pane.voices.length === 0) {
      return pane.notRecorded
        ? pane.notRecorded
        : 'Nothing quotable has been matched to this subject yet.'
    }
    return null
  },
}

// ---- WP2.2 · voices on the subject, from the reading month ------------------------

/** A voice's cite on the market page: when, its likes, and under whose video,
 *  a maker's video marked (decision F). The platform is the app's glyph, or a
 *  word on paper and in an email (`voiceCite`). */
function marketCite(v: SubjectVoice, mode: RenderMode): ReactNode {
  const likes = v.likes ? `${fmtInt(v.likes)} like${v.likes === 1 ? '' : 's'}` : null
  const [when, ...where] = v.cite.split(' · ')
  const cite = [when, likes, ...where].filter(Boolean).join(' · ')
  // The platform in words where no glyph is drawn (`voiceCite`'s rule).
  const parts = mode === 'app' ? cite : voiceCite({ ...v, cite })
  if (mode === 'email') return <span>{parts}{v.maker ? ' · a maker’s video' : ''}</span>
  return (
    <span>
      {mode === 'app' && v.platform ? <PlatformIcon platform={v.platform} className="mr-1.5 inline-block align-[-2px]" /> : null}
      {parts}
      {v.maker ? <> · <span className="whitespace-nowrap"><MakerMark /> a maker’s video</span></> : null}
    </span>
  )
}

/**
 * SIX VOICES FROM THE READING MONTH (§2.3 S5; the approved preview's cards):
 * each the evidence of one of the subject's own member insights, dated in the
 * month, the market's first, never the video's own account. Three across on
 * the inner ground in the app; three columns on paper; stacked in an email.
 */
function MarketVoices({ data, mode, appUrl }: { data: SubjectsData; mode: RenderMode; appUrl: string }) {
  const pane = data.selected
  const voice = surface('voice')
  const footer = openLink(mode, `${appUrl}${voice.href}`, `Hear these voices in ${voice.label} →`)
  const title = pane ? `Voices on ${pane.name}` : subjectsVoices.title
  const empty = subjectsVoices.emptyState(data)
  if (!pane || empty) {
    const words = pane && pane.voices.length === 0 && !pane.notRecorded
      ? `No comment on ${pane.name} dated in ${longMonth(data.month)} can be quoted yet.`
      : empty ?? 'Nothing is selected.'
    return (
      <BlockFrame title={title} question={subjectsVoices.question} mode={mode} footer={footer} roomy>
        <BlockEmpty mode={mode}>{words}</BlockEmpty>
      </BlockFrame>
    )
  }
  if (mode === 'email') {
    return (
      <BlockFrame title={title} question={subjectsVoices.question} mode={mode} footer={footer}>
        <BlockQuotes mode={mode} quotes={pane.voices.map((v) => ({ quote: v.quote, cite: v.href ? <a href={v.href} rel="noreferrer" target="_blank" style={{ color: EMAIL.muted, fontFamily: FONT.mono }}>{marketCite(v, mode)}</a> : marketCite(v, mode) }))} />
      </BlockFrame>
    )
  }
  const card = (v: SubjectVoice) => {
    const cite = marketCite(v, mode)
    return (
      // THE PREVIEW'S CARD (d3 polish): the quote at the top and its line of
      // provenance at the foot, 16px clear of it at least, so a row of cards
      // of one height reads as one row. On a phone the cards stack, so none
      // is held taller than its quote.
      <div key={v.quote.ref ?? v.cite} className={`flex min-w-0 flex-col gap-2 rounded-md bg-inner p-6 ${mode === 'print' ? 'mb-3 break-inside-avoid' : 'sm:min-h-[148px] [&>blockquote]:flex [&>blockquote]:flex-1 [&>blockquote]:flex-col [&>blockquote>footer]:mt-auto [&>blockquote>footer]:pt-4'}`}>
        {SOURCE_FLAG[v.source] ? <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{SOURCE_FLAG[v.source]}</span> : null}
        <BlockQuote quote={v.quote} mode={mode} ground="inner" cite={v.href && mode === 'app' ? <a href={v.href} rel="noreferrer" target="_blank">{cite}</a> : cite} />
      </div>
    )
  }
  return (
    <BlockFrame title={title} question={subjectsVoices.question} mode={mode} footer={footer} roomy>
      {mode === 'print'
        ? <div className="min-w-0 [column-count:3] [column-gap:20px]">{pane.voices.map(card)}</div>
        : <div className="grid min-w-0 grid-cols-1 items-stretch gap-6 sm:grid-cols-2 xl:grid-cols-3">{pane.voices.map(card)}</div>}
    </BlockFrame>
  )
}
