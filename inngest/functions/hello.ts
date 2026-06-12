import { inngest } from '@/inngest/client'

// Hello-world function. Exists only to validate the Vercel deploy + Inngest
// registration path (endpoint reachable, function syncs, a step runs). Remove
// once the real pipeline functions (Pass A onward) are in place.
export const helloWorld = inngest.createFunction(
  { id: 'hello-world', triggers: [{ event: 'test/hello.world' }] },
  async ({ event, step }) => {
    const greeting = await step.run('build-greeting', () => {
      const name = (event.data as { name?: string } | undefined)?.name ?? 'world'
      return `Hello, ${name}!`
    })

    return { greeting }
  },
)
