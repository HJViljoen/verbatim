import type { GatherConfig } from './types'
import { str } from './util'

/**
 * Resolve entity tags for a video from its account name.
 *
 * v4.1 rule (do not regress): `is_client` from `brand_keywords`,
 * `is_competitor` / `competitor_name` from `competitor_names` ONLY.
 * `competitor_keywords` and `industry_keywords` are search-only — using them to
 * tag produced garbage like competitor_name="prosthetic" on industry videos.
 */
export function tagAccount(
  accountName: string,
  config: GatherConfig,
): { is_client: boolean; is_competitor: boolean; competitor_name: string | null } {
  const acct = str(accountName).toLowerCase()

  const is_client = (config.brand_keywords ?? []).some((k) => acct.includes(str(k).toLowerCase()))

  let is_competitor = false
  let competitor_name: string | null = null
  for (const cn of config.competitor_names ?? []) {
    const name = str(cn)
    if (name && acct.includes(name.toLowerCase())) {
      is_competitor = true
      competitor_name = name
      break
    }
  }

  return { is_client, is_competitor, competitor_name }
}
