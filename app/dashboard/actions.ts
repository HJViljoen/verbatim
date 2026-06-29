'use server'

import { inngest } from '@/inngest/client'
import { getSessionContext, canManageTenant } from '@/lib/auth'

export interface RunNowState {
  ok: boolean
  message: string
}

// Manually trigger the pipeline for the caller's tenant. Owner/admin only —
// re-checked server-side (the button is also hidden for members). Emits the same
// event the cron dispatcher uses, so manual and scheduled runs share one path.
export async function triggerRunNow(
  _prev: RunNowState,
  _formData: FormData,
): Promise<RunNowState> {
  const { clientId, role } = await getSessionContext()
  if (!canManageTenant(role)) {
    return { ok: false, message: 'Only owners and admins can start a run.' }
  }
  try {
    await inngest.send({ name: 'pipeline/run.requested', data: { clientId } })
  } catch (e) {
    return { ok: false, message: `Could not start run: ${(e as Error).message}` }
  }
  return { ok: true, message: 'Run started — refresh in a few minutes for new data.' }
}
