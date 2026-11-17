// Production's Supabase project ref (the same one lib/gather/retag.ts names
// and AGENTS.md publishes). Finance code that could write the real books on a
// rehearsal's say-so checks it: the daily job's injected day
// (lib/finance/daily.ts runDay) and the backfill's --apply
// (scripts/finance-backfill.ts). Kept here, apart from retag.ts, so neither
// pulls in the gather modules.
export const PROD_REF = 'mkwjlckescdveosvrvaq'
