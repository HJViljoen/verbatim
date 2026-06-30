import { Inngest } from 'inngest'

// Single Inngest client for the Verbatim pipeline. The `id` namespaces this
// app in Inngest Cloud and must stay stable across deployments — so it keeps the
// original 'sociallens' value despite the rebrand (changing it re-registers the app).
export const inngest = new Inngest({ id: 'sociallens' })
