// One fetch of /api/search-index (~the full post-body corpus, 10x the size of the
// nav index) shared by every consumer: the ⌘K palette's snippet bodies, /writing
// search, and /archive search. Before this each kept its own ref-guarded fetch, so
// typing in a page search and then opening the palette downloaded and parsed the
// whole corpus twice. Module-level promise = one request per page load, resolved
// instantly for every consumer after the first. A failed fetch clears the slot so
// the next caller retries.
//
// `contentLower` is computed once here: matching lowercases the corpus, and doing
// it per keystroke over every body was the archive/writing search's hottest line.

export interface SearchIndexItem {
  slug: string
  content: string
  contentLower: string
  href?: string
  /** H2/H3 anchors (text + rehype-slug id) powering the palette's heading deep links. */
  headings?: { text: string; slug: string }[]
}

let indexPromise: Promise<SearchIndexItem[]> | null = null

export function loadSearchIndex(): Promise<SearchIndexItem[]> {
  return (indexPromise ??= fetch('/api/search-index')
    .then((r) => {
      if (!r.ok) throw new Error(`search-index: ${r.status}`)
      return r.json()
    })
    .then((items: { slug: string; content: string; href?: string; headings?: { text: string; slug: string }[] }[]) =>
      items.map((i) => ({ ...i, contentLower: i.content.toLowerCase() })),
    )
    .catch((err) => {
      indexPromise = null
      throw err
    }))
}
