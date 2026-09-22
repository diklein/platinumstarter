import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison. Guards password/secret checks against
 * timing side-channels. Returns false immediately on length mismatch (the
 * length itself is not sensitive here).
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Cookie name that marks a visitor as having entered the design password. */
export const DESIGN_UNLOCK_COOKIE = 'design_unlock'

/**
 * Deterministic unlock token derived from the shared design password via HMAC.
 * The token is one-way (does not expose the password) and rotates automatically
 * when DESIGN_PASSWORD changes — invalidating previously issued cookies.
 */
export function designUnlockToken(secret: string): string {
  return createHmac('sha256', secret).update('design-unlock-v1').digest('hex')
}
