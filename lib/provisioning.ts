import { deriveCompetitorKeywords, ONBOARDING_MAX_VIDEOS } from './onboarding-config'
import type { Platform } from './gather/types'

/** Every platform the pipeline can store data for. Mirrors the `Platform`
 *  union in lib/gather/types, which is the type the adapters are keyed by —
 *  a value list is needed to validate operator input at runtime. */
const KNOWN_PLATFORMS: readonly Platform[] = ['tiktok', 'youtube', 'instagram', 'reddit']

// Tenant provisioning (Tier 2, 2026-08-18).
//
// Every tenant in production was stood up by hand-written SQL, and the shape
// that produces is easy to get subtly wrong in ways nothing catches until a run
// spends money: competitor_keywords left empty means gather never searches for
// the competitors you just named (the whole competitive half of the product,
// silently absent), max_videos left at the column default of 10 means the
// analysis floors leave almost nothing standing, and a tenant created active
// starts drawing paid runs on the next scheduler tick.
//
// Pure shaping + validation here, IO in scripts/provision-tenant.ts, so the
// rules are testable without a database and the same rules apply wherever a
// tenant is created.

export interface TenantSpec {
  companyName: string
  /** Words that mean "this is about the client". Defaults to the company name. */
  brandKeywords?: string[]
  competitorNames: string[]
  industryKeywords?: string[]
  platforms?: string[]
  reportEmails?: string[]
  reportDay?: string
  reportPeriod?: 'weekly' | 'monthly' | 'paused'
  maxVideos?: number
  commentDepth?: number
  /** Each competitor's own accounts, keyed by the EXACT competitorNames entry:
   *  `{ "Cotopaxi": { instagram: 'cotopaxi', youtube: 'UC…' } }`. Optional — a
   *  tenant without them simply has no competitor census. Operator-set: a wrong
   *  handle credits another brand's posts to a tracked competitor. */
  competitorHandles?: Record<string, Record<string, string>>
  plan?: string
  comped?: boolean
  /** An operator running this IS the approval. Off means the tenant is created
   *  dormant, matching what a self-serve signup gets. */
  approve?: boolean
}

/** Mirrors the tracking_configs CHECK constraints (T0-2) so a bad spec fails
 *  with a sentence instead of a raw constraint name after three writes. */
export const LIMITS = {
  maxVideos: 100,
  commentDepth: 500,
  maxComments: 1000,
  keywordsPerBucket: 15,
  reportEmails: 25,
} as const

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export function validateSpec(spec: TenantSpec): string[] {
  const errors: string[] = []
  const push = (c: boolean, m: string) => { if (c) errors.push(m) }

  push(!spec.companyName?.trim(), 'companyName is required')
  push(!spec.competitorNames?.length, 'at least one competitor is required — half the corpus is found through them, and every competitive surface reads them')
  push((spec.competitorNames ?? []).length > LIMITS.keywordsPerBucket, `at most ${LIMITS.keywordsPerBucket} competitors`)
  push((spec.industryKeywords ?? []).length > LIMITS.keywordsPerBucket, `at most ${LIMITS.keywordsPerBucket} industry keywords`)
  push((spec.brandKeywords ?? []).length > LIMITS.keywordsPerBucket, `at most ${LIMITS.keywordsPerBucket} brand keywords`)
  push((spec.reportEmails ?? []).length > LIMITS.reportEmails, `at most ${LIMITS.reportEmails} report recipients`)
  push((spec.maxVideos ?? 0) > LIMITS.maxVideos, `maxVideos must be at most ${LIMITS.maxVideos}`)
  push((spec.commentDepth ?? 0) > LIMITS.commentDepth, `commentDepth must be at most ${LIMITS.commentDepth}`)
  push(!!spec.reportDay && !DAYS.includes(spec.reportDay), `reportDay must be one of ${DAYS.join(', ')}`)

  const unknown = (spec.platforms ?? []).filter((p) => !KNOWN_PLATFORMS.includes(p as Platform))
  push(unknown.length > 0, `unknown platform(s): ${unknown.join(', ')}`)

  // Reddit is operator-enabled per the platform's own rule; flag it rather than
  // refuse, so an operator can turn it on deliberately and knowingly.
  for (const e of (spec.reportEmails ?? [])) {
    push(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e), `not an email address: ${e}`)
  }
  for (const [name, handles] of Object.entries(spec.competitorHandles ?? {})) {
    for (const e of validateHandles(handles ?? {})) errors.push(`${name} — ${e}`)
  }
  return errors
}

