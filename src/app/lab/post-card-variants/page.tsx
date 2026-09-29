import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/page-shell'
import { WritingSearchClient, type PostForList } from '@/components/writing/writing-search-client'

export const metadata: Metadata = {
  title: 'Lab · Post card variants',
  robots: { index: false, follow: false },
}

// A "break it" sketch: the real /writing list item, fed the content a real archive will
// eventually contain. Every row is a fixture (the slugs go nowhere); what matters is the
// shape of the content, not the words. Add a case whenever a real post breaks the list.
const MANY_TAGS = ['design', 'typography', 'color', 'motion', 'layout', 'process', 'tooling', 'writing', 'photography', 'nextjs', 'tailwind', 'accessibility']

const POSTS: PostForList[] = [
  {
    slug: 'fixture-long-title',
    title: 'A title long enough to wrap onto three lines at the reading column width, which is exactly the kind of headline an enthusiastic first draft produces before the edit',
    date: '2026-09-01',
    type: 'article',
    tags: MANY_TAGS,
  },
  {
    slug: 'fixture-unbroken-word',
    title: 'AVeryLongUnbrokenWordThatNoBrowserWillWrapWithoutHelpFromOverflowWrapOrHyphensAnywhereInTheColumn',
    date: '2026-08-30',
    type: 'article',
    excerpt: 'A single token wider than the column. If the list has no overflow handling, this row pushes the page sideways.',
    tags: ['edge-cases'],
  },
  {
    slug: 'fixture-note',
    date: '2026-08-28',
    type: 'note',
    body: 'A note has no title and no excerpt, only a body, so the date has to carry the whole entry.\n\nThis one has two paragraphs, which is one more than most notes, to see how the rhythm holds when the body keeps going past the first thought.',
  },
  {
    slug: 'fixture-long-excerpt',
    title: 'Short title',
    date: '2026-08-25',
    type: 'article',
    excerpt:
      'An excerpt that keeps going well past the three lines the list allows, so the clamp has to do its job and cut it cleanly. It mentions nothing in particular, it just continues, sentence after sentence, in order to be long enough that the third line ends mid-thought and the ellipsis has to land somewhere inside a word rather than at a tidy period. If the clamp is missing, this paragraph is the row that gives it away.',
    tags: ['edge-cases', 'excerpts'],
  },
  {
    slug: 'fixture-quote-first',
    title: '“Quoted” titles hang their first glyph into the margin',
    date: '2026-08-20',
    type: 'link',
    excerpt: '“So do excerpts.” The site uses hanging punctuation, so the opening quote should sit outside the text edge in Safari and be pulled by a measured indent elsewhere.',
    tags: ['typography'],
  },
  {
    slug: 'fixture-empty',
    date: '2026-08-15',
    type: 'article',
  },
]

export default function PostCardVariantsPage() {
  const hashtagCounts = Object.fromEntries(MANY_TAGS.concat('edge-cases', 'excerpts', 'typography').map((t) => [t, 1]))

  return (
    <PageShell
      title="Post card variants"
      subtitle="The /writing list item, rendered by the real component with the content that breaks lists"
      headerClassName="col-prose mb-4"
    >
      <div className="col-prose">
        <p className="mb-16 max-w-prose font-sans text-prose leading-prose text-foreground">
          Below is <code className="font-mono">WritingSearchClient</code>, the component behind /writing, given six
          fixture posts instead of the archive: a three-line title with a dozen tags, one unbroken word wider than the
          column, a note with no title, an excerpt that has to be clamped, a quote-first title, and a post with nothing
          but a date. The links go nowhere. When one of these looks wrong here, it looks wrong on the live page too, so
          fix the component, not the sketch.
        </p>
        <WritingSearchClient posts={POSTS} hashtagCounts={hashtagCounts} />
      </div>
    </PageShell>
  )
}
