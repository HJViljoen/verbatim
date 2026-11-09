import type { ReactNode } from 'react'
import Link from 'next/link'
import { appShort, fmtInt } from '@/lib/format'
import type { NotAnswered } from '@/lib/agent/measure'
import type { AskHistory, AskReads } from '@/lib/pages/agent-thread'
import { CARD, EmptyBox, GoLink } from '@/components/v2'
import { GO, LBL } from '@/components/v2/look'
import { cn } from '@/lib/utils'

// The right rail — three tiles (Block D wave 2, E-ask · `ask.history.*`,
// `ask.draws.*`, `ask.notanswered*`).
//
// The build had ONE of these and drew it as a drawer parked off the bottom
// edge: a list of the last fifty threads, title and date, no heading, no
// figures, and gone entirely on a thread page. The artboard puts three tiles
// beside the answer, and each of them is a question a reader of an answer asks
// next: what else have I asked, what stands behind an answer, and what could
// this not answer.
//
// SINCE THE AUDIT DESIGN (7 Nov; a question thread has no board, so the
// recipe): each a kit card with its title a sentence-case label, its gap in
// the dashed box, its figures in tabular sans and its link words with no
// arrow.

/** A rail tile: the kit's card, its title a label (the `Tile` eyebrow it
 *  was), its link at the foot. */
function RailTile({ title, link, children }: { title: string; link?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn(CARD, 'gap-3.5')}>
      <h2 className={cn('m-0', LBL)}>{title}</h2>
      {children}
      {link ? <div className="mt-auto pt-1">{link}</div> : null}
    </section>
  )
}

/** Where "What we track" goes, and where the rail's last tile sends a reader
 *  who wants a refusal to stop being a refusal. */
export const TRACKED_HREF = '/dashboard/settings'

/**
 * "Earlier questions".
 *
 * NO PER-ROW FIGURES, AND THAT IS THE DECISION. The artboard writes "answered
 * 20 Sep · smell 41 videos · zips 71" under each row. Nothing stores those:
 * `agent_messages.result` holds a conversation count per grounded point and
 * nothing that summarises a thread, so a figure here would have to be
 * re-derived at read time from a stored answer's prose — the re-derivation the
 * whole reading layer exists to stop. The rows carry what is recorded: the
 * question, when it was answered, and the one flag that is a fact.
 */
