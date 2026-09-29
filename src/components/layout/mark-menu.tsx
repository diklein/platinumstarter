'use client'

import { useCallback } from 'react'
import { Copy, Download } from 'lucide-react'
import { copyLogoSvg, downloadLogo, markFilename } from '@/lib/logo-actions'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

/** Right-click (or long-press) the header mark to take the logo with you: copy the SVG
 *  markup, or download the SVG / transparent 512px PNG. The assets are pre-rendered by
 *  scripts/generate-logo.mjs in the avatar's circle-crop-safe frame — nothing is
 *  rasterized in the browser. Wraps just the mark, not the whole home link, so ordinary
 *  right-clicks on the wordmark keep the browser's own link menu. */
export function MarkMenu({ children }: { children: React.ReactNode }) {
  const copySvg = useCallback(() => { copyLogoSvg().catch(() => {}) }, [])
  const download = downloadLogo

  return (
    <ContextMenu>
      {/* -m/p pair: a 17px mark is a hard right-click target, so the trigger pads out to
          ~33px of hit area while the negative margin keeps the lockup's geometry exact.
          relative z-10 is load-bearing: the home link's invisible ::after hit-extender
          overlays the mark, and without the lift every real right-click targets the LINK —
          the trigger (a child) never sees the event, so the system menu shows. Synthetic
          dispatch on the svg can't catch this; only hit-testing can. */}
      <ContextMenuTrigger render={<span className="relative z-10 inline-flex -m-2 p-2" />}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={copySvg}>
          <Copy className="size-4.5" aria-hidden />
          Copy logo as SVG
        </ContextMenuItem>
        <ContextMenuItem onClick={() => download('/logo.svg', markFilename('svg'))}>
          <Download className="size-4.5" aria-hidden />
          Download logo as SVG
        </ContextMenuItem>
        <ContextMenuItem onClick={() => download('/logo.png', markFilename('png'))}>
          <Download className="size-4.5" aria-hidden />
          Download logo as PNG
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
