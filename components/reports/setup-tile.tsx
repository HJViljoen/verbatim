import { Tile } from '@/components/shell/tile'
import { CONTACT_EMAIL } from '@/lib/legal'
import type { BriefCard } from '@/lib/reports/briefs'

// WHAT A CLIENT SEES WHERE THE BRIEFS WOULD BE (finish-list item 16, 29 Sep
// 2026).
//
// The Studio is hidden from tenants (lib/studio-visibility.ts), so a client
// met three cards reading "Never built for this workspace. Building one takes a
// few minutes." with no way to build one, and a quarterly card that was mostly
// empty space. Reports are on hold while Heinrich sets them up with each team,
// so the client is told exactly that, and who to write to. Only this page's
// tenant-facing state changes: the operator's view, the briefs and the report
// templates are as they were.

/** The brief cards a client is shown: only the ones with a build behind them,
 *  which they can open and download. An operator sees all three. */
export function briefCardsFor(cards: readonly BriefCard[], studio: boolean): BriefCard[] {
  return studio ? [...cards] : cards.filter((c) => c.latest != null)
}

export const REPORTS_SETUP_TITLE = 'Reports for your team'
export const REPORTS_SETUP_LINE = 'Reports for your team are being set up with Heinrich: which ones, who gets each, and how often.'
export const REPORTS_SETUP_UNTIL = 'Until then, the reading pages carry everything a report would draw on, and anything built or sent for you is kept in the archive below.'

export function ReportsSetupTile() {
  return (
    <Tile
      col={12}
      row={1}
      eyebrow={REPORTS_SETUP_TITLE}
      className="xl:min-h-0"
      footer={
        <span className="text-[12px] text-secondary-foreground">
          To ask about them, write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-foreground underline underline-offset-2">{CONTACT_EMAIL}</a>
        </span>
      }
    >
      <div className="flex max-w-[76ch] flex-col gap-1.5">
        <p className="m-0 text-[15px] leading-[1.5] text-foreground">{REPORTS_SETUP_LINE}</p>
        <p className="m-0 text-[13px] leading-[1.5] text-secondary-foreground">{REPORTS_SETUP_UNTIL}</p>
      </div>
    </Tile>
  )
}
