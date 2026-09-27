import { PlatformIcon } from '@/components/charts/platform-icon'
import { GridRow, GridTable, MonoNote, Section, SectionHead } from '@/components/settings/chrome'
import { platformLabel } from '@/lib/format'
import type { PlatformRow } from '@/lib/settings/connections'

// `settings.platforms` — where we listen, at the artboard's density.
//
// THE SWITCHES ARE NOT DRAWN. The artboard puts a toggle on every row;
// `tracking_configs.platforms` has no client write path anywhere in the app —
// it moves cost directly and is an operator lever — so the row keeps the built
// page's status pill in the same cell. A switch that cannot switch is worse
// than a word that can be read.
//
// NO SHARE COLUMN ANY MORE (market-first WP3.10, GS F31). It printed the
// CLIENT's own videos by platform, nine a month on Sealand, as if it were how
// the conversation splits; the market's mix is "Where we read it" at the top
// of this page. The head is the title alone (the 25 Sep rulings).

const COLS = '200px minmax(0,1fr) 110px'
const HEAD = ['Platform', 'What we read', ''] as const
// "What we read" is a sentence and its head belongs over its first word.
const ALIGN = ['left', 'left', 'right'] as const

export function PlatformsSection({ rows, ownAccounts }: {
  rows: readonly PlatformRow[]
  /** Unused since WP3.10 (the client's share went); kept so a caller that
   *  still passes it compiles. */
  basis?: string
  /** The client's own accounts, per platform — the row the artboard has no
   *  line for and the product needs, because "no account of yours is
   *  configured" is the commonest reason a brand cannot see itself. */
  ownAccounts: Readonly<Record<string, string>>
}) {
  const mine = Object.entries(ownAccounts).filter(([, v]) => v && v.trim() !== '')
  return (
    <Section>
      <SectionHead title="Platforms" />
      <GridTable cols={COLS} min={700} head={HEAD} align={ALIGN}>
        {rows.map((r) => (
          <GridRow
            key={r.platform}
            cols={COLS}
            align={ALIGN}
            minHeight={48}
            cells={[
              <span key="n" className="inline-flex items-center gap-2 text-[12.5px] font-medium">
                <PlatformIcon platform={r.platform} size={14} className="text-secondary-foreground" />
                {r.label}
              </span>,
              <span key="w" className="block text-[12.5px] text-muted-foreground">{r.reads}</span>,
              <span
                key="c"
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-px text-[10.5px] font-medium ${r.connected ? 'bg-accent text-accent-foreground' : 'bg-warning/15 text-warning'}`}
              >
                {r.connected ? 'Connected' : 'Not connected'}
              </span>,
            ]}
          />
        ))}
      </GridTable>
      <MonoNote className="max-w-[820px]">
        Your accounts:{' '}
        {mine.length === 0
          ? 'none configured'
          : mine.map(([p, h]) => `${platformLabel(p)} ${p === 'youtube' ? h : `@${h}`}`).join(' · ')}
      </MonoNote>
    </Section>
  )
}
