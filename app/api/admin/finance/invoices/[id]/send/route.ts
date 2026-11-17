import { financeCaller } from '@/lib/finance/access'
import { FinanceTablesMissing } from '@/lib/finance/load'
import { sendInvoice, supabaseSendPort } from '@/lib/finance/send'
import { createAdminClient } from '@/lib/supabase-admin'

// POST /api/admin/finance/invoices/[id]/send — email an invoice with its PDF
// (lib/finance/send.ts: claim, send, record; a refused email puts it back to
// `ready` with the reason). Body `{ "mode": "test" }` sends the same email to
// ALERT_EMAIL alone and changes nothing. The ops key (the daily job) or a
// platform admin's session; everyone else 404. No Chromium here: the PDF was
// printed by the render route and is read back from storage.

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!(await financeCaller(req))) return Response.json({ error: 'Not found.' }, { status: 404 })
  const { id } = await params
  if (!UUID.test(id)) return Response.json({ error: 'No such invoice.' }, { status: 404 })
  const body = (await req.json().catch(() => null)) as { mode?: unknown } | null
  const test = body?.mode === 'test'
  try {
    const r = await sendInvoice(supabaseSendPort(createAdminClient()), id, { test })
    return Response.json(r, { status: r.ok ? 200 : 409 })
  } catch (e) {
    if (e instanceof FinanceTablesMissing) return Response.json({ ok: false, message: 'The finance tables are not in this database yet.' }, { status: 503 })
    console.error('[admin/finance/send] failed:', e)
    return Response.json({ ok: false, message: 'The invoice could not be sent.' }, { status: 500 })
  }
}
