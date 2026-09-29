export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 3600) {
    const m = Math.max(1, Math.floor(seconds / 60))
    return `${m}m ago`
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    return `${h}h ago`
  }
  if (seconds < 604800) {
    const d = Math.floor(seconds / 86400)
    return `${d}d ago`
  }
  if (seconds < 2592000) {
    const w = Math.floor(seconds / 604800)
    return `${w}w ago`
  }
  if (seconds < 31536000) {
    const mo = Math.floor(seconds / 2592000)
    return `${mo}mo ago`
  }
  const y = Math.floor(seconds / 31536000)
  return `${y}y ago`
}
