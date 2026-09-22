import type { PhotoSource } from './site-config-schema'

/**
 * The remote hostnames the site must trust to display synced photos: next/image's
 * `remotePatterns` and the CSP `img-src` in next.config.mjs both read this, so a new photo
 * source is one config entry away from rendering, with nothing hardcoded per service.
 *
 * Two inputs, because the services split the API host from the media host in ways the config
 * alone cannot know: a Pixelfed instance usually serves media from a CDN (pxscdn.com behind
 * pixelfed.social), PhotoPrism can hand thumbnails to a `contentUri` on another host, Glass
 * feeds embed cdn.glass.photo. The config gives the hosts that are knowable up front; the
 * synced records give the ones the services chose. `images.unsplash.com` is always trusted
 * (the template's first-class source, and hand-written manual entries use it too).
 */
export function photoRemoteHosts(
  sources: readonly PhotoSource[],
  synced: ReadonlyArray<{ urls: { regular: string; small?: string } }>,
): string[] {
  const hosts = new Set<string>(['images.unsplash.com'])
  const add = (value: string | undefined) => {
    if (!value) return
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
      if (url.protocol === 'https:' && url.hostname) hosts.add(url.hostname)
    } catch {
      // not a URL (a local /images path, or a typo the sync will report)
    }
  }
  for (const source of sources) {
    if (source.kind === 'glass') add('cdn.glass.photo')
    else if (source.kind === 'pixelfed') add(source.instance)
    else if (source.kind === 'immich' || source.kind === 'photoprism') add(source.url)
  }
  for (const photo of synced) {
    add(photo.urls.regular)
    add(photo.urls.small)
  }
  return [...hosts].sort()
}
