import { getAllPosts } from './posts'
import { CURRENTLY_READING } from './books'
import { moduleEnabled } from './site-config'

export interface NowData {
  reading: { title: string; author: string } | null
  post: { title: string; href: string } | null
}

/**
 * Assemble the homepage "now" signals: the hand-set book (books module) and the newest titled
 * post. Each line is null when its module is off or its data is absent. Build-time only (fs
 * reads, no external calls), so the homepage stays statically prerenderable.
 */
export function getNowData(): NowData {
  const post = getAllPosts().find((p) => p.title)
  const reading = moduleEnabled('books') && CURRENTLY_READING ? CURRENTLY_READING : null

  return {
    reading: reading ? { title: reading.title, author: reading.author } : null,
    post: post?.title ? { title: post.title, href: `/writing/${post.slug}` } : null,
  }
}