/** The three platforms an account census can actually read. Reddit has no
 *  brand profile worth reading — a subreddit is a community, not an account
 *  (lib/gather/owned.ts OWNED_PROFILE_PLATFORMS). */
export const HANDLE_PLATFORMS: readonly string[] = ['instagram', 'tiktok', 'youtube']

/** A YouTube handle must be a CHANNEL ID, not an @name: the owned reader calls
 *  the Data API's channels endpoint with it (lib/gather/owned.ts), and an
 *  @name silently reads nothing. Both live tenants' own channels are stored
 *  this way (`UClVW7BGbRvC5-0kowu8quhw`, `UCCthtmYgmon7h0meZaC1FEQ`). */
export const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/

/** Instagram: 1-30 of letters, digits, period and underscore; no leading or
 *  trailing period and no consecutive periods — the platform's own published
 *  rule. Checked against every handle this product stores. */
export const INSTAGRAM_HANDLE = /^(?!.*\.\.)(?!\.)[A-Za-z0-9._]{1,30}(?<!\.)$/

/** TikTok: 2-24 of letters, digits, period and underscore; no trailing period.
 *  TikTok permits a LEADING period where Instagram does not, which is why
 *  these are two expressions and not one. */
export const TIKTOK_HANDLE = /^[A-Za-z0-9._]{2,24}(?<!\.)$/

/**
 * What a person actually pastes, turned into what we store.
 *
 * Handles arrive from a browser's address bar far more often than from the
 * profile itself: `https://www.instagram.com/ossur_corp/`, `@ossur_corp`,
 * `instagram.com/ossur_corp?hl=en`. All three are the same account, and
 * rejecting two of them teaches a client to retype rather than to paste — so
 * they are normalised to the bare handle before anything is validated.
 *
 * YouTube is the exception and stays untouched: the owned reader calls the
 * Data API's channels endpoint with a CHANNEL ID, a pasted `youtube.com/@name`
 * is NOT one, and quietly stripping it to `@name` would produce a value that
 * passes as a handle and silently reads nothing. A YouTube URL is handed back
 * as it came so `validateHandles` can say what is wrong with it.
 */
