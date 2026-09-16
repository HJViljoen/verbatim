
import type { Block, QuoteRef } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuotes } from '@/components/blocks/quote'
import { EMAIL } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { voicesMeta, VOICES_SHOWN, type SubjectsData } from '@/lib/pages/subjects'

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

export const subjectsVoices: Block<SubjectsData> = {
  key: 'subjects.voices',
  title: 'Voices on this subject',
  question: 'What are people actually saying?',

  render(data, mode = 'app', ctx) {
    const pane = data.selected
    const empty = subjectsVoices.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/voice`
    const footer = openLink(mode, href, 'Hear these voices in Voice →')

    if (!pane || empty) {
      return (
        <BlockFrame title={subjectsVoices.title} question={subjectsVoices.question} mode={mode} footer={footer}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    return (
      <BlockFrame
        title={subjectsVoices.title}
        question={subjectsVoices.question}
        mode={mode}
        meta={voicesMeta(pane.voices.length, pane.voicesFrom, pane.voicesSampled)}
        footer={footer}
      >
        <BlockQuotes
          mode={mode}
          quotes={pane.voices.map((v) => ({
            quote: v.quote,
            // original · English · platform · date · LINK (design §3 SU2). The
            // link was computed and thrown away; the words stay the words when
            // there is nowhere to send the reader (the OV1 precedent).
            cite: v.href
              ? <a href={v.href} rel="noreferrer" target="_blank" style={mode === 'email' ? { color: EMAIL.muted } : undefined}>{v.cite}</a>
              : v.cite,
          }))}
        />
      </BlockFrame>
    )
  },

  quotes(data): QuoteRef[] {
    return (data.selected?.voices ?? []).map((v) => v.quote.ref).filter((r): r is string => Boolean(r))
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
