import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { surface } from '@/lib/nav'
import { FINDINGS_TITLE, seenLine, thinLine, type FindingGroup, type FindingsBlock } from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import { Line } from './parts'

// B4 · Where a rival's talk differs (market-first WP3.5, plan §2.5 B4; CO6 at
// last; the approved preview's full-width cards).
//
// PASS C'S FINDINGS FROM THE LATEST UPDATE, BY BRAND, each a card: how it
// differs (the category, in plain words), its title (stored model prose,
// `pass_c_finding`), one voice from its own evidence, and in how many of the
// last six months its theme was read. The voice and the months come from the
// month readings (`month_evidence_refs`), anchored on the finding's lead
// registry theme, so they survive the pruning of the insights the finding
// cites (S14, F33). A brand too thin for the comparison is named once.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings).

export const FINDINGS_NONE = 'No update has set a brand you track against the category yet.'
export const FINDINGS_UNREAD = 'Not read for this workspace yet.'

function Card({ f, mode }: { f: FindingGroup['findings'][number]; mode: RenderMode }) {
  if (mode === 'email') {
    return (
      <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '12px 16px', marginTop: 8 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.muted }}>{f.kindWords}</div>
        <div data-copy="stored" data-slot="pass_c_finding" style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink, marginTop: 4 }}>{f.title}</div>
        {f.quote ? <BlockQuote quote={f.quote} mode={mode} ground="inner" /> : null}
        {f.seen ? <div style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.muted, marginTop: 6 }}>{seenLine(f.seen)}</div> : null}
      </div>
    )
  }
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-md bg-inner p-4 sm:p-6">
      <span className="font-mono text-[13px] text-muted-foreground">{f.kindWords}</span>
      <h4 data-copy="stored" data-slot="pass_c_finding" className="m-0 text-[17px] font-semibold leading-[1.4] text-foreground [text-wrap:balance]">{f.title}</h4>
      {f.quote ? (
        <div className="mt-1 border-t border-border pt-4">
          <BlockQuote quote={f.quote} mode={mode} ground="inner" />
        </div>
      ) : null}
      {f.seen ? <span className="mt-auto pt-1 font-mono text-[13px] text-muted-foreground">{seenLine(f.seen)}</span> : null}
    </article>
  )
}

function Group({ g, mode }: { g: FindingGroup; mode: RenderMode }) {
  if (mode === 'email') {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>{g.rival} against the category</div>
        {g.findings.map((f) => <Card key={f.id} f={f} mode={mode} />)}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h3 className="m-0 flex items-center text-[15px] font-semibold text-foreground">
        <span aria-hidden className="mr-2.5 inline-block size-2 flex-none rounded-[2px] bg-comp" />
        {g.rival} against the category
      </h3>
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
        {g.findings.map((f) => <Card key={f.id} f={f} mode={mode} />)}
      </div>
    </div>
  )
}

const emptyOf = (b: FindingsBlock): string | null => (b.groups.length === 0 && b.thin.length === 0 ? FINDINGS_NONE : null)

export const competitiveFindings: Block<CompetitiveSurfaceData> = {
  key: 'competitive.findings',
  title: FINDINGS_TITLE,
  question: 'Where does the talk around a brand differ from the category’s?',

  render(data, mode = 'app', ctx) {
    const b = data.brands?.findings
    if (!b) return <BlockFrame title={FINDINGS_TITLE} mode={mode} roomy><BlockEmpty mode={mode}>{FINDINGS_UNREAD}</BlockEmpty></BlockFrame>
    const first = b.groups[0]?.rival ?? null
    const footer = first
      ? openLink(mode, `${ctx.appUrl}${surface('ask').href}?ask=${encodeURIComponent(`What does my market say about ${first}?`)}`, `Ask about ${first} →`)
      : null
    const thin = thinLine(b)
    const empty = emptyOf(b)
    return (
      <BlockFrame title={FINDINGS_TITLE} mode={mode} footer={footer} roomy>
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {b.groups.map((g) => <Group key={g.rival} g={g} mode={mode} />)}
        {thin ? <Line mode={mode} className="text-[14px] text-muted-foreground">{thin}</Line> : null}
      </BlockFrame>
    )
  },

  quotes(data) {
    return (data.brands?.findings.groups ?? []).flatMap((g) => g.findings.flatMap((f) => (f.quote ? [f.quote.ref] : [])))
  },

  emptyState(data) {
    const b = data.brands?.findings
    return b ? emptyOf(b) : FINDINGS_UNREAD
  },
}