export function normaliseHandle(platform: string, raw: string): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  if (platform === 'youtube') {
    // One case is safe and worth taking: the canonical channel URL, which
    // contains the channel id itself.
    return s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1] ?? s
  }
  const fromUrl = s.match(/(?:instagram|tiktok)\.com\/@?([^/?#\s]+)/i)?.[1]
  return (fromUrl ?? s).replace(/^@/, '').replace(/\/+$/, '').trim()
}

/** Validate one rival's account handles. Nothing in the product has ever
 *  checked these — `buildProvisionPlan` only filters the KEYS to names that are
 *  tracked — and a wrong handle credits another brand's posts to a tracked
 *  rival, which is worse than tracking nothing (the reason Sealand's config
 *  script verified each one by hand: TikTok @cotopaxi is a private individual
 *  named Nelson). Returns sentences, empty when the set is usable. */
export function validateHandles(handles: Record<string, string>): string[] {
  const errors: string[] = []
  for (const [platform, handle] of Object.entries(handles)) {
    if (!HANDLE_PLATFORMS.includes(platform)) {
      errors.push(`${platform}: not a platform an account can be read on (${HANDLE_PLATFORMS.join(', ')})`)
      continue
    }
    const value = (handle ?? '').trim()
    if (!value) {
      errors.push(`${platform}: empty handle — leave the platform out instead`)
      continue
    }
    if (value.startsWith('@')) {
      errors.push(`${platform}: drop the leading @ — handles are stored bare`)
      continue
    }
    if (platform === 'youtube') {
      if (!YOUTUBE_CHANNEL_ID.test(value)) {
        errors.push(`youtube: "${value}" is not a channel id — YouTube is read by channel id (UC… , 24 characters), and an @name reads nothing at all`)
      }
      continue
    }
    if (/[/:?#]/.test(value) || /\.com/i.test(value)) {
      errors.push(`${platform}: "${value}" looks like a link — paste the handle on its own, or let the form take it out of the URL for you`)
      continue
    }
    if (platform === 'instagram' && !INSTAGRAM_HANDLE.test(value)) {
      errors.push(`instagram: "${value}" is not an Instagram username — letters, digits, periods and underscores, at most 30, and never starting or ending with a period`)
      continue
    }
    if (platform === 'tiktok' && !TIKTOK_HANDLE.test(value)) {
      errors.push(`tiktok: "${value}" is not a TikTok username — letters, digits, periods and underscores, 2 to 24 of them, and never ending in a period`)
    }
  }
  return errors
}

/**
 * What a format check CANNOT catch, said out loud.
 *
 * The canonical failure this product has already had is a handle in perfect
 * format belonging to the wrong person: TikTok @cotopaxi is a private
 * individual named Nelson, and it passes TIKTOK_HANDLE exactly as
 * @cotopaxiofficial does. No expression distinguishes them.
 *
 * What does distinguish them is the census Settings already prints: a wrong
 * handle yields posts that are captured and then discarded or never read,
 * while a right one yields posts that are read and produce findings. So the
 * handles form states the second check rather than implying the first is the
 * whole of it.
 */
export const HANDLE_FORMAT_CAVEAT =
  'A handle in the right shape can still be the wrong account. After the next update, check that posts captured from it are also being read — a handle that captures and never reads is usually the wrong person.'

export interface ProvisionPlan {
  client: {
    company_name: string
    plan: string
    is_comped: boolean
    is_active: boolean
    approved_at: string | null
  }
  config: {
    brand_keywords: string[]
    competitor_names: string[]
    competitor_keywords: string[]
    industry_keywords: string[]
    /** Competitor-owned account handles, keyed by competitor name. */
    competitor_handles: Record<string, Record<string, string>>
    platforms: string[]
    report_emails: string[]
    report_day: string
    report_period: string
    max_videos: number
    comment_depth: number
  }
  /** Things an operator should see before committing, not errors. */
  warnings: string[]
}

export function buildProvisionPlan(spec: TenantSpec, now = new Date()): ProvisionPlan {
  const competitorNames = (spec.competitorNames ?? []).map((s) => s.trim()).filter(Boolean)
  const brandKeywords = (spec.brandKeywords?.length ? spec.brandKeywords : [spec.companyName])
    .map((s) => s.trim()).filter(Boolean)
  // Derived, never left empty: gather searches competitor_KEYWORDS while
  // tagging matches competitor_NAMES, and nothing in the app ever wrote the
  // former, so a hand-made tenant gathered nothing about its competitors.
  const competitorKeywords = deriveCompetitorKeywords(competitorNames)
  // Only handles for names we actually track: a key that matches no competitor
  // would read an account whose posts nothing downstream could attribute.
  const competitorHandles = Object.fromEntries(
    Object.entries(spec.competitorHandles ?? {}).filter(([name]) =>
      competitorNames.some((n) => n.toLowerCase() === name.toLowerCase()),
    ),
  )

  const warnings: string[] = []
  const dropped = competitorNames.filter(
    (n) => !competitorKeywords.some((k) => k.toLowerCase() === n.toLowerCase()),
  )
  if (dropped.length) {
    warnings.push(`too short to search on, so they will tag but not gather: ${dropped.join(', ')}`)
  }
  if ((spec.platforms ?? []).includes('reddit')) {
    warnings.push('reddit is enabled: it is a degradable, operator-enabled platform and spends on every run')
  }
  if (!spec.reportEmails?.length) {
    warnings.push('no recipients: the default schedule will email nobody')
  }
  if (spec.approve) {
    warnings.push('approved and active: the scheduler will pick this tenant up on its next report_day')
  }

  return {
    client: {
      company_name: spec.companyName.trim(),
      plan: spec.plan ?? 'design_partner',
      is_comped: spec.comped ?? true,
      is_active: Boolean(spec.approve),
      approved_at: spec.approve ? now.toISOString() : null,
    },
    config: {
      brand_keywords: brandKeywords,
      competitor_names: competitorNames,
      competitor_keywords: competitorKeywords,
      industry_keywords: (spec.industryKeywords ?? []).map((s) => s.trim()).filter(Boolean),
      platforms: spec.platforms ?? ['tiktok', 'youtube', 'instagram'],
      report_emails: (spec.reportEmails ?? []).map((s) => s.trim()).filter(Boolean),
      report_day: spec.reportDay ?? 'sunday',
      // Paused by default: a new tenant should produce its first read when an
      // operator asks for it, not whenever the next scheduler tick lands.
      report_period: spec.reportPeriod ?? 'paused',
      max_videos: spec.maxVideos ?? ONBOARDING_MAX_VIDEOS,
      comment_depth: spec.commentDepth ?? 50,
      competitor_handles: competitorHandles,
    },
    warnings,
  }
}
