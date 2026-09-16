import { createAdminClient } from './lib/supabase-admin'
import { loadAskBasis, askBasisLine } from './lib/agent/basis'
async function main() {
  const admin = createAdminClient()
  const { data } = await admin.from('clients').select('id, company_name').order('company_name')
  for (const c of (data ?? []) as { id: string; company_name: string }[]) {
    const b = await loadAskBasis(admin, c.id)
    console.log(c.company_name, '→', JSON.stringify(b))
    console.log('   ', askBasisLine(b, { asked: true }))
  }
}
main()
