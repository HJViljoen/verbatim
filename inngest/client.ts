import { Inngest } from 'inngest'

// Single Inngest client for the SocialLens pipeline. The `id` namespaces this
// app in Inngest Cloud and must stay stable across deployments.
export const inngest = new Inngest({ id: 'sociallens' })
