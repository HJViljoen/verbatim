import Link from 'next/link'
import { fmtInt, shortDate } from '@/lib/format'
import type { NotAnswered } from '@/lib/agent/measure'
import type { AskHistory, AskReads } from '@/lib/pages/agent-thread'
import { Tile, TileEmpty } from '@/components/shell/tile'
import { InferencePill } from './marks'

// The right rail — three tiles (Block D wave 2, E-ask · `ask.history.*`,
// `ask.draws.*`, `ask.notanswered*`).
//
// The build had ONE of these and drew it as a drawer parked off the bottom
// edge: a list of the last fifty threads, title and date, no heading, no
// figures, and gone entirely on a thread page. The artboard puts three tiles
// beside the answer, and each of them is a question a reader of an answer asks
// next: what else have I asked, what stands behind an answer, and what could
// this not answer.

/** Where "What we track →" goes, and where the rail's last tile sends a reader
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
export function EarlierQuestionsTile({ history, col = 12, row = 2, openThread = false }: {
  history: AskHistory | null
  col?: number
  row?: number
  /** A thread is open beside the tile (its page): the empty line says "nothing
   *  ELSE". On Ask's own page no thread is open, and "else" there reads as
   *  though a question had been asked (sw-2 item 5). */
  openThread?: boolean
}) {
  /** Whether this tile has a LIST — what both halves of the footer, and the
   *  meta, are facts about. */
  const drawn = Boolean(history && history.rows.length > 0)
  return (
    <Tile
      col={col}
      row={row}
      // THE PREVIEW'S TITLE, AND THE TITLE ALONE (25 Sep rulings, WP3.9): a
      // header carries its title and a footer its link, so the "3 of 12"
      // meta and the "earliest 28 Sep" note left the tile. The month's asking
      // is still stated once, by `NotAnsweredTile`'s budget line.
      eyebrow="Your questions"
      footer={drawn ? <Link href={history!.href} className="hover:underline">All questions →</Link> : undefined}
      distribute="between"
    >
      {!history ? (
        <TileEmpty>Your earlier questions could not be read just now.</TileEmpty>
      ) : history.rows.length === 0 ? (
        // TRUE ON BOTH ROUTES. The open thread is excluded from the rows
        // (`askHistory`'s `exclude`) but still counted in the month, so on a
        // thread page "no question has been asked" would be a lie told beside
        // the question the reader is reading.
        <TileEmpty>{openThread ? 'Nothing else has been asked in this workspace yet.' : 'Nothing has been asked in this workspace yet.'}</TileEmpty>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {history.rows.map((r, i) => (
            <li key={r.threadId} className={i > 0 ? 'border-t border-border/70 pt-2.5' : undefined}>
              <Link href={`/dashboard/agent/${r.threadId}`} className="flex flex-col gap-1 hover:underline">
                {/* The thread's title is model prose (`ask_extract_title`), so
                    the node names its slot rather than silencing rule (c) for
                    free — a question titled "Is price fading?" is the reader's
                    word, not a claim of ours. */}
                <span data-copy="subject" data-slot="ask_extract_title" className="text-[12.5px] font-medium text-foreground">
                  {r.title}
                </span>
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  answered <span data-copy="figure">{shortDate(r.askedAt)}</span>
                </span>
                {/* `=== true` on purpose: null is "we did not re-read that plan",
                    which is not "nothing crossed" (`AskHistoryRow.claimCrossed`). */}
                {r.claimCrossed === true && <InferencePill>1 claim crossed</InferencePill>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}

/** The swatch each row of "What an answer reads" carries: the market in the
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
 * TITLE ALONE, LINK ALONE (25 Sep rulings). Nothing sits beside the title and
 * the footer is one link, to where the method is said in full.
 */
export function ReadsTile({ reads, col = 12, row = 2 }: { reads: AskReads; col?: number; row?: number }) {
  return (
    <Tile
      col={col}
      row={row}
      eyebrow="What an answer reads"
      footer={<Link href={HOW_TO_READ_HREF} className="hover:underline">What we read, and how →</Link>}
      distribute="between"
    >
      <p className="m-0 text-[13px] text-foreground">Your market, not only your own posts.</p>
      <ul className="m-0 flex list-none flex-col p-0">
        {reads.rows.map((r, i) => (
          <li key={r.key} className={`flex flex-col gap-1 py-2.5 ${i > 0 ? 'border-t border-border/70' : ''}`}>
            <div className="flex items-baseline gap-2.5">
              <span aria-hidden className="size-2.5 flex-none translate-y-px rounded-[2px]" style={{ background: READ_SWATCH[r.key] }} />
              <span className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">{r.label}</span>
              {r.value != null && (
                <span data-copy="figure" className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{fmtInt(r.value)}</span>
              )}
            </div>
            <p className="m-0 pl-5 text-[12px] leading-[1.45] text-muted-foreground">
              <span data-copy="figure">{r.line}</span>
            </p>
          </li>
        ))}
      </ul>
      <dl className="m-0 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 border-t border-border/70 pt-2.5">
        {reads.facts.map((f) => (
          <div key={f.term} className="contents">
            <dt className="text-[12px] text-muted-foreground">{f.term}</dt>
            <dd className="m-0 text-[12.5px] text-foreground">
              <span data-copy="figure">{f.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Tile>
  )
}

/** Where "What we read, and how →" goes: Settings › How to read, where the
 *  method is said in full (25 Sep rulings: that is its job, not a footnote's). */
export const HOW_TO_READ_HREF = '/dashboard/settings/how-to-read'

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
export function NotAnsweredTile({ notAnswered, col = 12, row = 2 }: { notAnswered: NotAnswered | null; col?: number; row?: number }) {
  return (
    <Tile
      col={col}
      row={row}
      eyebrow="Not answered this month"
      // TITLE ALONE, LINK ALONE (25 Sep rulings, WP3.9): the "2 of 3 asked"
      // meta and the "Settings" note left; the budget line says the month.
      footer={<Link href={notAnswered?.href ?? TRACKED_HREF} className="hover:underline">What we track →</Link>}
      distribute="between"
    >
      {!notAnswered ? (
        <TileEmpty>This month&rsquo;s questions could not be read just now.</TileEmpty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {notAnswered.declined.length === 0 ? (
            // ONE SENTENCE, NOT TWO. The budget line below already says "1 of
            // 40 questions asked this month. Every one was answered from the
            // conversation", so an empty state saying it again made the tile
            // state the same fact twice in the state a fresh workspace is in.
            notAnswered.asked === 0 ? (
              <TileEmpty>No question has been asked this month.</TileEmpty>
            ) : null
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {notAnswered.declined.map((d, i) => (
                <li key={`${d.question}-${i}`} className={`flex flex-col gap-0.5 ${i > 0 ? 'border-t border-border/70 pt-2.5' : ''}`}>
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
                  <p data-copy="quote" className="m-0 text-[12.5px] font-medium text-foreground">{d.question}</p>
                  <span className="font-mono text-[10.5px] leading-[1.35] text-muted-foreground">{d.why}</span>
                </li>
              ))}
            </ul>
          )}
          {/* The budget, said once. `line` is composed by `notAnsweredFrom` and
              carries its own "of N" (lib/agent/measure.ts). */}
          <p className="m-0 border-t border-border/70 pt-2.5 font-mono text-[10.5px] leading-[1.35] text-muted-foreground">
            <span data-copy="figure">{notAnswered.line}</span>
          </p>
        </div>
      )}
    </Tile>
  )
}
