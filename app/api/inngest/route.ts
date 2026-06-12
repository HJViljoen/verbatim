import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { helloWorld } from '@/inngest/functions/hello'

// Inngest endpoint. Inngest Cloud calls this route (GET to sync, PUT to
// register, POST to invoke) using its own signing-key auth — it carries no
// Supabase session, so `proxy.ts` excludes this path from the auth redirect.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld],
})
