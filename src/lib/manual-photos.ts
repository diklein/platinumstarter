import type { UnsplashPhoto } from './unsplash-photos'

// Photos for /photos that DON'T come from Unsplash.
//
// The Unsplash photos live in unsplash-photos.json, which the sync cron
// (scripts/fetch-unsplash-photos.mjs) overwrites wholesale every 2 hours — so a
// hand-added entry there would be wiped. These live here instead and get merged in
// (see src/app/photos/page.tsx), sorted with the rest by `created_at`.
//
// To add one:
//   1. Drop the image in public/images/photos/ (a web-sized JPG; ImageOptim on push).
//   2. Add an entry below. Use a LOCAL `urls` path (/images/photos/…) — a non-Unsplash
//      URL automatically hides the "Download on Unsplash" link in the lightbox.
//      `width`/`height` are the pixel dimensions, `color` is a dominant hex (for the
//      blur placeholder), and `created_at` controls where it sorts. `exif` is optional
//      (use null fields to omit a line).
//
// EXAMPLE CONTENT. The entries below are the template's demo photos: eight photographs by eight
// Unsplash photographers, used under the Unsplash License and downloaded at Unsplash's 1080px
// "regular" size into public/images/photos/example-<n>.jpg. The Unsplash photo id rides in each
// entry's id (`example-<n>-<unsplash id>`), the photographer is named in the caption, and `link`
// points at the photo's Unsplash page, so the lightbox credits it. Every example entry's id starts
// with `example-`; that prefix is what `npm run clear-examples` matches when it empties this list
// and deletes the files. Real entries never use it.
export const manualPhotos: UnsplashPhoto[] = [
  // {
  //   id: 'local-atrium',
  //   created_at: '2026-07-01T12:00:00Z',
  //   description: 'A short caption shown under the photo',
  //   alt_description: 'Accessible alt text describing the image',
  //   color: '#c8b9a6',
  //   width: 2000,
  //   height: 1333,
  //   urls: {
  //     regular: '/images/photos/atrium.jpg',
  //     small: '/images/photos/atrium.jpg',
  //   },
  //   exif: { make: 'Fujifilm', model: 'X-T4', exposure_time: '1/250', aperture: '2.8', focal_length: '23', iso: 160 },
  // },
  {
    id: 'example-1-023T4jyCRqA',
    created_at: '2018-01-25T17:16:56Z',
    description: 'A red tram on Queens Quay, Toronto, on a wet night. Photo by Filip Mroz on Unsplash',
    alt_description: 'A red tram pulling into a rain-soaked stop at night, its lights reflected in the tracks',
    color: '#260c26',
    width: 1080,
    height: 1350,
    urls: {
      regular: '/images/photos/example-1.jpg',
      small: '/images/photos/example-1.jpg',
    },
    exif: {
      make: 'Canon',
      model: 'Canon EOS 5D Mark III',
      exposure_time: '1/125',
      aperture: '1.4',
      focal_length: '35.0',
      iso: 500,
    },
    source: 'unsplash',
    link: 'https://unsplash.com/photos/photo-of-tram-beside-waiting-station-during-nighttime-023T4jyCRqA',
  },
  {
    id: 'example-2-4CDdd1RCt6w',
    created_at: '2018-12-05T19:50:49Z',
    description: 'A forest track in fog. Photo by Marek Szturc on Unsplash',
    alt_description: 'A dirt path winding into a dense forest filled with fog',
    color: '#262626',
    width: 1080,
    height: 720,
    urls: {
      regular: '/images/photos/example-2.jpg',
      small: '/images/photos/example-2.jpg',
    },
    exif: {
      make: 'FUJIFILM',
      model: 'X-T2',
      exposure_time: '1/80',
      aperture: '2.0',
      focal_length: '23.0',
      iso: 500,
    },
    source: 'unsplash',
    link: 'https://unsplash.com/photos/dirt-path-through-foggy-forest-4CDdd1RCt6w',
  },
  {
    id: 'example-3-IWYcrdO93WY',
    created_at: '2019-09-23T17:10:36Z',
    description: 'Concrete at the Dongdaemun Design Plaza, Seoul. Photo by 준영 박 on Unsplash',
    alt_description: 'Angled concrete columns of a modern building, photographed from below',
    color: '#262626',
    width: 1080,
    height: 1620,
    urls: {
      regular: '/images/photos/example-3.jpg',
      small: '/images/photos/example-3.jpg',
    },
    exif: {
      make: 'SONY',
      model: 'ILCE-7',
      exposure_time: '1/2000',
      aperture: null,
      focal_length: '50.0',
      iso: 640,
    },
    source: 'unsplash',
    link: 'https://unsplash.com/photos/architectural-photography-of-concrete-monument-IWYcrdO93WY',
  },
  {
    id: 'example-4-RIQ96s3Uzso',
    created_at: '2018-06-15T07:19:12Z',
    description: 'Window light on a wall, Melbourne. Photo by Alexander Possingham on Unsplash',
    alt_description: 'Soft sunlight through a window casting a shadow of the frame on a plain wall',
    color: '#594026',
    width: 1080,
    height: 1620,
    urls: {
      regular: '/images/photos/example-4.jpg',
      small: '/images/photos/example-4.jpg',
    },
    exif: {
      make: 'Canon',
      model: 'Canon EOS 5D Mark II',
      exposure_time: '1/100',
      aperture: '1.8',
      focal_length: '35.0',
      iso: 800,
    },
    source: 'unsplash',
    link: 'https://unsplash.com/photos/window-shadow-on-wall-RIQ96s3Uzso',
  },
  {
    id: 'example-5-XK0faa4_mCQ',
    created_at: '2019-01-02T07:40:17Z',
    description: 'The National Theatre, London. Photo by Simone Hutsch on Unsplash',
    alt_description: 'The layered concrete forms of a brutalist theatre building against a pale sky',
    color: '#c0d9d9',
    width: 1080,
    height: 664,
    urls: {
      regular: '/images/photos/example-5.jpg',
      small: '/images/photos/example-5.jpg',
    },
    exif: {
      make: 'Canon',
      model: 'Canon EOS 7D',
      exposure_time: '1/100',
      aperture: '16.0',
      focal_length: '24.0',
      iso: 100,
    },
    source: 'unsplash',
    link: 'https://unsplash.com/photos/landscape-photography-of-gray-concrete-building-XK0faa4_mCQ',
  },
  {
    id: 'example-6-ZOeyUJB6t_Y',
    created_at: '2021-01-09T15:33:10Z',
    description: 'Shelves in a pottery studio. Photo by Manki Kim on Unsplash',
    alt_description: 'Wooden shelves stacked with unglazed ceramic bowls, cups, and vases',
    color: '#262626',
    width: 1080,
    height: 720,
    urls: {
      regular: '/images/photos/example-6.jpg',
      small: '/images/photos/example-6.jpg',
    },
    exif: {
      make: 'SONY',
      model: 'ILCE-7M2',
      exposure_time: '1/30',
      aperture: '3.5',
      focal_length: '55.0',
      iso: 640,
    },
    source: 'unsplash',
    link: 'https://unsplash.com/photos/white-ceramic-teacup-on-brown-wooden-shelf-ZOeyUJB6t_Y',
  },
  {
    id: 'example-7-kogC-cLefIs',
    created_at: '2021-01-15T05:13:48Z',
    description: 'Devils Slide, California. Photo by Karsten Koehn on Unsplash',
    alt_description: 'Waves breaking against rocky cliffs on a foggy stretch of Pacific coast',
    color: '#f3f3f3',
    width: 1080,
    height: 607,
    urls: {
      regular: '/images/photos/example-7.jpg',
      small: '/images/photos/example-7.jpg',
    },
    exif: {
      make: 'FUJIFILM',
      model: 'X-Pro3',
      exposure_time: '1/1000',
      aperture: '5.6',
      focal_length: '23.0',
      iso: 1000,
    },
    source: 'unsplash',
    link: 'https://unsplash.com/photos/gray-rocky-mountain-beside-body-of-water-during-daytime-kogC-cLefIs',
  },
  {
    id: 'example-8-vZ1JAXUO3-0',
    created_at: '2015-11-26T06:13:11Z',
    description: 'Lake Louise at dawn. Photo by Roberto Nickson on Unsplash',
    alt_description: 'A calm mountain lake reflecting snowy peaks, with wildflowers on the near shore',
    color: '#73c0f3',
    width: 1080,
    height: 720,
    urls: {
      regular: '/images/photos/example-8.jpg',
      small: '/images/photos/example-8.jpg',
    },
    exif: {
      make: null,
      model: null,
      exposure_time: null,
      aperture: null,
      focal_length: null,
      iso: null,
    },
    source: 'unsplash',
    link: 'https://unsplash.com/photos/calm-mountain-lake-reflecting-snowy-peaks-vZ1JAXUO3-0',
  },
]
