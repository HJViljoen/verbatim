import { z } from 'zod'
import { isStaticKey } from './compose'
import { REPORT_FRAMING_MAX, REPORT_TITLE_MAX, SECTION_PAGES, type ReportSection } from './types'
import { DOCUMENT_BRIEF_MAX, EXPORT_PARAMS_MAX_CHARS, EXPORT_PARAMS_MAX_KEYS, REPORT_MAX_SECTIONS } from '../config'
import { DEFAULT_DOCUMENT_ROLE, DOCUMENT_BLOCK_KEYS, DOCUMENT_ROLES, documentSettings, type DocumentBlockKey, type DocumentRole, type DocumentSettings } from './documents/types'
import { CUSTOM_KEY, documentTemplate } from './documents/templates'
import type { Audience } from './types'

/** What a browser may put into a report: shared by the server actions and the
 *  routes, so a crafted POST meets the same caps as the Studio. */
export const audienceSchema = z.enum(['leadership', 'marketing', 'sales', 'content', 'general'])

export const sectionSchema = z.object({
  id: z.string().min(1).max(40),
  page: z.enum(SECTION_PAGES as [string, ...string[]]),
  params: z.record(z.string().max(40), z.string().max(EXPORT_PARAMS_MAX_CHARS)).refine((p) => Object.keys(p).length <= EXPORT_PARAMS_MAX_KEYS, 'too many params'),
  keys: z.array(z.string().max(60).refine(isStaticKey, 'not a static tile key')).min(1, 'a section keeps at least one tile').max(40).optional(),
  variant: z.enum(['default', 'full']).optional(),
  framing: z.string().max(REPORT_FRAMING_MAX).optional(),
})

export const sectionsSchema = z.array(sectionSchema).max(REPORT_MAX_SECTIONS, `a report holds at most ${REPORT_MAX_SECTIONS} sections`)

export const reportPatchSchema = z.object({
  title: z.string().trim().min(1, 'a report needs a title').max(REPORT_TITLE_MAX).optional(),
  audience: audienceSchema.optional(),
  coverTitle: z.string().trim().max(REPORT_TITLE_MAX).optional(),
  /** Free-text "written for" (Stage 3). */
  reader: z.string().trim().max(80).optional(),
  sections: sectionsSchema.optional(),
})

export type ReportPatch = z.infer<typeof reportPatchSchema>

/** A written report's settings, as the Studio may change them (2026-08-31). */
export const documentSettingsPatch = z.object({
  title: z.string().trim().min(1, 'a report needs a title').max(REPORT_TITLE_MAX).optional(),
  reader: z.string().trim().max(80).optional(),
  sellsTo: z.enum(['consumers', 'retail', 'professionals', 'businesses']).optional(),
  /** null = every tracked competitor. */
  competitors: z.array(z.string().trim().min(1).max(60)).max(10).nullable().optional(),
  findings: z.union([z.literal(3), z.literal(4)]).optional(),
  /** Custom briefs (2026-09-12): the operator's own instruction, the topic
   *  blocks it must include in their print order, and whose voice writes it.
   *  Empty string and empty array are how the Studio clears them. */
  brief: z.string().trim().max(DOCUMENT_BRIEF_MAX, `a brief runs to ${DOCUMENT_BRIEF_MAX} characters at most`).optional(),
  blocks: z.array(z.enum(DOCUMENT_BLOCK_KEYS as [DocumentBlockKey, ...DocumentBlockKey[]]))
    .max(DOCUMENT_BLOCK_KEYS.length)
    .refine((b) => new Set(b).size === b.length, 'a block can only be included once')
    .optional(),
  role: z.enum(DOCUMENT_ROLES as [DocumentRole, ...DocumentRole[]]).optional(),
})
export type DocumentSettingsPatch = z.infer<typeof documentSettingsPatch>

/** Sections as stored: drop empty framing, keep keys in catalogue order is the caller's job. */
export function tidySections(sections: z.infer<typeof sectionsSchema>): ReportSection[] {
  return sections.map((s) => {
    const out: ReportSection = { id: s.id, page: s.page as ReportSection['page'], params: s.params }
    if (s.keys) out.keys = s.keys
    if (s.variant === 'full') out.variant = 'full'
    const framing = s.framing?.trim()
    if (framing) out.framing = framing
    return out
  })
}

/** The three fields that belong to a custom brief and to nothing else. */
export const CUSTOM_ONLY_FIELDS = ['brief', 'blocks', 'role'] as const

/**
 * A settings patch applied to the row it lands on (WP7d, 2026-09-12). The
 * server action is the contract, not the Studio's hidden controls: a crafted
 * POST must not put a brief, a topic block or a role on one of the four fixed
 * templates, whose skeleton is fixed on purpose. Those fields are stripped
 * there and named back to the caller.
 *
 * On a custom brief the ROLE also sets the register: the report is filed and
 * rendered as what it is written as (a custom brief in the marketing role is
 * a marketing report), so the audience is returned with the settings.
 */
export function applyDocumentSettingsPatch(args: {
  templateKey: string | null | undefined
  current: Partial<DocumentSettings> | null | undefined
  patch: DocumentSettingsPatch
}): { settings: DocumentSettings; audience: Audience | null; ignored: string[] } {
  const custom = args.templateKey === CUSTOM_KEY
  const p = args.patch
  const ignored = custom ? [] : CUSTOM_ONLY_FIELDS.filter((f) => p[f] !== undefined)
  const settings = documentSettings({
    ...(args.current ?? {}),
    ...(p.sellsTo !== undefined ? { sellsTo: p.sellsTo } : {}),
    ...(p.competitors !== undefined ? { competitors: p.competitors } : {}),
    ...(p.findings !== undefined ? { findings: p.findings } : {}),
    ...(custom && p.brief !== undefined ? { brief: p.brief } : {}),
    ...(custom && p.blocks !== undefined ? { blocks: p.blocks } : {}),
    ...(custom && p.role !== undefined ? { role: p.role } : {}),
    // A fixed template never carries them, whatever an older row stored.
    ...(custom ? {} : { brief: undefined, blocks: undefined, role: undefined }),
  })
  const audience = custom ? (documentTemplate(settings.role ?? DEFAULT_DOCUMENT_ROLE)?.audience ?? null) : null
  return { settings, audience, ignored }
}

/** What the operator is told when a patch tried to set a custom brief's own
 *  fields on a fixed template. */
export const IGNORED_FIELDS_MESSAGE = 'A brief, its topics and its role belong to a custom brief. Nothing else in this report changed.'
