import { Inngest } from 'inngest'

// Single Inngest client for the Verbatim pipeline. The `id` namespaces this
// app in Inngest Cloud and must stay stable across deployments — safe to set to
// 'verbatim' now because Inngest Cloud isn't connected yet (no registration to
// disrupt); keep it fixed once Cloud is live.
export const inngest = new Inngest({ id: 'verbatim' })
