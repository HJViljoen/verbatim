import Link from 'next/link'
import { Play, Sparkles } from 'lucide-react'
import { FlagChip, InPlacePanel, PanelSection, PanelTitle, StatCell, StatRow } from '@/components/v2'
import { QuoteBlock } from '@/components/quote-block'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import {
  IDEA_PANEL_ID, contentHref, fmtMultiple, groupHref, monthWords, POST_IDEA_SLOT,
  type ContentState, type IdeaPanel,
} from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Fig, OLink } from './parts'

/**
 * A POST IDEA, OPENED IN PLACE (E5-Content-Open): the full-width panel under
 * the idea's row, its notch at the card that opened it (`?idea=<rank>`).
 *
 * Level 2, so the comments' own words may print here: the words to borrow
 * (Pass A's phrases off the idea's comments) and three of the comments
 * through the quote gate. Everything else is code's or the stored idea's:
 *
 *   the four figures   this week's videos of the week's market; the month's
 *                      beside it (decision 1; the board's "15 of the 23 are
 *                      new amputees" is not computable, no video belongs to
 *                      a group); the last three weeks as bare counts; your
 *                      posts this month that touched on it
 *   the suggested post the format and opening code chose (with their
 *                      multiples), the cover and length the writer stored,
 *                      and in a medical market the medical team line
 *   what they want to  the model's sub-question labels over comment ids;
 *   know               the counts are the ids', never a number it typed
 *   who's asking       group names, each opening in Voices; no counts
 *   market videos      "where this came up, best response first" (decision
 *                      5: we cannot yet tell a video ANSWERED it)
 */

const BRIEF_KEY = 'm-0 mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'

