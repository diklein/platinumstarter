import { getSearchIndex } from '@/lib/search-index'

// The ⌘K palette's search index as a static JSON asset, emitted at build time and fetched
// by the palette on first open intent — instead of riding in every page's flight payload
// (it was ~45KB, over half the homepage's HTML).
export const dynamic = 'force-static'

export function GET() {
  return Response.json(getSearchIndex())
}
