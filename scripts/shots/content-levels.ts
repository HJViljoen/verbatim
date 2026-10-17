// Content's level pages for the shots harness (depth as pages, 17 Oct; the G5
// boards): every state beside its board, registered in scripts/pages-shots.ts
// with one line. Shot with
//
//   node --import tsx scripts/pages-shots.ts --only <keys> --out <dir> \
//     --artboards ~/Documents/Heinrich/Verbatim-Design/depth-2026-10/canvas/project
//
// and `--width 390` for the phone (the phone boards are G5-*-Phone). A loader
// dump of a level page (`scripts/content-dump.ts --view idea:<id> | replies |
// posts`) is drawn by its own page with `CONTENT_LEVEL_JSON=<file>` (key
// `content-levels-real`).

import { readFileSync } from 'node:fs'
import { createElement as h, type ReactNode } from 'react'

import { ContentPage } from '../../components/pages/v2/content'
import { ContentIdeaPage } from '../../components/pages/v2/content/idea-page'
import { ContentPostsPage } from '../../components/pages/v2/content/posts-page'
import { ContentRepliesPage } from '../../components/pages/v2/content/replies-page'
import { contentFixture, contentThinFixture } from '../../lib/pages/v2/content-fixture'
import type { ContentIdeaData } from '../../lib/pages/v2/content-idea'
import { contentIdeaFixture, contentPostsFixture, contentRepliesFixture } from '../../lib/pages/v2/content-levels-fixture'
import type { PostsPageData } from '../../lib/pages/v2/content-posts'
import type { RepliesPageData } from '../../lib/pages/v2/content-replies'

interface ShotPage { key: string; path: string; artboard: string; page: () => ReactNode }

const IDEA = '/dashboard/content/ideas/i0000001-0000-4000-8000-000000000000'
const REPLIES = '/dashboard/content/replies'
const POSTS = '/dashboard/content/posts'

/** A level page's loader dump, drawn by its own page (`view` names it). */
function dumpPage(file: string): ShotPage {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { view: 'idea' | 'replies' | 'posts' | 'root'; data: unknown }
  if (raw.view === 'idea') return { key: 'content-levels-real', path: IDEA, artboard: 'G5-Content-Idea.dc.html', page: () => h(ContentIdeaPage, { data: raw.data as ContentIdeaData }) }
  if (raw.view === 'replies') return { key: 'content-levels-real', path: REPLIES, artboard: 'G5-Content-Replies.dc.html', page: () => h(ContentRepliesPage, { data: raw.data as RepliesPageData }) }
  if (raw.view === 'posts') return { key: 'content-levels-real', path: POSTS, artboard: 'G5-Content-Posts.dc.html', page: () => h(ContentPostsPage, { data: raw.data as PostsPageData }) }
  return { key: 'content-levels-real', path: '/dashboard/content', artboard: 'G5-Content.dc.html', page: () => h(ContentPage, { data: raw.data as never }) }
}

