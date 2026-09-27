// The weekly email's markup (market-first WP3.7): the same pieces the monthly
// draws its inbox sections with (components/blocks/monthly/email.tsx), because
// the approved preview draws "Your market this week" in the same cards, tables,
// inner blocks and footer links as "September in your market". Imported, never
// copied, so the two artefacts cannot drift apart in an inbox.
//
// Tables and inline styles only: Outlook lays out with Word.

export {
  MonthlyLink as WeeklyLink,
  Bar,
  Num,
  Table,
  RowLabel,
  Inner,
  Body,
  ChipLine,
  SubHead,
  MONTHLY_EMAIL_CSS as WEEKLY_EMAIL_CSS,
  type Column,
} from '@/components/blocks/monthly/email'
