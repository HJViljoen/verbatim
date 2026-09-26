import type { SupabaseClient } from '@supabase/supabase-js'

import { readingHandle } from '../reading/read'
import { loadReadingMonth } from '../reading/reading-view'
import { oneLineBar } from '../shell/bar'
import type { ContextLineInput } from '../shell/bar'

/**
 * Settings' one-line bar for a sub-page that does not already hold the reading
 * month (the 25 Sep rulings, market-first WP3.10): the brand, the reading
 * month, and "as at the {update} update · next update {date}". The same read
 * every reading page makes (`loadReadingMonth`, memoised per request). A read
 * that fails leaves the bar its title alone, never a date made up for it.
 */
export async function settingsBar(supabase: SupabaseClient, clientId: string, tenant: string, now: string = new Date().toISOString()): Promise<ContextLineInput | null> {
  const reading = await loadReadingMonth(supabase, readingHandle(clientId), now).catch((error: unknown) => {
    console.error(`[settings] reading month not read for ${clientId}: ${(error as { message?: string }).message ?? String(error)}`)
    return null
  })
  return oneLineBar(tenant, reading)
}
