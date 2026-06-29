// Shared between the settings form (client) and its server action. Kept in a
// plain module (no 'use server'/'use client') so both sides import one source
// of truth for the allowed values + numeric bounds.

export const PLATFORMS = ['tiktok', 'youtube', 'instagram'] as const
export const PERIODS = ['weekly', 'monthly'] as const
export const DAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const

export const LIMITS = {
  max_videos: { min: 1, max: 1000 },
  max_comments: { min: 1, max: 2000 },
  comment_depth: { min: 1, max: 2000 },
} as const

export type Platform = (typeof PLATFORMS)[number]
