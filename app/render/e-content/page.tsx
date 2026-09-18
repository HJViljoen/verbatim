import { notFound } from 'next/navigation'
import { PrintRoot } from '@/components/print/print-root'
import { Slide } from '@/components/print/slide'
import { DeckFooter } from '@/components/print/report-deck'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { contentMake } from '@/components/blocks/content-brief/make'
import { contentPlaybook } from '@/components/blocks/content-brief/playbook'
import { contentRecord } from '@/components/blocks/content-brief/record'
import {
  contentBriefFixture,
  ledgerWithDismissal,
  longContentLedger,
  thinContentBriefFixture,
} from '@/components/blocks/content-brief/fixture'

// THROWAWAY. The E-content fix pass's side-by-side harness: the three slides in
// the real deck chrome, from their populated fixtures, at the artboard's
// 1123 x 631. Dev-only and deleted before the branch is reported.

const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

export default async function Page({ searchParams }: { searchParams: Promise<{ only?: string; state?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  const data = sp.state === 'thin' ? thinContentBriefFixture() : contentBriefFixture()
  const ledger = sp.state === 'long' ? longContentLedger() : ledgerWithDismissal()
  const chrome = (title: string) => ({
    context: `${title} · September 2026`,
    footer: <DeckFooter company="Össur" date="28 Sep 2026" />,
  })
  const slides = [
    {
      key: 'make',
      title: 'What to make next',
      framing: 'Each one is something the conversation asked for, with the reading behind it where there is one.',
      body: contentMake.render(ledger, 'print', ctx),
    },
    {
      key: 'playbook',
      title: 'Hooks and formats that worked',
      framing: 'What the category makes, what you make, and what is rated highest — every row with the number it is counted from.',
      body: contentPlaybook.render(data, 'print', ctx),
    },
    {
      key: 'record',
      title: 'The record behind this brief',
      framing: 'What was read, over what, and what was held back.',
      body: contentRecord.render(data, 'print', ctx),
    },
  ].filter((s) => !sp.only || sp.only === s.key)
  return (
    <PrintRoot>
      {slides.map((s, i) => (
        <Slide key={s.key} title={s.title} chrome={chrome('Content brief')} page={i + 2} pages={5} layout="single">
          <div className="flex flex-col gap-3" data-section-body>
            <p className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground">{s.framing}</p>
            {s.body}
          </div>
        </Slide>
      ))}
    </PrintRoot>
  )
}
