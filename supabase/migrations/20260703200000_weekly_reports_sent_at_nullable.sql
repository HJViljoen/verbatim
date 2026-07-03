-- A report can be stored without being emailed (no provider, no recipients, or
-- an operator "store" run) — sent_at is genuinely unknown-until-sent, and the
-- Reports page already renders the null as "viewable here".
ALTER TABLE weekly_reports ALTER COLUMN sent_at DROP NOT NULL;
