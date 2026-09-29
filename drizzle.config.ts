// `npm run db:push` applies src/lib/db/schema.ts to the Neon database named by DATABASE_URL.
// Only the optional likes feature needs a database, so drizzle-kit is not a dependency: the
// script fetches it with npx on the one run that needs it. The shape below is drizzle-kit's
// own config object, typed here rather than imported from it.
const config = {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql' as const,
  dbCredentials: { url: process.env.DATABASE_URL! },
}

export default config
