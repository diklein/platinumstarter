import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAllPostsIncludingScheduled, todayUtc } from '@/lib/posts'

/**
 * Scheduled posts go live without a push. A post dated after the build day is left out of
 * the build (see hideScheduled in src/lib/posts.ts). This route runs once a day from the
 * `crons` entry in vercel.json, just after midnight UTC, and when a post has come due since
 * the build it revalidates every cached page, so the next visitor gets the site with the
 * post in it: list, home, feed, sitemap, search index, and the post's own URL. Nothing is
 * rebuilt and no deploy hook is involved; the content is in the repo the function runs from.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that variable is set on the project
 * (`npx vercel env add CRON_SECRET production`); with it set, nothing else can trigger the
 * revalidation. Without it the route is open, and the worst a stranger can do is empty a
 * cache the next visitors refill.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = todayUtc()
  const buildDate = process.env.PLATINUM_BUILD_DATE ?? today
  // Hidden by the build (dated after it), no longer in the future.
  const due = getAllPostsIncludingScheduled().filter((p) => p.date > buildDate && p.date <= today)

  if (due.length === 0) {
    return NextResponse.json({ today, buildDate, due: [], revalidated: false })
  }

  revalidatePath('/', 'layout')
  for (const p of ['/feed.xml', '/sitemap.xml', '/llms.txt', '/api/search-index']) revalidatePath(p)
  revalidatePath('/writing/[slug]', 'page')
  revalidatePath('/[slug]', 'page')

  return NextResponse.json({ today, buildDate, due: due.map((p) => p.slug), revalidated: true })
}
