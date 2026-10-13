// The v2 kit (depth redesign, T2): the shared server components the Market,
// Voices, Your products, Content and Your moves pages are drawn from, to the
// boards in Verbatim-Design/depth-2026-10 (E2 to E6). The page bar is the
// shared `PageBar` (components/shell/page-grid.tsx, its `meta` line); the
// colour roles are components/colour-roles.tsx; the movement badge is
// `MovementBadge`. `scripts/render-kit.tsx` draws every piece on one page.
export { InPlacePanel, PanelSection, PanelTitle, SELECTED_CARD_RING, type InPlacePanelProps } from './panel'
export { PeriodSwitch, PERIODS, parsePeriod, type Period, type PeriodOption, type PeriodSwitchProps } from './period-switch'
export { FlagChip, FLAG_WORDS, flagWordOf, type FlagChipProps, type FlagWord } from './flag-chip'
export { CARD, CardHead, type CardHeadProps } from './card-head'
export { StatCell, StatRow, type StatCellProps } from './stat-cell'
export { SpikeBars, type SpikeBarsProps, type SpikeWeek } from './spike-bars'
export { MiniBars, type MiniBar, type MiniBarsProps } from './mini-bars'
export { SlopePair, type SlopePairProps, type SlopeRow } from './slope-pair'
export { UnitSquares, MAX_UNITS, type UnitSquaresProps } from './unit-squares'
export { TickBar, TickBarRow, TickKey, type TickBarProps, type TickBarRowProps } from './tick-bar'
export { CatalogueShelf, ShelfLegend, shelfTone, type CatalogueShelfProps, type ShelfColumn, type ShelfProduct } from './catalogue-shelf'
export { PairedBars, type PairedBarsProps, type PairedCell, type PairedColumn, type PairedRow } from './paired-bars'
