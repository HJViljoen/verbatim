import Link from 'next/link'
import { shortDate } from '@/lib/format'
import type { AskHistory } from '@/lib/pages/agent-thread'

// "Earlier questions" on the Agent page (pages rebuild, 1 Oct): drawn only
// once there is one (the artboard draws the page of a workspace that has never
// asked, so it shows the box alone). In the artboard's card style: a white
// card, the title, then one row per question with its date, hairlines between.
export function EarlierQuestions({ history }: { history: AskHistory | null }) {
  if (!history || history.rows.length === 0) return null
  return (
    <section aria-label="Earlier questions" className="flex flex-col gap-3 rounded-[16px] bg-white px-7 pt-6 pb-5 leading-[normal]">
      <h2 className="m-0 text-[20px] font-bold text-[#26292C]">Earlier questions</h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {history.rows.map((r) => (
          <li key={r.threadId} className="border-t border-[#E4E2DC]">
            <Link href={`/dashboard/agent/${r.threadId}`} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px] text-[#26292C] no-underline hover:underline">
              {/* The thread's title is model prose (`ask_extract_title`). */}
              <span data-copy="subject" data-slot="ask_extract_title" className="min-w-0 font-semibold">{r.title}</span>
              <span data-copy="figure" className="shrink-0 text-[13px] text-[#5F656B]">{shortDate(r.askedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
