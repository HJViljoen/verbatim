import Link from 'next/link'
import { shortDate } from '@/lib/format'
import type { AskHistory } from '@/lib/pages/agent-thread'
import { CARD, GO, TBL, TD, TH } from '@/components/v2'
import { cn } from '@/lib/utils'

// Earlier questions on the Agent page. Since the audit design (7 Nov,
// Agent.dc.html): a tile under the question with a table, Question and Asked,
// each title its thread's link, rows ruled at the top. It was a sheet raised
// from a handle at the foot of the pane from 1 Oct (Heinrich: "the chat
// history at the bottom with the thing you can click on so it comes up");
// the board draws it static, so it is a server component with no state.
//
// Drawn only once there is a question (rule 2), as the sheet was.

export function EarlierQuestions({ history }: { history: AskHistory | null }) {
  if (!history || history.rows.length === 0) return null

  return (
    // 48px under the question's tile (the boards' section gap): PageFrame's
    // 22px plus 26.
    <section aria-labelledby="agent-earlier-title" className={cn(CARD, 'mt-[26px] w-full max-w-[1000px] gap-2')}>
      <h2 id="agent-earlier-title" className="m-0 mb-1.5 text-[21px] font-semibold leading-[1.3] text-foreground">
        Earlier questions
      </h2>
      <table className={TBL}>
        <thead>
          <tr>
            <th scope="col" className={TH}>Question</th>
            <th scope="col" className={cn(TH, 'w-[90px] pr-0 text-right')}>Asked</th>
          </tr>
        </thead>
        <tbody>
          {history.rows.map((r) => (
            <tr key={r.threadId}>
              <td className={TD}>
                {/* The thread's title is model prose (`ask_extract_title`). */}
                <Link href={`/dashboard/agent/${r.threadId}`} data-history-row="" className={cn(GO, 'text-[15px] font-normal')}>
                  <span data-copy="subject" data-slot="ask_extract_title">{r.title}</span>
                </Link>
              </td>
              <td className={cn(TD, 'whitespace-nowrap pr-0 text-right tabular-nums text-secondary-foreground')}>
                <span data-copy="figure">{shortDate(r.askedAt)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
