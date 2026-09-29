import { permanentRedirect, notFound } from 'next/navigation'
import { getAllPosts, getPostBySlug } from '@/lib/posts'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export default async function LegacySlugRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  if (!post) notFound()

  permanentRedirect(`/writing/${slug}`)
}