export function IdeaPanelView({ panel, state, count, month, weekWord }: {
  panel: IdeaPanel
  state: ContentState
  /** How many ideas stand in the row, for where the notch points. */
  count: number
  month: { month: string; complete: boolean }
  weekWord: string
}) {
  const { card } = panel
  const at = (card.rank - 0.5) / Math.max(1, count)
  const most = Math.max(1, ...panel.subquestions.map((s) => s.videos))
  const when = monthWords(month)
  return (
    <InPlacePanel
      id={IDEA_PANEL_ID}
      notchAt={at}
      closeHref={contentHref({ ...state, open: null })}
      closeLabel="Close this post idea"
      labelledBy="idea-title"
      head={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[6px] bg-accent px-2 py-[3px] text-[12px] leading-[1.3]">Post idea {card.rank}</span>
            <FlagChip verdict={card.flag} />
            {card.subject ? <span className="rounded-[6px] bg-accent px-2 py-[3px] text-[12px] leading-[1.3]">{card.subject.name}</span> : null}
          </div>
          <PanelTitle id="idea-title" className="text-[24px] leading-[1.25]">
            <span data-copy="stored" data-slot={POST_IDEA_SLOT}>{card.title}</span>
          </PanelTitle>
        </>
      }
    >
      <StatRow>
        {card.week ? <StatCell value={card.week.k} of={card.week.n} label={`videos in your market ${weekWord} where it came up`} /> : null}
        {card.month ? <StatCell value={card.month.k} of={card.month.n} label={`videos ${when}`} /> : null}
        {card.weeks ? (
          <StatCell value={card.weeks.map((w) => fmtInt(w.count)).join(' · ')} label={`videos a week, the weeks of ${card.weeks.map((w) => w.label).join(', ')}`} />
        ) : null}
        {card.own.state === 'touched' || card.own.state === 'none' ? (
          <StatCell value={card.own.touched} of={card.own.posts} label={`posts of yours ${when} touched on it`} />
        ) : null}
      </StatRow>

      <PanelSection label="Suggested post">
        <div className="grid grid-cols-1 gap-5 rounded-[12px] bg-inner px-[22px] py-5 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className={BRIEF_KEY}>Format</p>
            <p className="m-0 text-[15px] leading-[1.45]">
              {card.format ? <>{card.format.label}{card.format.multiple != null ? <> <Fig className="text-[13px]">· {fmtMultiple(card.format.multiple)}</Fig></> : null}</> : <span className="text-muted-foreground">Too few of the market’s videos on it to choose one</span>}
            </p>
          </div>
          <div>
            <p className={BRIEF_KEY}>Open with</p>
            <p className="m-0 text-[15px] leading-[1.45]">
              {card.opening ? <>{card.opening.name}{card.opening.multiple != null ? <> <Fig className="text-[13px]">· {fmtMultiple(card.opening.multiple)}</Fig></> : null}</> : <span className="text-muted-foreground">Too few of the market’s videos on it to choose one</span>}
            </p>
          </div>
          <div>
            <p className={BRIEF_KEY}>Cover</p>
            <p className="m-0 text-[15px] leading-[1.45]" data-copy="stored" data-slot={POST_IDEA_SLOT}>{panel.cover}</p>
          </div>
          {panel.length ? (
            <div>
              <p className={BRIEF_KEY}>Length</p>
              <p className="m-0 text-[15px] leading-[1.45]" data-copy="stored" data-slot={POST_IDEA_SLOT}>{panel.length}</p>
            </div>
          ) : null}
        </div>
        <p className="m-0 text-[13px] leading-[1.4] text-muted-foreground">
          The multiples are how the market’s videos made that way, and opening that way, did against a typical video in your market.
          {card.medical ? <> {MEDICAL_LINE}</> : null}
        </p>
      </PanelSection>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <PanelSection label={<>What they want to know · in <Fig>{fmtInt(panel.asking)}</Fig> {panel.asking === 1 ? 'video' : 'videos'}</>}>
          {panel.subquestions.length > 0 ? panel.subquestions.map((s) => (
            <div key={s.label} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_30px] items-center gap-2.5 text-[13.5px] leading-[1.35]">
              <span data-copy="stored" data-slot={POST_IDEA_SLOT}>{s.label}</span>
              <div role="img" aria-label={`${s.videos} of ${panel.asking} videos`} className="relative h-2 rounded-full bg-track">
                <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${Math.round((s.videos / most) * 100)}%` }} />
              </div>
              <Fig className="text-right text-[12.5px]">{fmtInt(s.videos)}</Fig>
            </div>
          )) : <p className="m-0 text-[13.5px] text-muted-foreground">No sub-questions were sorted for it.</p>}
        </PanelSection>
        <PanelSection label="Who's asking">
          {card.groups.length > 0 ? (
            <>
              {card.groups.map((g) => (
                <Link key={g.key} href={groupHref(g.key)} className="-mx-2 flex items-center justify-between gap-3 rounded-[6px] px-2 py-1.5 text-[14px] no-underline transition-colors hover:bg-inner">
                  <span data-copy="subject" data-slot="pass_e_persona">{g.name}</span>
                  <span aria-hidden className="text-muted-foreground">→</span>
                </Link>
              ))}
              <span className="text-[12px] text-muted-foreground">Each opens in Voices</span>
            </>
          ) : <p className="m-0 text-[13.5px] text-muted-foreground">No group in your market’s profile cites it yet.</p>}
        </PanelSection>
        <PanelSection label="Words to borrow">
          {panel.words.length > 0 ? (
            <div>
              {panel.words.map((w) => (
                <span key={w.ref} data-copy="quote" className="mr-1.5 mb-1.5 inline-block rounded-[8px] bg-inner px-2.5 py-1.5 font-serif text-[14px] italic">“{w.text}”</span>
              ))}
            </div>
          ) : <p className="m-0 text-[13.5px] text-muted-foreground">No short phrase in these comments reads well enough to borrow.</p>}
        </PanelSection>
      </div>

      <PanelSection label="Market videos where this came up, best response first">
        {panel.videos.length > 0 ? (
          <div>
            {panel.videos.map((v) => (
              <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-track py-3 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
                <div aria-hidden className="hidden h-[68px] w-[120px] items-center justify-center rounded-[8px] bg-track text-muted-foreground sm:flex"><Play className="size-5" /></div>
                <div className="min-w-0">
                  <div className="text-[14.5px] leading-[1.4] font-semibold">
                    {v.url ? <a href={v.url} target="_blank" rel="noreferrer" className="no-underline hover:underline"><span data-copy="quote">“{v.title ?? 'Untitled video'}”</span></a> : <span data-copy="quote">“{v.title ?? 'Untitled video'}”</span>}
                  </div>
                  <div className="mt-[3px] text-[12.5px] text-muted-foreground">
                    {[v.account ? `@${v.account.replace(/^@+/, '')}` : null, platformLabel(v.platform), v.format?.toLowerCase(), v.opening ? `opens with ${v.opening.charAt(0).toLowerCase()}${v.opening.slice(1)}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="text-right">
                  {v.multiple != null ? (
                    <>
                      <Fig className="block text-[18px] font-medium">{fmtMultiple(v.multiple)}</Fig>
                      <div className="text-[12px] text-muted-foreground">typical response</div>
                    </>
                  ) : <div className="text-[12px] text-muted-foreground">no response figure</div>}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="m-0 text-[13.5px] text-muted-foreground">None of the videos these comments sit under could be read.</p>}
      </PanelSection>

      {panel.quotes.length > 0 ? (
        <PanelSection label={<>In their words · <Fig>{fmtInt(panel.quotes.length)}</Fig> of the comments</>}>
          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-3">
            {panel.quotes.map((q) => (
              <div key={q.ref} className="rounded-[10px] bg-inner px-[15px] py-[13px]">
                <QuoteBlock quote={q} ground="inner" cite={[q.platform ? platformLabel(q.platform) : null, q.date ? shortDate(q.date) : null].filter(Boolean).join(' · ')} />
              </div>
            ))}
          </div>
        </PanelSection>
      ) : null}

      <div className="flex flex-wrap items-center gap-[18px] border-t border-track pt-5">
        <Link href={panel.askHref} className={cn('inline-flex min-h-[38px] items-center gap-2 rounded-[8px] bg-brand px-3.5 py-[9px] text-[13.5px] font-semibold text-brand-foreground no-underline transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
          <Sparkles aria-hidden className="size-4" />
          Ask the Agent to draft an outline
        </Link>
        <OLink href={panel.conversationHref}>See the conversation and its videos in Market →</OLink>
      </div>
    </InPlacePanel>
  )
}
