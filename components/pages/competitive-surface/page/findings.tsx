import { Fragment } from 'react'

import { FINDINGS_SUB, FINDINGS_TITLE, marketLabel, type FindingCard } from '@/lib/pages/brands'
import { BrandName, Card, Chip, TitleRow } from './ui'

// Where a rival's talk differs (the artboard's third block): Pass C's written
// findings at brand level, two abreast, each saying who the talk it rests on
// is about. The cards carry no quote: on this page the quotes live in the
// brand pane (the artboard's note).

/** "Cotopaxi and other bags in your market, set against Sealand". */
function AboutLine({ f, client, noun }: { f: FindingCard & { rival: string }; client: string; noun: string | null }) {
  const about = f.about ?? null
  const others: { kind: 'brand' | 'market'; label: string }[] = [
    ...(about?.brands ?? []).map((b) => ({ kind: 'brand' as const, label: b })),
    ...(about?.market ? [{ kind: 'market' as const, label: marketLabel(noun, true) }] : []),
  ]
  return (
    <div className="pt-0.5 text-[12px] leading-[1.45]">
      <BrandName kind="brand">{f.rival}</BrandName>
      {others.map((o) => (
        <Fragment key={`${o.kind}:${o.label}`}>
          <span className="text-muted-foreground"> and </span>
          <BrandName kind={o.kind}>{o.label}</BrandName>
        </Fragment>
      ))}
      {about?.client ? (
        <>
          <span className="text-muted-foreground">, set against </span>
          <BrandName kind="you">{client}</BrandName>
        </>
      ) : null}
    </div>
  )
}

export function FindingsBlockView({ findings, client, noun }: { findings: (FindingCard & { rival: string })[]; client: string; noun: string | null }) {
  return (
    <section className="flex flex-col gap-3.5">
      <TitleRow title={FINDINGS_TITLE} sub={FINDINGS_SUB} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {findings.map((f) => (
          <Card key={f.id} className="gap-3 px-[26px] pt-[22px] pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{f.rival}</Chip>
              <span className="text-[13px] text-muted-foreground">{f.kindWords}</span>
            </div>
            <h3 data-copy="stored" data-slot="pass_c_finding" className="m-0 text-[18px] font-bold leading-[1.35] text-foreground">{f.title}</h3>
            {f.body ? (
              <p data-copy="stored" data-slot="pass_c_finding" className="m-0 text-[15px] leading-[1.6] text-foreground">{f.body}</p>
            ) : null}
            <AboutLine f={f} client={client} noun={noun} />
          </Card>
        ))}
      </div>
    </section>
  )
}
