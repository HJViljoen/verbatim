'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionContext } from '@/lib/auth'
import { actorStamp } from '@/lib/config-log'
import { canManageTenant } from '@/lib/roles'
import { createAdminClient } from '@/lib/supabase-admin'
import { parseTagValue, PRODUCT_TAG_COPY, writeProductTag, type TagOutcome } from '@/lib/products/tags'

// "Tag the product" (depth v2 T12; lib/products/tags.ts says what a tag is and
// what it moves). The Tag control is Your products' (T5, wave 2b); this is the
// action it posts to: `videoId`, `commentId` (absent for a video as a whole)
// and `choice` (a TagOption's value: 'named:<product>', 'unclear:<category>',
// 'unbranded:<category>' or 'none'), through useActionState.
//
// OWNERS AND ADMINS, as "Not your market" (app/dashboard/segments/actions.ts):
// a tag changes what the tenant's product counts read, and it is logged as a
// change. ON THE ADMIN CLIENT, SCOPED BY THE SESSION: `authenticated` holds no
// INSERT on product_tags (the migration's grants), so the write goes through
// the service role; the tenant is the session's, never the form's, and the
// video and comment are resolved against it first. The actor is the person
// (actorStamp), carried onto the tag and the change row.
//
// NOT THE TENANT LOCK: the lock holds the searches, rivals and communities; a
// tag changes none of them.

export interface ProductTagState {
  ok: boolean
  outcome: TagOutcome | 'role' | 'unread'
  message: string
}

const schema = z.object({
  videoId: z.string().uuid(),
  commentId: z.string().uuid().nullable(),
  choice: z.string().min(1),
})

export async function tagProduct(_prev: ProductTagState, formData: FormData): Promise<ProductTagState> {
  const session = await getSessionContext()
  if (!canManageTenant(session.role)) return { ok: false, outcome: 'role', message: PRODUCT_TAG_COPY.role }

  const comment = formData.get('commentId')
  const parsed = schema.safeParse({ videoId: formData.get('videoId'), commentId: comment ? String(comment) : null, choice: formData.get('choice') })
  const choice = parsed.success ? parseTagValue(parsed.data.choice) : null
  if (!parsed.success || !choice) return { ok: false, outcome: 'unread', message: PRODUCT_TAG_COPY.unread }

  const r = await writeProductTag(createAdminClient(), {
    clientId: session.clientId,
    videoId: parsed.data.videoId,
    commentId: parsed.data.commentId,
    choice,
    actor: actorStamp(session, 'tagged a product'),
  })
  switch (r.outcome) {
    case 'written':
      revalidatePath('/dashboard/products')
      return { ok: true, outcome: r.outcome, message: PRODUCT_TAG_COPY.done }
    case 'already':
      return { ok: true, outcome: r.outcome, message: PRODUCT_TAG_COPY.already }
    case 'changed':
      return { ok: false, outcome: r.outcome, message: PRODUCT_TAG_COPY.changed }
    case 'unknown_text':
      return { ok: false, outcome: r.outcome, message: PRODUCT_TAG_COPY.unknown }
    case 'unknown_target':
      return { ok: false, outcome: r.outcome, message: PRODUCT_TAG_COPY.unknownTarget }
    case 'not_ready':
      return { ok: false, outcome: r.outcome, message: PRODUCT_TAG_COPY.notReady }
    case 'failed':
      console.error(`[product-tags] tag not written for ${session.clientId}: ${r.error ?? 'unknown error'}`)
      return { ok: false, outcome: r.outcome, message: PRODUCT_TAG_COPY.failed }
  }
}
