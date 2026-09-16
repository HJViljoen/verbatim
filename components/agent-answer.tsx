import { QuoteBlock } from '@/components/quote-block'
import { platformLabel, shortDate } from '@/lib/format'
import { JUDGEMENT_HEADING, NEAREST_HEADING, saidHeading } from '@/lib/agent/types'
import type { Citation, ThreadAnswer } from '@/lib/pages/agent-thread'

// Rendering the three registers.
//
// The labels are the CLIENT's words, not ours. "Grounded / judgement / silent"
// is the vocabulary of the people who built it; a head of marketing reading
// this on a Tuesday needs to know which sentences their customers stand behind
// and which ones are the tool's opinion. Same structure, human words.
//
// Answer first. The client asked a question — the answer is the first thing on
// the page, and the evidence sits under it as support, not as a preamble to it.

function ConversationCount({ n }: { n: number }) {
  // "Conversations" is a fixed word (lib/calibration.ts GLOSSARY) and means
  // distinct source videos. The number is always shown beside the claim rather
  // than turned into a magnitude word.
  return (
    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
      {n} {n === 1 ? 'conversation' : 'conversations'}
    </span>
  )
}

/** Where one quoted voice was said, as the line under it (AS4).
 *
 *  THIS USED TO BE IN THE PDF ONLY. The deck has rendered "platform · date ·
 *  link" per quote since the export landed, and the screen rendered the words
 *  alone — `loadAgentThread` handed the page the number, the platform, the date
 *  and the deep link, and the page threw all four away. A reader on screen
 *  could not tell a YouTube comment from a TikTok caption, and could not go and
 *  read it.
 *
 *  The NUMBER is the deck's number: assigned across the whole thread in the
 *  loader, so the superscript here, the appendix on paper and a share link all
 *  name the same voice. `commentLevel` is the honest half — YouTube deep-links
 *  the comment itself, TikTok and Instagram can only reach the post, and the
 *  link says which. */
function Provenance({ q, meta }: { q: ThreadAnswer['grounded'][number]['quotes'][number]; meta?: Citation }) {
  const where = [meta?.platform ? platformLabel(meta.platform) : null, meta?.date ? shortDate(meta.date) : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <span className="tabular-nums">
      {q.n}
      {where ? ` · ${where}` : ' · source on file'}
      {meta?.href && (
        <>
          {' · '}
          <a href={meta.href} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
            {meta.commentLevel ? 'the comment' : 'the post'}
          </a>
        </>
      )}
    </span>
  )
}

export function AgentAnswerView({ answer, citations = [] }: { answer: ThreadAnswer; citations?: Citation[] }) {
  const metaByRef = new Map(citations.map((c) => [c.ref, c]))
  const hasGrounded = answer.grounded.length > 0
  // The model's refs ("G1", "G3") are internal handles and mean nothing to a
  // reader. Number the findings as they appear and cite THOSE, so "based on 1
  // and 2" points at something visible on the same screen.
  const numberOf = new Map(answer.grounded.map((g, i) => [g.id, i + 1]))

  return (
    <div className="space-y-6">
      {answer.notice && (
        <p className="rounded-lg border border-dashed border-border/60 bg-popover px-4 py-3 text-sm text-muted-foreground">
          {answer.notice}
        </p>
      )}

      <p className="text-[17px] leading-relaxed text-foreground">{answer.answer}</p>

      {hasGrounded && (
        <section className="space-y-4">
          {/* The heading follows the evidence. "Your customers" is a claim
              about whose audience spoke, and on 2026-09-10 it was printed over
              a comment from another brand's audience. It is said only when
              every point rests on the client's own videos. */}
          <h3 className="text-sm font-semibold">{saidHeading(answer.grounded)}</h3>
          {answer.grounded.map((point, i) => (
            <div key={point.id} className="space-y-2 rounded-lg border border-border/60 bg-popover p-4">
              {/* Not flex-wrap: a finding that runs to two lines was dropping
                  its count onto a third, where it read as a stray number
                  rather than as the measure of the line above it. */}
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 flex-1 text-[15px] leading-snug text-foreground">
                  <span className="mr-2 text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                  {point.text}
                </p>
                <ConversationCount n={point.conversationCount} />
              </div>
              <div className="space-y-2">
                {point.quotes.map((q) => (
                  <QuoteBlock
                    key={q.ref + q.n}
                    quote={{ text: q.text, lang: q.lang, english: q.english }}
                    cite={<Provenance q={q} meta={metaByRef.get(q.ref)} />}
                  />
                ))}
              </div>
              {point.themeRefs.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {point.themeRefs.map((t) => t.label).filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {answer.nearest.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{NEAREST_HEADING}</h3>
          {answer.nearest.map((n, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 rounded-lg border border-dashed border-border/60 bg-popover p-4">
              <p className="min-w-0 flex-1 text-[15px] leading-snug text-foreground/90">{n.text}</p>
              <ConversationCount n={n.conversationCount} />
            </div>
          ))}
        </section>
      )}

      {answer.judgement.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{JUDGEMENT_HEADING}</h3>
          {/* Visually distinct from the evidence above on purpose. A reader
              skimming must never mistake this column for the one their
              customers stand behind. */}
          <div className="space-y-3 rounded-lg bg-muted p-4">
            {answer.judgement.map((j, i) => {
              const cites = j.basedOn.map((ref) => numberOf.get(ref)).filter((n): n is number => Boolean(n))
              return (
                <div key={i} className="space-y-1">
                  <p className="text-[15px] leading-snug text-foreground/85">{j.text}</p>
                  {/* Which findings this rests on. A proposal a reader cannot
                      trace back to the evidence is just an opinion — and the
                      two that carry no citation say so rather than borrowing
                      credibility from the ones above them. */}
                  <p className="text-xs text-muted-foreground">
                    {cites.length > 0
                      ? `Reasoning from ${cites.length === 1 ? 'finding' : 'findings'} ${cites.sort((a, b) => a - b).join(', ')} above.`
                      : 'Not drawn from any single finding above — this one is inference.'}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}
