import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import type { Post } from '@/lib/posts'
import { site, moduleEnabled, socialLinks, type SocialNetwork } from '@/lib/site-config'
import { CURRENTLY_READING } from '@/lib/books'
import { getNowData } from '@/lib/now'
import { getGitHubContributions } from '@/lib/github'
import { manualPhotos } from '@/lib/manual-photos'
import photosJson from '@/lib/synced-photos.json'
import type { UnsplashPhoto } from '@/lib/unsplash-photos'
import { ContribGrid } from '@/components/about/contrib-grid'
import { NowColumn } from './now-column'

/* The home grid's cells, one function per `site.home.grid` name. Every cell self-disables
 * (returns null) when its module is off or its data is absent, so the config can list a cell
 * the site cannot fill yet and nothing renders a blank seat. All server-side: the data is
 * repo files at build time, plus one optional GitHub fetch for the calendar. */

const HEADING = 'section-label'
const ITEM = 'font-sans text-prose text-foreground link-accent-hover'

function Cell({ title, children, full = false }: { title: string; children: ReactNode; full?: boolean }) {
  // Cells sit in a 4-column inner grid and use 3 of the 4 by default; `full` spans all four
  // for side-by-side layouts (the reading cell's cover + text).
  return (
    <div className={`${full ? 'col-span-4' : 'col-span-3'} flex flex-col gap-4`}>
      <h2 className={HEADING}>{title}</h2>
      {children}
    </div>
  )
}

function latestPost(posts: Post[]): ReactNode {
  if (posts.length === 0) return null
  return (
    <Cell title={posts.length === 1 ? 'Latest post' : 'Latest posts'}>
      <ul className="flex flex-col gap-3">
        {posts.map((post) => (
          <li key={post.slug}>
            {/* prefetch={false}: Next 16 fires several segment prefetches per viewport link,
                and the swarm crowded the throttled-mobile LCP window. Hover still prefetches. */}
            <Link prefetch={false} href={`/writing/${post.slug}`} className={ITEM}>
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
    </Cell>
  )
}

function reading(): ReactNode {
  if (!moduleEnabled('books') || !CURRENTLY_READING) return null
  const book = CURRENTLY_READING
  return (
    <Cell title="Currently reading" full>
      <div className="grid grid-cols-3 gap-x-6">
        <div className="self-start">
          <Image
            src={book.image}
            alt={book.title}
            width={324}
            height={500}
            sizes="(max-width: 899px) 30vw, (max-width: 1535px) 13vw, 9vw"
            className="w-full h-auto"
          />
        </div>
        <div className="col-span-2 min-w-0">
          <p className="font-sans text-prose leading-snug text-foreground">{book.title}</p>
          <p className="mt-4 font-sans text-label text-[var(--color-muted)]">{book.author}</p>
          <p className="mt-4">
            <a
              href={book.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-prose text-primary underline underline-offset-[3px] decoration-primary hover:opacity-70 active:opacity-70 transition-opacity"
            >
              View book<span className="sr-only"> (opens in new tab)</span>
            </a>
          </p>
        </div>
      </div>
    </Cell>
  )
}

function now(): ReactNode {
  const data = getNowData()
  if (!data.reading && !data.post) return null
  return (
    <div className="col-span-3">
      <NowColumn data={data} />
    </div>
  )
}

function photos(): ReactNode {
  if (!moduleEnabled('photos')) return null
  const latest = [...manualPhotos, ...(photosJson as UnsplashPhoto[])]
    .filter((p) => p.created_at)
    .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
    .slice(0, 6)
  if (latest.length === 0) return null
  return (
    <Cell title="Recent photos">
      <div className="grid grid-cols-3 gap-0.5 overflow-hidden">
        {latest.map((photo) => (
          <Link key={photo.id} href={`/photos/${photo.id}`} className="relative aspect-square" style={{ backgroundColor: photo.color }}>
            <Image
              src={photo.urls.small ?? photo.urls.regular}
              alt={photo.alt_description ?? photo.description ?? ''}
              fill
              sizes="(max-width: 767px) 33vw, 120px"
              className="object-cover"
            />
          </Link>
        ))}
      </div>
    </Cell>
  )
}

const NETWORK_LABEL: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  bluesky: 'Bluesky',
  x: 'X',
  mastodon: 'Mastodon',
  buttondown: 'Newsletter',
  unsplash: 'Unsplash',
  youtube: 'YouTube',
  github: 'GitHub',
}

function social(): ReactNode {
  const links = socialLinks()
  if (links.length === 0) return null
  return (
    <Cell title="Elsewhere">
      <ul className="flex flex-col gap-3">
        {links.map(({ network, href }) => (
          <li key={network}>
            <a href={href} target="_blank" rel="noopener noreferrer" className={ITEM}>
              {NETWORK_LABEL[network]}<span className="sr-only"> (opens in new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </Cell>
  )
}

async function calendar(): Promise<ReactNode> {
  // Needs GITHUB_TOKEN in the build environment; without it the fetch returns null and the
  // cell disappears (the same contract as the About page's calendar card).
  const cal = await getGitHubContributions()
  if (!cal) return null
  return (
    <Cell title={`${cal.totalContributions.toLocaleString('en-US')} contributions this year`} full>
      <ContribGrid weeks={cal.weeks} total={cal.totalContributions} />
    </Cell>
  )
}

/** The cells to render, in `site.home.grid` order, with every empty one already dropped. */
export async function homeCells(posts: Post[]): Promise<ReactNode[]> {
  const out: ReactNode[] = []
  for (const name of site.home.grid) {
    let cell: ReactNode = null
    switch (name) {
      case 'latestPost': cell = latestPost(posts); break
      case 'reading': cell = reading(); break
      case 'now': cell = now(); break
      case 'photos': cell = photos(); break
      case 'social': cell = social(); break
      case 'calendar': cell = await calendar(); break
    }
    if (cell) out.push(cell)
  }
  return out
}
