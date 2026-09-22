# Photo sources

The photos page shows two sets merged and sorted newest first: the local photos folder
(`site.sources.photos`, hand-listed in `src/lib/manual-photos.ts`) and everything
`scripts/fetch-photos.mjs` synced from the services in `photos.sources` of `site.config.ts` into
`src/lib/synced-photos.json`. The local set always renders; the sync is optional and additive.
The build never calls a photo API (the build-from-repo rule): you run the sync, or the
`Sync photos` GitHub workflow runs it daily, and the JSON is committed like any other content.

```ts
photos: {
  sources: [
    { kind: 'unsplash' },                                       // the account in social.unsplash
    { kind: 'glass', profile: 'you' },                          // glass.photo/you
    { kind: 'pixelfed', instance: 'pixelfed.social', user: 'you' },
    { kind: 'immich', url: 'https://photos.example.com', album: 'Portfolio' },
    { kind: 'photoprism', url: 'https://prism.example.com', album: 'Portfolio' },
  ],
},
```

Keys never go in the config. They live in `.env.local` (and in the repository's Actions secrets
for the workflow): `UNSPLASH_ACCESS_KEY`, `PIXELFED_TOKEN` (optional), `IMMICH_API_KEY`,
`PHOTOPRISM_TOKEN`. `photos.source: 'unsplash' | 'both'` from earlier configs still works for
one release and means `sources: [{ kind: 'unsplash' }]`.

```
node scripts/fetch-photos.mjs              # every configured source
node scripts/fetch-photos.mjs --dry-run    # fetch and report, write nothing
node scripts/fetch-photos.mjs --only glass # a subset; the rest of the JSON is kept as is
node qa/run.mjs --only glass,pixelfed,immich,photoprism   # prove the adapters against public feeds
```

## What every source becomes

