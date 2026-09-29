'use client'

import { useEffect } from 'react'

export function VideoAutoplayObserver() {
  useEffect(() => {
    // Reduced-motion users get the first frame, not autoplay — same contract as AutoplayVideo.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Only the raw <video> tags in older posts that bypass the AutoplayVideo wrapper:
    // AutoplayVideo marks its element (data-managed-autoplay) and runs its own observer,
    // so observing it here too would override its sticky user-pause. Videos with native
    // controls are sound-bearing embeds the viewer drives — never muted, never autoplayed.
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
      .filter(video => video.dataset.managedAutoplay === undefined && !video.controls)
    const observers = videos.map(video => {
      video.muted = true
      // Without playsinline, iOS Safari forces the video fullscreen the moment .play()
      // is called. Set it (before observing) on every video this observer autoplays.
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', '')
      video.playsInline = true
      // A pause that lands while the clip is on screen came from something other than this
      // observer (it only pauses off-screen clips) — treat it as the user's, and make it
      // sticky: scrolling must not restart what they stopped. Any play() clears the flag.
      let intersecting = false
      let userPaused = false
      video.addEventListener('pause', () => { if (intersecting) userPaused = true })
      video.addEventListener('play', () => { userPaused = false })
      const observer = new IntersectionObserver(
        ([entry]) => {
          intersecting = entry.isIntersecting
          if (entry.isIntersecting) {
            if (!userPaused) (entry.target as HTMLVideoElement).play().catch(() => {})
          } else {
            (entry.target as HTMLVideoElement).pause()
          }
        },
        { threshold: 0.5 }
      )
      observer.observe(video)
      return observer
    })
    return () => observers.forEach(o => o.disconnect())
  }, [])

  return null
}
