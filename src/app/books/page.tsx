import { pageMetadata } from '@/lib/seo'
import { PageShell } from '@/components/layout/page-shell'
import Image from 'next/image'
import Link from 'next/link'

export const metadata = pageMetadata({
  title: 'Books',
  description: 'A shelf of books worth reading, with a line on why.',
  path: '/books',
})

const A = 'text-foreground link-accent-hover underline underline-offset-[3px]'

type Book = {
  /** The template's own entries; clear them when the shelf is yours. */
  example?: true
  name: string
  /** File under public/images/books/. */
  image: string
  /** Rendered size; the default is the 120x180 (2:3) slot. Set both for odd formats. */
  imgWidth?: number
  imgHeight?: number
  /** Takes *italics*, **bold**, and [links](url). */
  description: string
  link: { label: string; href: string }
}

// Example data: three public-domain titles with generated placeholder covers
// (scripts/generate-example-covers.mjs), each linking to its Project Gutenberg page. Replace
// the entries with your own shelf.
const books: Book[] = [
  {
    example: true,
    name: 'The Time Machine',
    image: 'example-time-machine.png',
    description: 'H. G. Wells sends an unnamed inventor eight hundred thousand years forward and brings him back with a story nobody at the dinner table believes. *The Time Machine* is short, strange, and still the template for the genre.',
    link: { label: 'Project Gutenberg', href: 'https://www.gutenberg.org/ebooks/35' },
  },
  {
    example: true,
    name: 'Pride and Prejudice',
    image: 'example-pride-and-prejudice.png',
    description: 'Jane Austen on money, manners, and the two people in the room who are wrong about each other. The dialogue is the reason it gets reread.',
    link: { label: 'Project Gutenberg', href: 'https://www.gutenberg.org/ebooks/1342' },
  },
  {
    example: true,
    name: 'Moby-Dick',
    image: 'example-moby-dick.png',
    description: 'Herman Melville puts a whole world on one ship. *Moby-Dick* is a novel, a manual on whaling, and a sermon, and it earns every chapter about rope.',
    link: { label: 'Project Gutenberg', href: 'https://www.gutenberg.org/ebooks/2701' },
  },
]

function renderDescription(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return <Link key={i} href={linkMatch[2]} className={A} target="_blank" rel="noopener noreferrer">{linkMatch[1]}<span className="sr-only"> (opens in new tab)</span></Link>
    }
    return part
  })
}

export default function BooksPage() {
  return (
    <PageShell title="Books" headerClassName="col-span-12" subtitle="What is worth reading, and why">

      {/* Full-width nested grid mirroring the page grid (grid-cols-12 gap-x-6) so the
          .col-gallery-item nth-child placements count only items, never the header. */}
      <div className="col-span-12 grid grid-cols-12 gap-x-6 gap-y-20">
        {books.map((book, index) => (
          <div key={book.name} className="col-gallery-item">
            {/* Fixed-height slot with covers sitting on its bottom edge — a shelf: the
                ragged edge is the varying cover tops, and every title row aligns. */}
            <div className="flex items-end h-44 mb-6">
              <Image
                src={`/images/books/${book.image}`}
                alt={book.name}
                width={book.imgWidth ?? 120}
                height={book.imgHeight ?? 180}
                sizes="160px"
                className="w-auto h-full"
                loading={index < 6 ? 'eager' : 'lazy'}
              />
            </div>
            <h2 className="font-sans font-semibold text-prose leading-prose tracking-[-0.01em] text-foreground mb-2">
              {book.name}
            </h2>
            <p className="font-sans text-[1.125rem] leading-normal text-foreground mb-4">
              {renderDescription(book.description)}
            </p>
            <Link
              href={book.link.href}
              className="font-sans text-[1.125rem] text-primary underline underline-offset-[3px] decoration-primary hover:opacity-70 active:opacity-70 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              {book.link.label}<span className="sr-only"> (opens in new tab)</span>
            </Link>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
