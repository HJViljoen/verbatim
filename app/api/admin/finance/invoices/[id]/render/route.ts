import { financeCaller } from '@/lib/finance/access'
import { FinanceTablesMissing } from '@/lib/finance/load'
import { RenderRefused, renderInvoice } from '@/lib/finance/render'
import { createAdminClient } from '@/lib/supabase-admin'

// POST /api/admin/finance/invoices/[id]/render — print an invoice to its
// one-page PDF and file it (lib/finance/render.ts). Called by the
// finance-daily Inngest job with the ops key (Chromium runs here, in a route,
// never in a step) and by the Costs page's Print button as the platform
// admin. Everyone else: 404. Own tracing entry in next.config.ts.

export const runtime = 'nodejs'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!(await financeCaller(req))) return Response.json({ error: 'Not found.' }, { status: 404 })
  const { id } = await params
  if (!UUID.test(id)) return Response.json({ error: 'No such invoice.' }, { status: 404 })
  try {
    const out = await renderInvoice(createAdminClient(), id)
    return Response.json(out)
  } catch (e) {
    if (e instanceof RenderRefused) return Response.json({ error: e.message }, { status: e.status })
    if (e instanceof FinanceTablesMissing) return Response.json({ error: 'The finance tables are not in this database yet.' }, { status: 503 })
    console.error('[admin/finance/render] failed:', e)
    return Response.json({ error: 'The invoice could not be printed.' }, { status: 500 })
  }
}
