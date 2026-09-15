import Link from 'next/link'

import { SettingsCard, SettingsFrame } from '@/components/settings-frame'
import { ListSearch } from '@/components/shell/list-search'
import { GLOSSARY, THIRTEEN_WORDS, READER_FLAGS } from '@/lib/calibration'
import { getSessionContext } from '@/lib/auth'
import { surface } from '@/lib/nav'
import { READING_CARDS, READING_PATH } from '@/lib/settings/how-to-read'

// Settings › How to read (Phase 1 WP16, design ST9) — one card per surface,
// the thirteen words, and a path through the product on the three clocks it
// keeps.
//
// The Guide it replaces had a false claim on it: "search terms … are changed by
// us on request, not from this page", while the same rail rendered a term
// editor the client had been able to save since 2026-09-11. It is not carried
// forward, and the true half of that sentence is (lib/settings/how-to-read.ts).
//
// TITLE AND QUESTION COME FROM lib/nav.ts, never from here. One table owns what
// a surface is called and what it answers; a second copy of either is how the
// sidebar came to say "Content" about a page routed at /dashboard/videos.

export default async function HowToReadPage() {
  // The page is static text, but the frame is a tenant surface and the rail is
  // the workspace's: resolving the session is what keeps a signed-out reader
  // out of it, the same as every other sub-page.
  const { supabase, clientId } = await getSessionContext()
  const { data: client } = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle()

  return (
    <SettingsFrame
      active="guide"
      title="Settings"
      context={(client?.company_name as string | undefined) ?? 'Your workspace'}
      contentTitle="How to read"
      contentMeta={`${READING_CARDS.length} pages`}
    >
      <div className="flex flex-col gap-3">
        <ListSearch scope="reading-cards" placeholder="Search…" />

        <div id="reading-cards" className="flex flex-col gap-3">
          {READING_CARDS.map((card) => {
            const s = surface(card.key)
            return (
              <section
                key={card.key}
                id={card.key}
                data-search={`${s.label} ${s.question ?? ''} ${card.tells} ${card.cannot.join(' ')} ${card.read.map((k) => GLOSSARY[k][0]).join(' ')}`.toLowerCase()}
                className="scroll-mt-4 rounded-md bg-inner px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[14px] font-semibold">{s.label}</h3>
                  <Link href={s.href} className="shrink-0 text-[12px] font-medium hover:underline">Open it →</Link>
                </div>
                {s.question && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{s.question}</p>}
                <p className="mt-1.5 text-[12.5px] leading-[1.55] text-secondary-foreground">{card.tells}</p>

                {card.read.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">How to read it</p>
                    <dl className="flex flex-col gap-1">
                      {card.read.map((k) => (
                        <div key={k} className="flex gap-2 text-[12px] leading-[1.45]">
                          <dt className="shrink-0 font-semibold text-foreground">{GLOSSARY[k][0]}</dt>
                          <dd className="text-secondary-foreground">— {GLOSSARY[k][1]}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                <div className="mt-3">
                  <p className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">What it cannot tell you</p>
                  <ul className="flex flex-col gap-1">
                    {card.cannot.map((c) => (
                      <li key={c} className="flex gap-2 text-[12px] leading-[1.45] text-secondary-foreground">
                        <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )
          })}
        </div>

        <SettingsCard
          title="The thirteen words"
          description="Every figure in this product is built out of these. Each one means the same thing on every page and in every document, and each is assigned by a fixed rule from counted data — never worded by the model."
        >
          <dl className="flex flex-col gap-1.5">
            {[...THIRTEEN_WORDS, ...READER_FLAGS].map((k) => (
              <div key={k} className="flex gap-2 text-[12px] leading-[1.5]">
                <dt className="w-[110px] shrink-0 font-semibold">{GLOSSARY[k][0]}</dt>
                <dd className="text-secondary-foreground">{GLOSSARY[k][1]}</dd>
              </div>
            ))}
          </dl>
        </SettingsCard>

        <SettingsCard
          title="A way through it"
          description="The product keeps three clocks and they answer different questions. Reading it on the wrong one is the commonest way to be misled by it."
        >
          <div className="flex flex-col gap-3">
            {READING_PATH.map((step) => (
              <div key={step.when}>
                <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{step.when}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {step.what.map((w) => (
                    <li key={w} className="flex gap-2 text-[12px] leading-[1.45] text-secondary-foreground">
                      <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SettingsCard>
      </div>
    </SettingsFrame>
  )
}
