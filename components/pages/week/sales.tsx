import { salesSection } from './sales-section'
import type { WeekData } from '@/lib/pages/week'

// "For sales" on This week (market-first WP3.7; the approved preview's This
// week): components/pages/week/sales-section.tsx under this page's key. (WP3.7
// shared it with the weekly's WR4; the weekly stays on deploy 3's template
// while the report redesigns are paused, 27 Sep.)

export const weekSales = salesSection<WeekData>('week.sales', (d) => d.sales)
