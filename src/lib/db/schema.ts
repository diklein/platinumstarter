import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core'

// One row per likeable page, keyed by a stable slug (e.g. "writing/<post>").
// `count` is a running clap-style tally: every click increments it, with no per-user dedup — the
// button is a repeatable +1, not a one-like toggle.
//
// notified_at / notified_count drive the like-notification emails (see /api/likes): at most one
// email per slug per hour, carrying the likes gained since the previous email. notified_at is
// the atomic claim (a conditional UPDATE wins it for exactly one request per window);
// notified_count is the tally as of the last email, so the next one can report the delta.
export const likes = pgTable('likes', {
  slug: text('slug').primaryKey(),
  count: integer('count').notNull().default(0),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  notifiedCount: integer('notified_count').notNull().default(0),
})
