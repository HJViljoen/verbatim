import { redirect } from 'next/navigation'

// Retired 2026-08-23: Ask (then the Verbatim Agent) superseded the Ask page —
// the same question and plan/document check, and more. The ENGINE stays
// (lib/ask, plan_checks): the document mode on /api/agent runs on it. The
// /api/ask route itself was deleted in Phase 1 WP21 — it had been live and
// unreferenced by any UI for three weeks, with its own daily cap that did not
// fail closed, which is the definition of an unmetered way in.
export default function AskPage() {
  redirect('/dashboard/agent')
}
