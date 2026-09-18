import Link from 'next/link'
import { fmtInt, shortDate } from '@/lib/format'
import type { NotAnswered } from '@/lib/agent/measure'
import type { AskDrawRow, AskHistory } from '@/lib/pages/agent-thread'
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
export function EarlierQuestionsTile({ history, row = 2 }: { history: AskHistory | null; row?: number }) {
  return (
    <Tile
      col={12}
      row={row}
      eyebrow="Earlier questions"
      meta={history ? `${fmtInt(history.thisMonth)} this month` : undefined}
      footer={history && history.rows.length > 0 ? <Link href={history.href} className="hover:underline">All questions →</Link> : undefined}
      // D14: EARLIEST EVIDENCE, and the word says so. We do not know when this
      // workspace started asking; we know the oldest question we still hold.
      footerNote={history?.earliest ? `earliest ${shortDate(history.earliest)}` : undefined}
      distribute="between"
    >
      {!history ? (
        <TileEmpty>Your earlier questions could not be read just now.</TileEmpty>
      ) : history.rows.length === 0 ? (
        <TileEmpty>No question has been asked in this workspace yet.</TileEmpty>
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

/**
 * "What an answer draws on".
 *
 * FOUR ROWS, NOT THE MOCK'S FIVE — `askDraws` says which and why. The footer is
 * the record: `lib/nav.ts:hasRecord` admits Ask (D-record, wave 1) precisely so
 * the drawer can be opened from here, and the drawer is where updates-this-
 * month, the video count, the language mix and the tracking changes live.
 */
export function DrawsTile({
  draws, recordHref, delivered, row = 2,
}: {
  draws: readonly AskDrawRow[]
  recordHref: string | null
  /** The footer note — the same count the Updates row prints, in the artboard's
   *  own position. Null prints no note rather than a zero. */
  delivered: number | null
  row?: number
}) {
  return (
    <Tile
      col={12}
      row={row}
      eyebrow="What an answer draws on"
      footer={recordHref ? <Link href={recordHref} className="hover:underline">The record →</Link> : undefined}
      footerNote={delivered != null ? `${fmtInt(delivered)} ${delivered === 1 ? 'update' : 'updates'} delivered` : undefined}
      distribute="between"
    >
      <dl className="m-0 grid grid-cols-[84px_1fr] gap-x-3 gap-y-2.5">
        {draws.map((d) => (
          <div key={d.term} className="contents">
            <dt className="pt-px font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{d.term}</dt>
            <dd className="m-0 text-[12.5px] text-foreground">
              <span data-copy="figure">{d.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Tile>
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
export function NotAnsweredTile({ notAnswered, row = 2 }: { notAnswered: NotAnswered | null; row?: number }) {
  return (
    <Tile
      col={12}
      row={row}
      eyebrow="Not answered this month"
      meta={notAnswered ? `${fmtInt(notAnswered.declined.length)}` : undefined}
      footer={<Link href={notAnswered?.href ?? TRACKED_HREF} className="hover:underline">What we track →</Link>}
      footerNote="Settings"
      distribute="between"
    >
      {!notAnswered ? (
        <TileEmpty>This month&rsquo;s questions could not be read just now.</TileEmpty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {notAnswered.declined.length === 0 ? (
            <TileEmpty>Every question asked this month was answered from the conversation.</TileEmpty>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {notAnswered.declined.map((d, i) => (
                <li key={`${d.question}-${i}`} className={`flex flex-col gap-0.5 ${i > 0 ? 'border-t border-border/70 pt-2.5' : ''}`}>
                  {/* The reader's own question, verbatim. Not our prose and not
                      the model's: a question a reader typed is the one string
                      on this page neither scrubber has any business touching. */}
                  <p className="m-0 text-[12.5px] font-medium text-foreground">{d.question}</p>
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