export function contentLevelPages(): ShotPage[] {
  return [
    // The root: its cards open pages (G5-Content), with fewer ideas (a
    // question card holds the third place), and the thin real state.
    { key: 'content-levels-root', path: '/dashboard/content', artboard: 'G5-Content.dc.html', page: () => h(ContentPage, { data: contentFixture({ ideas: 'two' }) }) },
    { key: 'content-levels-root-full', path: '/dashboard/content', artboard: 'G5-Content.dc.html', page: () => h(ContentPage, { data: contentFixture() }) },
    { key: 'content-levels-root-thin', path: '/dashboard/content', artboard: 'G5-Content.dc.html', page: () => h(ContentPage, { data: contentThinFixture() }) },
    // A post idea: the hub, its switcher open, the thin idea, a sub-question
    // opened, an older idea, the comments unread, and the three calm lines.
    { key: 'content-levels-idea', path: IDEA, artboard: 'G5-Content-Idea.dc.html', page: () => h(ContentIdeaPage, { data: contentIdeaFixture() }) },
    { key: 'content-levels-idea-switcher', path: IDEA, artboard: 'G5-Content-Idea-Switcher.dc.html', page: () => h(ContentIdeaPage, { data: contentIdeaFixture(), switcherOpen: true }) },
    { key: 'content-levels-idea-thin', path: IDEA, artboard: 'G5-Content-Idea-Thin.dc.html', page: () => h(ContentIdeaPage, { data: contentIdeaFixture({ thin: true }) }) },
    { key: 'content-levels-idea-flagged', path: IDEA, artboard: 'G5-Content-Idea.dc.html', page: () => h(ContentIdeaPage, { data: contentIdeaFixture({ rank: 2 }) }) },
    { key: 'content-levels-idea-open', path: IDEA, artboard: 'G5-Content-Idea.dc.html', page: () => h(ContentIdeaPage, { data: contentIdeaFixture({ sub: 1 }) }) },
    { key: 'content-levels-idea-older', path: IDEA, artboard: 'G5-Content-Idea.dc.html', page: () => h(ContentIdeaPage, { data: contentIdeaFixture({ older: true }) }) },
    { key: 'content-levels-idea-unread', path: IDEA, artboard: 'G5-Content-Idea.dc.html', page: () => h(ContentIdeaPage, { data: contentIdeaFixture({ commentsUnread: true }) }) },
    { key: 'content-levels-idea-missing', path: IDEA, artboard: 'G5-Content-Idea.dc.html', page: () => h(ContentIdeaPage, { data: contentIdeaFixture({ state: 'missing' }) }) },
    // Worth a reply: the week, the month, a kind listed in full on a phone,
    // empty, unread, and before any update covered a week.
    { key: 'content-levels-replies', path: REPLIES, artboard: 'G5-Content-Replies.dc.html', page: () => h(ContentRepliesPage, { data: contentRepliesFixture() }) },
    { key: 'content-levels-replies-month', path: REPLIES, artboard: 'G5-Content-Replies.dc.html', page: () => h(ContentRepliesPage, { data: contentRepliesFixture({ period: 'month' }) }) },
    { key: 'content-levels-replies-kind', path: REPLIES, artboard: 'G5-Content-Replies.dc.html', page: () => h(ContentRepliesPage, { data: contentRepliesFixture({ kind: 'buy' }) }) },
    { key: 'content-levels-replies-empty', path: REPLIES, artboard: 'G5-Content-Replies.dc.html', page: () => h(ContentRepliesPage, { data: contentRepliesFixture({ state: 'empty', noIdeas: true }) }) },
    { key: 'content-levels-replies-unread', path: REPLIES, artboard: 'G5-Content-Replies.dc.html', page: () => h(ContentRepliesPage, { data: contentRepliesFixture({ state: 'unread' }) }) },
    { key: 'content-levels-replies-no-week', path: REPLIES, artboard: 'G5-Content-Replies.dc.html', page: () => h(ContentRepliesPage, { data: contentRepliesFixture({ state: 'no_week' }) }) },
    // Your posts: the month, every post listed, one post's comments open,
    // none published, unread, and their comments unread.
    { key: 'content-levels-posts', path: POSTS, artboard: 'G5-Content-Posts.dc.html', page: () => h(ContentPostsPage, { data: contentPostsFixture() }) },
    { key: 'content-levels-posts-all', path: POSTS, artboard: 'G5-Content-Posts.dc.html', page: () => h(ContentPostsPage, { data: contentPostsFixture({ all: true }) }) },
    { key: 'content-levels-posts-open', path: POSTS, artboard: 'G5-Content-Posts.dc.html', page: () => h(ContentPostsPage, { data: contentPostsFixture({ post: 'p0000001-0000-4000-8000-000000000000' }) }) },
    { key: 'content-levels-posts-none', path: POSTS, artboard: 'G5-Content-Posts.dc.html', page: () => h(ContentPostsPage, { data: contentPostsFixture({ state: 'none' }) }) },
    { key: 'content-levels-posts-unread', path: POSTS, artboard: 'G5-Content-Posts.dc.html', page: () => h(ContentPostsPage, { data: contentPostsFixture({ state: 'unread' }) }) },
    { key: 'content-levels-posts-comments-unread', path: POSTS, artboard: 'G5-Content-Posts.dc.html', page: () => h(ContentPostsPage, { data: contentPostsFixture({ state: 'comments_unread' }) }) },
    ...(process.env.CONTENT_LEVEL_JSON ? [dumpPage(process.env.CONTENT_LEVEL_JSON)] : []),
  ]
}
