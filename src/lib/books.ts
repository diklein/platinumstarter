/**
 * The one hand-maintained reading signal: the book being read right now. It feeds the home
 * grid's `reading` cell and the Reading line of the `now` cell (both also need the `books`
 * module on). Set it to null to hide both. Swap the fields (and drop a cover into
 * public/images/books/) when a new book starts; the /books shelf itself lives on its page.
 */
export interface CurrentBook {
  title: string
  author: string
  /** Cover path under /public. */
  image: string
  /** Where the title links (a store or publisher page). */
  href: string
}

// Example data: a public-domain title with a generated placeholder cover
// (scripts/generate-example-covers.mjs). Replace it with the book on your nightstand.
export const CURRENTLY_READING: CurrentBook | null = {
  title: 'The Time Machine',
  author: 'H. G. Wells',
  image: '/images/books/example-time-machine.png',
  href: 'https://www.gutenberg.org/ebooks/35',
}