Each adapter (`scripts/photo-sources/<kind>.mjs`) returns the record the site already renders,
the `UnsplashPhoto` shape in `src/lib/unsplash-photos.ts`: `id` (prefixed with the kind, except
Unsplash whose bare ids are existing permalinks), `created_at`, `description` (the caption),
`alt_description`, `color` (the blur placeholder), `width`, `height`, `urls.regular` (the grid
AND the lightbox hi-res layer; one string everywhere it appears), `urls.small` (the home and
About collages), `exif`, plus `source` and `link` (the photo's page on the service). The
lightbox caption and the permalink page keep "Download on Unsplash" for Unsplash photos and show
"View on Glass" / "View on Pixelfed" / "View on Immich" / "View on PhotoPrism" for the rest.

The sync applies the same rules to every source: ids never land twice (within a source or
across sources); a committed photo that vanishes from a listing is kept while it is under 60
days old (APIs answer from caches that disagree about recent uploads); a source that fails keeps
every photo it committed before; a run that would halve the committed set aborts unless
`--force`; committed EXIF and alt text survive a re-sync that comes back without them.

Remote hosts are derived, not hardcoded: `next.config.mjs` builds `images.remotePatterns` and the
CSP `img-src` from `photos.sources` plus the hosts the synced records actually use
(`src/lib/photo-hosts.ts`), because Pixelfed instances and PhotoPrism can serve media from a CDN
host the config cannot know. After the first sync of a new source, rebuild: the hosts come from
the JSON.

## Unsplash

What it is: the photo community with the permissive licence; the template's first-class source.

Signup and key (two minutes): create an account at https://unsplash.com/join, then at
https://unsplash.com/oauth/applications choose New Application, accept the API terms, name it,
and copy the **Access Key** (not the Secret key) from the app's Keys section into
`UNSPLASH_ACCESS_KEY`. Set `social.unsplash` to your username (or `user` on the source).

```ts
{ kind: 'unsplash' }                      // or { kind: 'unsplash', user: 'name' }
```

Lossy: nothing the site shows. EXIF comes from a per-photo call, so a 200-photo profile is
about 200 requests; demo apps get 50 requests/hour (the sync retries with backoff and keeps
previously committed EXIF), production apps 5,000/hour. Apply for production before the first
full sync. Cost: free.

## Glass

What it is: a paid, ad-free photography community (glass.photo). Posting needs a membership
(US$39.99/year at the time of writing); reading a public profile does not, and there is no API.

Signup and key (two minutes): join at https://glass.photo, then in the app turn on **Public
Profile** (Settings → Public Profile; https://glass.photo/faq/using-public-profiles). Your
profile is `glass.photo/<you>` and the feed the sync reads is `glass.photo/<you>/rss`
(https://glass.photo/highlights/profile-rss-feeds). No key.

```ts
{ kind: 'glass', profile: 'you' }
```

Lossy: the feed is the newest 100 posts only (no pagination), carries no EXIF and no
dominant color (a neutral placeholder is used), and offers one rendition (3072px on the long
edge, on cdn.glass.photo), so grid thumbnails and the lightbox load the same file. The caption is
both title and description; alt text is empty until `scripts/generate-unsplash-alt-text.mjs`
fills it. Cost: free to read; posting is the membership.

## Pixelfed

What it is: the federated (ActivityPub) photo network; pixelfed.social is the flagship instance,
any instance works.

Signup and key (two minutes): create an account on an instance (https://pixelfed.social/register
or https://pixelfed.org/servers to pick one). Public accounts need no token: the sync reads the
instance's public JSON route. If your instance refuses that route, or the account is private,
create a token under **Settings → Applications** (`https://<instance>/settings/applications`,
Personal Access Tokens) and set `PIXELFED_TOKEN`; the sync then uses the Mastodon-compatible
`/api/v1/accounts/:id/statuses` route with it.

```ts
{ kind: 'pixelfed', instance: 'pixelfed.social', user: 'you' }
```

Lossy: Pixelfed strips EXIF on upload, so no camera data; captions keep their hashtags; a
multi-photo post becomes one record per image (`pixelfed-<post>-2`, `-3`); the "original"
upload is served as is (a PNG stays a PNG). The dominant color comes from the BlurHash. Only
public and unlisted posts sync; reblogs are skipped. Cost: free.

## Immich

What it is: self-hosted photo management (https://immich.app), the Google Photos replacement.
You run the server; the site reads it.

Signup and key (two minutes): in the Immich web app click your avatar → **Account Settings →
API Keys → New API Key**, name it, and give it `album.read`, `asset.read`, `sharedLink.read`,
and `sharedLink.create` (or All). Copy it into `IMMICH_API_KEY`. The server must be reachable
from where the sync runs AND from your visitors' browsers over https (images load straight
from it).

```ts
{ kind: 'immich', url: 'https://photos.example.com', album: 'Portfolio' }   // album name or id
{ kind: 'immich', url: 'https://photos.example.com' }                       // the whole timeline
```

How the images get out: every Immich asset route needs credentials, so the sync creates (and
re-uses) one public **shared link**, the same thing the Share button makes, and puts its key on
each image URL. For an album source that is the album's link; for a timeline source it is one
individual-assets link the sync tops up each run. The key is public by design (it is the share
URL) and lives in the committed JSON; deleting the link in Immich revokes it and the next sync
makes a new one. Downloads are off on the link; visitors get the 1440px preview rendition.

Lossy: alt text is empty (the caption is the asset description); `created_at` is the EXIF
capture date, else the file date; archived, hidden, and locked assets never sync. EXIF is
complete. Cost: free software; hosting is yours.

## PhotoPrism

What it is: self-hosted, AI-tagged photo library (https://www.photoprism.app). You run it; the
site reads its REST API.

Signup and key (two minutes): in PhotoPrism go to **Settings → Account → Apps and Devices**,
add an app password, and copy it into `PHOTOPRISM_TOKEN` (it is sent as a Bearer token;
https://docs.photoprism.app/user-guide/users/client-credentials/). Instances running in public
mode (`PHOTOPRISM_AUTH_MODE=public`, like the demo) need no token. As with Immich, the server
must be reachable over https from the sync and from visitors' browsers.

```ts
{ kind: 'photoprism', url: 'https://prism.example.com', album: 'Portfolio' }  // album name or UID
{ kind: 'photoprism', url: 'https://prism.example.com' }                      // every public photo
```

Lossy: `alt_description` is PhotoPrism's generated title ("Bridge / Berlin / 2018"),
`description` its caption; the color is the nearest of PhotoPrism's 16 named colors, not a
sampled value; thumbnails are the pre-generated `fit_1920` (grid and lightbox) and `tile_500`
(collages) sizes, served from the instance's `contentUri` (a CDN host on some setups). Private
photos never sync. EXIF is complete. Cost: free (Community Edition); app passwords have been in
the free edition since the April 2024 release, per the integrations matrix.

## Verifying without your accounts

`node qa/run.mjs --only glass,pixelfed,immich,photoprism` runs the four adapters against public
feeds and demo servers (Glass: Tom Watson's public profile, `tom`; Pixelfed: `@dansup` on
pixelfed.social; Immich: https://demo.immich.app with its documented demo login, which mints and
then deletes a throwaway API key and shared link; PhotoPrism: https://demo.photoprism.app in
public mode). Set `QA_GLASS_PROFILE`, `QA_PIXELFED_INSTANCE` + `QA_PIXELFED_USER`,
`QA_IMMICH_URL` (with `IMMICH_API_KEY`), or `QA_PHOTOPRISM_URL` (with `PHOTOPRISM_TOKEN`) to
point a test at your own account instead. The Unsplash test still needs your key.

## Not sources, and why

From `docs/starter-integrations.md` section 11 (verified 2026-08-30):

| Service | Status | Why |
|---|---|---|
| Google Photos | Import only | The Library API stopped serving reads of the user's library in March 2025; a Takeout archive is the path in |
| Apple / iCloud Photos | Recipe | No API has ever existed; export from Photos on a Mac (osxphotos, or a watched folder) into the local photos folder |
| Flickr | Recipe | API keys are only issued to Pro accounts now |
| Cloudinary | Docs mention | A CDN and transformation service, not a place photos are published |
| SmugMug | Skip | OAuth 1.0a only; not worth a signing implementation for a personal site |
| 500px | Incompatible | The public API was shut down in 2018 |
| Lightroom | Incompatible | Enterprise OAuth only, and the JWT credential flow reached end of life in 2025 |
| EyeEm | Incompatible | Shut down in January 2026 |
