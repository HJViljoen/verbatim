import { cache } from 'react'
import { getSessionContext } from '@/lib/auth'

/**
 * The viewed workspace's `clients` row, read ONCE per request (React
 * `cache()`): the billing banner and the phone's top bar both need it (the
 * banner its billing columns, the bar its `company_name`), and the dashboard
 * layout streams both behind Suspense. One select of the whole row, as the
 * banner always made it (`select('*')`: the billing columns are optional on
 * older rows). Null where the row cannot be read; each caller says what that
 * means for it.
 */
export const viewedClientRow = cache(async (): Promise<Record<string, unknown> | null> => {
  const { supabase, clientId } = await getSessionContext()
  const { data } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
})
