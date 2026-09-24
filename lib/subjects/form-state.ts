import type { SubjectFormState } from '@/lib/actions/subjects'

/** A subject form's state before its first submit. It lives here, not in
 *  `lib/actions/subjects.ts`: a "use server" file may export async functions
 *  only, and one plain object there took down every Studio action (2026-09-24). */
export const EMPTY_STATE: SubjectFormState = { ok: false, message: '' }
