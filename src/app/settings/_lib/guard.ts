/**
 * The one gate every settings surface shares. /settings and /api/settings exist ONLY under
 * `next dev`: the proxy rewrites them to a 404 elsewhere (src/proxy.ts), the page throws
 * notFound(), and the route handlers answer 404. Belt and braces: none of the three trusts
 * the others.
 */
export const isDev = process.env.NODE_ENV === 'development'

export function notAvailable(): Response {
  return new Response(null, { status: 404 })
}
