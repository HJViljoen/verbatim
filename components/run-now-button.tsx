'use client'

import { useActionState } from 'react'
import { Play } from 'lucide-react'
import { triggerRunNow, type RunNowState } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/button'

const initial: RunNowState = { ok: false, message: '' }

// Owner/admin-only manual pipeline trigger. Rendered conditionally by the
// dashboard; the server action re-checks the role regardless.
export function RunNowButton() {
  const [state, action, pending] = useActionState(triggerRunNow, initial)
  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <Play className="h-3.5 w-3.5" />
        {pending ? 'Starting…' : 'Run now'}
      </Button>
      {state.message && (
        <span className={`text-xs ${state.ok ? 'text-green-600' : 'text-destructive'}`}>{state.message}</span>
      )}
    </form>
  )
}
