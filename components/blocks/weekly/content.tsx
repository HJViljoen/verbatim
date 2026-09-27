import { repliesSection } from '@/components/pages/week/reply'
import type { WeeklyData } from '@/lib/pages/weekly'
import type { WeeklyBlock } from './section'

// WR5 · Worth a reply (market-first WP3.7; the approved preview's
// WeeklyReport): This week's own section under the weekly's key, over the same
// reply queue (`buildReplies`), so the email and the page pick the same
// comments. In an inbox: "12 comments are worth a reply: 6 buying signals, 3
// questions and 3 objections.", three rows, and "Open all 12 on This week".
// The key keeps its Phase 1 name (`weekly.content`, "for content"): a key is a
// stored contract, and the section is still the content person's.

export const weeklyContent = repliesSection<WeeklyData>('weekly.content', (d) => d.replies, 'weekly') as WeeklyBlock
