import { describe, it, expect } from 'vitest'
import { tiktok } from './tiktok'
import { instagram } from './instagram'
import { youtube, youtubeCoverUrl } from './youtube'
import { reddit } from './reddit'

// Cover-frame extraction (WP7b, 2026-09-12).
//
// The fixtures below are the SHAPES read off real `video_raw.raw` rows on
// 2026-09-12 (three rows per platform, read-only, both live tenants) — urls
// shortened, nothing else changed. That verification is the point of this file:
// the design guessed `covers` / `videoMeta.coverUrl` for TikTok and
// `thumbnailUrl` for Instagram, and none of those fields exist in what the
// actors actually return. If an actor version ever moves the cover, these tests
// are where the old shape is on record.

const TT_COVER = 'https://p16-common-sign.tiktokcdn.com/tos-useast5-p-0068-tx/osEz~tplv-tiktokx-cropcenter-q:300:400:q70.heic?dr=14782'

describe('tiktok.coverUrl', () => {
  it('reads video.cover — the field the live actor returns', () => {
    expect(tiktok.coverUrl!({ video: { url: 'https://v45.tiktokcdn-eu.com/x.mp4', cover: TT_COVER, thumbnail: TT_COVER, duration: 66.4 } }))
      .toBe(TT_COVER)
  })

  it('falls back to video.thumbnail when only that is present', () => {
    expect(tiktok.coverUrl!({ video: { thumbnail: TT_COVER } })).toBe(TT_COVER)
  })

  it('is null when the item carries no cover at all', () => {
    expect(tiktok.coverUrl!({ video: { url: 'https://v45.tiktokcdn-eu.com/x.mp4' } })).toBeNull()
    expect(tiktok.coverUrl!({})).toBeNull()
  })
})

const IG_COVER = 'https://instagram.frkh1-1.fna.fbcdn.net/v/t51.82787-15/786914279_18620888395047255_n.jpg?stp=dst-jpg_e35_tt6'

describe('instagram.coverUrl', () => {
  it('reads displayUrl — present on every sampled item, reels included', () => {
    expect(instagram.coverUrl!({ type: 'Video', productType: 'clips', displayUrl: IG_COVER, images: [], videoUrl: 'https://x/v.mp4' }))
      .toBe(IG_COVER)
  })

  it('falls back to images[0] when displayUrl is missing', () => {
    expect(instagram.coverUrl!({ images: [IG_COVER, 'https://other.jpg'] })).toBe(IG_COVER)
  })

  it('is null with neither, and tolerates an empty images array', () => {
    expect(instagram.coverUrl!({ images: [] })).toBeNull()
    expect(instagram.coverUrl!({})).toBeNull()
  })
})

describe('youtube.coverUrl', () => {
  const thumbnails = {
    default: { url: 'https://i.ytimg.com/vi/UJWdnF1JHEQ/default.jpg', width: 120, height: 90 },
    medium: { url: 'https://i.ytimg.com/vi/UJWdnF1JHEQ/mqdefault.jpg', width: 320, height: 180 },
    high: { url: 'https://i.ytimg.com/vi/UJWdnF1JHEQ/hqdefault.jpg', width: 480, height: 360 },
    standard: { url: 'https://i.ytimg.com/vi/UJWdnF1JHEQ/sddefault.jpg', width: 640, height: 480 },
    maxres: { url: 'https://i.ytimg.com/vi/UJWdnF1JHEQ/maxresdefault.jpg', width: 1280, height: 720 },
  }

  it('prefers high (hqdefault) — the one variant every video has', () => {
    expect(youtube.coverUrl!({ id: 'UJWdnF1JHEQ', snippet: { thumbnails } }))
      .toBe('https://i.ytimg.com/vi/UJWdnF1JHEQ/hqdefault.jpg')
  })

  it('falls through the smaller variants when high is absent', () => {
    expect(youtube.coverUrl!({ id: 'x', snippet: { thumbnails: { default: thumbnails.default, medium: thumbnails.medium } } }))
      .toBe(thumbnails.medium.url)
  })

  it('derives the durable url from the id when the item has no thumbnails', () => {
    expect(youtube.coverUrl!({ id: 'Xxfk30ld5R0' })).toBe('https://i.ytimg.com/vi/Xxfk30ld5R0/hqdefault.jpg')
    expect(youtube.coverUrl!({})).toBeNull()
  })

  it('coverUrlById needs no raw item — this is what makes YouTube backfillable', () => {
    expect(youtube.coverUrlById!('wJGfSoPbB5U')).toBe('https://i.ytimg.com/vi/wJGfSoPbB5U/hqdefault.jpg')
    expect(youtubeCoverUrl('wJGfSoPbB5U')).toBe(youtube.coverUrlById!('wJGfSoPbB5U'))
  })
})

describe('reddit', () => {
  it('has no cover frame — it is text-native, and OCR must skip it', () => {
    expect(reddit.coverUrl).toBeUndefined()
    expect(reddit.coverUrlById).toBeUndefined()
  })
})

describe('only YouTube survives its raw item', () => {
  it('TikTok and Instagram have no by-id cover: their urls are signed and expire', () => {
    expect(tiktok.coverUrlById).toBeUndefined()
    expect(instagram.coverUrlById).toBeUndefined()
    expect(youtube.coverUrlById).toBeDefined()
  })
})
