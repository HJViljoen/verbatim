
import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote, BlockQuotes } from '@/components/blocks/quote'
import { PlatformIcon } from '@/components/charts/platform-icon'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { voiceCite, voicesMeta, VOICES_SHOWN, type SubjectsData, type SubjectVoice } from '@/lib/pages/subjects'

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
const FRAME_GONE = 'counted, not quotable — this frame has since been removed'

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
    const empty = subjectsVoices.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/voice`
    const footer = openLink(mode, href, 'Hear these voices in Voice →')
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
        // D15 · THE LANGUAGE SHARE MAY ONLY PRINT WITH ITS REAL BASIS. The mock
        // writes "27% of this month's videos are not in English"; what is
        // recorded is the language of what was said ON CAMERA, all-time, and
        // comments have no language of their own recorded at all. `methodLines`
        // composes that sentence once for every surface — so the slot prints
        // the measure the product actually holds, or stays empty.
        footerNote={data.method?.language ?? undefined}
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
      return data.list.proposed.length > 0
        ? 'Confirm a subject and this is where we quote what was said about it.'
        : 'Name a subject and this is where we quote what was said about it.'
    }
    if (pane.voices.length === 0) {
      return pane.notRecorded
        ? pane.notRecorded
        : `Nothing quotable has been matched to this subject yet — we show at most ${fmtInt(VOICES_SHOWN)} once there is.`
    }
    return null
  },
}
