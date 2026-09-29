'use server'

import { cookies } from 'next/headers'
import { safeEqual, designUnlockToken, DESIGN_UNLOCK_COOKIE } from '@/lib/auth'

// Single password for all NDA-gated portfolio pieces.
// Set DESIGN_PASSWORD in Vercel environment variables.
//
// On success this sets an httpOnly cookie so the SERVER can decide whether to
// render protected content. The gate is enforced server-side (see the design
// [slug] page) — protected MDX is never sent to a client that has not unlocked.
export async function unlockDesign(input: string): Promise<boolean> {
  const expected = process.env.DESIGN_PASSWORD
  if (!expected) return false
  if (!safeEqual(input, expected)) return false

  const store = await cookies()
  store.set(DESIGN_UNLOCK_COOKIE, designUnlockToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return true
}
