import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { likes } from '@/lib/db/schema'
import { site, absoluteUrl } from '@/lib/site-config'

// Every like can email the site owner (site.identity.email; no address = no email),
// throttled to at most ONE email per slug per hour so an
// enthusiastic clicker (the button is a repeatable +1) can't flood the inbox: the first
// like in a window sends immediately; likes landing inside the window ride along as a
// "+N" delta in the NEXT window's email. Fire-and-forget via after() — the button's
// response never waits on Resend. Production only (plus LIKE_NOTIFY_DEV=1 for testing);
// silently off until RESEND_API_KEY exists.
async function notifyLike(slug: string, count: number, prevNotified: number) {
  const key = process.env.RESEND_API_KEY
  const to = site.identity.email
  if (!key || !to) return
  if (process.env.VERCEL_ENV !== 'production' && process.env.LIKE_NOTIFY_DEV !== '1') return
  try {
    // Atomic claim: exactly one request can move notified_at inside any hour. Concurrent
    // likes lose the WHERE and send nothing; their increments show up in the next delta.
    const claimed = await getDb()
      .update(likes)
      .set({ notifiedAt: sql`now()`, notifiedCount: count })
      .where(and(eq(likes.slug, slug), sql`(notified_at IS NULL OR notified_at < now() - interval '1 hour')`))
      .returning({ slug: likes.slug })
    if (claimed.length === 0) return

    const delta = count - prevNotified
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? 'Platinum <onboarding@resend.dev>',
        to: [to],
        subject: `Liked: ${slug} is at ${count}`,
        text: `${slug} now has ${count} like${count === 1 ? '' : 's'} (+${delta} since the last email).\n\n${absoluteUrl(slug)}`,
      }),
    })
    // Surface rejections in the function logs (a bad sender/recipient pairing fails HERE,
    // invisibly to the liker) — the response body is Resend's diagnosis, no secrets in it.
    if (!res.ok) console.error(`like-notify: resend ${res.status} for ${slug}: ${await res.text()}`)
  } catch (err) {
    // Notification failures must never surface to the liker.
    console.error(`like-notify: ${err instanceof Error ? err.message : err}`)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/likes?slug=... → the page's current count (0 if it has never been liked, or if the
// datastore isn't reachable yet — the button degrades gracefully rather than erroring).
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
  try {
    const [row] = await getDb().select({ count: likes.count }).from(likes).where(eq(likes.slug, slug))
    return NextResponse.json({ count: row?.count ?? 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}

// POST /api/likes { slug } → increment by one and return the new count. Upsert so the first like
// creates the row; the increment runs in the DB (count = count + 1), so concurrent likes from
// different visitors never clobber each other.
export async function POST(req: NextRequest) {
  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string }
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
  try {
    const [row] = await getDb()
      .insert(likes)
      .values({ slug, count: 1 })
      .onConflictDoUpdate({ target: likes.slug, set: { count: sql`${likes.count} + 1` } })
      .returning({ count: likes.count, notifiedCount: likes.notifiedCount })
    after(() => notifyLike(slug, row.count, row.notifiedCount))
    return NextResponse.json({ count: row.count })
  } catch {
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 })
  }
}
