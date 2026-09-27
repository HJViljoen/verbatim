import { salesSection } from '@/components/blocks/weekly/sales'
import type { WeekData } from '@/lib/pages/week'

// "For sales" on This week (market-first WP3.7; the approved preview's This
// week): the weekly's own section (WR4) under this page's key, because This
// week and the weekly report carry this section in full and two
// implementations of it is two chances to tell a salesperson two different
// things about one update.

export const weekSales = salesSection<WeekData>('week.sales', (d) => d.sales)
