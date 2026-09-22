import { AutoplayVideo } from './autoplay-video'

interface PhoneFrameVideoProps {
  src?: string
  loop?: boolean
  /** Accessible name for the focusable clip inside the frame. */
  label?: string
}

// Shared: build a rounded-rect SVG path (clockwise)
function rrPath(x: number, y: number, w: number, h: number, r: number) {
  return (
    `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} ` +
    `V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} ` +
    `H${x + r} Q${x},${y + h} ${x},${y + h - r} ` +
    `V${y + r} Q${x},${y} ${x + r},${y} Z`
  )
}

// iPhone 8-style: thick top bezel (speaker + camera), thick bottom bezel (home button), no notch
export function PhoneVideoClassic({ src, loop = true, label = 'App demo video' }: PhoneFrameVideoProps) {
  const VW = 300, VH = 596
  const SX = 20, SY = 72, SW = 260, SH = 462
  const rx = 42

  return (
    <div className="relative mx-auto" style={{ maxWidth: VW }}>
      {/* Video sits in the screen cutout */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: `${(SY / VH) * 100}%`,
          left: `${(SX / VW) * 100}%`,
          width: `${(SW / VW) * 100}%`,
          height: `${(SH / VH) * 100}%`,
          borderRadius: 2,
        }}
      >
        <AutoplayVideo src={src} loop={loop} ariaLabel={label} className="w-full h-full object-cover" />
      </div>

      {/* SVG phone frame (evenodd punches screen hole) */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="relative w-full block pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Phone body with screen cutout */}
        <path
          fillRule="evenodd"
          d={`${rrPath(0, 0, VW, VH, rx)} ${rrPath(SX, SY, SW, SH, 2)}`}
          fill="#1C1C1E"
        />
        {/* Speaker grille */}
        <rect x="115" y="33" width="70" height="8" rx="4" fill="#3A3A3C" />
        {/* Front camera */}
        <circle cx="82" cy="37" r="6" fill="#2C2C2E" />
        {/* Home button outer ring */}
        <circle cx="150" cy="561" r="26" fill="none" stroke="#3A3A3C" strokeWidth="1.5" />
        {/* Home button inner rounded square */}
        <rect x="138" y="549" width="24" height="24" rx="6" fill="none" stroke="#3A3A3C" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

// iPhone X-style: thin bezels, notch (Face ID + camera), no home button, swipe indicator
export function PhoneVideoModern({ src, loop = true, label = 'App demo video' }: PhoneFrameVideoProps) {
  const VW = 300, VH = 596
  const SX = 9, SY = 9, SW = 282, SH = 578
  const rx = 42
  // Notch
  const NW = 132, NH = 38, NX = (VW - NW) / 2, NY = SY

  return (
    <div className="relative mx-auto" style={{ maxWidth: VW }}>
      {/* Video sits in the screen cutout */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: `${(SY / VH) * 100}%`,
          left: `${(SX / VW) * 100}%`,
          width: `${(SW / VW) * 100}%`,
          height: `${(SH / VH) * 100}%`,
          borderRadius: 12,
        }}
      >
        <AutoplayVideo src={src} loop={loop} ariaLabel={label} className="w-full h-full object-cover" />
      </div>

      {/* SVG phone frame (evenodd punches screen hole) */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="relative w-full block pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Phone body with screen cutout */}
        <path
          fillRule="evenodd"
          d={`${rrPath(0, 0, VW, VH, rx)} ${rrPath(SX, SY, SW, SH, 12)}`}
          fill="#1C1C1E"
        />
        {/* Notch pill — covers video, same color as bezel */}
        <rect x={NX} y={NY} width={NW} height={NH} rx={NH / 2} fill="#1C1C1E" />
        {/* Speaker in notch */}
        <rect x={NX + 28} y={NY + 15} width={50} height={7} rx="3.5" fill="#3A3A3C" />
        {/* Camera dot in notch */}
        <circle cx={NX + NW - 22} cy={NY + NH / 2} r={5} fill="#2C2C2E" />
        {/* Home indicator bar */}
        <rect x="115" y="582" width="70" height="4" rx="2" fill="#3A3A3C" />
      </svg>
    </div>
  )
}
