import { forSalesBlock } from '@/components/blocks/for-sales'
import type { WeekData } from '@/lib/pages/week'

// WK §5 · For sales (the mock's §7; the weekly report's WR4).
//
// ONE LINE, AND THAT IS DELIBERATE. The block itself is
// `components/blocks/for-sales.tsx` because This week and the weekly report
// both carry this section in full, and two implementations of it is two chances
// to tell a salesperson two different things about one week. WP17 writes the
// same line against its own data shape.

export const weekSales = forSalesBlock<WeekData>('week.sales', (d) => d.sales)
