import type { Block } from '@/lib/blocks/types'
import type { ContentBriefData } from '@/lib/pages/content-brief'
import { contentPlaybook } from './playbook'
import { contentRecord } from './record'

export { contentMake } from './make'
export { contentPlaybook } from './playbook'
export { contentRecord } from './record'

/**
 * The content brief's own blocks (Block D wave 2, package E-content).
 *
 * TWO OF THE THREE ARE HERE AND THE THIRD IS NOT, ON PURPOSE. `content.make`
 * draws `MarketSurfaceData` — the ledger the brief already loads for
 * `ct.advice` — so it is registered against the MARKET surface in
 * `lib/reports/documents/load-reading.ts` and costs no second read. These two
 * draw this surface's own data.
 */
export const CONTENT_BRIEF_BLOCKS: readonly Block<ContentBriefData>[] = [
  contentPlaybook,
  contentRecord,
]