export function EarlierQuestionsTile({ history, openThread = false }: {
  history: AskHistory | null
  /** A thread is open beside the tile (its page): the empty line says "nothing
   *  ELSE". On Ask's own page no thread is open, and "else" there reads as
   *  though a question had been asked (sw-2 item 5). */
  openThread?: boolean
}) {
  /** Whether this tile has a LIST — what its link is a fact about. */
  const drawn = Boolean(history && history.rows.length > 0)
  return (
    // THE PREVIEW'S TITLE, AND THE TITLE ALONE (25 Sep rulings, WP3.9): a
    // header carries its title and a footer its link. The month's asking is
    // stated once, by `NotAnsweredTile`'s budget line.
    <RailTile title="Your questions" link={drawn ? <GoLink href={history!.href}>All questions</GoLink> : undefined}>
      {!history ? (
        <EmptyBox>Your earlier questions could not be read just now.</EmptyBox>
      ) : history.rows.length === 0 ? (
        // TRUE ON BOTH ROUTES. The open thread is excluded from the rows
        // (`askHistory`'s `exclude`) but still counted in the month, so on a
        // thread page "no question has been asked" would be a lie told beside
        // the question the reader is reading.
        <EmptyBox>{openThread ? 'Nothing else has been asked in this workspace yet.' : 'Nothing has been asked in this workspace yet.'}</EmptyBox>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {history.rows.map((r, i) => (
            <li key={r.threadId} className={cn('flex flex-col gap-1 py-3', i > 0 ? 'border-t border-track' : 'pt-0')}>
              <Link href={`/dashboard/agent/${r.threadId}`} className={cn(GO, 'self-start text-[14.5px] font-normal leading-[1.45]')}>
                {/* The thread's title is model prose (`ask_extract_title`), so
                    the node names its slot rather than silencing rule (c) for
                    free — a question titled "Is price fading?" is the reader's
                    word, not a claim of ours. */}
                <span data-copy="subject" data-slot="ask_extract_title">{r.title}</span>
              </Link>
              <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground">
                <span>answered <span data-copy="figure" className="tabular-nums">{appShort(r.askedAt)}</span></span>
                {/* `=== true` on purpose: null is "we did not re-read that plan",
                    which is not "nothing crossed" (`AskHistoryRow.claimCrossed`). */}
                {r.claimCrossed === true && <span className="font-semibold text-foreground">1 claim crossed</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </RailTile>
  )
}

/** The swatch each row of "What answers cover" carries: the market in the
 *  main ink (decision K), the brands you track in theirs, your own posts in
 *  yours. */
const READ_SWATCH: Record<AskReads['rows'][number]['key'], string> = {
  market: 'var(--foreground)',
  brands: 'var(--comp)',
  own: 'var(--you)',
}

/**
 * "What an answer reads" (WP3.9; the approved preview's rail).
 *
 * WHAT IT REPLACED. "What an answer draws on" printed the index's own
 * bookkeeping (monthly readings, updates delivered, findings searchable, when
 * they were indexed). The market-first question is a different one: what an
 * answer is ABOUT. So the tile says the market's size in the month the pages
 * read and its two parts, the client's own posts (read, marked as theirs,
 * never counted as the market), the window, the months that can be compared
 * on, and the first pair read the same way. Every count is the pooled market's
 * own (decision E), one denominator a line.
 *
 * TITLE ALONE (25 Sep rulings). Nothing sits beside the title.
 *
 * WHAT ANSWERS COVER, NOT HOW WE READ (§0a, 1 Oct). It was "What an answer
 * reads", with "What we read, and how →" to the method page (operator-only
 * since the pages build) and the months read and the first comparison "read
 * the same way" under the counts. The counts stay: they are what a finding's
 * base adds up to (796 + 38 = 834, the Dashboard's figure).
 */
export function ReadsTile({ reads }: { reads: AskReads }) {
  return (
    <RailTile title="What answers cover">
      <p className="m-0 text-[14px] leading-[1.5] text-foreground">Your market, not only your own posts.</p>
      <ul className="m-0 flex list-none flex-col p-0">
        {reads.rows.map((r, i) => (
          <li key={r.key} className={cn('flex flex-col gap-1 py-3', i > 0 ? 'border-t border-track' : 'pt-0')}>
            <div className="flex items-baseline gap-2.5">
              <span aria-hidden className="size-2.5 flex-none translate-y-px rounded-[2px]" style={{ background: READ_SWATCH[r.key] }} />
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-foreground">{r.label}</span>
              {r.value != null && (
                <span data-copy="figure" className="text-[15px] font-semibold tabular-nums text-foreground">{fmtInt(r.value)}</span>
              )}
            </div>
            <p className="m-0 pl-5 text-[13px] leading-[1.45] text-muted-foreground">
              <span data-copy="figure">{r.line}</span>
            </p>
          </li>
        ))}
      </ul>
      <dl className="m-0 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 border-t border-track pt-3">
        {reads.facts.map((f) => (
          <div key={f.term} className="contents">
            <dt className="text-[13px] text-muted-foreground">{f.term}</dt>
            <dd className="m-0 text-[13.5px] text-foreground">
              <span data-copy="figure">{f.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </RailTile>
  )
}

/**
 * "Not answered this month".
 *
 * `loadNotAnswered` (wave 1) is the wall-clock month's questions, the
 * workspace's budget and the ones the engine declined with the reason in the
 * reader's words. The two reasons are real answers rather than failures: the
 * corpus genuinely does not speak to some questions, and it structurally cannot
 * see a client's own numbers.
 *
 * THE MONTH HERE IS THE WALL CLOCK and it is the one month in this product that
 * is not the comment's (`lib/ask/quota.ts` — a spend limit is dated by the day
 * the money is spent). The meta says "asked this month" rather than naming a
 * month, so it cannot be read as a reading of September.
 */
export function NotAnsweredTile({ notAnswered }: { notAnswered: NotAnswered | null }) {
  return (
    // TITLE ALONE, LINK ALONE (25 Sep rulings, WP3.9): the "2 of 3 asked"
    // meta and the "Settings" note left; the budget line says the month.
    <RailTile title="Not answered this month" link={<GoLink href={notAnswered?.href ?? TRACKED_HREF}>What we track</GoLink>}>
      {!notAnswered ? (
        <EmptyBox>This month&rsquo;s questions could not be read just now.</EmptyBox>
      ) : (
        <div className="flex flex-col gap-3">
          {notAnswered.declined.length === 0 ? (
            // ONE SENTENCE, NOT TWO. The budget line below already says "1 of
            // 40 questions asked this month. Every one was answered from the
            // conversation", so an empty state saying it again made the tile
            // state the same fact twice in the state a fresh workspace is in.
            notAnswered.asked === 0 ? (
              <EmptyBox>No question has been asked this month.</EmptyBox>
            ) : null
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {notAnswered.declined.map((d, i) => (
                <li key={`${d.question}-${i}`} className={cn('flex flex-col gap-1 py-3', i > 0 ? 'border-t border-track' : 'pt-0')}>
                  {/* The reader's own question, verbatim, AND MARKED AS
                      THEIRS. Not our prose and not the model's — a question a
                      reader typed is the one string on this page neither
                      scrubber has any business touching — but unmarked markup
                      is not exempt from rule (c), which is by design, so "Is
                      durability growing?" put a direction word in a node the
                      sweep would take. `quote` is the kind for words that are
                      not the product's: the model-written thread title two
                      tiles up already names its slot, and this is the other
                      reader-authored string on the same page. */}
                  <p data-copy="quote" className="m-0 text-[14.5px] font-medium leading-[1.45] text-foreground">{d.question}</p>
                  <span className="text-[13px] leading-[1.45] text-muted-foreground">{d.why}</span>
                </li>
              ))}
            </ul>
          )}
          {/* The budget, said once. `line` is composed by `notAnsweredFrom` and
              carries its own "of N" (lib/agent/measure.ts). */}
          <p className="m-0 border-t border-track pt-3 text-[13px] leading-[1.45] text-muted-foreground">
            <span data-copy="figure">{notAnswered.line}</span>
          </p>
        </div>
      )}
    </RailTile>
  )
}
