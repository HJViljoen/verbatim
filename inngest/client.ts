import { Inngest } from 'inngest'

// Single Inngest client for the Verbatim pipeline. The `id` namespaces this app
// in Inngest Cloud and must stay stable across deployments. Cloud IS connected
// and has been for months — the 06:00 SAST dispatcher and every scheduled run
// come through it — so changing this string now would orphan the registered
// app, not merely rename it. Fixed.
export const inngest = new Inngest({ id: 'verbatim' })
