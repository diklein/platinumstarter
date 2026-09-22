import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

// Neon's HTTP driver — serverless-friendly (a stateless fetch per query, no pooled connection to
// hold open across function invocations), the documented Vercel + Drizzle path. DATABASE_URL is
// wired by the Neon Vercel Marketplace integration (and mirrored into .env.local for dev).
//
// Constructed lazily: neon() throws on an undefined URL, so building the client at import time
// would fail the whole build before the database is provisioned. getDb() defers that to the first
// query, where the route's try/catch turns "not provisioned yet" into a graceful fallback.
function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(neon(url), { schema })
}

let _db: ReturnType<typeof createDb> | null = null

export function getDb() {
  return (_db ??= createDb())
}
